import { Point, Stroke } from '../components/DrawingCanvas';

/**
 * Stroke optimization utilities for better performance and quality
 * Similar to techniques used by Goodnotes and other drawing apps
 */

export interface OptimizedStroke extends Stroke {
  boundingBox?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  length?: number;
}

/**
 * Simplify a stroke using the Ramer-Douglas-Peucker algorithm
 * Reduces the number of points while maintaining the stroke's shape
 */
export function simplifyStroke(points: Point[], tolerance: number = 2): Point[] {
  if (points.length <= 2) return points;

  const simplified = ramerDouglasPeucker(points, tolerance);
  return simplified.length < 2 ? points : simplified;
}

function ramerDouglasPeucker(points: Point[], tolerance: number): Point[] {
  if (points.length <= 2) return points;

  let maxDistance = 0;
  let maxIndex = 0;
  const start = points[0];
  const end = points[points.length - 1];

  for (let i = 1; i < points.length - 1; i++) {
    const distance = perpendicularDistance(points[i], start, end);
    if (distance > maxDistance) {
      maxDistance = distance;
      maxIndex = i;
    }
  }

  if (maxDistance > tolerance) {
    const leftPart = ramerDouglasPeucker(points.slice(0, maxIndex + 1), tolerance);
    const rightPart = ramerDouglasPeucker(points.slice(maxIndex), tolerance);
    
    return [...leftPart.slice(0, -1), ...rightPart];
  }

  return [start, end];
}

function perpendicularDistance(point: Point, lineStart: Point, lineEnd: Point): number {
  const A = lineEnd.x - lineStart.x;
  const B = lineEnd.y - lineStart.y;
  const C = point.x - lineStart.x;
  const D = point.y - lineStart.y;

  const dot = A * C + B * D;
  const lenSq = A * A + B * B;
  
  if (lenSq === 0) return Math.sqrt(C * C + D * D);

  const param = dot / lenSq;
  
  let xx: number, yy: number;
  
  if (param < 0) {
    xx = lineStart.x;
    yy = lineStart.y;
  } else if (param > 1) {
    xx = lineEnd.x;
    yy = lineEnd.y;
  } else {
    xx = lineStart.x + param * A;
    yy = lineStart.y + param * B;
  }

  const dx = point.x - xx;
  const dy = point.y - yy;
  
  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Smooth a stroke using Catmull-Rom spline interpolation
 * Creates smoother curves between points
 */
export function smoothStroke(points: Point[], smoothing: number = 0.5): Point[] {
  if (points.length < 3) return points;

  const smoothed: Point[] = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    // Catmull-Rom interpolation
    const smoothedPoint: Point = {
      x: curr.x + smoothing * (prev.x - next.x) * 0.25,
      y: curr.y + smoothing * (prev.y - next.y) * 0.25,
      pressure: curr.pressure,
      timestamp: curr.timestamp,
    };

    smoothed.push(smoothedPoint);
  }

  smoothed.push(points[points.length - 1]);
  return smoothed;
}

/**
 * Calculate bounding box for a stroke
 */
export function calculateBoundingBox(points: Point[]): { x: number; y: number; width: number; height: number } {
  if (points.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = points[0].x;
  let maxX = points[0].x;
  let minY = points[0].y;
  let maxY = points[0].y;

  for (const point of points) {
    minX = Math.min(minX, point.x);
    maxX = Math.max(maxX, point.x);
    minY = Math.min(minY, point.y);
    maxY = Math.max(maxY, point.y);
  }

  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

/**
 * Calculate the total length of a stroke
 */
export function calculateStrokeLength(points: Point[]): number {
  if (points.length < 2) return 0;

  let length = 0;
  for (let i = 1; i < points.length; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    length += Math.sqrt(dx * dx + dy * dy);
  }

  return length;
}

/**
 * Optimize a stroke for better performance and quality
 */
export function optimizeStroke(stroke: Stroke, options: {
  simplify?: boolean;
  smooth?: boolean;
  tolerance?: number;
  smoothing?: number;
} = {}): OptimizedStroke {
  const {
    simplify = true,
    smooth = true,
    tolerance = 2,
    smoothing = 0.3,
  } = options;

  let optimizedPoints = [...stroke.points];

  // Apply smoothing first
  if (smooth && optimizedPoints.length > 2) {
    optimizedPoints = smoothStroke(optimizedPoints, smoothing);
  }

  // Then simplify to reduce points
  if (simplify && optimizedPoints.length > 2) {
    optimizedPoints = simplifyStroke(optimizedPoints, tolerance);
  }

  const optimizedStroke: OptimizedStroke = {
    ...stroke,
    points: optimizedPoints,
    boundingBox: calculateBoundingBox(optimizedPoints),
    length: calculateStrokeLength(optimizedPoints),
  };

  return optimizedStroke;
}

/**
 * Check if two strokes intersect (useful for eraser tool)
 */
export function strokesIntersect(stroke1: Stroke, stroke2: Stroke): boolean {
  const bbox1 = calculateBoundingBox(stroke1.points);
  const bbox2 = calculateBoundingBox(stroke2.points);

  // Quick bounding box check first
  if (
    bbox1.x > bbox2.x + bbox2.width ||
    bbox2.x > bbox1.x + bbox1.width ||
    bbox1.y > bbox2.y + bbox2.height ||
    bbox2.y > bbox1.y + bbox1.height
  ) {
    return false;
  }

  // More detailed intersection check
  for (let i = 0; i < stroke1.points.length - 1; i++) {
    for (let j = 0; j < stroke2.points.length - 1; j++) {
      if (lineSegmentsIntersect(
        stroke1.points[i],
        stroke1.points[i + 1],
        stroke2.points[j],
        stroke2.points[j + 1]
      )) {
        return true;
      }
    }
  }

  return false;
}

function lineSegmentsIntersect(p1: Point, p2: Point, p3: Point, p4: Point): boolean {
  const denominator = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
  
  if (denominator === 0) return false; // Lines are parallel
  
  const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / denominator;
  const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / denominator;
  
  return ua >= 0 && ua <= 1 && ub >= 0 && ub <= 1;
}

/**
 * Convert stroke data to SVG path string with enhanced smoothing
 */
export function strokeToSVGPath(stroke: Stroke): string {
  if (stroke.points.length < 2) return '';

  // For very short strokes, use simple linear path
  if (stroke.points.length === 2) {
    return `M${stroke.points[0].x},${stroke.points[0].y} L${stroke.points[1].x},${stroke.points[1].y}`;
  }
  
  // For longer strokes, use Catmull-Rom spline for maximum smoothness
  if (stroke.points.length >= 4) {
    return createCatmullRomSVGPath(stroke.points, 0.5);
  }
  
  // For 3 points, use enhanced quadratic bezier
  return createEnhancedQuadraticSVGPath(stroke.points);
}

/**
 * Create ultra-smooth SVG path using Catmull-Rom splines
 */
function createCatmullRomSVGPath(points: Point[], tension: number = 0.5): string {
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
}

/**
 * Create enhanced quadratic bezier path for shorter strokes
 */
function createEnhancedQuadraticSVGPath(points: Point[]): string {
  let path = `M${points[0].x},${points[0].y}`;
  
  for (let i = 1; i < points.length - 1; i++) {
    const current = points[i];
    const next = points[i + 1];
    const prev = points[i - 1];
    
    // Enhanced control point calculation with better smoothing
    const controlX = current.x * 0.7 + (prev.x + next.x) * 0.15;
    const controlY = current.y * 0.7 + (prev.y + next.y) * 0.15;
    const midX = (current.x + next.x) / 2;
    const midY = (current.y + next.y) / 2;
    
    path += ` Q${controlX},${controlY} ${midX},${midY}`;
  }
  
  // Finish with the last point
  const lastPoint = points[points.length - 1];
  path += ` L${lastPoint.x},${lastPoint.y}`;
  
  return path;
}

/**
 * Advanced stroke smoothing using multiple algorithms combined
 */
export function advancedSmoothStroke(points: Point[], options: {
  velocitySmoothing?: number;
  pressureSmoothing?: number;
  positionSmoothing?: number;
} = {}): Point[] {
  if (points.length < 3) return points;

  const {
    velocitySmoothing = 0.3,
    pressureSmoothing = 0.4,
    positionSmoothing = 0.2
  } = options;

  const smoothed: Point[] = [points[0]];

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    // Calculate velocities for adaptive smoothing
    const prevVel = Math.sqrt(
      Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2)
    ) / Math.max(1, (curr.timestamp || 0) - (prev.timestamp || 0));
    
    const nextVel = Math.sqrt(
      Math.pow(next.x - curr.x, 2) + Math.pow(next.y - curr.y, 2)
    ) / Math.max(1, (next.timestamp || 0) - (curr.timestamp || 0));

    // Adaptive smoothing based on velocity
    const adaptiveSmoothing = positionSmoothing * (1 + Math.min(prevVel + nextVel, 2) / 2);

    const smoothedPoint: Point = {
      x: curr.x * (1 - adaptiveSmoothing) + (prev.x + next.x) * adaptiveSmoothing / 2,
      y: curr.y * (1 - adaptiveSmoothing) + (prev.y + next.y) * adaptiveSmoothing / 2,
      pressure: curr.pressure ? 
        curr.pressure * (1 - pressureSmoothing) + 
        ((prev.pressure || 1) + (next.pressure || 1)) * pressureSmoothing / 2 : 
        curr.pressure,
      timestamp: curr.timestamp,
    };

    smoothed.push(smoothedPoint);
  }

  smoothed.push(points[points.length - 1]);
  return smoothed;
}
