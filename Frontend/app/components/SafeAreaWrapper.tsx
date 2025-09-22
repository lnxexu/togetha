import React, { useEffect, useRef } from 'react';
import { View, StyleSheet, Platform, StatusBar } from 'react-native';
import { SafeAreaView, useSafeAreaInsets, EdgeInsets } from 'react-native-safe-area-context';

interface SafeAreaWrapperProps {
  children: React.ReactNode;
  screenType?: 'onboarding' | 'main' | 'modal';
  backgroundColor?: string;
  includeNavBar?: boolean;
  style?: any;
  disableTopSafeArea?: boolean;
}

/**
 * Enhanced SafeAreaWrapper that maintains consistent safe area handling
 * and prevents layout shifts during app state changes on Android
 */
export const SafeAreaWrapper: React.FC<SafeAreaWrapperProps> = ({
  children,
  screenType = 'main',
  backgroundColor = '#FFFFFF',
  includeNavBar = true,
  style = {}
  , disableTopSafeArea = false
}) => {
  const currentInsets = useSafeAreaInsets();
  const stableInsets = useRef<EdgeInsets>(currentInsets);
  const isFirstRender = useRef(true);

  // Store the first valid insets and use them consistently
  useEffect(() => {
    if (isFirstRender.current && currentInsets.bottom > 0) {
      stableInsets.current = currentInsets;
      isFirstRender.current = false;
    }
  }, [currentInsets]);

  // For Android, ensure we always have consistent bottom insets for navigation bar
  const finalInsets = Platform.OS === 'android' 
    ? {
        ...stableInsets.current,
        bottom: Math.max(stableInsets.current.bottom, 12) // Reduced minimum space for Android nav bar (smaller safe area)
      }
    : stableInsets.current;

  const containerStyle = {
    ...styles.container,
    backgroundColor,
    // allow caller to opt-out of top safe area padding (useful when header is absolute)
    paddingTop: disableTopSafeArea ? 0 : finalInsets.top,
    paddingBottom: includeNavBar ? 0 : finalInsets.bottom, // Let NavBar handle bottom padding
    ...style
  };

  return (
    <SafeAreaView style={containerStyle} edges={['left', 'right']}>
      {children}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

export default SafeAreaWrapper;