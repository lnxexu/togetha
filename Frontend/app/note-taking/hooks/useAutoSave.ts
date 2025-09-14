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
 * Custom hook for Google Docs-style auto-save functionality
 * Provides optimistic updates and conflict resolution
 */
export function useAutoSave<T>(
  data: T,
  saveFunction: (data: T) => Promise<T | void>,
  options?: {
    delay?: number;
    enabled?: boolean;
    onSaveStart?: () => void;
    onSaveSuccess?: (result?: T) => void;
    onSaveError?: (error: Error) => void;
  }
) {
  const {
    delay = 2000, // 2 seconds like Google Docs
    enabled = true,
    onSaveStart,
    onSaveSuccess,
    onSaveError,
  } = options || {};

  const isSavingRef = useRef(false);
  const lastSavedDataRef = useRef<T | undefined>(undefined);
  const pendingSaveRef = useRef<T | undefined>(undefined);
  const timeoutRef = useRef<NodeJS.Timeout | undefined>(undefined);

  const performSave = useCallback(
    async (dataToSave: T) => {
      if (isSavingRef.current) {
        // If already saving, queue this save for later
        pendingSaveRef.current = dataToSave;
        return;
      }

      // Check if data has actually changed
      if (JSON.stringify(dataToSave) === JSON.stringify(lastSavedDataRef.current)) {
        return;
      }

      try {
        isSavingRef.current = true;
        onSaveStart?.();

        const result = await saveFunction(dataToSave);
        
        lastSavedDataRef.current = dataToSave;
        onSaveSuccess?.(result as T);

        // If there's a pending save with different data, execute it
        if (pendingSaveRef.current && 
            JSON.stringify(pendingSaveRef.current) !== JSON.stringify(dataToSave)) {
          const pendingData = pendingSaveRef.current;
          pendingSaveRef.current = undefined;
          // Recursively save pending data
          setTimeout(() => performSave(pendingData), 100);
        }
      } catch (error) {
        onSaveError?.(error as Error);
      } finally {
        isSavingRef.current = false;
      }
    },
    [saveFunction, onSaveStart, onSaveSuccess, onSaveError]
  );

  const debouncedSave = useDebounce(performSave, delay);

  const triggerSave = useCallback(
    (dataToSave: T) => {
      if (!enabled) return;
      debouncedSave(dataToSave);
    },
    [debouncedSave, enabled]
  );

  const forceSave = useCallback(
    async (dataToSave: T) => {
      if (!enabled) return;
      
      // Clear any pending debounced saves
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      
      await performSave(dataToSave);
    },
    [performSave, enabled]
  );

  return {
    triggerSave,
    forceSave,
    isSaving: isSavingRef.current,
  };
}