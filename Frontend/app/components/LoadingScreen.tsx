import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface LoadingScreenProps {
  message?: string;
  onAnimationComplete?: () => void;
  isVisible?: boolean;
}

export default function LoadingScreen({ 
  message = "Loading...", 
  onAnimationComplete,
  isVisible = true
}: LoadingScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();
  
  // Visibility control for smooth transitions
  useEffect(() => {
    if (isVisible) {
      // Fade in animation
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      // Fade out animation
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 300,
        useNativeDriver: true,
      }).start(() => {
        if (onAnimationComplete) {
          onAnimationComplete();
        }
      });
    }
  }, [isVisible]);

  // Don't render if not visible and animation is complete
  const [shouldRender, setShouldRender] = useState(isVisible);
  
  useEffect(() => {
    if (isVisible) {
      setShouldRender(true);
    } else {
      // Delay hiding the component until fade out completes
      setTimeout(() => setShouldRender(false), 300);
    }
  }, [isVisible]);

  if (!shouldRender) {
    return null;
  }

  return (
    <Animated.View 
      style={[
        styles.overlay,
        {
          opacity: fadeAnim,
        }
      ]}
    >
      <StatusBar 
        barStyle="light-content" 
        backgroundColor="transparent" 
        translucent 
      />
      
      {/* Blur background */}
      <View style={styles.blurBackground}>
        <SafeAreaView style={styles.container}>
          <View style={styles.content}>
            {/* Simple Spinner */}
            <View style={styles.spinnerContainer}>
              <ActivityIndicator 
                size="large" 
                color="rgba(255, 255, 255, 0.8)"
              />
            </View>

            {/* Loading Text */}
            <Text style={styles.message}>{message}</Text>
          </View>
        </SafeAreaView>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  blurBackground: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)', // Light transparent overlay for blur effect
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 40,
    paddingVertical: 30,
  },
  spinnerContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  message: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 1)',
    textAlign: 'center',
    fontWeight: '500',
  },
});