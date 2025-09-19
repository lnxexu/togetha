import { Platform, StatusBar, Dimensions } from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';

export interface SafeAreaConfig {
  paddingTop: number;
  paddingBottom: number;
  minHeight: number;
  statusBarHeight: number;
  contentPaddingTop: number;
  contentPaddingBottom: number;
}

/**
 * Enhanced safe area configuration for all screens
 * Handles Android navigation bar, iOS notch, landscape orientation, and different screen types
 * 
 * IMPORTANT: This addresses the Android navigation bar overlay issue where the floating
 * navigation footer was being covered by the phone's built-in navigation bar.
 * The solution includes proper bottom padding calculations and stable layout handling.
 */
export const getEnhancedSafeAreaConfig = (
  insets: EdgeInsets,
  screenHeight: number,
  isLandscape: boolean = false,
  screenType: 'onboarding' | 'main' | 'modal' = 'main'
): SafeAreaConfig => {
  const statusBarHeight = Platform.OS === 'android' 
    ? StatusBar.currentHeight || 0 
    : insets.top;

  // Base padding calculations based on screen type
  let basePaddingTop: number;
  let basePaddingBottom: number;

  switch (screenType) {
    case 'onboarding':
      basePaddingTop = isLandscape ? 20 : 40;
      basePaddingBottom = isLandscape ? 20 : 40;
      break;
    case 'modal':
      basePaddingTop = isLandscape ? 15 : 30;
      basePaddingBottom = isLandscape ? 15 : 30;
      break;
    case 'main':
    default:
      basePaddingTop = isLandscape ? 10 : 20;
      basePaddingBottom = isLandscape ? 10 : 20;
      break;
  }

  // Android navigation bar height (common heights: 48dp for 3-button, 32dp for gesture)
  const androidNavBarHeight = Platform.OS === 'android' ? 48 : 0;
  
  // Safe area calculations
  const safeTopPadding = Math.max(
    basePaddingTop,
    insets.top + (screenType === 'onboarding' ? 10 : 5)
  );
  
  const safeBottomPadding = Math.max(
    insets.bottom + 20, // Safe area bottom + additional spacing
    androidNavBarHeight, // Minimum height for Android nav bar
    basePaddingBottom
  );

  // Content padding (for scrollable content within safe areas)
  const contentPaddingTop = screenType === 'onboarding' ? 20 : 16;
  const contentPaddingBottom = screenType === 'onboarding' ? 30 : 20;

  return {
    paddingTop: safeTopPadding,
    paddingBottom: safeBottomPadding,
    minHeight: screenHeight - insets.top - insets.bottom,
    statusBarHeight,
    contentPaddingTop,
    contentPaddingBottom,
  };
};

/**
 * Get safe area container styles for different screen types
 */
export const getSafeAreaContainerStyle = (screenType: 'onboarding' | 'main' | 'modal' = 'main') => {
  const baseStyle = {
    flex: 1,
  };

  switch (screenType) {
    case 'onboarding':
      return {
        ...baseStyle,
        backgroundColor: '#FAF5FF', // Light purple background
      };
    case 'modal':
      return {
        ...baseStyle,
        backgroundColor: 'transparent',
      };
    case 'main':
    default:
      return {
        ...baseStyle,
        backgroundColor: '#FFFFFF',
      };
  }
};

/**
 * Enhanced status bar configuration for different screen types
 */
export const getStatusBarConfig = (screenType: 'onboarding' | 'main' | 'modal' = 'main') => {
  const baseConfig = {
    translucent: true,
  };

  switch (screenType) {
    case 'onboarding':
      return {
        ...baseConfig,
        barStyle: 'dark-content' as const,
        backgroundColor: 'transparent',
      };
    case 'modal':
      return {
        ...baseConfig,
        barStyle: 'light-content' as const,
        backgroundColor: 'transparent',
      };
    case 'main':
    default:
      return {
        ...baseConfig,
        barStyle: 'dark-content' as const,
        backgroundColor: '#FFFFFF',
      };
  }
};

/**
 * Get keyboard avoiding view behavior for cross-platform compatibility
 */
export const getKeyboardAvoidingViewBehavior = () => {
  return Platform.OS === 'ios' ? 'padding' : 'height';
};

/**
 * Get platform-specific shadow styles
 */
export const getPlatformShadow = (elevation: number = 4, shadowColor: string = '#000') => {
  if (Platform.OS === 'ios') {
    return {
      shadowColor,
      shadowOffset: { width: 0, height: elevation / 2 },
      shadowOpacity: 0.1,
      shadowRadius: elevation,
    };
  } else {
    return {
      elevation,
    };
  }
};

/**
 * Get responsive font size based on screen dimensions
 */
export const getResponsiveFontSize = (baseSize: number, screenWidth: number) => {
  const scale = screenWidth / 375; // Base width (iPhone X)
  const newSize = baseSize * scale;
  
  // Ensure font size stays within reasonable bounds
  const minSize = baseSize * 0.8;
  const maxSize = baseSize * 1.2;
  
  return Math.max(minSize, Math.min(maxSize, newSize));
};

/**
 * Check if device has a notch (for iPhone X and newer)
 */
export const hasNotch = (insets: EdgeInsets) => {
  return insets.top > 20 || insets.bottom > 0;
};

/**
 * Get modal safe area configuration
 */
export const getModalSafeArea = (insets: EdgeInsets) => {
  return {
    paddingTop: Math.max(insets.top, 20),
    paddingBottom: Math.max(insets.bottom, 20),
    paddingHorizontal: 20,
  };
};
