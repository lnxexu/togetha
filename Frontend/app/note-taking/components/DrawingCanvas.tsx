import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, PanResponder, GestureResponderEvent } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { optimizeStroke, strokeToSVGPath } from '../utils/strokeUtils';
import TemplateOverlay, { TemplateType } from './TemplateOverlay';
import { DrawingStroke } from '../services/drawingAPI';

export interface Point {
  x: number;
  y: number;
  pressure?: number;
  timestamp?: number;
}

export type DrawingTool = 'pen' | 'highlighter' | 'eraser' | 'brush' | 'pencil' | 'calligraphy';

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
  tool: DrawingTool;
  opacity?: number;
}

interface DrawingCanvasProps {
  strokes: DrawingStroke[];
  currentTool: DrawingTool;
  onAddStroke: (stroke: DrawingStroke) => void;
  currentColor: string;
  currentWidth: number;
  onStrokeComplete: (stroke: Stroke) => void;
  onStrokeUpdate?: (stroke: Stroke | null) => void;
  backgroundColor?: string;
  disabled?: boolean;
  template?: TemplateType;
  templateOptions?: {
    gridSize?: number;
    lineHeight?: number;
    margin?: number;
  };
  scaleStrokesWithZoom?: boolean; // Controls whether stroke thickness scales with zoom
  currentZoom?: number; // Current zoom level for scaling calculations
}

export const DrawingCanvas: React.FC<DrawingCanvasProps> = ({
  strokes,
  currentTool,
  currentColor,
  currentWidth,
  onStrokeComplete,
  onStrokeUpdate,
  backgroundColor = '#ffffff',
  disabled = false,
  template = 'blank',
  templateOptions = {},
  scaleStrokesWithZoom = false,
  currentZoom = 1,
}) => {
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 400, height: 600 });
  const strokeIdRef = useRef(0);
  // Add a ref for unique segment ID generation
  const segmentIdRef = useRef(0);

  // Debug effect to monitor strokes received
  React.useEffect(() => {
    console.log('DrawingCanvas: Received strokes:', strokes.length);
    if (strokes.length > 0) {
      console.log('DrawingCanvas: First stroke sample:', strokes[0]);
      console.log('DrawingCanvas: First stroke validation:', {
        hasId: !!strokes[0]?.id,
        hasPoints: Array.isArray(strokes[0]?.points),
        pointsLength: strokes[0]?.points?.length,
        pointsFormat: strokes[0]?.points?.slice(0, 4),
        hasColor: !!strokes[0]?.color,
        hasWidth: !!strokes[0]?.width,
        hasTool: !!strokes[0]?.tool,
      });
    }
  }, [strokes]);

  const onLayout = useCallback((event: any) => {
    const { width, height } = event.nativeEvent.layout;
    if (width > 0 && height > 0) {
      setCanvasDimensions({ width, height });
    }
  }, []);

  const createSmoothPath = useCallback((points: Point[]): string => {
    if (points.length < 2) return '';
    
    let path = `M${points[0].x},${points[0].y}`;
    
    if (points.length === 2) {
      path += ` L${points[1].x},${points[1].y}`;
      return path;
    }

    for (let i = 1; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      
      path += ` Q${current.x},${current.y} ${midX},${midY}`;
    }
    
    const lastPoint = points[points.length - 1];
    path += ` L${lastPoint.x},${lastPoint.y}`;
    
    return path;
  }, []);

  const getPressureWidth = useCallback((pressure: number = 1, baseWidth: number): number => {
    const minWidth = baseWidth * 0.5;
    const maxWidth = baseWidth * 1.5;
    return minWidth + (maxWidth - minWidth) * pressure;
  }, []);

  const handleTouchStart = useCallback((evt: GestureResponderEvent) => {
    if (disabled) return;

    const { locationX, locationY } = evt.nativeEvent;
    const pressure = (evt.nativeEvent as any).force || 1;
    
    const isEraser = currentTool === 'eraser';
    
    const newStroke: Stroke = {
      id: `stroke_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      points: [{
        x: locationX,
        y: locationY,
        pressure,
        timestamp: Date.now()
      }],
      color: isEraser ? 'transparent' : currentColor,
      width: isEraser ? currentWidth * 2 : currentWidth,
      tool: currentTool,
      opacity: isEraser ? 1 : (currentTool === 'highlighter' ? 0.4 : 1)
    };

    setCurrentStroke(newStroke);
    setIsDrawing(true);
    onStrokeUpdate?.(newStroke);
  }, [disabled, currentColor, currentWidth, currentTool, onStrokeUpdate]);

  const handleTouchMove = useCallback((evt: GestureResponderEvent) => {
    if (!isDrawing || !currentStroke || disabled) return;

    const { locationX, locationY } = evt.nativeEvent;
    const pressure = (evt.nativeEvent as any).force || 1;
    
    const lastPoint = currentStroke.points[currentStroke.points.length - 1];
    const distance = Math.sqrt(
      Math.pow(locationX - lastPoint.x, 2) + Math.pow(locationY - lastPoint.y, 2)
    );

    if (distance > 2) {
      const newPoint: Point = {
        x: locationX,
        y: locationY,
        pressure,
        timestamp: Date.now()
      };

      const updatedStroke = {
        ...currentStroke,
        points: [...currentStroke.points, newPoint]
      };

      setCurrentStroke(updatedStroke);
      onStrokeUpdate?.(updatedStroke);
    }
  }, [isDrawing, currentStroke, disabled, onStrokeUpdate]);

  const eraseIntersectingStrokes = (existingStrokes: Stroke[], eraserStroke: Stroke): Stroke[] => {
    if (!eraserStroke.points.length) return existingStrokes;
    
    const eraseThreshold = eraserStroke.width / 2;
    
    return existingStrokes.reduce((result, stroke) => {
      if (stroke.points.length === 0) return result;
      
      // Find points that are NOT intersecting with the eraser
      const survivingPoints = stroke.points.filter(strokePoint => {
        return !eraserStroke.points.some(eraserPoint => {
          const distance = Math.sqrt(
            Math.pow(strokePoint.x - eraserPoint.x, 2) + 
            Math.pow(strokePoint.y - eraserPoint.y, 2)
          );
          return distance < eraseThreshold;
        });
      });
      
      // If we have enough surviving points, create segments
      if (survivingPoints.length > 1) {
        // Group consecutive surviving points into segments
        const segments: Point[][] = [];
        let currentSegment: Point[] = [];
        let lastValidIndex = -2;
        
        survivingPoints.forEach(point => {
          const originalIndex = stroke.points.findIndex(p => 
            p.x === point.x && p.y === point.y && p.timestamp === point.timestamp
          );
          
          if (originalIndex === lastValidIndex + 1 || currentSegment.length === 0) {
            // Continue current segment
            currentSegment.push(point);
          } else {
            // Start new segment
            if (currentSegment.length > 1) {
              segments.push([...currentSegment]);
            }
            currentSegment = [point];
          }
          
          lastValidIndex = originalIndex;
        });
        
        // Add the last segment
        if (currentSegment.length > 1) {
          segments.push(currentSegment);
        }
        
        // Create new strokes for each segment
        segments.forEach((segment, index) => {
          if (segment.length > 1) {
            // Generate unique ID for each segment using a counter
            const uniqueSegmentId = `${stroke.id}_segment_${index}_${++segmentIdRef.current}`;
            result.push({
              ...stroke,
              id: uniqueSegmentId,
              points: segment,
            });
          }
        });
      }
      
      return result;
    }, [] as Stroke[]);
  };

const handleTouchEnd = useCallback(() => {
    if (!isDrawing || !currentStroke || disabled) return;

    // Ensure we have at least 2 points for a valid stroke
    if (currentStroke.points.length >= 2) {
      // Optimize the stroke before saving
      const optimizedStroke = optimizeStroke(currentStroke, {
        simplify: true,
        smooth: true,
        tolerance: 1.5,
        smoothing: 0.3,
      });
      onStrokeComplete(optimizedStroke);
    }

    setCurrentStroke(null);
    setIsDrawing(false);
    onStrokeUpdate?.(null);
  }, [isDrawing, currentStroke, disabled, onStrokeComplete, onStrokeUpdate]);


  const getStrokeBounds = (stroke: Stroke): { minX: number; minY: number; maxX: number; maxY: number } => {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    
    stroke.points.forEach(point => {
      minX = Math.min(minX, point.x);
      minY = Math.min(minY, point.y);
      maxX = Math.max(maxX, point.x);
      maxY = Math.max(maxY, point.y);
    });
    
    const padding = stroke.width / 2;
    return {
      minX: minX - padding,
      minY: minY - padding,
      maxX: maxX + padding,
      maxY: maxY + padding
    };
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: () => !disabled,
    onMoveShouldSetPanResponder: () => !disabled,
    onPanResponderGrant: handleTouchStart,
    onPanResponderMove: handleTouchMove,
    onPanResponderRelease: handleTouchEnd,
    onPanResponderTerminate: handleTouchEnd,
  });

  // Convert DrawingStroke to Stroke for rendering
  const convertDrawingStrokeToStroke = useCallback((drawingStroke: DrawingStroke): Stroke => {
    console.log(`Converting stroke ${drawingStroke.id}:`, {
      originalPointsLength: drawingStroke.points.length,
      originalPointsSample: drawingStroke.points.slice(0, 8),
      pointsAreNumbers: drawingStroke.points.every(p => typeof p === 'number'),
      color: drawingStroke.color,
      width: drawingStroke.width,
      tool: drawingStroke.tool
    });
    
    const points: Point[] = [];
    for (let i = 0; i < drawingStroke.points.length; i += 2) {
      if (i + 1 < drawingStroke.points.length) {
        const x = drawingStroke.points[i];
        const y = drawingStroke.points[i + 1];
        
        if (typeof x === 'number' && typeof y === 'number') {
          points.push({
            x: x,
            y: y,
            timestamp: drawingStroke.timestamp
          });
        } else {
          console.warn(`Invalid point data at index ${i}:`, { x, y, xType: typeof x, yType: typeof y });
        }
      }
    }

    const convertedStroke = {
      id: drawingStroke.id,
      points,
      color: drawingStroke.color,
      width: drawingStroke.width,
      tool: drawingStroke.tool as DrawingTool,
      opacity: drawingStroke.opacity || 1
    };

    console.log(`Converted stroke ${drawingStroke.id}:`, {
      convertedPointsLength: convertedStroke.points.length,
      convertedPointsSample: convertedStroke.points.slice(0, 4),
      isValidStroke: convertedStroke.points.length >= 2,
      allFieldsPresent: {
        hasId: !!convertedStroke.id,
        hasPoints: Array.isArray(convertedStroke.points),
        hasColor: !!convertedStroke.color,
        hasWidth: !!convertedStroke.width,
        hasTool: !!convertedStroke.tool,
      }
    });

    return convertedStroke;
  }, []);

  const renderStroke = useCallback((stroke: Stroke, index: number | string) => {
    if (stroke.points.length < 2) {
      console.log(`DrawingCanvas: Skipping stroke ${stroke.id} - insufficient points:`, stroke.points.length);
      return null;
    }

    const pathData = strokeToSVGPath(stroke);
    
    if (!pathData) {
      console.log(`DrawingCanvas: No path data for stroke ${stroke.id}`);
      return null;
    }
    
    console.log(`DrawingCanvas: Rendering stroke ${stroke.id} with ${stroke.points.length} points, color: ${stroke.color}, width: ${stroke.width}`);
    
    // Apply tool-specific styling with optional zoom scaling
    let strokeWidth = stroke.width * (scaleStrokesWithZoom ? currentZoom : 1);
    let strokeOpacity = 1;
    let fillOpacity = 0;
    let strokeLinecap: 'round' | 'square' | 'butt' = 'round';
    let strokeDasharray: string | undefined;
    
    switch (stroke.tool) {
      case 'highlighter':
        strokeWidth = (stroke.width * 2.5) * (scaleStrokesWithZoom ? currentZoom : 1);
        strokeOpacity = 0.4;
        fillOpacity = 0.2;
        break;
      case 'brush':
        strokeWidth = (stroke.width * 1.8) * (scaleStrokesWithZoom ? currentZoom : 1);
        strokeOpacity = 0.9;
        strokeLinecap = 'round';
        break;
      case 'pencil':
        strokeWidth = (stroke.width * 0.8) * (scaleStrokesWithZoom ? currentZoom : 1);
        strokeOpacity = 0.8;
        strokeLinecap = 'round';
        break;
      case 'calligraphy':
        strokeWidth = (stroke.width * 1.8) * (scaleStrokesWithZoom ? currentZoom : 1);
        strokeLinecap = 'square';
        break;
      case 'eraser':
        // Eraser strokes are temporary and should appear as dashed lines
        strokeWidth = stroke.width * (scaleStrokesWithZoom ? currentZoom : 1);
        strokeOpacity = 0.5;
        strokeDasharray = '5,5';
        break;
      case 'pen':
      default:
        strokeWidth = stroke.width * (scaleStrokesWithZoom ? currentZoom : 1);
        strokeOpacity = 1.0;
        strokeLinecap = 'round';
        break;
    }
    
    return (
      <Path
        key={`${stroke.id}-${index}`}
        d={pathData}
        stroke={stroke.color}
        strokeWidth={strokeWidth}
        strokeLinecap={strokeLinecap}
        strokeLinejoin="round"
        fill={stroke.tool === 'highlighter' ? stroke.color : 'none'}
        fillOpacity={fillOpacity}
        opacity={stroke.opacity || 1}
        strokeOpacity={strokeOpacity}
        strokeDasharray={strokeDasharray}
      />
    );
  }, []);

  return (
    <View 
      style={[styles.container, { backgroundColor }]} 
      onLayout={onLayout}
      {...panResponder.panHandlers}
    >
      <TemplateOverlay 
        template={template}
        canvasWidth={canvasDimensions.width}
        canvasHeight={canvasDimensions.height}
        {...templateOptions}
      />
      
      <Svg
        width={canvasDimensions.width}
        height={canvasDimensions.height}
        style={StyleSheet.absoluteFillObject}
      >
        <G>
          {/* Render completed strokes */}
          {strokes.map((drawingStroke, index) => {
            console.log(`DrawingCanvas: Processing stroke ${index}:`, drawingStroke.id);
            const convertedStroke = convertDrawingStrokeToStroke(drawingStroke);
            console.log(`DrawingCanvas: Converted stroke ${index}:`, convertedStroke.id, 'points:', convertedStroke.points.length);
            return renderStroke(convertedStroke, index);
          })}
          
          {/* Render current stroke being drawn */}
          {currentStroke && renderStroke(currentStroke, 'current')}
        </G>
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    width: '100%',
    height: '100%',
    backgroundColor: '#ffffff',
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
});

export default DrawingCanvas;