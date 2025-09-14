import React, { useMemo } from 'react';
import { View, StyleSheet, Text, Image } from 'react-native';
import Svg, { Line, Circle, Path } from 'react-native-svg';
import RenderHtml from 'react-native-render-html';
import { TemplateType } from './TemplateOverlay';

interface DrawingStroke {
  id: string;
  points: number[];
  color: string;
  width: number;
  tool: string;
  timestamp: number;
  opacity?: number;
}

interface Note {
  id: string;
  title: string;
  content: string;
  formatted_content?: string;
  type: "text" | "image" | "drawing" | "document";
  drawing_data?: any;
  document_file?: string;
  document_url?: string;
  template?: string;
}

interface TemplatePreviewProps {
  template?: TemplateType;
  note?: Note;
  size?: number;
  width?: number;
  height?: number;
}

export const TemplatePreview: React.FC<TemplatePreviewProps> = ({
  template,
  note,
  size = 40,
  width,
  height,
}) => {
  const previewWidth = width || size;
  const previewHeight = height || size;
  const strokeColor = '#D1D5DB';
  const strokeWidth = 0.8;

  // Enhanced HTML tag styles to match the main notes display exactly
  const previewHtmlTagStyles = useMemo(() => ({
    body: {
      fontFamily: 'Inter-Regular',
      fontSize: 10,
      lineHeight: 14,
      color: '#1E293B',
      margin: 0,
      padding: 0,
    },
    p: {
      marginTop: 0,
      marginBottom: 4,
      fontSize: 10,
      lineHeight: 14,
      color: '#1E293B',
      fontFamily: 'Inter-Regular',
    },
    h1: {
      fontSize: 12,
      fontWeight: '700' as const,
      marginTop: 0,
      marginBottom: 4,
      color: '#0F172A',
      fontFamily: 'Inter-Bold',
    },
    h2: {
      fontSize: 11,
      fontWeight: '700' as const,
      marginTop: 0,
      marginBottom: 3,
      color: '#0F172A',
      fontFamily: 'Inter-Bold',
    },
    h3: {
      fontSize: 10,
      fontWeight: '700' as const,
      marginTop: 0,
      marginBottom: 2,
      color: '#0F172A',
      fontFamily: 'Inter-Bold',
    },
    strong: {
      fontWeight: '700' as const,
    },
    em: {
      fontStyle: 'italic' as const,
    },
    u: {
      textDecorationLine: 'underline' as const,
    },
    ul: {
      marginTop: 0,
      marginBottom: 4,
      paddingLeft: 12,
    },
    ol: {
      marginTop: 0,
      marginBottom: 4,
      paddingLeft: 12,
    },
    li: {
      marginBottom: 1,
      fontSize: 10,
      lineHeight: 14,
      color: '#1E293B',
      fontFamily: 'Inter-Regular',
    },
    a: {
      color: '#6A009C',
      textDecorationLine: 'underline' as const,
    },
    blockquote: {
      marginLeft: 6,
      paddingLeft: 6,
      borderLeftWidth: 2,
      borderLeftColor: '#DDD',
      fontStyle: 'italic' as const,
      backgroundColor: '#F9F9F9',
    },
    code: {
      fontFamily: 'Courier',
      backgroundColor: '#F5F5F5',
      paddingHorizontal: 3,
      paddingVertical: 1,
      borderRadius: 2,
      fontSize: 9,
    },
    pre: {
      backgroundColor: '#F5F5F5',
      padding: 6,
      borderRadius: 4,
      overflow: 'hidden' as const,
      fontFamily: 'Courier',
      fontSize: 9,
    },
  }), []);

  // Function to extract and render drawing strokes
  const getDrawingStrokes = (drawingData: any): DrawingStroke[] => {
    if (!drawingData) return [];

    try {
      let strokes: DrawingStroke[] = [];

      if (typeof drawingData === 'string') {
        const parsed = JSON.parse(drawingData);
        if (Array.isArray(parsed)) {
          strokes = parsed;
        } else if (parsed.strokes && Array.isArray(parsed.strokes)) {
          strokes = parsed.strokes;
        }
      } else if (Array.isArray(drawingData)) {
        strokes = drawingData;
      } else if (drawingData.strokes && Array.isArray(drawingData.strokes)) {
        strokes = drawingData.strokes;
      }

      return strokes.filter(stroke => 
        stroke && 
        stroke.points && 
        Array.isArray(stroke.points) && 
        stroke.points.length >= 2 &&
        stroke.color
      );
    } catch (error) {
      console.error('Error parsing drawing data for preview:', error);
      return [];
    }
  };

  // Function to convert stroke to SVG path with improved accuracy
  const strokeToPath = (stroke: DrawingStroke, scaleX: number, scaleY: number, offsetX: number, offsetY: number): string => {
    if (!stroke.points || stroke.points.length < 4) return '';

    const points = [];
    for (let i = 0; i < stroke.points.length; i += 2) {
      const x = stroke.points[i] * scaleX;
      const y = stroke.points[i + 1] * scaleY;
      points.push({ x, y });
    }

    if (points.length < 2) return '';

    let path = `M${points[0].x},${points[0].y}`;
    
    if (points.length === 1) {
      // Single point, draw a small circle to match original behavior
      const r = Math.max(1, stroke.width / 2);
      return `M${points[0].x},${points[0].y} m-${r},0 a${r},${r} 0 1,0 ${r*2},0 a${r},${r} 0 1,0 -${r*2},0`;
    }

    // Create smooth path for better accuracy
    for (let i = 1; i < points.length; i++) {
      path += ` L${points[i].x},${points[i].y}`;
    }

    return path;
  };

  // Function to render note-specific content
  const renderNoteContent = () => {
    if (!note) return null;

    switch (note.type) {
      case 'drawing':
        const strokes = getDrawingStrokes(note.drawing_data);
        if (strokes.length === 0) {
          return (
            <View style={styles.emptyDrawing}>
              <Text style={styles.emptyText}>Empty drawing</Text>
            </View>
          );
        }

        // Calculate bounds exactly like the original DrawingPreview
        let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
        strokes.forEach(stroke => {
          for (let i = 0; i < stroke.points.length; i += 2) {
            const x = stroke.points[i];
            const y = stroke.points[i + 1];
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
          }
        });

        // Add padding like the original
        const padding = 20;
        const drawingWidth = maxX - minX + padding * 2;
        const drawingHeight = maxY - minY + padding * 2;

        // Calculate scale to fit in preview (same logic as original)
        const scaleX = previewWidth / Math.max(drawingWidth, 1);
        const scaleY = previewHeight / Math.max(drawingHeight, 1);
        const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down

        // Center the drawing (same logic as original)
        const offsetX = (previewWidth - drawingWidth * scale) / 2;
        const offsetY = (previewHeight - drawingHeight * scale) / 2;

        return (
          <Svg width={previewWidth} height={previewHeight}>
            {strokes.map((stroke, index) => {
              const path = strokeToPath(stroke, scale, scale, 0, 0);
              if (!path) return null;
              
              return (
                <Path
                  key={`${stroke.id}-${index}`}
                  d={path}
                  stroke={stroke.color}
                  strokeWidth={Math.max(0.5, stroke.width * scale)}
                  strokeOpacity={stroke.opacity || 1}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  transform={`translate(${offsetX + (padding - minX) * scale}, ${offsetY + (padding - minY) * scale})`}
                />
              );
            })}
          </Svg>
        );

      case 'document':
        return (
          <View style={styles.documentPreview}>
            {note.document_file && note.document_file.toLowerCase().match(/\.(jpg|jpeg|png|gif|bmp|webp)$/i) ? (
              <Image 
                source={{ uri: note.document_url || note.document_file }} 
                style={styles.documentImage}
                resizeMode="cover"
                onError={(error) => {
                  console.log('Image failed to load:', error);
                }}
              />
            ) : (
              <View style={styles.documentPlaceholder}>
                <Text style={styles.documentIcon}>
                  {note.document_file?.toLowerCase().includes('.pdf') ? '📄' : 
                   note.document_file?.toLowerCase().includes('.doc') ? '📝' :
                   note.document_file?.toLowerCase().includes('.xls') ? '📊' :
                   note.document_file?.toLowerCase().includes('.ppt') ? '📽️' : '📄'}
                </Text>
                <Text style={styles.documentName} numberOfLines={2}>
                  {note.title || note.document_file?.split('/').pop()?.split('.')[0] || 'Document'}
                </Text>
                {note.document_file && (
                  <Text style={styles.documentType}>
                    {note.document_file.split('.').pop()?.toUpperCase() || 'FILE'}
                  </Text>
                )}
              </View>
            )}
          </View>
        );

      case 'text':
      default:
        if (note.formatted_content) {
          let cleanHtml = note.formatted_content;
          // Clean up the HTML content more carefully for accurate preview
          cleanHtml = cleanHtml.replace(/<p><\/p>/g, '');
          cleanHtml = cleanHtml.replace(/<p>&nbsp;<\/p>/g, '');
          cleanHtml = cleanHtml.replace(/<p>\s*<\/p>/g, '');
          cleanHtml = cleanHtml.replace(/\s+/g, ' ');
          cleanHtml = cleanHtml.trim();
          
          // More intelligent truncation that preserves HTML structure
          if (cleanHtml.length > 200) {
            // Try to find a good breaking point that doesn't break HTML tags
            let truncatePoint = 200;
            let inTag = false;
            for (let i = 0; i < Math.min(cleanHtml.length, 250); i++) {
              if (cleanHtml[i] === '<') inTag = true;
              if (cleanHtml[i] === '>') inTag = false;
              if (!inTag && cleanHtml[i] === ' ' && i <= 200) {
                truncatePoint = i;
              }
            }
            cleanHtml = cleanHtml.substring(0, truncatePoint) + '...';
          }

          return (
            <View style={styles.htmlContainer}>
              <RenderHtml
                contentWidth={previewWidth - 16}
                source={{ html: cleanHtml }}
                tagsStyles={previewHtmlTagStyles}
                enableExperimentalMarginCollapsing={true}
                renderersProps={{
                  img: {
                    enableExperimentalPercentWidth: true,
                  },
                }}
              />
            </View>
          );
        } else if (note.content) {
          // Plain text content with better styling to match the app
          const truncatedContent = note.content.length > 120 ? note.content.substring(0, 120) + '...' : note.content;
          return (
            <Text style={styles.plainTextContent} numberOfLines={6}>
              {truncatedContent}
            </Text>
          );
        } else {
          // Empty note placeholder with better styling
          return (
            <View style={styles.emptyNote}>
              <View style={styles.documentLines}>
                <View style={[styles.documentLine, styles.documentTitleLine]} />
                <View style={[styles.documentLine, { width: '90%' }]} />
                <View style={[styles.documentLine, { width: '75%' }]} />
                <View style={[styles.documentLine, { width: '85%' }]} />
              </View>
              <Text style={styles.emptyText}>Empty note</Text>
            </View>
          );
        }
    }
  };

  // Function to render template preview (for empty notes or template selection)
  const renderTemplatePreview = () => {
    if (!template) return null;

    switch (template) {
      case 'blank':
        return null;
      
      case 'grid':
        const gridSpacing = previewWidth / 4;
        const gridLines = [];
        
        for (let x = gridSpacing; x < previewWidth; x += gridSpacing) {
          gridLines.push(
            <Line
              key={`v-${x}`}
              x1={x}
              y1={0}
              x2={x}
              y2={previewHeight}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
          );
        }
        
        for (let y = gridSpacing; y < previewHeight; y += gridSpacing) {
          gridLines.push(
            <Line
              key={`h-${y}`}
              x1={0}
              y1={y}
              x2={previewWidth}
              y2={y}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
          );
        }
        
        return gridLines;
      
      case 'lines':
        const lineSpacing = previewHeight / 5;
        const horizontalLines = [];
        
        for (let y = lineSpacing; y < previewHeight; y += lineSpacing) {
          horizontalLines.push(
            <Line
              key={`line-${y}`}
              x1={0}
              y1={y}
              x2={previewWidth}
              y2={y}
              stroke={strokeColor}
              strokeWidth={strokeWidth}
            />
          );
        }
        
        horizontalLines.push(
          <Line
            key="margin"
            x1={previewWidth * 0.2}
            y1={0}
            x2={previewWidth * 0.2}
            y2={previewHeight}
            stroke="#3B82F6"
            strokeWidth={strokeWidth * 1.5}
          />
        );
        
        return horizontalLines;
      
      case 'dots':
        const dotSpacing = previewWidth / 6;
        const dots = [];
        
        for (let x = dotSpacing; x < previewWidth; x += dotSpacing) {
          for (let y = dotSpacing; y < previewHeight; y += dotSpacing) {
            dots.push(
              <Circle
                key={`dot-${x}-${y}`}
                cx={x}
                cy={y}
                r={0.5}
                fill={strokeColor}
              />
            );
          }
        }
        
        return dots;
      
      case 'sketch':
        const diagonalLines = [];
        const diagSpacing = previewWidth / 3;
        
        for (let offset = 0; offset < previewWidth; offset += diagSpacing) {
          diagonalLines.push(
            <Line
              key={`diag1-${offset}`}
              x1={0}
              y1={offset}
              x2={previewWidth - offset}
              y2={previewHeight}
              stroke={strokeColor}
              strokeWidth={strokeWidth * 0.6}
            />
          );
          
          diagonalLines.push(
            <Line
              key={`diag2-${offset}`}
              x1={offset}
              y1={0}
              x2={previewWidth}
              y2={previewHeight - offset}
              stroke={strokeColor}
              strokeWidth={strokeWidth * 0.6}
            />
          );
        }
        
        return diagonalLines;
      
      case 'notes':
        const notesElements = [];
        const headerHeight = previewHeight * 0.3;
        const sidebarWidth = previewWidth * 0.25;
        const noteLineSpacing = previewHeight / 8;
        
        notesElements.push(
          <Line
            key="header"
            x1={0}
            y1={headerHeight}
            x2={previewWidth}
            y2={headerHeight}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
        );
        
        notesElements.push(
          <Line
            key="sidebar"
            x1={sidebarWidth}
            y1={headerHeight}
            x2={sidebarWidth}
            y2={previewHeight}
            stroke={strokeColor}
            strokeWidth={strokeWidth}
          />
        );
        
        for (let y = headerHeight + noteLineSpacing; y < previewHeight; y += noteLineSpacing) {
          notesElements.push(
            <Line
              key={`note-line-${y}`}
              x1={sidebarWidth}
              y1={y}
              x2={previewWidth}
              y2={y}
              stroke={strokeColor}
              strokeWidth={strokeWidth * 0.8}
            />
          );
        }
        
        return notesElements;
      
      default:
        return null;
    }
  };

  return (
    <View style={[styles.container, { width: previewWidth, height: previewHeight }]}>
      {note ? renderNoteContent() : (
        <Svg width={previewWidth} height={previewHeight}>
          {renderTemplatePreview()}
        </Svg>
      )}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    padding: 6,
  },
  htmlContainer: {
    flex: 1,
  },
  plainTextContent: {
    fontSize: 10,
    lineHeight: 14,
    color: '#1E293B',
    fontFamily: 'Inter-Regular',
  },
  emptyDrawing: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
  },
  emptyNote: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 9,
    color: '#94A3B8',
    fontStyle: 'italic',
    fontFamily: 'Inter-Regular',
  },
  documentPreview: {
    flex: 1,
    borderRadius: 6,
    overflow: 'hidden',
  },
  documentImage: {
    width: '100%',
    height: '100%',
    borderRadius: 6,
  },
  documentPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F8F9FA',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E9ECEF',
  },
  documentIcon: {
    fontSize: 24,
    marginBottom: 4,
  },
  documentName: {
    fontSize: 9,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 4,
    fontFamily: 'Inter-Regular',
    marginBottom: 2,
  },
  documentType: {
    fontSize: 7,
    color: '#94A3B8',
    textAlign: 'center',
    fontFamily: 'Inter-Medium',
    textTransform: 'uppercase',
  },
  documentLines: {
    width: '100%',
    marginBottom: 6,
  },
  documentLine: {
    height: 1.5,
    backgroundColor: '#E2E8F0',
    marginBottom: 3,
    borderRadius: 1,
  },
  documentTitleLine: {
    width: '60%',
    height: 2,
    backgroundColor: '#CBD5E1',
    marginBottom: 6,
  },
});

export default TemplatePreview;
