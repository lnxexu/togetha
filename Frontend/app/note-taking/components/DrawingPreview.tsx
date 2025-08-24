import React from 'react';
import { View, StyleSheet } from 'react-native';
import Svg, { Path } from 'react-native-svg';

interface DrawingStroke {
  id: string;
  points: number[];
  color: string;
  width: number;
  tool: string;
  timestamp: number;
  opacity?: number;
}

interface DrawingPreviewProps {
  drawingData: any;
  width: number;
  height: number;
}

const DrawingPreview: React.FC<DrawingPreviewProps> = ({
  drawingData,
  width,
  height,
}) => {
  const getStrokes = (): DrawingStroke[] => {
    if (!drawingData) {
      console.log('DrawingPreview: No drawing data provided');
      return [];
    }

    console.log('DrawingPreview: Processing drawing data:', {
      type: typeof drawingData,
      isString: typeof drawingData === 'string',
      isArray: Array.isArray(drawingData),
      hasStrokesProperty: drawingData.strokes !== undefined,
      sample: typeof drawingData === 'string' ? drawingData.substring(0, 100) + '...' : 'not string'
    });

    try {
      let strokes: DrawingStroke[] = [];

      if (typeof drawingData === 'string') {
        // Parse JSON string
        const parsed = JSON.parse(drawingData);
        console.log('DrawingPreview: Parsed JSON:', { isArray: Array.isArray(parsed), length: Array.isArray(parsed) ? parsed.length : 'not array' });
        if (Array.isArray(parsed)) {
          strokes = parsed;
        } else if (parsed.strokes && Array.isArray(parsed.strokes)) {
          strokes = parsed.strokes;
        }
      } else if (Array.isArray(drawingData)) {
        // Direct array
        console.log('DrawingPreview: Direct array with', drawingData.length, 'strokes');
        strokes = drawingData;
      } else if (drawingData.strokes && Array.isArray(drawingData.strokes)) {
        // Object with strokes property
        console.log('DrawingPreview: Object with strokes property containing', drawingData.strokes.length, 'strokes');
        strokes = drawingData.strokes;
      }

      console.log('DrawingPreview: Final strokes count:', strokes.length);
      if (strokes.length > 0) {
        console.log('DrawingPreview: First stroke sample:', {
          id: strokes[0].id,
          pointsCount: strokes[0].points?.length,
          color: strokes[0].color,
          tool: strokes[0].tool
        });
      }

      return strokes;
    } catch (error) {
      console.error('Error parsing drawing data for preview:', error);
      return [];
    }
  };

  const strokeToPath = (stroke: DrawingStroke, scaleX: number, scaleY: number): string => {
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
      // Single point, draw a small circle
      const r = Math.max(1, stroke.width / 2);
      return `M${points[0].x},${points[0].y} m-${r},0 a${r},${r} 0 1,0 ${r*2},0 a${r},${r} 0 1,0 -${r*2},0`;
    }

    for (let i = 1; i < points.length; i++) {
      path += ` L${points[i].x},${points[i].y}`;
    }

    return path;
  };

  const strokes = getStrokes();

  if (strokes.length === 0) {
    return <View style={[styles.container, { width, height }]} />;
  }

  // Calculate bounds to fit the drawing in the preview
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

  // Add some padding
  const padding = 20;
  const drawingWidth = maxX - minX + padding * 2;
  const drawingHeight = maxY - minY + padding * 2;

  // Calculate scale to fit in preview
  const scaleX = width / Math.max(drawingWidth, 1);
  const scaleY = height / Math.max(drawingHeight, 1);
  const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down

  // Center the drawing
  const offsetX = (width - drawingWidth * scale) / 2;
  const offsetY = (height - drawingHeight * scale) / 2;

  return (
    <View style={[styles.container, { width, height }]}>
      <Svg width={width} height={height}>
        {strokes.map((stroke, index) => {
          const path = strokeToPath(stroke, scale, scale);
          if (!path) return null;

          return (
            <Path
              key={`${stroke.id}-${index}`} // Use combination of id and index to ensure uniqueness
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
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#FAFAFA',
    borderRadius: 8,
    overflow: 'hidden',
  },
});

export default DrawingPreview;
