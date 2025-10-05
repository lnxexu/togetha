export type DrawingStroke = {
  id: string;
  points: number[];
  color: string;
  width: number;
  tool?: string;
  timestamp?: number;
  opacity?: number;
};

/**
 * Normalize drawing_data from various backend shapes into a strokes array.
 * Accepts: JSON string, direct array, or object with {strokes}.
 */
export function parseStrokes(input: unknown): DrawingStroke[] {
  try {
    if (!input) return [];
    let data: any = input;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { return []; }
    }
    if (Array.isArray(data)) return sanitizeStrokes(data);
    if (data && Array.isArray(data.strokes)) return sanitizeStrokes(data.strokes);
    return [];
  } catch {
    return [];
  }
}

/** Ensure each stroke has minimal fields and points as numbers */
function sanitizeStrokes(strokes: any[]): DrawingStroke[] {
  return strokes
    .filter(Boolean)
    .map((s, idx) => ({
      id: typeof s.id === 'string' ? s.id : `stroke_${idx}`,
      points: Array.isArray(s.points) ? s.points.filter((n: any) => typeof n === 'number') : [],
      color: typeof s.color === 'string' ? s.color : '#111827',
      width: typeof s.width === 'number' ? s.width : 2,
      tool: typeof s.tool === 'string' ? s.tool : undefined,
      timestamp: typeof s.timestamp === 'number' ? s.timestamp : undefined,
      opacity: typeof s.opacity === 'number' ? s.opacity : undefined,
    }))
    .filter(s => s.points.length >= 2);
}

/** Lightweight detector for whether a note's drawing_data represents a drawing */
export function isDrawingData(input: unknown): boolean {
  try {
    const strokes = parseStrokes(input);
    return strokes.length > 0;
  } catch {
    return false;
  }
}
