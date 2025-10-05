import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform } from 'react-native';
import Svg, { Path, G, Rect } from 'react-native-svg';
import RenderHtml from 'react-native-render-html';
import { API_URL } from '@/constants/ApiConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getLocalPDFPathEnhanced, isRemoteURL } from '../utils/pdfUtils';
import { parseStrokes as parseStrokesShared } from '../utils/drawingData';
import TemplateOverlay, { TemplateType } from './TemplateOverlay';

// Conditionally require native PDF renderer (no-op on web)
const Pdf = Platform.OS !== 'web' ? require('react-native-pdf').default : null as any;

type TagObject = { id: number; name: string };

type DrawingStroke = {
	id: string;
	points: number[]; // [x1,y1,x2,y2,...]
	color: string;
	width: number;
	tool?: string;
	timestamp?: number;
	opacity?: number;
};

type Note = {
	id: string;
	title: string;
	content: string;
	formatted_content?: string;
	type?: 'text' | 'image' | 'drawing' | 'document';
	tags?: (string | TagObject)[];
	template?: string | null;
	// Drawing
	drawing_data?: string | DrawingStroke[] | { strokes?: DrawingStroke[]; [k: string]: any } | null;
	// Document
	document_file?: string | null; // relative path or URL
	document_url?: string | null; // absolute URL
	document_annotations?: any; // JSON array with normalized annotations
};

interface TemplatePreviewProps {
	note?: Note;
	template?: TemplateType; // when used to preview a template (toolbar)
	width?: number;
	height?: number;
}

// Small, consistent HTML tag styles for card previews
const previewTagStyles = {
	body: { margin: 0, padding: 0 },
	p: { margin: 0, padding: 0 },
	li: { margin: 0, padding: 0 },
	h1: { fontSize: 12, fontWeight: '700' as const, marginVertical: 2 },
	h2: { fontSize: 11, fontWeight: '700' as const, marginVertical: 1 },
	h3: { fontSize: 10, fontWeight: '700' as const, marginVertical: 1 },
	strong: { fontWeight: '700' as const },
	b: { fontWeight: '700' as const },
	em: { fontStyle: 'italic' as const },
	i: { fontStyle: 'italic' as const },
	u: { textDecorationLine: 'underline' as const },
	mark: { backgroundColor: '#FFF59D' },
	span: { }, // allow inline styles like color, background-color
	strike: { textDecorationLine: 'line-through' as const },
	s: { textDecorationLine: 'line-through' as const },
	a: { textDecorationLine: 'underline', color: '#6A009C' },
	blockquote: {
		borderLeftWidth: 3, borderLeftColor: '#94A3B8', paddingLeft: 8, marginLeft: 0,
		backgroundColor: '#F8FAFC', borderRadius: 4, paddingVertical: 4
	},
	hr: { borderBottomWidth: 1, borderBottomColor: '#E5E7EB', height: 0, marginVertical: 6 },
} as const;

// Normalize legacy tags like <font color="red" size="4"> to <span style="color:red;font-size:16px">
function normalizeLegacyTags(html: string): string {
	if (!html) return html;
	try {
		// Replace opening <font ...> with <span style=...>
		html = html.replace(/<\s*font\b([^>]*)>/gi, (_match, attrs: string) => {
			const colorMatch = /color\s*=\s*['\"]?([^'\"\s>]+)['\"]?/i.exec(attrs);
			const sizeMatch = /size\s*=\s*['\"]?([^'\"\s>]+)['\"]?/i.exec(attrs);
			const styles: string[] = [];
			if (colorMatch && colorMatch[1]) {
				styles.push(`color:${colorMatch[1]}`);
			}
			if (sizeMatch && sizeMatch[1]) {
				const num = parseInt(sizeMatch[1], 10);
				const sizeMap: Record<number, number> = { 1: 10, 2: 12, 3: 14, 4: 16, 5: 18, 6: 20, 7: 24 };
				const px = sizeMap[num] || 14;
				styles.push(`font-size:${px}px`);
			}
			const styleAttr = styles.length ? ` style="${styles.join(';')}"` : '';
			return `<span${styleAttr}>`;
		});
		// Replace closing </font> with </span>
		html = html.replace(/<\s*\/\s*font\s*>/gi, '</span>');
	} catch {}
	return html;
}

function resolveDocumentUri(note: Note): { uri: string | null; ext: string | null } {
	const raw = note.document_url || note.document_file || null;
	if (!raw) return { uri: null, ext: null };
	const hasProtocol = /^https?:\/\//i.test(raw) || raw.startsWith('file://');
	const uri = hasProtocol ? raw : `${API_URL}${raw.startsWith('/') ? '' : '/'}${raw}`;
	const lower = uri.toLowerCase();
	const ext = lower.endsWith('.pdf') ? 'pdf' : lower.endsWith('.doc') || lower.endsWith('.docx') ? 'docx' : lower.endsWith('.txt') ? 'txt' : null;
	return { uri, ext };
}

// Parse drawing_data in any supported shape into uniform strokes
const parseStrokes = (drawingData: Note['drawing_data']) => parseStrokesShared(drawingData as any);

// Compute global bounds across all strokes
function getStrokeBounds(strokes: DrawingStroke[]) {
	let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
	strokes.forEach(s => {
		const pts = s.points;
		for (let i = 0; i < pts.length; i += 2) {
			const x = pts[i]; const y = pts[i + 1];
			if (typeof x !== 'number' || typeof y !== 'number') continue;
			minX = Math.min(minX, x);
			minY = Math.min(minY, y);
			maxX = Math.max(maxX, x);
			maxY = Math.max(maxY, y);
		}
	});
	if (!isFinite(minX) || !isFinite(minY) || !isFinite(maxX) || !isFinite(maxY)) {
		return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
	}
	// Add a tiny padding so wide strokes aren’t clipped
	const pad = 8;
	return { minX: minX - pad, minY: minY - pad, maxX: maxX + pad, maxY: maxY + pad };
}

// Convert points to a simple smooth-ish path (preview-friendly and fast)
function strokeToPath(stroke: DrawingStroke): string {
	const pts = stroke.points;
	if (!pts || pts.length < 2) return '';
	let d = '';
	for (let i = 0; i < pts.length; i += 2) {
		const x = pts[i]; const y = pts[i + 1];
		if (i === 0) d += `M${x},${y}`; else d += ` L${x},${y}`;
	}
	return d;
}

const TemplatePreview: React.FC<TemplatePreviewProps> = ({ note, template, width = 80, height = 100 }) => {
	// If used as a template thumbnail
	if (!note && template) {
		return (
			<View style={[styles.card, { width, height, padding: 0, overflow: 'hidden' }]}> 
				<TemplateOverlay template={template} canvasWidth={width} canvasHeight={height} />
			</View>
		);
	}

	const safeNote = note as Note | undefined;
	const isDrawing = !!safeNote && ((safeNote.type === 'drawing') || (!!safeNote.drawing_data));
	const isDocument = !!safeNote && ((safeNote.type === 'document') || (!!safeNote.document_file || !!safeNote.document_url));

	if (isDrawing && safeNote) {
		return <DrawingPreview note={safeNote} width={width} height={height} />;
	}
	if (isDocument && safeNote) {
		return <DocumentPreview note={safeNote} width={width} height={height} />;
	}
	return <TextPreview note={safeNote as Note} width={width} height={height} />;
};

const TextPreview: React.FC<TemplatePreviewProps> = ({ note, width = 80, height = 100 }) => {
    const htmlRaw = note ? ((note.formatted_content && note.formatted_content.trim()) ? note.formatted_content : (note.content || '')) : '';
    const html = useMemo(() => normalizeLegacyTags(htmlRaw), [htmlRaw]);
		return (
			<View style={[styles.card, { width, height }]}> 
				{html ? (
					<View style={[styles.contentClip, { maxHeight: height - 16 }]}> 
												<RenderHtml
													contentWidth={(width || 80) - 16}
												source={{ html }}
							tagsStyles={previewTagStyles as any}
												defaultTextProps={{ selectable: false }}
												baseStyle={{ fontSize: 10, lineHeight: 14, color: '#1E293B' }}
												ignoredDomTags={['img','video','iframe']}
												enableExperimentalBRCollapsing={true}
												domVisitors={{
													onElement: (el) => {
														// Keep inline styles for color/background-color where present
														if (el?.attribs?.style) {
															// no-op: RenderHtml will honor inline style by default; we just avoid stripping
														}
													}
												}}
						/>
					</View>
				) : (
					<View style={styles.emptyState}><Text style={styles.emptyText}>No content</Text></View>
				)}
			</View>
		);
};

const DrawingPreview: React.FC<TemplatePreviewProps> = ({ note, width = 80, height = 100 }) => {
	const strokes = useMemo(() => parseStrokes(note?.drawing_data), [note?.drawing_data]);
	const bounds = useMemo(() => getStrokeBounds(strokes), [strokes]);
	const vbW = Math.max(1, bounds.maxX - bounds.minX);
	const vbH = Math.max(1, bounds.maxY - bounds.minY);

	return (
		<View style={[styles.card, { width, height, padding: 0 }]}> 
			{strokes.length === 0 ? (
				<View style={styles.emptyState}><Text style={styles.emptyText}>Empty drawing</Text></View>
			) : (
				<Svg width={width} height={height} viewBox={`${bounds.minX} ${bounds.minY} ${vbW} ${vbH}`}> 
					<Rect x={bounds.minX} y={bounds.minY} width={vbW} height={vbH} fill="#FFFFFF" />
								{strokes.map((s, idx) => {
									if (!s) return null;
									const d = strokeToPath(s);
						if (!d) return null;
						const opacity = typeof s.opacity === 'number' ? s.opacity : (s.tool === 'highlighter' ? 0.4 : 1);
						// Scale stroke width relative to viewBox scaling; RN SVG scales strokeWidth with viewBox automatically.
						return (
							<Path
											key={`${s.id || 'stroke'}-${idx}`}
								d={d}
								fill="none"
								stroke={s.color || '#111827'}
								strokeWidth={Math.max(1, s.width || 2)}
								strokeLinecap="round"
								strokeLinejoin="round"
								opacity={opacity}
											vectorEffect="non-scaling-stroke"
							/>
						);
					})}
				</Svg>
			)}
		</View>
	);
};

const DocumentPreview: React.FC<TemplatePreviewProps> = ({ note, width = 80, height = 100 }) => {
	const { uri, ext } = useMemo(() => resolveDocumentUri(note as Note), [note?.document_file, note?.document_url]);
	const [localUri, setLocalUri] = useState<string | null>(null);
	const [loading, setLoading] = useState<boolean>(true);
	const [error, setError] = useState<string | null>(null);

		useEffect(() => {
		let mounted = true;
		const load = async () => {
			try {
				if (!uri) {
					throw new Error('No document URI');
				}
				if (ext === 'pdf' && isRemoteURL(uri)) {
						// Include auth header for backend resources
						let headers: HeadersInit | undefined;
						if (uri.includes(API_URL)) {
							const token = await AsyncStorage.getItem('authToken');
							if (token) headers = { Authorization: `Token ${token}`, Accept: 'application/pdf' };
						}
						const result = await getLocalPDFPathEnhanced(uri, undefined, undefined, headers);
						const path = result.uri;
					if (!mounted) return;
					setLocalUri(path);
				} else {
					setLocalUri(uri);
				}
				setError(null);
			} catch (e: any) {
				setError(e?.message || 'Failed to load document');
			} finally {
				setLoading(false);
			}
		};
		load();
		return () => { mounted = false; };
	}, [uri, ext]);

	// Prepare annotation overlays (first page only) using normalized coordinates 0-1
		const annotations: any[] = useMemo(() => {
			const anns = Array.isArray(note?.document_annotations) ? (note?.document_annotations as any[]) : [];
		// Only show a few to keep it light
		return anns.filter(a => (a?.page ?? 1) === 1).slice(0, 20);
		}, [note?.document_annotations]);

	return (
		<View style={[styles.card, { width, height, overflow: 'hidden' }]}> 
			{loading ? (
				<View style={styles.centered}><ActivityIndicator size="small" color="#6366F1" /></View>
			) : error || !localUri ? (
				<View style={styles.centered}><Text style={styles.placeholderText}>Document preview unavailable</Text></View>
			) : ext === 'pdf' ? (
				<View style={{ width: '100%', height: '100%' }}>
					{Platform.OS !== 'web' && Pdf ? (
						<>
							<Pdf
								style={{ width, height }}
								source={{ uri: localUri }}
								page={1}
								trustAllCerts={true}
								enablePaging={false}
							/>
							{/* Simple overlay for highlights on page 1 */}
							{annotations.length > 0 && (
								<View style={StyleSheet.absoluteFill} pointerEvents="none">
									<Svg width={width} height={height}>
										<G>
																	{annotations.map((ann, idx) => {
																		if (!ann) return null;
												if (ann.type === 'highlight') {
													const x = (ann.x || 0) * width;
													const y = (ann.y || 0) * height;
													const w = (ann.width || 0.15) * width;
													const h = (ann.height || 0.05) * height;
													return (
														<Rect key={idx} x={x} y={y} width={w} height={h} fill={ann.color || '#F59E0B'} opacity={0.25} />
													);
												}
												if ((ann.type === 'pen' || ann.type === 'brush' || ann.type === 'pencil') && ann.path) {
													// Path assumed normalized 0-1; scale via group transform
													return (
														<G key={idx} transform={`scale(${width}, ${height})`}>
															  <Path d={ann.path} fill="none" stroke={ann.color || '#1F2937'} strokeWidth={(ann.strokeWidth || 2) / Math.max(width || 80, height || 100)} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
														</G>
													);
												}
												return null;
											})}
										</G>
									</Svg>
								</View>
							)}
						</>
					) : (
						// Web fallback: we can't render native PDF; show a light placeholder
						<View style={styles.centered}><Text style={styles.placeholderText}>PDF</Text></View>
					)}
				</View>
			) : (
				// Non-PDF: lightweight placeholder with type
				<View style={styles.centered}><Text style={styles.placeholderText}>{ext?.toUpperCase() || 'DOCUMENT'}</Text></View>
			)}
		</View>
	);
};

const styles = StyleSheet.create({
	card: {
		backgroundColor: '#FFFFFF',
		borderRadius: 12,
		padding: 8,
		borderWidth: 1,
		borderColor: '#E5E7EB',
	},
	emptyState: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	emptyText: {
		color: '#9CA3AF',
		fontSize: 12,
	},
	centered: {
		flex: 1,
		alignItems: 'center',
		justifyContent: 'center',
	},
	placeholderText: {
		color: '#6B7280',
		fontSize: 12,
		fontFamily: 'Inter-Medium',
	},
		contentClip: {
			overflow: 'hidden',
		},
});

export default TemplatePreview;

