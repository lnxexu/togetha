import { useState, useCallback, useEffect } from 'react';
import { drawingAPI, DrawingStroke, DrawingData } from '../services/drawingAPI';

interface UseDrawingAPIReturn {
  // State
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
  lastSaved: Date | null;
  hasUnsavedChanges: boolean;
  
  // Actions
  saveDrawing: (noteId: string, strokes: DrawingStroke[]) => Promise<boolean>;
  loadDrawing: (noteId: string) => Promise<DrawingData | null>;
  clearDrawing: (noteId: string) => Promise<boolean>;
  autoSaveDrawing: (noteId: string, strokes: DrawingStroke[]) => Promise<void>;
  clearError: () => void;
  markAsSaved: () => void;
  markAsUnsaved: () => void;
}

export const useDrawingAPI = (): UseDrawingAPIReturn => {
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const markAsSaved = useCallback(() => {
    setHasUnsavedChanges(false);
    setLastSaved(new Date());
  }, []);

  const markAsUnsaved = useCallback(() => {
    setHasUnsavedChanges(true);
  }, []);

  const saveDrawing = useCallback(async (noteId: string, strokes: DrawingStroke[]): Promise<boolean> => {
    setIsSaving(true);
    setError(null);
    
    try {
      await drawingAPI.saveDrawing(noteId, strokes);
      markAsSaved();
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to save drawing';
      setError(errorMessage);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [markAsSaved]);

  const loadDrawing = useCallback(async (noteId: string): Promise<DrawingData | null> => {
    setIsLoading(true);
    setError(null);
    
    try {
      const data = await drawingAPI.getDrawing(noteId);
      return data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to load drawing';
      setError(errorMessage);
      return null;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const clearDrawing = useCallback(async (noteId: string): Promise<boolean> => {
    setIsSaving(true);
    setError(null);
    
    try {
      await drawingAPI.clearDrawing(noteId);
      markAsSaved();
      return true;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to clear drawing';
      setError(errorMessage);
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [markAsSaved]);

  const autoSaveDrawing = useCallback(async (noteId: string, strokes: DrawingStroke[]): Promise<void> => {
    try {
      await drawingAPI.autoSaveDrawing(noteId, strokes);
      markAsSaved();
    } catch (err) {
      // Auto-save failures are handled silently
      console.warn('Auto-save failed:', err);
    }
  }, [markAsSaved]);

  return {
    // State
    isLoading,
    isSaving,
    error,
    lastSaved,
    hasUnsavedChanges,
    
    // Actions
    saveDrawing,
    loadDrawing,
    clearDrawing,
    autoSaveDrawing,
    clearError,
    markAsSaved,
    markAsUnsaved,
  };
};

// Custom hook for auto-save functionality with debouncing
export const useAutoSaveDrawing = (
  noteId: string | null,
  strokes: DrawingStroke[],
  delay: number = 2000 // 2 seconds
) => {
  const { autoSaveDrawing, hasUnsavedChanges, markAsUnsaved } = useDrawingAPI();

  useEffect(() => {
    if (!noteId || strokes.length === 0) return;

    markAsUnsaved();

    const timeoutId = setTimeout(() => {
      autoSaveDrawing(noteId, strokes);
    }, delay);

    return () => clearTimeout(timeoutId);
  }, [noteId, strokes, delay, autoSaveDrawing, markAsUnsaved]);

  return { hasUnsavedChanges };
};
