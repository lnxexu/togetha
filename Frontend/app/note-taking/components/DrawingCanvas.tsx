import React, { useState, useRef, useCallback, useMemo } from 'react';
import { View, StyleSheet, PanResponder, GestureResponderEvent, Dimensions } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { getStroke } from 'perfect-freehand';
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
  const [canvasZoom, setCanvasZoom] = useState(1);
  const [canvasPan, setCanvasPan] = useState({ x: 0, y: 0 });
  const gestureStartDistanceRef = useRef(0);
  const gestureStartZoomRef = useRef(1);
  const isPinchingRef = useRef(false);
  
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
  const segmentIdRef = useRef(0);

  // Use perfect-freehand for professional, smooth stroke rendering
  const getSmoothStrokePath = useCallback((points: Point[], width: number, tool: DrawingTool): string => {
    if (points.length < 2) return '';

    // Convert points to perfect-freehand format [x, y, pressure]
    const pfPoints = points.map(p => [p.x, p.y, p.pressure || 0.5]);

    // Tool-specific perfect-freehand settings optimized for visible, smooth curves
    const options = {
      size: width,
      thinning: tool === 'calligraphy' ? 0.7 : tool === 'brush' ? 0.5 : 0.4,
      smoothing: 0.85, // Even higher smoothing for maximum curve visibility
      streamline: 0.75, // Higher streamline for better curve flow
      easing: (t: number) => {
        // Custom easing for ultra-smooth curves
        const ease = t * t * t * (t * (t * 6 - 15) + 10); // Smootherstep function
        return ease;
      },
      simulatePressure: true,
      last: true,
      start: {
        taper: tool === 'calligraphy' ? 25 : tool === 'brush' ? 15 : 8,
        cap: true,
      },
      end: {
        taper: tool === 'calligraphy' ? 25 : tool === 'brush' ? 15 : 8,
        cap: true,
      },
    };

    const stroke = getStroke(pfPoints, options);
    if (stroke.length === 0) return '';

    // Convert stroke outline to SVG path
    const pathData = stroke.reduce(
      (acc, [x0, y0], i, arr) => {
        if (i === 0) return `M ${x0.toFixed(2)},${y0.toFixed(2)}`;
        return acc + ` L ${x0.toFixed(2)},${y0.toFixed(2)}`;
      },
      ''
    ) + ' Z';

    return pathData;
  }, []);

  const getPressureWidth = useCallback((pressure: number = 1, baseWidth: number): number => {
    const minWidth = baseWidth * 0.5;
    const maxWidth = baseWidth * 1.5;
    return minWidth + (maxWidth - minWidth) * pressure;
  }, []);

  const touchStartTimeRef = useRef(0);
  const touchStartPosRef = useRef({ x: 0, y: 0 });

  const handleTouchStart = useCallback((evt: GestureResponderEvent) => {
    if (disabled) return;

    const { locationX, locationY } = evt.nativeEvent;
    const pressure = (evt.nativeEvent as any).force || 1;
    const timestamp = Date.now();
    
    touchStartTimeRef.current = timestamp;
    touchStartPosRef.current = { x: locationX, y: locationY };
    
    const isEraser = currentTool === 'eraser';
    
    const newStroke: Stroke = {
      id: `stroke_${timestamp}_${Math.random().toString(36).substr(2, 9)}`,
      points: [{
        x: locationX,
        y: locationY,
        pressure,
        timestamp
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
  }, [disabled, currentColor, currentWidth, currentTool, onStrokeUpdate, backgroundColor]);

  // Capture every point for truly seamless strokes - no filtering
  const shouldAddPoint = useCallback((newPoint: Point, lastPoint: Point): boolean => {
    // No distance filtering - capture all movement for maximum smoothness
    // The perfect-freehand library will handle rendering optimization
    return true;
  }, []);
  
  const handleTouchMove = useCallback((evt: GestureResponderEvent) => {
    if (!isDrawing || !currentStroke || disabled) return;

    const { locationX, locationY } = evt.nativeEvent;
    const pressure = (evt.nativeEvent as any).force || 0.5;
    const timestamp = Date.now();
    
    const lastPoint = currentStroke.points[currentStroke.points.length - 1];
    const newPoint: Point = { x: locationX, y: locationY, pressure, timestamp };

    if (shouldAddPoint(newPoint, lastPoint)) {
      // Directly mutate points array for performance - React will still re-render
      currentStroke.points.push(newPoint);
      
      // Update state with the same reference to trigger render
      // This is more efficient than creating new objects every time
      setCurrentStroke({ ...currentStroke });
      
      // Throttle stroke update callbacks to reduce overhead
      if (onStrokeUpdate && currentStroke.points.length % 2 === 0) {
        onStrokeUpdate(currentStroke);
      }
    }
  }, [isDrawing, currentStroke, disabled, onStrokeUpdate, shouldAddPoint]);

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

    const touchDuration = Date.now() - touchStartTimeRef.current;
    const touchDistance = currentStroke.points.length > 1 ? 
      Math.sqrt(
        Math.pow(currentStroke.points[currentStroke.points.length - 1].x - touchStartPosRef.current.x, 2) +
        Math.pow(currentStroke.points[currentStroke.points.length - 1].y - touchStartPosRef.current.y, 2)
      ) : 0;

    // If touch was quick and didn't move much, create a visible dot
    if (touchDuration < 200 && touchDistance < 5) {
      // Create a circular dot by adding points in a circle
      const centerX = currentStroke.points[0].x;
      const centerY = currentStroke.points[0].y;
      const dotRadius = currentStroke.width / 2;
      const dotPoints: Point[] = [];
      
      // Create a circle with 16 points for a smooth dot
      for (let i = 0; i <= 16; i++) {
        const angle = (i / 16) * Math.PI * 2;
        dotPoints.push({
          x: centerX + Math.cos(angle) * dotRadius,
          y: centerY + Math.sin(angle) * dotRadius,
          pressure: 1,
          timestamp: Date.now()
        });
      }
      
      const dotStroke = {
        ...currentStroke,
        points: dotPoints
      };
      
      onStrokeComplete(dotStroke);
    } else if (currentStroke.points.length >= 2) {
      // Normal stroke - minimal optimization to maintain visual consistency
      const optimizationConfig = {
        pen: { simplify: true, smooth: false, tolerance: 0.5, smoothing: 0 },
        pencil: { simplify: true, smooth: false, tolerance: 0.4, smoothing: 0 },
        brush: { simplify: true, smooth: false, tolerance: 1.0, smoothing: 0 },
        highlighter: { simplify: true, smooth: false, tolerance: 1.5, smoothing: 0 },
        calligraphy: { simplify: false, smooth: false, tolerance: 0.3, smoothing: 0 },
        eraser: { simplify: true, smooth: false, tolerance: 1.0, smoothing: 0 },
      };
      
      const config = optimizationConfig[currentTool] || optimizationConfig.pen;
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

  const getDistance = (touches: any[]) => {
    if (touches.length < 2) return 0;
    const [touch1, touch2] = touches;
    const dx = touch1.pageX - touch2.pageX;
    const dy = touch1.pageY - touch2.pageY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const panResponder = PanResponder.create({
    onStartShouldSetPanResponder: (evt) => {
      const touches = evt.nativeEvent.touches || [];
      return !disabled || touches.length === 2;
    },
    onStartShouldSetPanResponderCapture: (evt) => {
      const touches = evt.nativeEvent.touches || [];
      return (!disabled || touches.length === 2);
    },
    onMoveShouldSetPanResponder: (evt) => {
      const touches = evt.nativeEvent.touches || [];
      return !disabled || touches.length === 2;
    },
    onMoveShouldSetPanResponderCapture: (evt) => {
      const touches = evt.nativeEvent.touches || [];
      return (!disabled || touches.length === 2);
    },
    onPanResponderTerminationRequest: () => false,
    onShouldBlockNativeResponder: () => true,
    onPanResponderGrant: (evt) => {
      const touches = evt.nativeEvent.touches || [];
      if (touches.length === 2) {
        // Start pinch zoom
        isPinchingRef.current = true;
        gestureStartZoomRef.current = canvasZoom;
        gestureStartDistanceRef.current = getDistance(touches);
      } else {
        isPinchingRef.current = false;
        handleTouchStart(evt);
      }
    },
    onPanResponderMove: (evt, gestureState) => {
      const touches = evt.nativeEvent.touches || [];
      if (touches.length === 2 && isPinchingRef.current) {
        // Handle pinch zoom
        const currentDistance = getDistance(touches);
        const startDistance = gestureStartDistanceRef.current;
        if (startDistance > 0) {
          const scale = currentDistance / startDistance;
          const newZoom = Math.max(0.5, Math.min(5, gestureStartZoomRef.current * scale));
          setCanvasZoom(newZoom);
        }
      } else if (!isPinchingRef.current) {
        handleTouchMove(evt);
      }
    },
    onPanResponderRelease: () => {
      if (!isPinchingRef.current) {
        handleTouchEnd();
      }
      isPinchingRef.current = false;
      gestureStartDistanceRef.current = 0;
    },
    onPanResponderTerminate: () => {
      if (!isPinchingRef.current) {
        handleTouchEnd();
      }
      isPinchingRef.current = false;
      gestureStartDistanceRef.current = 0;
    },
  });

  // Convert DrawingStroke to Stroke for rendering
  const convertDrawingStrokeToStroke = useCallback((drawingStroke: DrawingStroke): Stroke => {
    const points: Point[] = [];
    for (let i = 0; i < drawingStroke.points.length; i += 2) {
      if (i + 1 < drawingStroke.points.length) {
        const x = drawingStroke.points[i];
        const y = drawingStroke.points[i + 1];
        
        if (typeof x === 'number' && typeof y === 'number') {
          points.push({ x, y, timestamp: drawingStroke.timestamp });
        }
      }
    }

    return {
      id: drawingStroke.id,
      points,
      color: drawingStroke.color,
      width: drawingStroke.width,
      tool: drawingStroke.tool as DrawingTool,
      opacity: drawingStroke.opacity || 1
    };
  }, []);

  const renderStroke = useCallback((stroke: Stroke, index: number | string) => {
    if (stroke.points.length < 2) return null;

    // Calculate effective width
    const effectiveWidth = scaleStrokesWithZoom ? stroke.width * currentZoom : stroke.width;
    
    let pathData: string;
    let opacity = stroke.opacity || 1;
    
    // Use perfect-freehand for pen, pencil, brush, calligraphy (smooth, professional)
    if (stroke.tool === 'pen' || stroke.tool === 'pencil' || stroke.tool === 'brush' || stroke.tool === 'calligraphy') {
      pathData = getSmoothStrokePath(stroke.points, effectiveWidth, stroke.tool);
      if (!pathData) return null;
      
      return (
        <Path
          key={`${stroke.id}-${index}`}
          d={pathData}
          fill={stroke.color}
          opacity={opacity}
        />
      );
    }
    
    // Simple line rendering for highlighter and eraser (fast)
    const createSimplePath = (points: Point[]): string => {
      if (points.length < 2) return '';
      let path = `M${points[0].x},${points[0].y}`;
      for (let i = 1; i < points.length; i++) {
        path += ` L${points[i].x},${points[i].y}`;
      }
      return path;
    };
    
    pathData = createSimplePath(stroke.points);
    if (!pathData) return null;
    
    if (stroke.tool === 'highlighter') {
      return (
        <Path
          key={`${stroke.id}-${index}`}
          d={pathData}
          stroke={stroke.color}
          strokeWidth={effectiveWidth * 2.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
          opacity={0.4}
        />
      );
    }
    
    // Eraser
    return (
      <Path
        key={`${stroke.id}-${index}`}
        d={pathData}
        stroke={stroke.color}
        strokeWidth={effectiveWidth * 1.8}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={1}
      />
    );
  }, [scaleStrokesWithZoom, currentZoom, getSmoothStrokePath]);

  return (
    <View 
      style={[
        styles.container,
        { backgroundColor, width: CANVAS_WIDTH, height: CANVAS_HEIGHT, alignSelf: 'center' },
        CANVAS_MARGIN ? { marginVertical: CANVAS_MARGIN } : null,
      ]} 
      {...panResponder.panHandlers}
      collapsable={false}
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
        <G scale={canvasZoom} origin={`${CANVAS_WIDTH/2}, ${CANVAS_HEIGHT/2}`}>
          {/* Render completed strokes */}
          {strokes.map((drawingStroke, index) => {
            const convertedStroke = convertDrawingStrokeToStroke(drawingStroke);
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