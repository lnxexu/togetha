import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, PanResponder, GestureResponderEvent, Dimensions } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { optimizeStroke, strokeToSVGPath, advancedSmoothStroke } from '../utils/strokeUtils';
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

export type CanvasOrientation = 'landscape' | 'portrait';

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
  orientation?: CanvasOrientation; // Canvas orientation
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
  orientation = 'landscape',
}) => {
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  
  // Canvas dimensions based on orientation (fixed medium size)
  const getCanvasDimensions = () => {
    if (orientation === 'landscape') {
      return { width: 800, height: 600 };
    }

    // For portrait, compute a responsive size that fits the device window
    const window = Dimensions.get('window');
    // Use most of the available width with a little padding
    const horizontalPadding = 32; // reasonable default padding
    let width = Math.max(320, window.width - horizontalPadding);

    // Keep an aspect ratio close to portrait (3:4 -> width:height)
    let height = Math.round((width * 4) / 3);

    // Clamp to available height so the canvas never exceeds the visible area
    const reservedVerticalSpace = 180; // header/toolbars estimate
    const maxHeight = Math.max(400, window.height - reservedVerticalSpace);
    if (height > maxHeight) {
      height = Math.round(maxHeight);
      width = Math.round((height * 3) / 4);
    }

    // Compute vertical margin to center the canvas within available window height
    const availableHeight = Math.max(0, window.height - reservedVerticalSpace);
    const marginVertical = Math.max(0, Math.floor((availableHeight - height) / 2));
    return { width, height, marginVertical };
  };
  
  const { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, marginVertical: CANVAS_MARGIN = 0 } = getCanvasDimensions();
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

  // removed dynamic onLayout sizing — canvas uses fixed size constants

  // Enhanced smooth path creation with multiple algorithms
  const createSmoothPath = useCallback((points: Point[], smoothingLevel: number = 0.5): string => {
    if (points.length < 2) return '';
    
    // For very short strokes, use simple linear path
    if (points.length === 2) {
      return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;
    }
    
    // Apply Catmull-Rom spline for smooth curves
    if (points.length >= 4) {
      return createCatmullRomPath(points, smoothingLevel);
    }
    
    // For 3 points, use quadratic bezier with enhanced control points
    return createQuadraticBezierPath(points, smoothingLevel);
  }, []);
  
  // Catmull-Rom spline implementation for ultra-smooth curves
  const createCatmullRomPath = useCallback((points: Point[], tension: number = 0.5): string => {
    let path = `M${points[0].x},${points[0].y}`;
    
    for (let i = 0; i < points.length - 1; i++) {
      const p0 = points[Math.max(i - 1, 0)];
      const p1 = points[i];
      const p2 = points[Math.min(i + 1, points.length - 1)];
      const p3 = points[Math.min(i + 2, points.length - 1)];
      
      // Calculate control points for Catmull-Rom
      const cp1x = p1.x + (p2.x - p0.x) * tension / 6;
      const cp1y = p1.y + (p2.y - p0.y) * tension / 6;
      const cp2x = p2.x - (p3.x - p1.x) * tension / 6;
      const cp2y = p2.y - (p3.y - p1.y) * tension / 6;
      
      path += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
    }
    
    return path;
  }, []);
  
  // Enhanced quadratic bezier for shorter strokes
  const createQuadraticBezierPath = useCallback((points: Point[], smoothing: number = 0.5): string => {
    let path = `M${points[0].x},${points[0].y}`;
    
    for (let i = 1; i < points.length - 1; i++) {
      const current = points[i];
      const next = points[i + 1];
      
      // Enhanced control point calculation with smoothing
      const controlX = current.x * (1 - smoothing) + (points[i-1].x + next.x) * smoothing / 2;
      const controlY = current.y * (1 - smoothing) + (points[i-1].y + next.y) * smoothing / 2;
      const midX = (current.x + next.x) / 2;
      const midY = (current.y + next.y) / 2;
      
      path += ` Q${controlX},${controlY} ${midX},${midY}`;
    }
    
    // Finish with the last point
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
      // Render eraser as a white (canvas background) brush stroke while keeping the tool named 'eraser'
      color: isEraser ? backgroundColor : currentColor,
      // Slightly larger width for eraser to make it feel like a brush
      width: isEraser ? currentWidth * 1.8 : currentWidth,
      tool: currentTool,
      opacity: isEraser ? 1 : (currentTool === 'highlighter' ? 0.4 : 1)
    };

    setCurrentStroke(newStroke);
    setIsDrawing(true);
    onStrokeUpdate?.(newStroke);
  }, [disabled, currentColor, currentWidth, currentTool, onStrokeUpdate]);

  // Enhanced point filtering and smoothing
  const shouldAddPoint = useCallback((newPoint: Point, lastPoint: Point, currentPoints: Point[]): boolean => {
    const distance = Math.sqrt(
      Math.pow(newPoint.x - lastPoint.x, 2) + Math.pow(newPoint.y - lastPoint.y, 2)
    );
    
    // Dynamic distance threshold based on tool and speed
    const minDistance = currentTool === 'pen' ? 1.5 : 
                       currentTool === 'pencil' ? 1.0 : 
                       currentTool === 'brush' ? 2.0 : 2.0;
    
    // Consider velocity for adaptive sampling
    if (currentPoints.length >= 2) {
      const prevPoint = currentPoints[currentPoints.length - 2];
      const velocity = distance / Math.max(1, newPoint.timestamp! - lastPoint.timestamp!);
      
      // Adapt distance threshold based on velocity (faster = more points for smoothness)
      const adaptiveDistance = minDistance * Math.max(0.5, Math.min(2, 1 / (velocity + 0.1)));
      return distance > adaptiveDistance;
    }
    
    return distance > minDistance;
  }, [currentTool]);
  
  const handleTouchMove = useCallback((evt: GestureResponderEvent) => {
    if (!isDrawing || !currentStroke || disabled) return;

    const { locationX, locationY } = evt.nativeEvent;
    const pressure = (evt.nativeEvent as any).force || 1;
    const timestamp = Date.now();
    
    const lastPoint = currentStroke.points[currentStroke.points.length - 1];
    const newPoint: Point = {
      x: locationX,
      y: locationY,
      pressure,
      timestamp
    };

    if (shouldAddPoint(newPoint, lastPoint, currentStroke.points)) {
      // Apply real-time smoothing for immediate visual feedback
      const smoothedPoint = applySmoothingFilter(newPoint, currentStroke.points.slice(-3));
      
      const updatedStroke = {
        ...currentStroke,
        points: [...currentStroke.points, smoothedPoint]
      };

      setCurrentStroke(updatedStroke);
      onStrokeUpdate?.(updatedStroke);
    }
  }, [isDrawing, currentStroke, disabled, onStrokeUpdate, shouldAddPoint]);
  
  // Real-time smoothing filter for immediate visual feedback
  const applySmoothingFilter = useCallback((newPoint: Point, recentPoints: Point[]): Point => {
    if (recentPoints.length < 2) return newPoint;
    
    // Apply exponential moving average for smooth point positioning
    const smoothingFactor = 0.3;
    const lastPoint = recentPoints[recentPoints.length - 1];
    
    return {
      x: lastPoint.x + (newPoint.x - lastPoint.x) * smoothingFactor,
      y: lastPoint.y + (newPoint.y - lastPoint.y) * smoothingFactor,
      pressure: newPoint.pressure,
      timestamp: newPoint.timestamp
    };
  }, []);

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
      // Enhanced optimization parameters based on tool type
      const optimizationConfig = {
        pen: { simplify: true, smooth: true, tolerance: 1.0, smoothing: 0.4 },
        pencil: { simplify: true, smooth: true, tolerance: 0.8, smoothing: 0.5 },
        brush: { simplify: true, smooth: true, tolerance: 2.0, smoothing: 0.3 },
        highlighter: { simplify: true, smooth: true, tolerance: 3.0, smoothing: 0.2 },
        calligraphy: { simplify: false, smooth: true, tolerance: 0.5, smoothing: 0.6 },
        eraser: { simplify: true, smooth: false, tolerance: 2.0, smoothing: 0.1 },
      };
      
      const config = optimizationConfig[currentTool] || optimizationConfig.pen;
      
      // Optimize the stroke before saving
      const optimizedStroke = optimizeStroke(currentStroke, config);
      onStrokeComplete(optimizedStroke);
    }

    setCurrentStroke(null);
    setIsDrawing(false);
    onStrokeUpdate?.(null);
  }, [isDrawing, currentStroke, disabled, onStrokeComplete, onStrokeUpdate, currentTool]);


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

    // Use enhanced smooth path creation with tool-specific smoothing levels
    const smoothingLevels = {
      pen: 0.5,
      pencil: 0.6,
      brush: 0.4,
      highlighter: 0.3,
      calligraphy: 0.7,
      // Treat eraser as a smooth brush for visual appearance
      eraser: 0.45,
    };
    
    const smoothingLevel = smoothingLevels[stroke.tool] || 0.5;
    const pathData = createSmoothPath(stroke.points, smoothingLevel);
    
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
        // Render eraser as a painted stroke using the canvas background color
        strokeWidth = (stroke.width * 1.8) * (scaleStrokesWithZoom ? currentZoom : 1);
        strokeOpacity = 1.0;
        strokeLinecap = 'round';
        // Use the stroke.color (already set to backgroundColor when creating).
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
      style={[
        styles.container,
        { backgroundColor, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, alignSelf: 'center' },
        CANVAS_MARGIN ? { marginVertical: CANVAS_MARGIN } : null,
      ]} 
      {...panResponder.panHandlers}
    >
      <TemplateOverlay 
        template={template}
        canvasWidth={CANVAS_WIDTH}
        canvasHeight={CANVAS_HEIGHT}
        {...templateOptions}
      />
      
      <Svg
        width={CANVAS_WIDTH}
        height={CANVAS_HEIGHT}
        style={{ width: CANVAS_WIDTH, height: CANVAS_HEIGHT }}
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