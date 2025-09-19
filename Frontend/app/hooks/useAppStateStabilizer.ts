import { useEffect, useRef, useState } from 'react';
import { AppState, AppStateStatus, Dimensions, Platform } from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';

/**
 * Hook to monitor app state changes and prevent layout disruption
 * when users leave and return to the app - especially important for Android
 */
export const useAppStateStabilizer = () => {
  const appState = useRef(AppState.currentState);
  const [isLayoutStable, setIsLayoutStable] = useState(true);
  const dimensions = useRef(Dimensions.get('window'));
  const stabilityTimeout = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (Platform.OS === 'android') {
        if (
          appState.current.match(/inactive|background/) &&
          nextAppState === 'active'
        ) {
          // App has come to the foreground - prevent immediate layout changes
          setIsLayoutStable(false);
          
          // Clear any existing timeout
          if (stabilityTimeout.current) {
            clearTimeout(stabilityTimeout.current);
          }
          
          // Allow layout to stabilize after a delay
          stabilityTimeout.current = setTimeout(() => {
            setIsLayoutStable(true);
          }, 150); // Slightly longer delay for Android
        } else if (nextAppState.match(/inactive|background/)) {
          // App is going to background - lock layout
          setIsLayoutStable(false);
        }
      }

      appState.current = nextAppState;
    };

    const handleDimensionChange = ({ window }: any) => {
      // Only update dimensions when layout is stable
      if (isLayoutStable) {
        dimensions.current = window;
      }
    };

    const appStateSubscription = AppState.addEventListener(
      'change',
      handleAppStateChange
    );

    const dimensionSubscription = Dimensions.addEventListener(
      'change',
      handleDimensionChange
    );

    return () => {
      if (stabilityTimeout.current) {
        clearTimeout(stabilityTimeout.current);
      }
      appStateSubscription?.remove();
      dimensionSubscription?.remove();
    };
  }, [isLayoutStable]);

  return {
    isLayoutStable,
    dimensions: dimensions.current,
  };
};

/**
 * Hook to get stable safe area values that don't change during app transitions
 * This prevents the Android navigation bar transparency issue from affecting layout
 */
export const useStableSafeArea = (insets: EdgeInsets) => {
  const stableInsets = useRef<EdgeInsets>(insets);
  const { isLayoutStable } = useAppStateStabilizer();
  const isInitialized = useRef(false);

  useEffect(() => {
    // On first mount, always store the initial insets
    if (!isInitialized.current) {
      stableInsets.current = insets;
      isInitialized.current = true;
      return;
    }

    // Only update insets when layout is stable and we're not in transition
    if (isLayoutStable && Platform.OS === 'android') {
      // For Android, be more conservative about inset changes
      // Only update if there's a significant change (not just transparency changes)
      const bottomDiff = Math.abs(insets.bottom - stableInsets.current.bottom);
      if (bottomDiff > 10) { // Only update if change is significant
        stableInsets.current = insets;
      }
    } else if (Platform.OS === 'ios') {
      // iOS is more stable, can update more freely
      stableInsets.current = insets;
    }
  }, [insets, isLayoutStable]);

  return stableInsets.current;
};