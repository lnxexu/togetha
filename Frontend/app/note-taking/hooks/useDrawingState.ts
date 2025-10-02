import { useState, useCallback, useEffect, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, API_ENDPOINTS } from '@/constants/ApiConfig';
import { drawingAPI, DrawingStroke } from '../services/drawingAPI';

interface UseDrawingStateProps {
  noteId?: string;
  autoSave?: boolean;
  autoSaveInterval?: number;
  defaultTitle?: string;
  skipInitialLoad?: boolean; // Add flag to skip initial loading
}

interface SaveOptions {
  type?: string;
  title?: string;
  template?: string;
  folderId?: string | null;
  tags?: string[];
}

export const useDrawingState = ({ 
  noteId, 
  autoSave = true, 
  autoSaveInterval = 5000,
  defaultTitle = 'Untitled Drawing',
  skipInitialLoad = false
}: UseDrawingStateProps = {}) => {
  const [strokes, setStrokes] = useState<DrawingStroke[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // Add ref for unique segment ID generation
  const segmentIdRef = useRef(0);
  const [error, setError] = useState<string | null>(null);
  const [currentNoteId, setCurrentNoteId] = useState<string | undefined>(noteId);
  const [lastSaveTime, setLastSaveTime] = useState<number>(0);

  // Undo/Redo state
  const [history, setHistory] = useState<DrawingStroke[][]>([[]]);
  const [historyStep, setHistoryStep] = useState<number>(0);

  // Debug effect to monitor strokes changes
  useEffect(() => {
    console.log('useDrawingState: Strokes updated, count:', strokes.length);
  }, [strokes]);

  // Load drawing when noteId changes, but only if we're not skipping initial load
  useEffect(() => {
    if (currentNoteId && !skipInitialLoad) {
      console.log('useDrawingState: Loading drawing for noteId:', currentNoteId);
      loadDrawing();
    }
  }, [currentNoteId, skipInitialLoad]);

  // Auto-save functionality (also triggers when strokes are emptied to persist clears)
  useEffect(() => {
    if (autoSave && hasUnsavedChanges && currentNoteId) {
      const timer = setTimeout(() => {
        saveDrawing();
      }, autoSaveInterval);

      return () => clearTimeout(timer);
    }
  }, [strokes, hasUnsavedChanges, autoSave, autoSaveInterval, currentNoteId]);

  const loadDrawing = async () => {
    console.log('useDrawingState: loadDrawing called for noteId:', currentNoteId);
    
    if (!currentNoteId) {
      console.log('useDrawingState: No currentNoteId, skipping load');
      return;
    }

    console.log('useDrawingState: Starting to load drawing from API...');
    setIsLoading(true);
    setError(null);
    try {
      const drawingData = await drawingAPI.getDrawing(currentNoteId);
      console.log('useDrawingState: Loaded drawing data from API:', drawingData);
      console.log('useDrawingState: API returned strokes:', drawingData.strokes.length);
      setStrokes(drawingData.strokes);
      setHasUnsavedChanges(false);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Failed to load drawing';
      console.error('useDrawingState: loadDrawing failed:', error);
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

 const saveDrawing = useCallback(async (options?: SaveOptions) => {
  console.log('useDrawingState.saveDrawing called with:', {
    strokesCount: strokes?.length || 0,
    hasStrokes: !!strokes && strokes.length > 0,
    currentNoteId,
    options
  });

  // Allow saving empty strokes to persist a full erase

  console.log('Proceeding with save, setting isSaving to true...');
  setIsSaving(true);
  setError(null);

  try {
    let noteId = currentNoteId;
    let result;

    console.log('Save logic - noteId:', noteId);

    if (!noteId) {
      // Create new note
      console.log('Creating new note...');
      const title = options?.title || defaultTitle || 'Untitled Drawing';
      result = await drawingAPI.createDrawingNote(title, strokes, options?.folderId, options?.tags);
      noteId = result.noteId;
      setCurrentNoteId(noteId);
      console.log('Created new note with ID:', noteId);
    } else {
      // Update existing note - combine drawing data and metadata in a single request
      console.log('Updating existing note:', noteId);
      
      // Prepare the update data combining drawing data and metadata
      const updateData: any = {
        drawing_data: JSON.stringify(strokes)
      };
      
      if (options?.title) updateData.title = options.title;
      if (options?.folderId !== undefined) updateData.folder = options.folderId;
      if (options?.template) updateData.template = options.template;
      if (options?.tags) updateData.tag_names = options.tags;
      
      console.log('Sending combined update:', {
        hasDrawingData: !!updateData.drawing_data,
        drawingDataLength: updateData.drawing_data.length,
        metadata: { title: updateData.title, folder: updateData.folder, template: updateData.template, tags: updateData.tag_names }
      });
      
      try {
        const token = await AsyncStorage.getItem('authToken');
        if (token) {
          const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTES}${noteId}/`, {
            method: 'PATCH',
            headers: {
              'Authorization': `Token ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify(updateData),
          });
          
          if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
          }
          
          result = await response.json();
          console.log('Combined update result:', result);
        }
      } catch (updateError) {
        console.error('Failed to update note with combined data:', updateError);
        throw updateError;
      }
    }

    setHasUnsavedChanges(false);
    setLastSaveTime(Date.now());

    console.log('Save completed successfully');
    return result;
  } catch (error) {
    console.error('Failed to save drawing:', error);
    setError(error instanceof Error ? error.message : 'Failed to save drawing');
    throw error;
  } finally {
    setIsSaving(false);
  }
}, [strokes, currentNoteId, defaultTitle]);

  // Helper function to save state to history
  const saveToHistory = useCallback((newStrokes: DrawingStroke[]) => {
    setHistoryStep(prevStep => {
      setHistory(prev => {
        const newHistory = prev.slice(0, prevStep + 1);
        newHistory.push([...newStrokes]);
        // Limit history to prevent memory issues (keep last 50 states)
        const limitedHistory = newHistory.length > 50 ? newHistory.slice(-50) : newHistory;
        return limitedHistory;
      });
      return prevStep + 1;
    });
  }, []);

  const addStroke = useCallback((stroke: DrawingStroke) => {
    setStrokes(prev => {
      const newStrokes = [...prev, stroke];
      // Save to history after adding stroke
      setTimeout(() => saveToHistory(newStrokes), 0);
      return newStrokes;
    });
    setHasUnsavedChanges(true);
  }, [saveToHistory]);

  const eraseStrokes = useCallback((eraserStroke: DrawingStroke) => {
    setStrokes(prev => {
  // Eraser radius directly reflects selected width (half the diameter).
  // Remove large minimum to ensure small sizes (e.g., 1px) behave accurately.
  const eraserRadius = Math.max((eraserStroke.width || 12) * 0.5, 0.5);

      // Compute visual half-thickness of a stroke based on its tool and width.
      // This approximates the rendered footprint so the eraser removes ALL
      // overlapping layers, not only those whose centerline intersects.
      const getStrokeHalfThickness = (stroke: DrawingStroke): number => {
        const base = Math.max(stroke.width || 1, 0.5);
        switch (stroke.tool) {
          case 'highlighter':
            // Highlighter is rendered with ~2.5x strokeWidth in the canvas
            // so its half-thickness is ~1.25 * base
            return base * 1.25;
          case 'brush':
          case 'calligraphy':
          case 'pen':
          case 'pencil':
          case 'eraser':
          default:
            // perfect-freehand uses `size` as the full thickness
            return base * 0.5;
        }
      };

      // Convert eraser flat array to points
      const eraserPoints: { x: number; y: number }[] = [];
      for (let i = 0; i < eraserStroke.points.length; i += 2) {
        const x = eraserStroke.points[i];
        const y = eraserStroke.points[i + 1];
        if (typeof x === 'number' && typeof y === 'number') {
          eraserPoints.push({ x, y });
        }
      }

      // Distance helpers
      const dist2 = (ax: number, ay: number, bx: number, by: number) => {
        const dx = ax - bx; const dy = ay - by; return dx * dx + dy * dy;
      };
      const pointSegDist = (px: number, py: number, ax: number, ay: number, bx: number, by: number) => {
        const vx = bx - ax, vy = by - ay; // segment vector
        const wx = px - ax, wy = py - ay; // vector to point
        const c1 = vx * wx + vy * wy;
        if (c1 <= 0) return Math.sqrt(dist2(px, py, ax, ay));
        const c2 = vx * vx + vy * vy;
        if (c2 <= c1) return Math.sqrt(dist2(px, py, bx, by));
        const t = c1 / c2;
        const projx = ax + t * vx, projy = ay + t * vy;
        return Math.sqrt(dist2(px, py, projx, projy));
      };

      // Optional: densify eraser points for more uniform corridor coverage
      const denseEraser: { x: number; y: number }[] = [];
  // Use finer sampling for small erasers to avoid gaps; cap at reasonable minimum
  const step = Math.max(eraserRadius * 0.4, 0.5);
      for (let i = 0; i < eraserPoints.length - 1; i++) {
        const a = eraserPoints[i], b = eraserPoints[i + 1];
        denseEraser.push(a);
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len > step) {
          const n = Math.floor(len / step);
          for (let j = 1; j < n; j++) {
            denseEraser.push({ x: a.x + (dx * j) / n, y: a.y + (dy * j) / n });
          }
        }
      }
      if (eraserPoints.length > 0) denseEraser.push(eraserPoints[eraserPoints.length - 1]);

      // Build eraser segments and AABBs for broadphase
      const eraserSegs: { a:{x:number;y:number}; b:{x:number;y:number}; minX:number;minY:number;maxX:number;maxY:number }[] = [];
      for (let i = 0; i < denseEraser.length - 1; i++) {
        const a = denseEraser[i], b = denseEraser[i+1];
        eraserSegs.push({
          a, b,
          minX: Math.min(a.x, b.x),
          minY: Math.min(a.y, b.y),
          maxX: Math.max(a.x, b.x),
          maxY: Math.max(a.y, b.y),
        });
      }

      // Segment-to-segment minimal distance (corrected)
      const segSegDist = (ax:number,ay:number,bx:number,by:number, cx:number,cy:number,dx:number,dy:number) => {
        // Helper: clamp t to [0,1]
        const clamp01 = (t:number) => t < 0 ? 0 : (t > 1 ? 1 : t);
        const r = { x: bx - ax, y: by - ay };
        const s = { x: dx - cx, y: dy - cy }; // FIX: use (d - c), not swapped
        const rxs = r.x * s.y - r.y * s.x;
        const qp = { x: cx - ax, y: cy - ay };
        const qpxr = qp.x * r.y - qp.y * r.x;

        // If not parallel, check for intersection (distance 0)
        if (Math.abs(rxs) > 1e-6) {
          const t = (qp.x * s.y - qp.y * s.x) / rxs;
          const u = qpxr / rxs;
          if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return 0;
        }
        // Otherwise compute closest endpoints/projections
        const dot = (ux:number,uy:number,vx:number,vy:number) => ux*vx + uy*vy;
        const len2 = (ux:number,uy:number) => ux*ux + uy*uy;
        const projPointToSeg = (px:number,py:number, x1:number,y1:number, x2:number,y2:number) => {
          const vx = x2 - x1, vy = y2 - y1;
          const t = len2(vx,vy) === 0 ? 0 : clamp01(dot(px - x1, py - y1, vx, vy) / len2(vx,vy));
          const qx = x1 + t*vx, qy = y1 + t*vy;
          const dx0 = px - qx, dy0 = py - qy;
          return Math.hypot(dx0, dy0);
        };
        return Math.min(
          projPointToSeg(ax, ay, cx, cy, dx, dy),
          projPointToSeg(bx, by, cx, cy, dx, dy),
          projPointToSeg(cx, cy, ax, ay, bx, by),
          projPointToSeg(dx, dy, ax, ay, bx, by)
        );
      };

      const modifiedStrokes = prev.reduce((result: DrawingStroke[], stroke) => {
        if (!stroke.points || stroke.points.length < 2) return result;

        // Convert stroke points to objects
        const sp: { x: number; y: number }[] = [];
        for (let i = 0; i < stroke.points.length; i += 2) {
          const x = stroke.points[i];
          const y = stroke.points[i + 1];
          if (typeof x === 'number' && typeof y === 'number') sp.push({ x, y });
        }
        if (sp.length === 1) {
          // Dot stroke: erase only if within eraser radius
          let erased = false;
          const strokeHalf = getStrokeHalfThickness(stroke);
          for (let k = 0; k < eraserSegs.length; k++) {
            const es = eraserSegs[k];
            // Quick AABB check against a box around the dot
            const inflate = eraserRadius + strokeHalf;
            const minX = sp[0].x - inflate, maxX = sp[0].x + inflate;
            const minY = sp[0].y - inflate, maxY = sp[0].y + inflate;
            if (!(maxX < es.minX - eraserRadius || minX > es.maxX + eraserRadius || maxY < es.minY - eraserRadius || minY > es.maxY + eraserRadius)) {
              // Distance from point to eraser segment
              const d = pointSegDist(sp[0].x, sp[0].y, es.a.x, es.a.y, es.b.x, es.b.y);
              if (d <= eraserRadius + strokeHalf) { erased = true; break; }
            }
          }
          if (!erased) result.push(stroke);
          return result;
        }

        // For each segment of the stroke, decide if it's kept or erased based on proximity to the eraser path
        const keepSegment: boolean[] = new Array(sp.length - 1).fill(true);
        for (let i = 0; i < sp.length - 1; i++) {
          const a = sp[i], b = sp[i + 1];
          let erased = false;
          const strokeHalf = getStrokeHalfThickness(stroke);
          const combined = eraserRadius + strokeHalf;
          // Segment AABB expanded by eraser radius for broadphase
          const segMinX = Math.min(a.x, b.x) - combined;
          const segMinY = Math.min(a.y, b.y) - combined;
          const segMaxX = Math.max(a.x, b.x) + combined;
          const segMaxY = Math.max(a.y, b.y) + combined;

          for (let k = 0; k < eraserSegs.length; k++) {
            const es = eraserSegs[k];
            // AABB check
            if (!(segMaxX < es.minX - eraserRadius || segMinX > es.maxX + eraserRadius || segMaxY < es.minY - eraserRadius || segMinY > es.maxY + eraserRadius)) {
              const d = segSegDist(a.x, a.y, b.x, b.y, es.a.x, es.a.y, es.b.x, es.b.y);
              if (d <= combined) { erased = true; break; }
            }
          }
          keepSegment[i] = !erased;
        }

        // Rebuild stroke from kept segments
        const newSegments: number[][] = [];
        let current: number[] = [];
        // Always include the starting point if first segment is kept
        for (let i = 0; i < keepSegment.length; i++) {
          if (keepSegment[i]) {
            if (current.length === 0) {
              // start a new segment: include starting point index i
              current.push(i);
            }
            // include the end point of this kept segment (i+1)
            current.push(i + 1);
          } else {
            if (current.length > 1) {
              newSegments.push([...current]);
            }
            current = [];
          }
        }
        if (current.length > 1) newSegments.push(current);

        if (newSegments.length === 0) {
          // Entire stroke erased; drop it
          return result;
        }

        // If nothing was erased, preserve the original stroke
        if (newSegments.length === 1 && newSegments[0].length === sp.length) {
          result.push(stroke);
          return result;
        }

        // Create strokes from segments
        newSegments.forEach((seg, segIndex) => {
          const newPoints: number[] = [];
          // seg contains indices into sp. Ensure consecutive points
          for (let idx = 0; idx < seg.length; idx++) {
            const p = sp[seg[idx]];
            newPoints.push(p.x, p.y);
          }
          result.push({
            ...stroke,
            id: `${stroke.id}_seg_${segIndex}_${++segmentIdRef.current}`,
            points: newPoints,
          });
        });

        return result;
      }, [] as DrawingStroke[]);

      // Save to history after erasing
      setTimeout(() => saveToHistory(modifiedStrokes), 0);
      return modifiedStrokes;
    });
    setHasUnsavedChanges(true);
  }, [saveToHistory]);

  // Remove strokes by id(s) - used when deleting pages or removing groups of strokes
  const removeStrokesByIds = useCallback((ids: string[]) => {
    if (!ids || ids.length === 0) return;
    setStrokes(prev => {
      const filtered = prev.filter(s => !ids.includes(s.id));
      // Save to history after removal
      setTimeout(() => saveToHistory(filtered), 0);
      return filtered;
    });
    setHasUnsavedChanges(true);
  }, [saveToHistory]);

  const undo = useCallback(() => {
    setHistoryStep(prevStep => {
      if (prevStep > 0) {
        const newStep = prevStep - 1;
        setHistory(prevHistory => {
          const previousState = prevHistory[newStep] || [];
          setStrokes([...previousState]);
          setHasUnsavedChanges(true);
          console.log('Undo: Reverted to step', newStep, 'with', previousState.length, 'strokes');
          return prevHistory;
        });
        return newStep;
      }
      return prevStep;
    });
  }, []);

  const redo = useCallback(() => {
    setHistoryStep(prevStep => {
      setHistory(prevHistory => {
        if (prevStep < prevHistory.length - 1) {
          const newStep = prevStep + 1;
          const nextState = prevHistory[newStep] || [];
          setStrokes([...nextState]);
          setHasUnsavedChanges(true);
          console.log('Redo: Advanced to step', newStep, 'with', nextState.length, 'strokes');
          return prevHistory;
        }
        return prevHistory;
      });
      return prevStep < history.length - 1 ? prevStep + 1 : prevStep;
    });
  }, [history.length]);

  const canUndo = historyStep > 0;
  const canRedo = historyStep < history.length - 1;

  const clearDrawing = useCallback(async () => {
    // Clear immediately for instant user feedback
    const emptyStrokes: DrawingStroke[] = [];
    setStrokes(emptyStrokes);
    // Reset history when clearing
    setHistory([emptyStrokes]);
    setHistoryStep(0);
    setHasUnsavedChanges(false);
    
    // Then sync with server in background
    if (currentNoteId) {
      try {
        setIsSaving(true);
        await drawingAPI.clearDrawing(currentNoteId);
        console.log('Drawing cleared successfully on server');
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Failed to clear drawing on server';
        setError(errorMessage);
        console.error('Failed to clear drawing on server:', error);
        // On error, we could potentially restore the previous state here if needed
      } finally {
        setIsSaving(false);
      }
    } else {
      // No noteId - just clear the local state
      const emptyStrokes: DrawingStroke[] = [];
      setStrokes(emptyStrokes);
      // Reset history when clearing
      setHistory([emptyStrokes]);
      setHistoryStep(0);
      setHasUnsavedChanges(false);
    }
  }, [currentNoteId]);

  const undoLastStroke = useCallback(() => {
    // This is the legacy function - use the new undo instead
    undo();
  }, [undo]);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const importDrawing = useCallback((drawingData: any) => {
    console.log('=== useDrawingState: importDrawing called ===');
    console.log('useDrawingState: Importing drawing data:', drawingData);
    console.log('useDrawingState: DrawingData type:', typeof drawingData);
    console.log('useDrawingState: DrawingData keys:', drawingData ? Object.keys(drawingData) : 'null');
    console.log('useDrawingState: Has strokes field:', !!drawingData?.strokes);
    console.log('useDrawingState: Strokes field type:', Array.isArray(drawingData?.strokes) ? 'array' : typeof drawingData?.strokes);
    console.log('useDrawingState: Strokes length:', drawingData?.strokes?.length || 0);
    
    if (drawingData) {
      let strokesToImport = [];
      
      // Handle different data formats - prioritize direct strokes array
      if (drawingData.strokes && Array.isArray(drawingData.strokes)) {
        // Primary format: { strokes: [...] } (passed from notes.tsx)
        strokesToImport = drawingData.strokes;
        console.log('useDrawingState: Found strokes array at root level:', strokesToImport.length);
      } else if (Array.isArray(drawingData)) {
        // Direct array of strokes
        strokesToImport = drawingData;
        console.log('useDrawingState: Direct strokes array:', strokesToImport.length);
      } else if (drawingData.drawing_data) {
        // Handle nested drawing_data
        if (typeof drawingData.drawing_data === 'string') {
          try {
            const parsed = JSON.parse(drawingData.drawing_data);
            strokesToImport = Array.isArray(parsed) ? parsed : parsed.strokes || [];
            console.log('useDrawingState: Parsed drawing_data string:', strokesToImport.length);
          } catch (error) {
            console.error('Failed to parse drawing_data:', error);
            strokesToImport = [];
          }
        } else if (Array.isArray(drawingData.drawing_data)) {
          strokesToImport = drawingData.drawing_data;
          console.log('useDrawingState: Array drawing_data:', strokesToImport.length);
        } else if (drawingData.drawing_data?.strokes) {
          strokesToImport = drawingData.drawing_data.strokes;
          console.log('useDrawingState: Nested strokes in drawing_data:', strokesToImport.length);
        }
      }

      // Validate stroke format and log details
      if (strokesToImport.length > 0) {
        console.log('useDrawingState: First stroke sample:', strokesToImport[0]);
        console.log('useDrawingState: Stroke validation:', {
          hasId: !!strokesToImport[0]?.id,
          hasPoints: Array.isArray(strokesToImport[0]?.points),
          pointsLength: strokesToImport[0]?.points?.length,
          pointsType: typeof strokesToImport[0]?.points?.[0],
          hasColor: !!strokesToImport[0]?.color,
          hasWidth: !!strokesToImport[0]?.width,
          hasTool: !!strokesToImport[0]?.tool,
        });
      }

      console.log('useDrawingState: About to setStrokes with:', strokesToImport.length, 'strokes');
      setStrokes(strokesToImport);
      // Initialize history with the imported strokes
      setHistory([strokesToImport]);
      setHistoryStep(0);
      console.log('useDrawingState: setStrokes called and history initialized');
      setHasUnsavedChanges(false);

      // Set the note ID if available and not already set
      // Don't set currentNoteId here as it will trigger loadDrawing which overwrites imported data
      if (drawingData.id && !currentNoteId) {
        console.log('useDrawingState: Would set note ID but skipping to avoid loadDrawing override:', drawingData.id);
        // We'll set it later if needed, but for now avoid triggering the loadDrawing effect
        // setCurrentNoteId(drawingData.id.toString());
      }
    } else {
      console.log('useDrawingState: No drawing data provided');
    }
    console.log('=== useDrawingState: importDrawing completed ===');
  }, [currentNoteId]);

  const exportDrawing = useCallback(() => {
    return {
      strokes,
      strokeCount: strokes.length,
      lastModified: new Date().toISOString(),
    };
  }, [strokes]);

  const clear = useCallback(() => {
    clearDrawing();
  }, [clearDrawing]);

  const setNoteId = useCallback((noteId: string) => {
    console.log('useDrawingState: Setting note ID:', noteId);
    setCurrentNoteId(noteId);
  }, []);

  return {
    strokes,
    isLoading,
    isSaving,
    hasUnsavedChanges,
    error,
    currentNoteId,
    addStroke,
    eraseStrokes,
    removeStrokesByIds,
    clearDrawing,
    saveDrawing,
    loadDrawing,
    undoLastStroke, // Legacy function
    undo, // New undo function
    redo, // New redo function
    canUndo,
    canRedo,
    clearError,
    importDrawing,
    exportDrawing,
    clear,
    setNoteId,
  };
};