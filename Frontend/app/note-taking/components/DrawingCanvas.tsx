import React, { useState, useRef, useCallback } from 'react';
import { View, StyleSheet, PanResponder, GestureResponderEvent } from 'react-native';
import Svg, { Path, G } from 'react-native-svg';
import { optimizeStroke, strokeToSVGPath } from '../utils/strokeUtils';
import TemplateOverlay, { TemplateType } from './TemplateOverlay';

export interface Point {
  x: number;
  y: number;
  pressure?: number;
  timestamp?: number;
}

export type DrawingTool = 'pen' | 'highlighter' | 'eraser' | 'brush' | 'pencil' | 'marker' | 'calligraphy';

export interface Stroke {
  id: string;
  points: Point[];
  color: string;
  width: number;
  tool: DrawingTool;
  opacity?: number;
}

interface DrawingCanvasProps {
  strokes: Stroke[];
  currentTool: DrawingTool;
  currentColor: string;
  currentWidth: number;
  onStrokeComplete: (stroke: Stroke) => void;
  onStrokeUpdate?: (currentStroke: Stroke | null) => void;
  backgroundColor?: string;
  disabled?: boolean;
  template?: TemplateType;
  templateOptions?: {
    gridSize?: number;
    lineHeight?: number;
    margin?: number;
  };
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
}) => {
  const [currentStroke, setCurrentStroke] = useState<Stroke | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [canvasDimensions, setCanvasDimensions] = useState({ width: 400, height: 600 });
  const strokeIdRef = useRef(0);

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
      id: `stroke_${Date.now()}_${strokeIdRef.current++}`,
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
    
    return existingStrokes.reduce((result, stroke) => {
      if (stroke.points.length === 0) return result;
      
      const remainingPoints = stroke.points.filter(strokePoint => {
        return !eraserStroke.points.some(eraserPoint => {
          const distance = Math.sqrt(
            Math.pow(strokePoint.x - eraserPoint.x, 2) + 
            Math.pow(strokePoint.y - eraserPoint.y, 2)
          );
          return distance < (eraserStroke.width / 2);
        });
      });
      
      if (remainingPoints.length > 0) {
        result.push({
          ...stroke,
          points: remainingPoints
        });
      }
      
      return result;
    }, [] as Stroke[]);
  };

  const handleTouchEnd = useCallback(() => {
    if (!isDrawing || !currentStroke || disabled) return;
  
    if (currentStroke.tool === 'eraser') {
      const updatedStrokes = eraseIntersectingStrokes(strokes, currentStroke);
      onStrokeComplete?.({
        ...currentStroke
      });
    } else if (currentStroke.points.length >= 2) {
      const optimizedStroke = optimizeStroke(currentStroke, {
        simplify: true,
        smooth: true,
        tolerance: 1.5,
        smoothing: 0.3,
      });
      onStrokeComplete?.(optimizedStroke);
    }
  
    setCurrentStroke(null);
    setIsDrawing(false);
    onStrokeUpdate?.(null);
  }, [isDrawing, currentStroke, disabled, onStrokeComplete, onStrokeUpdate, strokes]);

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

  const renderStroke = useCallback((stroke: Stroke, index: number) => {
    if (stroke.points.length < 2 || stroke.tool === 'eraser') return null;

    const pathData = strokeToSVGPath(stroke);
    
    let strokeWidth = stroke.width;
    let strokeOpacity = 1;
    let fillOpacity = 0;
    let strokeLinecap: 'round' | 'square' | 'butt' = 'round';
    let strokeDasharray: string | undefined;
    
    switch (stroke.tool) {
      case 'highlighter':
        strokeWidth = stroke.width * 2.5;
        strokeOpacity = 0.4;
        fillOpacity = 0.2;
        break;
      case 'brush':
        strokeWidth = stroke.width * 1.5;
        strokeLinecap = 'round';
        break;
      case 'pencil':
        strokeWidth = stroke.width * 0.8;
        strokeOpacity = 0.8;
        break;
      case 'marker':
        strokeWidth = stroke.width * 1.2;
        strokeOpacity = 0.9;
        break;
      case 'calligraphy':
        strokeWidth = stroke.width * 1.8;
        strokeLinecap = 'square';
        break;
      case 'pen':
      default:
        strokeWidth = stroke.width;
        break;
    }
    
    return (
      <Path
        key={stroke.id || index}
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
          {strokes.map(renderStroke)}
          {currentStroke && renderStroke(currentStroke, -1)}
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