import { useCallback, useEffect, useRef } from 'react';

/**
 * Custom hook that provides a debounced function similar to Google Docs auto-save
 * This prevents rapid API calls and ensures smooth user experience
 */
export function useDebounce<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): T {
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);
  const callbackRef = useRef(callback);

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const debouncedCallback = useCallback(
    (...args: Parameters<T>) => {
      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Set new timeout
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay]
  ) as T;

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback;
}

/**
 * Enhanced hook for checking if data has unsaved changes
 */
export function useChangeDetection<T>(data: T, initialData: T | undefined) {
  const hasChanges = useCallback(() => {
    if (!initialData) return false;
    
    // Deep comparison of data objects
    const stringify = (obj: any) => {
      if (typeof obj === 'string') return obj.trim();
      return JSON.stringify(obj, Object.keys(obj).sort());
    };
    
    return stringify(data) !== stringify(initialData);
  }, [data, initialData]);

  return hasChanges();
}

/**
 * Custom hook for Google Docs-style auto-save functionality
 * Provides optimistic updates and conflict resolution
 */
export function useAutoSave<T>(
  data: T,
  saveFunction: (data: T, isAutoSave?: boolean) => Promise<T | void>,
  options?: {
    delay?: number;
    enabled?: boolean;
    onSaveStart?: () => void;
    onSaveSuccess?: (result?: T) => void;
    onSaveError?: (error: Error) => void;
    initialData?: T;
    trackChanges?: boolean;
  }
) {
  const {
    delay = 2000, // 2 seconds like Google Docs
    enabled = true,
    onSaveStart,
    onSaveSuccess,
    onSaveError,
    initialData,
    trackChanges = true,
  } = options || {};

  const isSavingRef = useRef(false);
  const lastSavedDataRef = useRef<T | undefined>(initialData);
  const pendingSaveRef = useRef<T | undefined>(undefined);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  // Enhanced change detection
  const hasUnsavedChanges = useChangeDetection(data, lastSavedDataRef.current);

  const performSave = useCallback(
    async (dataToSave: T, isAutoSave = true) => {
      if (isSavingRef.current) {
        // If already saving, queue this save for later
        pendingSaveRef.current = dataToSave;
        return;
      }

      // Check if data has actually changed
      if (trackChanges && JSON.stringify(dataToSave) === JSON.stringify(lastSavedDataRef.current)) {
        return;
      }

      try {
        isSavingRef.current = true;
        onSaveStart?.();

        const result = await saveFunction(dataToSave, isAutoSave);
        
        lastSavedDataRef.current = dataToSave;
        onSaveSuccess?.(result as T);

        // If there's a pending save with different data, execute it
        if (pendingSaveRef.current && 
            JSON.stringify(pendingSaveRef.current) !== JSON.stringify(dataToSave)) {
          const pendingData = pendingSaveRef.current;
          pendingSaveRef.current = undefined;
          // Recursively save pending data
          setTimeout(() => performSave(pendingData, isAutoSave), 100);
        }
      } catch (error) {
        onSaveError?.(error as Error);
      } finally {
        isSavingRef.current = false;
      }
    },
    [saveFunction, onSaveStart, onSaveSuccess, onSaveError, trackChanges]
  );

  const debouncedSave = useDebounce((dataToSave: T) => performSave(dataToSave, true), delay);

  const triggerSave = useCallback(
    (dataToSave: T) => {
      if (!enabled) return;
      debouncedSave(dataToSave);
    },
    [debouncedSave, enabled]
  );

  const forceSave = useCallback(
    async (dataToSave: T, isAutoSave = false) => {
      if (!enabled) return;
      
      // Clear any pending debounced saves
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      await performSave(dataToSave, isAutoSave);
    },
    [performSave, enabled]
  );

  // Update last saved data when initial data changes (for new notes)
  useEffect(() => {
    if (initialData && !lastSavedDataRef.current) {
      lastSavedDataRef.current = initialData;
    }
  }, [initialData]);

  return {
    triggerSave,
    forceSave,
    isSaving: isSavingRef.current,
    hasUnsavedChanges,
  };
}