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
 * Smooth a stroke using enhanced Catmull-Rom spline interpolation
 * Creates much smoother curves between points with adaptive tension
 */
export function smoothStroke(points: Point[], smoothing: number = 0.5): Point[] {
  if (points.length < 3) return points;

  const smoothed: Point[] = [points[0]];
  
  // Dynamically adjust smoothing based on stroke velocity and curvature
  const adaptiveSmoothing = (p0: Point, p1: Point, p2: Point): number => {
    // Calculate velocity between points
    const v1 = Math.sqrt(Math.pow(p1.x - p0.x, 2) + Math.pow(p1.y - p0.y, 2)) / 
               Math.max(1, (p1.timestamp || 0) - (p0.timestamp || 0));
    
    const v2 = Math.sqrt(Math.pow(p2.x - p1.x, 2) + Math.pow(p2.y - p1.y, 2)) /
               Math.max(1, (p2.timestamp || 0) - (p1.timestamp || 0));
    
    // Calculate angle between segments
    const dx1 = p1.x - p0.x;
    const dy1 = p1.y - p0.y;
    const dx2 = p2.x - p1.x;
    const dy2 = p2.y - p1.y;
    
    const dotProduct = dx1 * dx2 + dy1 * dy2;
    const mag1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const mag2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);
    
    const angle = Math.acos(Math.min(1, Math.max(-1, dotProduct / (mag1 * mag2 || 1))));
    
    // More smoothing for sharper angles and faster velocities
    const baseSmoothing = smoothing;
    const velocityFactor = Math.min(1, Math.max(0.5, (v1 + v2) / 2 / 10));
    const angleFactor = Math.min(1, Math.max(0.5, angle / Math.PI));
    
    return baseSmoothing * velocityFactor * angleFactor;
  };

  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];
    
    // Calculate adaptive smoothing factor
    const adaptiveFactor = adaptiveSmoothing(prev, curr, next);

    // Enhanced Catmull-Rom interpolation with adaptive smoothing
    const smoothedPoint: Point = {
      x: curr.x + adaptiveFactor * (prev.x - next.x) * 0.25,
      y: curr.y + adaptiveFactor * (prev.y - next.y) * 0.25,
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
 * Enhanced version with tool-specific optimizations
 */
export function optimizeStroke(stroke: Stroke, options: {
  simplify?: boolean;
  smooth?: boolean;
  tolerance?: number;
  smoothing?: number;
  highQuality?: boolean;
  preserveCurvature?: boolean;
} = {}): OptimizedStroke {
  const {
    simplify = true,
    smooth = true,
    tolerance = 2,
    smoothing = 0.3,
    highQuality = true,
    preserveCurvature = true,
  } = options;

  let optimizedPoints = [...stroke.points];
  
  // Calculate point distribution and velocity profile for adaptive optimization
  const velocities: number[] = [];
  let maxVelocity = 0;
  
  if (preserveCurvature && optimizedPoints.length > 3) {
    for (let i = 1; i < optimizedPoints.length; i++) {
      const curr = optimizedPoints[i];
      const prev = optimizedPoints[i - 1];
      const distance = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
      const time = Math.max(1, (curr.timestamp || 0) - (prev.timestamp || 0));
      const velocity = distance / time;
      velocities.push(velocity);
      maxVelocity = Math.max(maxVelocity, velocity);
    }
  }

  // Apply smoothing first with adaptive parameters
  if (smooth && optimizedPoints.length > 2) {
    // Use advanced smoothing for high quality mode
    if (highQuality) {
      optimizedPoints = advancedSmoothStroke(optimizedPoints, {
        velocitySmoothing: smoothing * 1.2,
        pressureSmoothing: smoothing,
        positionSmoothing: smoothing,
        curvatureAdaptation: preserveCurvature,
        highQuality: true
      });
    } else {
      optimizedPoints = smoothStroke(optimizedPoints, smoothing);
    }
  }

  // Then simplify to reduce points, but preserve high curvature areas
  if (simplify && optimizedPoints.length > 2) {
    // Use adaptive tolerance based on velocity for preserving curvature
    if (preserveCurvature && velocities.length > 0) {
      // Create adaptive tolerance array where slower points get lower tolerance (more detail)
      const adaptiveTolerance = optimizedPoints.map((_, i) => {
        if (i === 0) return tolerance;
        const vel = velocities[i - 1];
        const factor = Math.max(0.5, Math.min(1.5, vel / (maxVelocity || 1)));
        return tolerance * factor;
      });
      
      optimizedPoints = adaptiveSimplify(optimizedPoints, adaptiveTolerance);
    } else {
      optimizedPoints = simplifyStroke(optimizedPoints, tolerance);
    }
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
 * Adaptive simplification for strokes with variable tolerance per point
 * This preserves detail in high curvature areas while simplifying straight segments
 */
export function adaptiveSimplify(points: Point[], tolerances: number[]): Point[] {
  if (points.length <= 2) return points;
  
  // Ensure we have a tolerance value for each point
  const effectiveTolerance = tolerances.length === points.length ? 
    tolerances : Array(points.length).fill(Math.max(...tolerances, 2));
  
  // Mark points to keep (always keep first and last)
  const keepPoints = Array(points.length).fill(false);
  keepPoints[0] = true;
  keepPoints[points.length - 1] = true;
  
  // Recursive simplification with adaptive tolerance
  const simplifySegment = (start: number, end: number): void => {
    if (end - start <= 1) return;
    
    let maxDistance = 0;
    let maxIndex = start;
    
    // Find point with max distance from line segment, using its own tolerance value
    for (let i = start + 1; i < end; i++) {
      const distance = perpendicularDistance(points[i], points[start], points[end]);
      // Compare against this point's specific tolerance
      if (distance > maxDistance && distance > effectiveTolerance[i]) {
        maxDistance = distance;
        maxIndex = i;
      }
    }
    
    // If we found a point to keep, mark it and recurse
    if (maxIndex !== start) {
      keepPoints[maxIndex] = true;
      simplifySegment(start, maxIndex);
      simplifySegment(maxIndex, end);
    }
  };
  
  // Perform the simplification
  simplifySegment(0, points.length - 1);
  
  // Return only the points marked to keep
  return points.filter((_, i) => keepPoints[i]);
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
 * Ultra-smooth stroke rendering using advanced real-time smoothing algorithms
 * Optimized for high-quality drawing experience with minimal lag
 */
export function advancedSmoothStroke(points: Point[], options: {
  velocitySmoothing?: number;
  pressureSmoothing?: number;
  positionSmoothing?: number;
  curvatureAdaptation?: boolean;
  highQuality?: boolean;
} = {}): Point[] {
  if (points.length < 3) return points;

  const {
    velocitySmoothing = 0.3,
    pressureSmoothing = 0.4,
    positionSmoothing = 0.2,
    curvatureAdaptation = true,
    highQuality = true
  } = options;

  const smoothed: Point[] = [points[0]];
  
  // For high quality mode, consider more neighboring points
  const lookAhead = highQuality ? 2 : 1;
  const lookBehind = highQuality ? 2 : 1;

  for (let i = 1; i < points.length - 1; i++) {
    // Get reference points with dynamic window size
    const prevPoints: Point[] = [];
    const nextPoints: Point[] = [];
    
    // Collect previous points within window
    for (let j = 1; j <= lookBehind; j++) {
      const idx = i - j;
      if (idx >= 0) prevPoints.push(points[idx]);
    }
    
    // Collect next points within window
    for (let j = 1; j <= lookAhead; j++) {
      const idx = i + j;
      if (idx < points.length) nextPoints.push(points[idx]);
    }
    
    const curr = points[i];
    const prev = prevPoints.length > 0 ? prevPoints[0] : curr;
    const next = nextPoints.length > 0 ? nextPoints[0] : curr;

    // Calculate velocities for adaptive smoothing
    const prevVel = Math.sqrt(
      Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2)
    ) / Math.max(1, (curr.timestamp || 0) - (prev.timestamp || 0));
    
    const nextVel = Math.sqrt(
      Math.pow(next.x - curr.x, 2) + Math.pow(next.y - curr.y, 2)
    ) / Math.max(1, (next.timestamp || 0) - (curr.timestamp || 0));
    
    // Calculate curvature for adaptive smoothing
    let curvatureFactor = 1.0;
    if (curvatureAdaptation && prevPoints.length > 0 && nextPoints.length > 0) {
      // Calculate angle between segments for curvature estimation
      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;
      
      const dotProduct = dx1 * dx2 + dy1 * dy2;
      const mag1 = Math.sqrt(dx1 * dx1 + dy1 * dy1) || 0.001;
      const mag2 = Math.sqrt(dx2 * dx2 + dy2 * dy2) || 0.001;
      
      const cosAngle = Math.max(-1, Math.min(1, dotProduct / (mag1 * mag2)));
      const angle = Math.acos(cosAngle);
      
      // More smoothing for sharp turns (higher angles)
      curvatureFactor = 1.0 + (angle / Math.PI) * 0.5; 
    }

    // Highly adaptive smoothing based on velocity and curvature
    const adaptiveSmoothing = positionSmoothing * 
      (1 + Math.min(prevVel + nextVel, 3) / 3) * 
      curvatureFactor;

    // Multi-point weighted averaging for position
    let weightedSumX = curr.x * (1 - adaptiveSmoothing);
    let weightedSumY = curr.y * (1 - adaptiveSmoothing);
    let totalWeight = (1 - adaptiveSmoothing);
    
    // Add weighted contributions from previous and next points
    const addWeightedPoint = (point: Point, weight: number) => {
      weightedSumX += point.x * weight;
      weightedSumY += point.y * weight;
      totalWeight += weight;
    };
    
    // Distribute weights with more weight to closer points
    const spreadFactor = adaptiveSmoothing / (prevPoints.length + nextPoints.length + 0.001);
    
    prevPoints.forEach((point, idx) => {
      const weight = spreadFactor * (1 - idx / (prevPoints.length + 1));
      addWeightedPoint(point, weight);
    });
    
    nextPoints.forEach((point, idx) => {
      const weight = spreadFactor * (1 - idx / (nextPoints.length + 1));
      addWeightedPoint(point, weight);
    });

    const smoothedPoint: Point = {
      x: weightedSumX / totalWeight,
      y: weightedSumY / totalWeight,
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
