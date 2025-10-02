// Simple stroke utilities for basic drawing
export interface SimplePoint {
  x: number;
  y: number;
}

export interface SimpleStroke {
  points: SimplePoint[];
  color: string;
  width: number;
}

// Convert points to simple SVG path
export function pointsToPath(points: SimplePoint[]): string {
  if (points.length < 2) return '';
  
  let path = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i++) {
    path += ` L${points[i].x},${points[i].y}`;
  }
  return path;
}

// Basic distance calculation
export function getDistance(p1: SimplePoint, p2: SimplePoint): number {
  const dx = p2.x - p1.x;
  const dy = p2.y - p1.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// Remove duplicate points that are too close
export function simplifyPoints(points: SimplePoint[], threshold: number = 2): SimplePoint[] {
  if (points.length <= 2) return points;
  
  const simplified = [points[0]];
  
  for (let i = 1; i < points.length; i++) {
    const distance = getDistance(points[i], simplified[simplified.length - 1]);
    if (distance >= threshold) {
      simplified.push(points[i]);
    }
  }
  
  return simplified;
}