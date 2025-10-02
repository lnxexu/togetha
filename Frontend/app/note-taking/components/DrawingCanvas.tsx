import React, { useState, useRef, useCallback, useMemo, useEffect } from 'react';
import { View, StyleSheet, PanResponder, GestureResponderEvent, Dimensions } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { getStroke } from 'perfect-freehand';
// import { optimizeStroke, strokeToSVGPath, advancedSmoothStroke } from '../utils/strokeUtils';
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
  // Refs for high-frequency input batching without re-rendering on every point
  const currentStrokeRef = useRef<Stroke | null>(null);
  const framePendingRef = useRef(false);
  const rafIdRef = useRef<number | null>(null);
  const lastUpdateTimeRef = useRef(0);
  const gestureStartDistanceRef = useRef(0);
  const gestureStartZoomRef = useRef(1);
  const isPinchingRef = useRef(false);
  
  // Canvas dimensions based on orientation and screen size
  const getCanvasDimensions = () => {
    const window = Dimensions.get('window');
    // Add horizontal and vertical margins to the canvas
    const horizontalMargin = 10; // margin from the edges of the screen
    const verticalMargin = 10; // margin from the top and bottom
    
    if (orientation === 'landscape') {
      // In landscape, use a percentage of the screen width and height
      const width = Math.round(window.width * 0.9) - (horizontalMargin * 2); // 90% of screen width minus margins
      const height = Math.round(window.height * 0.75) - (verticalMargin * 2); // 75% of screen height minus margins
      return { width, height, marginHorizontal: horizontalMargin, marginVertical: verticalMargin };
    }

    // For portrait orientation
    // Use most of the available width with margins
    let width = Math.max(320, window.width - (horizontalMargin * 2));

    // Keep an aspect ratio close to portrait (3:4 -> width:height)
    let height = Math.round((width * 4) / 3);

    // Clamp to available height so the canvas never exceeds the visible area
    const reservedVerticalSpace = 180; // header/toolbars estimate
    const maxHeight = Math.max(400, window.height - reservedVerticalSpace - (verticalMargin * 2));
    if (height > maxHeight) {
      height = Math.round(maxHeight);
      width = Math.round((height * 3) / 4);
    }

    // Compute vertical margin to center the canvas within available window height
    const availableHeight = Math.max(0, window.height - reservedVerticalSpace);
    const marginVertical = Math.max(verticalMargin, Math.floor((availableHeight - height) / 2));
    return { width, height, marginHorizontal: horizontalMargin, marginVertical };
  };
  
  const { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, marginHorizontal: CANVAS_MARGIN_HORIZONTAL = 0, marginVertical: CANVAS_MARGIN_VERTICAL = 0 } = getCanvasDimensions();
  const strokeIdRef = useRef(0);
  const segmentIdRef = useRef(0);
  // Cache for expensive path computations of completed strokes
  const pathCacheRef = useRef(new Map<string, string>());

  // Lightweight preprocessing for performance
  const preprocessPoints = useCallback((points: Point[], tool: DrawingTool): Point[] => {
    // Skip preprocessing for pen/pencil for maximum responsiveness
    if (tool === 'pen' || tool === 'pencil') return points;
    
    if (points.length < 4) return points;
    
    const smoothedPoints: Point[] = [points[0]]; // Keep first point
    
    // Lighter smoothing for better performance
    for (let i = 2; i < points.length - 2; i += 2) { // Skip every other point for performance
      const prev = points[i - 2];
      const curr = points[i];
      const next = points[i + 2];
      
      // Lighter weighted average
      const smoothed: Point = {
        x: (prev.x * 0.15 + curr.x * 0.7 + next.x * 0.15),
        y: (prev.y * 0.15 + curr.y * 0.7 + next.y * 0.15),
        pressure: curr.pressure,
        timestamp: curr.timestamp
      };
      
      smoothedPoints.push(smoothed);
    }
    
    smoothedPoints.push(points[points.length - 1]); // Keep last point
    return smoothedPoints;
  }, []);

  // Use perfect-freehand for professional, smooth stroke rendering
  const getSmoothStrokePath = useCallback((points: Point[], width: number, tool: DrawingTool): string => {
    if (points.length === 0) return '';
    
    // For single point (dot), create a perfect circle
    if (points.length === 1) {
      const point = points[0];
      const radius = width / 2;
      return `M ${point.x - radius},${point.y} A ${radius},${radius} 0 1,0 ${point.x + radius},${point.y} A ${radius},${radius} 0 1,0 ${point.x - radius},${point.y} Z`;
    }

    // Preprocess points for selected tools only
    const smoothedPoints = preprocessPoints(points, tool);
    
    // Convert points to perfect-freehand format [x, y, pressure]
    const pfPoints = smoothedPoints.map(p => [p.x, p.y, p.pressure || 0.5]);

    // Tool-specific settings for differentiation and performance
    const needsRoundCaps = tool === 'pen' || tool === 'pencil' || tool === 'eraser';
    const isBrush = tool === 'brush';
    const isCalligraphy = tool === 'calligraphy';
    
    // Optimized settings for each tool type
    const options = {
      size: width,
      thinning: needsRoundCaps ? 0.05 : isBrush ? 0.3 : isCalligraphy ? 0.7 : 0.2,
      smoothing: needsRoundCaps ? 0.7 : isBrush ? 0.6 : isCalligraphy ? 0.8 : 0.6, // Reduced for performance
      streamline: needsRoundCaps ? 0.5 : isBrush ? 0.4 : isCalligraphy ? 0.6 : 0.4, // Reduced for responsiveness
      easing: (t: number) => {
        // Simplified easing for better performance
        if (isCalligraphy) {
          // More dramatic easing for calligraphy
          return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
        }
        // Standard smooth easing
        return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      },
      simulatePressure: isBrush || isCalligraphy, // Enable pressure simulation for artistic tools
      last: true,
      start: {
        taper: needsRoundCaps ? 0 : isBrush ? 5 : isCalligraphy ? 12 : 2,
        cap: true,
      },
      end: {
        taper: needsRoundCaps ? 0 : isBrush ? 5 : isCalligraphy ? 12 : 2,
        cap: true,
      },
    };

    const stroke = getStroke(pfPoints, options);
    if (stroke.length === 0) return '';

    // Convert stroke outline to ultra-smooth SVG path with curve interpolation
    let pathData = '';
    const smoothStroke = stroke.length > 4 ? stroke : stroke; // Use all points for small strokes
    
    if (smoothStroke.length < 3) {
      // Simple path for very small strokes
      pathData = smoothStroke.reduce(
        (acc, [x0, y0], i) => {
          if (i === 0) return `M ${x0},${y0}`;
          return acc + ` L ${x0},${y0}`;
        },
        ''
      );
    } else {
      // Create smooth curves using quadratic bezier curves
      const [firstX, firstY] = smoothStroke[0];
      pathData = `M ${firstX},${firstY}`;
      
      for (let i = 1; i < smoothStroke.length - 1; i++) {
        const [currentX, currentY] = smoothStroke[i];
        const [nextX, nextY] = smoothStroke[i + 1];
        
        // Control point is the current point, end point is midway to next
        const endX = (currentX + nextX) / 2;
        const endY = (currentY + nextY) / 2;
        
        pathData += ` Q ${currentX},${currentY} ${endX},${endY}`;
      }
      
      // Add final point
      const [lastX, lastY] = smoothStroke[smoothStroke.length - 1];
      pathData += ` T ${lastX},${lastY}`;
    }
    
    pathData += ' Z';

    return pathData;
  }, [preprocessPoints]);

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
    const pressure = (evt.nativeEvent as any).force || 0.7; // Default to moderate pressure
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
      // For eraser, make it more visible during drawing
      color: isEraser ? '#FF0000' : currentColor, // Red for eraser visibility during drawing
  // Use exact selected width for eraser to respect user size
  width: isEraser ? currentWidth : currentWidth,
      tool: currentTool,
      opacity: isEraser ? 1 : (currentTool === 'highlighter' ? 0.4 : 1)
    };

    // Initialize stroke in both state and ref (state drives rendering; ref is for fast mutation)
    currentStrokeRef.current = newStroke;
    setCurrentStroke(newStroke);
    setIsDrawing(true);
    onStrokeUpdate?.(newStroke);
    // Reset batching state
    framePendingRef.current = false;
    lastUpdateTimeRef.current = Date.now();
  }, [disabled, currentColor, currentWidth, currentTool, onStrokeUpdate, backgroundColor]);

  // Optimized point filtering for maximum responsiveness
  const shouldAddPoint = useCallback((newPoint: Point, lastPoint: Point, tool: DrawingTool): boolean => {
    // Always add the first point for immediate feedback
    if (!lastPoint) return true;
    
    // Calculate distance
    const distance = Math.sqrt(
      Math.pow(newPoint.x - lastPoint.x, 2) + Math.pow(newPoint.y - lastPoint.y, 2)
    );
    
    // Different thresholds for different tools for better performance
  let threshold = 1.0; // Default for pen/pencil
  if (tool === 'brush') threshold = 2.0; // Slightly less dense for brushes
  if (tool === 'calligraphy') threshold = 1.5; // Medium density for calligraphy
  // Make eraser denser so intersections are detected reliably
  if (tool === 'eraser') threshold = 1.5;
    
    return distance > threshold;
  }, []);
  
  const handleTouchMove = useCallback((evt: GestureResponderEvent) => {
    if (!isDrawing || disabled) return;
    const activeStroke = currentStrokeRef.current;
    if (!activeStroke) return;

    const { locationX, locationY } = evt.nativeEvent;
    const pressure = (evt.nativeEvent as any).force || 0.7;
    const timestamp = Date.now();

    const newPoint: Point = { x: locationX, y: locationY, pressure, timestamp };
    const lastPoint = activeStroke.points[activeStroke.points.length - 1];

    // Use optimized filtering for better performance
    if (shouldAddPoint(newPoint, lastPoint, currentTool)) {
      // Mutate ref directly to avoid frequent re-renders
      activeStroke.points.push(newPoint);

      // Schedule a single state update per animation frame
      if (!framePendingRef.current) {
        framePendingRef.current = true;
        rafIdRef.current = requestAnimationFrame(() => {
          framePendingRef.current = false;
          // Trigger a render with the latest ref snapshot
          const latest = currentStrokeRef.current;
          if (latest) setCurrentStroke({ ...latest });
        });
      }

      // Throttle onStrokeUpdate to ~30-60fps
      if (timestamp - lastUpdateTimeRef.current > 32) {
        lastUpdateTimeRef.current = timestamp;
        onStrokeUpdate?.(activeStroke);
      }
    }
  }, [isDrawing, disabled, onStrokeUpdate, shouldAddPoint, currentTool]);

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
  if (!isDrawing || disabled) return;
  const finishingStroke = currentStrokeRef.current || currentStroke;
  if (!finishingStroke) return;

    const touchDuration = Date.now() - touchStartTimeRef.current;
    const touchDistance = finishingStroke.points.length > 1 ? 
      Math.sqrt(
        Math.pow(finishingStroke.points[finishingStroke.points.length - 1].x - touchStartPosRef.current.x, 2) +
        Math.pow(finishingStroke.points[finishingStroke.points.length - 1].y - touchStartPosRef.current.y, 2)
      ) : 0;

    // If touch was quick and didn't move much, create a visible dot (perfect circle)
    // Compute total zoom to align width in canvas space with on-screen width
    const totalZoom = (currentZoom || 1) * (canvasZoom || 1);
    const adjustWidthForZoom = (width:number) => (scaleStrokesWithZoom ? width : width / (totalZoom || 1));

    if (touchDuration < 200 && touchDistance < 5) {
      // For ballpoint pen effect, create a simple single-point dot that will be rendered as a circle
      const dotStroke = {
        ...finishingStroke,
        // Ensure eraser width aligns with visual width
        width: finishingStroke.tool === 'eraser' ? adjustWidthForZoom(finishingStroke.width) : finishingStroke.width,
        points: [finishingStroke.points[0]] // Keep only the first point for perfect circle rendering
      };
      
      onStrokeComplete(dotStroke);
    } else if (finishingStroke.points.length >= 1) {
      // Normal stroke - use as-is for maximum responsiveness (single point or multi-point)
      const finalized = finishingStroke.tool === 'eraser'
        ? { ...finishingStroke, width: adjustWidthForZoom(finishingStroke.width) }
        : finishingStroke;
      onStrokeComplete(finalized);
    }

    setCurrentStroke(null);
    currentStrokeRef.current = null;
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
    if (stroke.points.length === 0) return null;

  // Calculate effective width compensating for all zoom factors applied (outer + inner)
  const totalZoom = (currentZoom || 1) * (canvasZoom || 1);
  const effectiveWidth = scaleStrokesWithZoom ? stroke.width : stroke.width / (totalZoom || 1);
    
    let pathData: string;
    let opacity = stroke.opacity || 1;
    
    // Create smooth path for better curves
    const createSmoothPath = (points: Point[]): string => {
      if (points.length < 2) return '';
      if (points.length === 2) {
        return `M${points[0].x},${points[0].y} L${points[1].x},${points[1].y}`;
      }
      
      let path = `M${points[0].x},${points[0].y}`;
      
      // Use quadratic curves for smoothness
      for (let i = 1; i < points.length - 1; i++) {
        const current = points[i];
        const next = points[i + 1];
        const controlX = current.x;
        const controlY = current.y;
        const endX = (current.x + next.x) / 2;
        const endY = (current.y + next.y) / 2;
        
        path += ` Q${controlX},${controlY} ${endX},${endY}`;
      }
      
      // Add final point
      const lastPoint = points[points.length - 1];
      path += ` T${lastPoint.x},${lastPoint.y}`;
      
      return path;
    };
    
    // Optimize rendering based on stroke state and tool
    const isCurrentStroke = index === 'current';

    // While drawing: show smoothing live for pen-like tools; keep eraser/highlighter lightweight
    if (isCurrentStroke) {
      // Consistent visual: use perfect-freehand outline while drawing for pen-like tools.
      // Keep centerline for highlighter and eraser during drawing for responsiveness and effect.
      if (stroke.tool === 'highlighter') {
        pathData = createSmoothPath(stroke.points);
        if (!pathData) return null;
        return (
          <Path
            key={`${stroke.id}-${index}`}
            d={pathData}
            stroke={stroke.color}
            strokeWidth={effectiveWidth * 2.0}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={0.35}
          />
        );
      }
      if (stroke.tool === 'eraser') {
        pathData = createSmoothPath(stroke.points);
        if (!pathData) return null;
        return (
          <Path
            key={`${stroke.id}-${index}`}
            d={pathData}
            stroke={stroke.color}
            strokeWidth={effectiveWidth}
            strokeLinecap="round"
            strokeLinejoin="round"
            fill="none"
            opacity={opacity}
          />
        );
      }

      // Single-point (dot) handling while drawing
      if (stroke.points.length === 1) {
        const dotPath = getSmoothStrokePath(stroke.points, effectiveWidth, stroke.tool);
        if (!dotPath) return null;
        return (
          <Path
            key={`${stroke.id}-${index}`}
            d={dotPath}
            fill={stroke.color}
            opacity={opacity}
          />
        );
      }

      // Use the same PF path as completed strokes to avoid position jump
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
    
    // For all other strokes and longer current strokes, use smooth rendering
    if (stroke.tool === 'pen' || stroke.tool === 'pencil' || stroke.tool === 'eraser' || stroke.tool === 'brush' || stroke.tool === 'calligraphy') {
      // Use cached path for completed strokes since it's expensive
  const cacheKey = `${stroke.id}:${effectiveWidth}:${stroke.tool}`;
      const cached = pathCacheRef.current.get(cacheKey);
      if (cached) {
        pathData = cached;
      } else {
        pathData = getSmoothStrokePath(stroke.points, effectiveWidth, stroke.tool);
        if (pathData) pathCacheRef.current.set(cacheKey, pathData);
      }
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
    
    // Handle highlighter with special rendering
    if (stroke.tool === 'highlighter') {
      pathData = createSmoothPath(stroke.points);
      if (!pathData) return null;
      
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

    // Fallback rendering for any remaining tools
    if (stroke.points.length === 1) {
      const dotPath = getSmoothStrokePath(stroke.points, effectiveWidth, stroke.tool);
      if (!dotPath) return null;
      return (
        <Path
          key={`${stroke.id}-${index}`}
          d={dotPath}
          fill={stroke.color}
          opacity={opacity}
        />
      );
    }
    pathData = createSmoothPath(stroke.points);
    if (!pathData) return null;
    return (
      <Path
        key={`${stroke.id}-${index}`}
        d={pathData}
        stroke={stroke.color}
        strokeWidth={effectiveWidth}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
        opacity={opacity}
      />
    );
  }, [scaleStrokesWithZoom, currentZoom, getSmoothStrokePath]);

  // Memoize conversion from DrawingStroke to Stroke to avoid recomputation on each render
  const memoConvertedStrokes = useMemo(() => {
    return strokes.map((drawingStroke) => convertDrawingStrokeToStroke(drawingStroke));
  }, [strokes, convertDrawingStrokeToStroke]);

  // Memoize the completed strokes layer so current stroke updates don't cause remapping
  const completedStrokesLayer = useMemo(() => {
    return memoConvertedStrokes.map((convertedStroke, index) => renderStroke(convertedStroke, index));
  }, [memoConvertedStrokes, renderStroke]);

  // Cleanup any pending animation frames on unmount
  useEffect(() => {
    return () => {
      if (rafIdRef.current != null) {
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = null;
      }
    };
  }, []);

  return (
    <View 
      style={[
        styles.container,
        { 
          backgroundColor, 
          width: CANVAS_WIDTH, 
          height: CANVAS_HEIGHT, 
          alignSelf: 'center',
          marginHorizontal: CANVAS_MARGIN_HORIZONTAL,
          marginVertical: CANVAS_MARGIN_VERTICAL,
        }
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
          {completedStrokesLayer}

          {/* Render current stroke being drawn */}
          {currentStroke && renderStroke(currentStroke, 'current')}
        </G>
      </Svg>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    borderWidth: 1,
    borderColor: '#e0e0e0',
  },
});

export default DrawingCanvas;