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

  // Base padding for different orientations
  const basePaddingTop = isLandscape ? 20 : 40;
  const basePaddingBottom = isLandscape ? 20 : 40;

  // Ensure minimum safe area on Android for navigation bar
  const androidNavBarHeight = Platform.OS === 'android' ? 48 : 0; // Typical Android nav bar height
  const safeBottomPadding = Math.max(
    insets.bottom + 20, // Safe area bottom + additional spacing
    androidNavBarHeight, // Minimum height for Android nav bar
    basePaddingBottom
  );

  return {
    paddingTop: Math.max(basePaddingTop, insets.top + 10),
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
  const baseBottom = isLandscape ? 30 : 50;
  const androidNavBarHeight = Platform.OS === 'android' ? 48 : 0;
  
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
