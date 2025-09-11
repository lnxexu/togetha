import { Platform, StatusBar, Dimensions } from 'react-native';
import { EdgeInsets } from 'react-native-safe-area-context';

export interface SafeAreaConfig {
  paddingTop: number;
  paddingBottom: number;
  minHeight: number;
  statusBarHeight: number;
}

/**
 * Calculate safe area configuration for onboarding screens
 * Handles Android navigation bar, iOS notch, and landscape orientation
 */
export const getSafeAreaConfig = (
  insets: EdgeInsets,
  screenHeight: number,
  isLandscape: boolean = false
): SafeAreaConfig => {
  const statusBarHeight = Platform.OS === 'android' 
    ? StatusBar.currentHeight || 0 
    : insets.top;

  // Minimal padding for landscape to maximize content space
  const basePaddingTop = isLandscape ? 0 : 40;
  const basePaddingBottom = isLandscape ? 0 : 40;

  // Ensure minimum safe area on Android for navigation bar
  const androidNavBarHeight = Platform.OS === 'android' ? 48 : 0;
  const safeBottomPadding = isLandscape 
    ? Math.max(insets.bottom, androidNavBarHeight) 
    : Math.max(
        insets.bottom + 20,
        androidNavBarHeight,
        basePaddingBottom
      );

  return {
    paddingTop: isLandscape ? 0 : Math.max(basePaddingTop, insets.top + 10),
    paddingBottom: safeBottomPadding,
    minHeight: screenHeight - insets.top - insets.bottom,
    statusBarHeight,
  };
};

/**
 * Get pagination bottom position for swiper
 */
export const getPaginationBottomPosition = (
  insets: EdgeInsets,
  isLandscape: boolean = false
): number => {
  // Use minimal padding in landscape mode to save vertical space
  const baseBottom = isLandscape ? 10 : 50;
  const androidNavBarHeight = Platform.OS === 'android' ? 48 : 0;
  
  // In landscape mode, use minimal bottom padding
  if (isLandscape) {
    return Math.max(
      insets.bottom + 5,
      androidNavBarHeight + 5,
      baseBottom
    );
  }
  
  return Math.max(
    insets.bottom + 20,
    androidNavBarHeight + 10,
    baseBottom
  );
};

/**
 * Status bar configuration for onboarding screens
 */
export const getStatusBarConfig = () => ({
  barStyle: 'dark-content' as const,
  backgroundColor: 'transparent',
  translucent: true,
});

/**
 * Safe area styles for container components
 */
export const getSafeAreaContainerStyle = () => ({
  flex: 1,
  backgroundColor: '#FAF5FF',
});

/**
 * Check if device is in landscape mode
 */
export const isLandscapeMode = (width: number, height: number): boolean => {
  return width > height;
};

/**
 * Get responsive layout configuration based on orientation
 */
export const getLayoutConfig = (
  width: number,
  height: number,
  insets: EdgeInsets
) => {
  const isLandscape = isLandscapeMode(width, height);
  
  return {
    isLandscape,
    containerPadding: {
      horizontal: isLandscape ? width * 0.1 : 24, // Similar to signin page
      top: isLandscape ? Math.max(insets.top + 10, 20) : Math.max(insets.top + 20, 60),
      bottom: isLandscape ? Math.max(insets.bottom + 10, 20) : Math.max(insets.bottom + 20, 40),
    },
    contentLayout: {
      flexDirection: isLandscape ? 'row' as const : 'column' as const,
      imageWidth: isLandscape ? Math.min(width * 0.35, 250) : Math.min(width * 0.55, 280),
      imageHeight: isLandscape ? Math.min(height * 0.5, 250) : Math.min(width * 0.55, 280),
      textMaxWidth: isLandscape ? width * 0.55 : width * 0.9, // Use more space
      maxContentWidth: isLandscape ? width : 400, // Max width constraint like signin
    },
    typography: {
      brandTitle: Math.min(isLandscape ? width * 0.04 : width * 0.08, 32),
      title: Math.min(isLandscape ? width * 0.032 : width * 0.055, 24),
      subtitle: Math.min(isLandscape ? width * 0.022 : width * 0.038, 16),
      buttonText: Math.min(isLandscape ? width * 0.022 : width * 0.04, 16),
    },
    spacing: {
      brandTitleMargin: isLandscape ? 12 : 24,
      titleMargin: isLandscape ? 8 : 16,
      subtitleMargin: isLandscape ? 16 : 32,
      buttonMargin: isLandscape ? 12 : 24,
      sectionGap: isLandscape ? 20 : 0, // Gap between image and text in landscape
    }
  };
};
