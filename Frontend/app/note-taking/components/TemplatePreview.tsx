import React, { useEffect, useMemo, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  Platform,
} from "react-native";
import Svg, { Path, G, Rect } from "react-native-svg";
import { getStroke } from "perfect-freehand";
import RenderHtml from "react-native-render-html";
import { API_URL } from "@/constants/ApiConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { getLocalPDFPathEnhanced, isRemoteURL } from "../utils/pdfUtils";
import { parseStrokes as parseStrokesShared } from "../utils/drawingData";
import TemplateOverlay, { TemplateType } from "./TemplateOverlay";

// Conditionally require native PDF renderer (no-op on web)
const Pdf =
  Platform.OS !== "web" ? require("react-native-pdf").default : (null as any);

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
  type?: "text" | "image" | "drawing" | "document";
  tags?: (string | TagObject)[];
  template?: string | null;
  // Drawing
  drawing_data?:
    | string
    | DrawingStroke[]
    | { strokes?: DrawingStroke[]; [k: string]: any }
    | null;
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
  body: { margin: 0, padding: 0, color: "#1E293B" },
  p: { margin: 0, padding: 0 },
  li: { margin: 0, padding: 0 },
  h1: { fontSize: 12, fontWeight: "700" as const, marginVertical: 2 },
  h2: { fontSize: 11, fontWeight: "700" as const, marginVertical: 1 },
  h3: { fontSize: 10, fontWeight: "700" as const, marginVertical: 1 },
  strong: { fontWeight: "700" as const },
  b: { fontWeight: "700" as const },
  em: { fontStyle: "italic" as const },
  i: { fontStyle: "italic" as const },
  u: { textDecorationLine: "underline" as const },
  mark: { backgroundColor: "#FFF59D" },
  span: {}, // allow inline styles like color, background-color
  strike: { textDecorationLine: "line-through" as const },
  s: { textDecorationLine: "line-through" as const },
  a: { textDecorationLine: "underline", color: "#6A009C" },
  blockquote: {
    borderLeftWidth: 3,
    borderLeftColor: "#94A3B8",
    paddingLeft: 8,
    marginLeft: 0,
    backgroundColor: "#F8FAFC",
    borderRadius: 4,
    paddingVertical: 4,
  },
  hr: {
    borderBottomWidth: 1,
    borderBottomColor: "#E5E7EB",
    height: 0,
    marginVertical: 6,
  },
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
        const sizeMap: Record<number, number> = {
          1: 10,
          2: 12,
          3: 14,
          4: 16,
          5: 18,
          6: 20,
          7: 24,
        };
        const px = sizeMap[num] || 14;
        styles.push(`font-size:${px}px`);
      }
      const styleAttr = styles.length ? ` style="${styles.join(";")}"` : "";
      return `<span${styleAttr}>`;
    });
    // Replace closing </font> with </span>
    html = html.replace(/<\s*\/\s*font\s*>/gi, "</span>");

    // Ensure <mark> has inline background color so it renders without external CSS
    html = html.replace(/<\s*mark\b([^>]*)>/gi, (m, attrs: string) => {
      // If style already has background or background-color, keep as is
      const hasStyle = /style\s*=\s*['"][^'"]*\bbackground(-color)?\s*:/i.test(
        attrs
      );
      if (hasStyle) return m;
      const hasClassYellow =
        /class\s*=\s*['"][^'"]*\b(highlight|hl|mark|yellow|bg-yellow)\b/i.test(
          attrs
        );
      const color = hasClassYellow ? "#FFF59D" : "#FEF3C7";
      const styleAttr = /style\s*=/.test(attrs)
        ? attrs.replace(/style\s*=\s*(['"])/i, (mm, q) => `style=${q}background-color:${color};`)
        : `${attrs} style="background-color:${color};"`;
      return `<mark${styleAttr}>`;
    });
    // Convert inline-styled semantic tags (i, em, b, strong, u) to spans with the
    // equivalent inline style so react-native-render-html applies color/background
    // consistently on text nodes in the preview cards.
    html = html.replace(/<\s*(i|em)\b([^>]*)style\s*=\s*(['"])(.*?)\3([^>]*)>/gi, (_m, tagName, before, q, styleBody, after) => {
      const style = styleBody || "";
      const hasFontStyle = /font-style\s*:/i.test(style);
      const combined = hasFontStyle ? style : `${style};font-style:italic`;
      const other = (before + ' ' + after).replace(/\s*style\s*=\s*(['"]).*?\1/i, '').trim();
      const attrs = other ? ` ${other} style="${combined}"` : ` style="${combined}"`;
      return `<${tagName}${attrs}>`;
    });
    html = html.replace(/<\s*(b|strong)\b([^>]*)style\s*=\s*(['"])(.*?)\3([^>]*)>/gi, (_m, tagName, before, q, styleBody, after) => {
      const style = styleBody || "";
      const hasWeight = /font-weight\s*:/i.test(style);
      const combined = hasWeight ? style : `${style};font-weight:700`;
      const other = (before + ' ' + after).replace(/\s*style\s*=\s*(['"]).*?\1/i, '').trim();
      const attrs = other ? ` ${other} style="${combined}"` : ` style="${combined}"`;
      return `<${tagName}${attrs}>`;
    });
    html = html.replace(/<\s*(u)\b([^>]*)style\s*=\s*(['"])(.*?)\3([^>]*)>/gi, (_m, tagName, before, q, styleBody, after) => {
      const style = styleBody || "";
      const hasDecor = /text-decoration\s*:/i.test(style);
      const combined = hasDecor ? style : `${style};text-decoration:underline`;
      const other = (before + ' ' + after).replace(/\s*style\s*=\s*(['"]).*?\1/i, '').trim();
      const attrs = other ? ` ${other} style="${combined}"` : ` style="${combined}"`;
      return `<${tagName}${attrs}>`;
    });
    // Common span highlight classes -> inline background
    html = html.replace(/<\s*span\b([^>]*)>/gi, (m, attrs: string) => {
      const classMatch = /class\s*=\s*['"]([^'"]*)['"]/i.exec(attrs);
      const classes = classMatch?.[1] || "";
      if (!/\b(highlight|hl|mark|bg-yellow|bg-highlight)\b/i.test(classes))
        return m;
      const hasBg = /style\s*=\s*['"][^'"]*\bbackground(-color)?\s*:/i.test(
        attrs
      );
      if (hasBg) return m;
      const color = "#FFF59D";
      const styleAttr = /style\s*=/.test(attrs)
        ? attrs.replace(
            /style\s*=\s*(['"])/i,
            (mm, q) => `style=${q}background-color:${color};`
          )
        : `${attrs} style="background-color:${color};"`;
      return `<span${styleAttr}>`;
    });
  } catch {}
  return html;
}

function resolveDocumentUri(note: Note): {
  uri: string | null;
  ext: string | null;
} {
  const raw = note.document_url || note.document_file || null;
  if (!raw) return { uri: null, ext: null };
  const hasProtocol = /^https?:\/\//i.test(raw) || raw.startsWith("file://");
  const uri = hasProtocol ? raw : require("@/constants/ApiConfig").joinUrl(API_URL, raw);
  const lower = uri.toLowerCase();
  const ext = lower.endsWith(".pdf")
    ? "pdf"
    : lower.endsWith(".doc") || lower.endsWith(".docx")
    ? "docx"
    : lower.endsWith(".txt")
    ? "txt"
    : null;
  return { uri, ext };
}

// Parse drawing_data in any supported shape into uniform strokes
const parseStrokes = (drawingData: Note["drawing_data"]) =>
  parseStrokesShared(drawingData as any);

// Compute global bounds across all strokes
function getStrokeBounds(strokes: DrawingStroke[]) {
  let minX = Infinity,
    minY = Infinity,
    maxX = -Infinity,
    maxY = -Infinity;
  strokes.forEach((s) => {
    const pts = s.points;
    for (let i = 0; i < pts.length; i += 2) {
      const x = pts[i];
      const y = pts[i + 1];
      if (typeof x !== "number" || typeof y !== "number") continue;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  });
  if (
    !isFinite(minX) ||
    !isFinite(minY) ||
    !isFinite(maxX) ||
    !isFinite(maxY)
  ) {
    return { minX: 0, minY: 0, maxX: 1, maxY: 1 };
  }
  // Add a tiny padding so wide strokes aren’t clipped
  const pad = 8;
  return {
    minX: minX - pad,
    minY: minY - pad,
    maxX: maxX + pad,
    maxY: maxY + pad,
  };
}

// Convert points to a simple smooth-ish path (preview-friendly and fast)
function strokeToPath(stroke: DrawingStroke): string {
  const pts = stroke.points;
  if (!pts || pts.length < 2) return "";
  let d = "";
  for (let i = 0; i < pts.length; i += 2) {
    const x = pts[i];
    const y = pts[i + 1];
    if (i === 0) d += `M${x},${y}`;
    else d += ` L${x},${y}`;
  }
  return d;
}

const TemplatePreview: React.FC<TemplatePreviewProps> = ({
  note,
  template,
  width = 80,
  height = 100,
}) => {
  // If used as a template thumbnail
  if (!note && template) {
    const innerWidth = Math.max(1, (width || 80) - 16);
    const innerHeight = Math.max(1, (height || 100) - 16);
    return (
      <View style={[styles.card, { width, height, overflow: "hidden" }]}> 
        <View style={{ width: innerWidth, height: innerHeight }}>
          <TemplateOverlay template={template} canvasWidth={innerWidth} canvasHeight={innerHeight} />
        </View>
      </View>
    );
  }

  const safeNote = note as Note | undefined;
  const isDrawing =
    !!safeNote && (safeNote.type === "drawing" || !!safeNote.drawing_data);
  const isDocument =
    !!safeNote &&
    (safeNote.type === "document" ||
      !!safeNote.document_file ||
      !!safeNote.document_url);

  if (isDrawing && safeNote) {
    return <DrawingPreview note={safeNote} width={width} height={height} />;
  }
  if (isDocument && safeNote) {
    return <DocumentPreview note={safeNote} width={width} height={height} />;
  }
  return <TextPreview note={safeNote as Note} width={width} height={height} />;
};

const TextPreview: React.FC<TemplatePreviewProps> = ({
  note,
  width = 80,
  height = 100,
}) => {
  const htmlRaw = note
    ? note.formatted_content && note.formatted_content.trim()
      ? note.formatted_content
      : note.content || ""
    : "";
  const html = useMemo(() => normalizeLegacyTags(htmlRaw), [htmlRaw]);
  const allowedInlineStyles = useMemo(
    () => {
      // Include both kebab-case and camelCase variants: some consumers of the
      // allowed styles prefer camelCase keys while inline HTML uses kebab-case.
      const kebab = [
        "color",
        "background-color",
        "background",
        "text-decoration",
        "text-decoration-color",
        "text-decoration-style",
        "font-weight",
        "font-style",
        "font-size",
        "letter-spacing",
        "word-spacing",
        "line-height",
        "margin-left",
        "margin-right",
        "margin",
        "padding-left",
        "padding-right",
        "padding",
        "text-indent",
        "text-align",
        "vertical-align",
        "width",
        "height",
        "max-width",
        "max-height",
      ];
      const camel = kebab.map((p) => p.replace(/-([a-z])/g, (_, c) => c.toUpperCase()));
      return Array.from(new Set([...kebab, ...camel]));
    },
    []
  );
  const innerWidth = Math.max(1, (width || 80) - 16);
  const innerHeight = Math.max(1, (height || 100) - 16);
  return (
    <View style={[styles.card, { width, height }]}> 
      {html ? (
        <View style={[styles.contentClip, { width: innerWidth, height: innerHeight }]}> 
          {/** Debug: print sanitized HTML in development to help diagnose missing inline styles */}
          {typeof __DEV__ !== "undefined" && __DEV__ ? (
            (() => {
              try {
                // limit length to avoid spamming Metro
                console.log && console.log("[TemplatePreview] sanitized html:", html?.slice(0, 1000));
              } catch (e) {}
              return null;
            })()
          ) : null}

          <RenderHtml
            contentWidth={innerWidth}
            source={{ html }}
            tagsStyles={previewTagStyles as any}
            allowedStyles={allowedInlineStyles as any}
            defaultTextProps={{ selectable: false }}
            baseStyle={{ fontSize: 10, lineHeight: 14 }}
            ignoredDomTags={["img", "video", "iframe"]}
            enableExperimentalBRCollapsing={true}
            domVisitors={{
              onElement: (el) => {
                try {
                  if (!el || !el.attribs) return;
                  const rawStyle = el.attribs.style || "";
                  if (!rawStyle || typeof rawStyle !== "string") return;

                  // Parse style string into declarations and keep only allowed properties
                  const decls = rawStyle.split(";").map((d) => d.trim()).filter(Boolean);
                  const kept: string[] = [];
                  for (const d of decls) {
                    const parts = d.split(":");
                    if (parts.length < 2) continue;
                    const prop = parts[0].trim().toLowerCase();
                    const val = parts.slice(1).join(":").trim();
                    // Normalize property to kebab-case (already lowercased)
                    const propKebab = prop.replace(/([A-Z])/g, "-$1").toLowerCase();
                    // Also accept camelCase versions in allowed list
                    const allowedKebab = (allowedInlineStyles as string[]).map(s => s.toLowerCase());
                    if (allowedKebab.includes(propKebab) || allowedKebab.includes(prop)) {
                      // Basic validation for color values to avoid dangerous content
                      if (propKebab === "color" || propKebab === "background-color" || propKebab.endsWith("color")) {
                        // Allow hex, rgb(a) and named colors
                        if (/^#([0-9a-f]{3}|[0-9a-f]{6})([0-9a-f]{2})?$/i.test(val) || /^rgba?\(/i.test(val) || /^[a-z\-]+$/i.test(val)) {
                          kept.push(`${propKebab}:${val}`);
                        }
                      } else if (propKebab === "text-indent" || propKebab === "margin-left" || propKebab === "padding-left" || /margin|padding|indent|width|height|font-size|line-height|letter-spacing/.test(propKebab)) {
                        // Allow numeric values and px/%/em units
                        if (/^[0-9\.]+(px|em|rem|%)?$/.test(val) || /^[0-9\.]+$/.test(val)) {
                          kept.push(`${propKebab}:${val}`);
                        }
                      } else {
                        // Default: keep the declaration
                        kept.push(`${propKebab}:${val}`);
                      }
                    }
                  }

                  if (kept.length > 0) {
                    // Overwrite the element's style attribute with sanitized declarations
                    el.attribs.style = kept.join(";");
                  } else {
                    // Remove style to avoid being stripped/ignored
                    delete el.attribs.style;
                  }
                } catch (e) {
                  // If anything goes wrong, don't block rendering
                }
              },
            }}
          />
        </View>
      ) : (
        <View style={[styles.emptyState, { width: innerWidth, height: innerHeight }]}>
          <Text style={styles.emptyText}>No content</Text>
        </View>
      )}
    </View>
  );
};

const DrawingPreview: React.FC<TemplatePreviewProps> = ({
  note,
  width = 80,
  height = 100,
}) => {
  const strokes = useMemo(
    () => parseStrokes(note?.drawing_data),
    [note?.drawing_data]
  );

  // Convert numeric points to [x,y] pairs
  const toPairs = (nums: number[]): Array<[number, number]> => {
    const out: Array<[number, number]> = [];
    for (let i = 0; i + 1 < nums.length; i += 2) {
      const x = nums[i];
      const y = nums[i + 1];
      if (Number.isFinite(x) && Number.isFinite(y)) out.push([x, y]);
    }
    return out;
  };

  // Light decimation to speed up preview generation
  const decimate = (pts: Array<[number, number]>, step: number) => {
    if (step <= 1 || pts.length <= 2) return pts;
    const out: Array<[number, number]> = [];
    for (let i = 0; i < pts.length; i += step) out.push(pts[i]);
    if (out[out.length - 1] !== pts[pts.length - 1])
      out.push(pts[pts.length - 1]);
    return out;
  };

  const outlineToPath = (outline: Array<[number, number]>): string => {
    if (!outline || outline.length === 0) return "";
    if (outline.length === 1) return `M ${outline[0][0]},${outline[0][1]} Z`;
    let d = `M ${outline[0][0]},${outline[0][1]}`;
    for (let i = 1; i < outline.length; i++)
      d += ` L ${outline[i][0]},${outline[i][1]}`;
    d += " Z";
    return d;
  };

  const computePreviewGeometry = useMemo(() => {
    // Build perfect-freehand outlines and accumulate bounds from outlines
    const paths: { d: string; color: string; opacity: number }[] = [];
    let minX = Infinity,
      minY = Infinity,
      maxX = -Infinity,
      maxY = -Infinity;
    for (const s of strokes) {
      if (!s || !Array.isArray(s.points) || s.points.length < 2) continue;
      const pairs = decimate(toPairs(s.points), 2);
      if (pairs.length === 0) continue;
      // Tool-aware options (approximate to editor rendering)
      const tool = (s.tool || "pen").toLowerCase();
      const sizeBase = Math.max(0.5, s.width || 2);
      const size =
        tool === "highlighter"
          ? sizeBase * 2.2
          : tool === "brush"
          ? sizeBase * 1.4
          : tool === "pencil"
          ? sizeBase * 0.9
          : sizeBase;
      const options = {
        size,
        thinning:
          tool === "brush"
            ? 0.3
            : tool === "calligraphy"
            ? 0.65
            : tool === "pencil"
            ? 0.05
            : 0.2,
        smoothing: tool === "calligraphy" ? 0.85 : tool === "brush" ? 0.6 : 0.6,
        streamline: tool === "brush" ? 0.4 : 0.4,
        simulatePressure: tool === "brush" || tool === "calligraphy",
        last: true,
      };
      const pfOutline = getStroke(pairs as any, options) as Array<
        [number, number]
      >;
      let d = "";
      if (!pfOutline || pfOutline.length < 3) {
        // Fallback: dot or simple line
        const p = pairs[pairs.length - 1];
        const r = Math.max(0.5, size / 2);
        d = `M ${p[0] - r},${p[1]} A ${r},${r} 0 1,0 ${p[0] + r},${
          p[1]
        } A ${r},${r} 0 1,0 ${p[0] - r},${p[1]} Z`;
        minX = Math.min(minX, p[0] - r);
        maxX = Math.max(maxX, p[0] + r);
        minY = Math.min(minY, p[1] - r);
        maxY = Math.max(maxY, p[1] + r);
      } else {
        d = outlineToPath(pfOutline);
        for (const [x, y] of pfOutline) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
          maxX = Math.max(maxX, x);
          maxY = Math.max(maxY, y);
        }
      }
      const opacity =
        typeof s.opacity === "number"
          ? s.opacity
          : tool === "highlighter"
          ? 0.35
          : 1;
      paths.push({ d, color: s.color || "#111827", opacity });
    }
    // If we couldn't derive valid stroke bounds, fall back to minimal box
    if (
      !isFinite(minX) ||
      !isFinite(minY) ||
      !isFinite(maxX) ||
      !isFinite(maxY)
    ) {
      // Keep paths but fallback to a small canvas box
      return { paths, viewBox: { x: 0, y: 0, w: 1, h: 1 } };
    }

    // Small padding to avoid clipping
    const pad = 4;
    const bounds = {
      x: minX - pad,
      y: minY - pad,
      w: Math.max(1, maxX - minX + pad * 2),
      h: Math.max(1, maxY - minY + pad * 2),
    };

    return {
      paths,
      viewBox: bounds,
    };
  }, [strokes]);

  // Prefer any explicit canvas size stored in the note's drawing_data
  // Common fields may include width/height or canvasWidth/canvasHeight
  const explicitWidth = (note as any)?.drawing_data?.width || (note as any)?.drawing_data?.canvasWidth || (note as any)?.drawing_data?.canvas?.width;
  const explicitHeight = (note as any)?.drawing_data?.height || (note as any)?.drawing_data?.canvasHeight || (note as any)?.drawing_data?.canvas?.height;

  // Fallback sensible defaults (match editor defaults reasonably)
  const canvasW = Number.isFinite(explicitWidth) ? explicitWidth : 1200;
  const canvasH = Number.isFinite(explicitHeight) ? explicitHeight : 900;

  // Use the full canvas viewBox (0..canvasW, 0..canvasH) so the preview shows the whole canvas
  const viewBoxString = `0 0 ${canvasW} ${canvasH}`;
  const innerWidth = Math.max(1, (width || 80) - 16);
  const innerHeight = Math.max(1, (height || 100) - 16);

  return (
    <View style={[styles.card, { width, height }]}> 
      {strokes.length === 0 || computePreviewGeometry.paths.length === 0 ? (
        <View style={[styles.emptyState, { width: innerWidth, height: innerHeight }]}>
          <Text style={styles.emptyText}>Empty drawing</Text>
        </View>
      ) : (
        <Svg
          width={innerWidth}
          height={innerHeight}
          viewBox={viewBoxString}
          preserveAspectRatio="xMidYMid meet"
        >
          {/* white background for canvas */}
          <Rect x={0} y={0} width={canvasW} height={canvasH} fill="#FFFFFF" />
          {/* Render each path; paths are already expressed in canvas coordinates */}
          {computePreviewGeometry.paths.map((p, idx) => (
            <Path key={`outline-${idx}`} d={p.d} fill={p.color} opacity={p.opacity} />
          ))}
        </Svg>
      )}
    </View>
  );
};

const DocumentPreview: React.FC<TemplatePreviewProps> = ({
  note,
  width = 80,
  height = 100,
}) => {
  const { uri, ext } = useMemo(
    () => resolveDocumentUri(note as Note),
    [note?.document_file, note?.document_url]
  );
  const [localUri, setLocalUri] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const load = async () => {
      try {
        if (!uri) {
          throw new Error("No document URI");
        }
        if (ext === "pdf" && isRemoteURL(uri)) {
          // Include auth header for backend resources
          let headers: HeadersInit | undefined;
          if (uri.includes(API_URL)) {
            const token = await AsyncStorage.getItem("authToken");
            if (token)
              headers = {
                Authorization: `Token ${token}`,
                Accept: "application/pdf",
              };
          }
          const result = await getLocalPDFPathEnhanced(
            uri,
            undefined,
            undefined,
            headers
          );
          const path = result.uri;
          if (!mounted) return;
          setLocalUri(path);
        } else {
          setLocalUri(uri);
        }
        setError(null);
      } catch (e: any) {
        setError(e?.message || "Failed to load document");
      } finally {
        setLoading(false);
      }
    };
    load();
    return () => {
      mounted = false;
    };
  }, [uri, ext]);

  // Prepare annotation overlays (first page only) using normalized coordinates 0-1
  const annotations: any[] = useMemo(() => {
    const anns = Array.isArray(note?.document_annotations)
      ? (note?.document_annotations as any[])
      : [];
    // Only show a few to keep it light
    return anns.filter((a) => (a?.page ?? 1) === 1).slice(0, 20);
  }, [note?.document_annotations]);

  const innerWidth = Math.max(1, (width || 80) - 16);
  const innerHeight = Math.max(1, (height || 100) - 16);
  return (
    <View style={[styles.card, { width, height, overflow: "hidden" }]}> 
      {loading ? (
        <View style={[styles.centered, { width: innerWidth, height: innerHeight }]}>
          <ActivityIndicator size="small" color="#6366F1" />
        </View>
      ) : error || !localUri ? (
        <View style={[styles.centered, { width: innerWidth, height: innerHeight }]}>
          <Text style={styles.placeholderText}>
            Document preview unavailable
          </Text>
        </View>
      ) : ext === "pdf" ? (
        <View style={{ width: innerWidth, height: innerHeight }}>
          {Platform.OS !== "web" && Pdf ? (
            <>
              <Pdf
                style={{ width: innerWidth, height: innerHeight }}
                source={{ uri: localUri }}
                page={1}
                trustAllCerts={true}
                enablePaging={false}
              />
              {annotations.length > 0 && (
                <View style={StyleSheet.absoluteFill} pointerEvents="none">
                  <Svg width={innerWidth} height={innerHeight}>
                    <G>
                      {annotations.map((ann, idx) => {
                        if (!ann) return null;
                        if (ann.type === "highlight") {
                          const x = (ann.x || 0) * innerWidth;
                          const y = (ann.y || 0) * innerHeight;
                          const w = (ann.width || 0.15) * innerWidth;
                          const h = (ann.height || 0.05) * innerHeight;
                          return (
                            <Rect key={idx} x={x} y={y} width={w} height={h} fill={ann.color || "#F59E0B"} opacity={0.25} />
                          );
                        }
                        if ((ann.type === "pen" || ann.type === "brush" || ann.type === "pencil") && ann.path) {
                          return (
                            <G key={idx} transform={`scale(${innerWidth}, ${innerHeight})`}>
                              <Path d={ann.path} fill="none" stroke={ann.color || "#1F2937"} strokeWidth={(ann.strokeWidth || 2) / Math.max(innerWidth || 80, innerHeight || 100)} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
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
            <View style={styles.centered}>
              <Text style={styles.placeholderText}>PDF</Text>
            </View>
          )}
        </View>
      ) : (
        <View style={[styles.centered, { width: innerWidth, height: innerHeight }]}>
          <Text style={styles.placeholderText}>{ext?.toUpperCase() || "DOCUMENT"}</Text>
        </View>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: "#E5E7EB",
  },
  emptyState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    color: "#9CA3AF",
    fontSize: 12,
  },
  centered: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  placeholderText: {
    color: "#6B7280",
    fontSize: 12,
    fontFamily: "Inter-Medium",
  },
  contentClip: {
    overflow: "hidden",
  },
});

export default TemplatePreview;
