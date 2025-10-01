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

  // Auto-save functionality
  useEffect(() => {
    if (autoSave && hasUnsavedChanges && currentNoteId && strokes.length > 0) {
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

  if (!strokes || strokes.length === 0) {
    console.warn('No strokes to save, strokes:', strokes);
    return;
  }

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
    setHistory(prev => {
      const newHistory = prev.slice(0, historyStep + 1);
      newHistory.push([...newStrokes]);
      // Limit history to prevent memory issues (keep last 50 states)
      return newHistory.length > 50 ? newHistory.slice(-50) : newHistory;
    });
    setHistoryStep(prev => prev + 1);
  }, [historyStep]);

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
      const eraseThreshold = (eraserStroke.width || 20) / 2;
      const eraserPoints: { x: number; y: number }[] = [];
      
      // Convert eraser flat points array to point objects
      for (let i = 0; i < eraserStroke.points.length; i += 2) {
        eraserPoints.push({
          x: eraserStroke.points[i],
          y: eraserStroke.points[i + 1]
        });
      }
      
      const modifiedStrokes = prev.reduce((result: DrawingStroke[], stroke) => {
        if (stroke.points.length === 0) return result;
        
        // Convert stroke flat points array to point objects for comparison
        const strokePoints: { x: number; y: number }[] = [];
        for (let i = 0; i < stroke.points.length; i += 2) {
          strokePoints.push({
            x: stroke.points[i],
            y: stroke.points[i + 1]
          });
        }
        
        // Find points that survive the eraser
        const survivingPointIndices: number[] = [];
        strokePoints.forEach((strokePoint, index) => {
          const shouldErase = eraserPoints.some(eraserPoint => {
            const distance = Math.sqrt(
              Math.pow(strokePoint.x - eraserPoint.x, 2) + 
              Math.pow(strokePoint.y - eraserPoint.y, 2)
            );
            return distance < eraseThreshold;
          });
          
          if (!shouldErase) {
            survivingPointIndices.push(index);
          }
        });
        
        if (survivingPointIndices.length > 1) {
          // Group consecutive surviving points into segments
          const segments: number[][] = [];
          let currentSegment: number[] = [];
          
          survivingPointIndices.forEach(index => {
            if (currentSegment.length === 0 || index === currentSegment[currentSegment.length - 1] + 1) {
              // Continue current segment
              currentSegment.push(index);
            } else {
              // Start new segment
              if (currentSegment.length > 1) {
                segments.push([...currentSegment]);
              }
              currentSegment = [index];
            }
          });
          
          // Add the last segment
          if (currentSegment.length > 1) {
            segments.push(currentSegment);
          }
          
          // Create new strokes for each segment
          segments.forEach((segment, segmentIndex) => {
            if (segment.length > 1) {
              const newPoints: number[] = [];
              segment.forEach(pointIndex => {
                newPoints.push(stroke.points[pointIndex * 2]);     // x
                newPoints.push(stroke.points[pointIndex * 2 + 1]); // y
              });
              
              result.push({
                ...stroke,
                id: `${stroke.id}_seg_${segmentIndex}_${++segmentIdRef.current}`,
                points: newPoints,
              });
            }
          });
        }
        
        return result;
      }, []);
      
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
    if (historyStep > 0) {
      const newStep = historyStep - 1;
      setHistoryStep(newStep);
      const previousState = history[newStep] || [];
      setStrokes([...previousState]);
      setHasUnsavedChanges(true);
      console.log('Undo: Reverted to step', newStep, 'with', previousState.length, 'strokes');
    }
  }, [historyStep, history]);

  const redo = useCallback(() => {
    if (historyStep < history.length - 1) {
      const newStep = historyStep + 1;
      setHistoryStep(newStep);
      const nextState = history[newStep] || [];
      setStrokes([...nextState]);
      setHasUnsavedChanges(true);
      console.log('Redo: Advanced to step', newStep, 'with', nextState.length, 'strokes');
    }
  }, [historyStep, history]);

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