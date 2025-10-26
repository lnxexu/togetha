import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Animated,
  StatusBar,
  SafeAreaView,
  ActivityIndicator,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

interface LoadingScreenProps {
  message?: string;
  onAnimationComplete?: () => void;
  isVisible?: boolean;
  showSuccessIcon?: boolean;
}

export default function LoadingScreen({
  message = "Loading...",
  onAnimationComplete,
  isVisible = true,
  showSuccessIcon = false,
}: LoadingScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const successFadeAnim = useRef(new Animated.Value(0)).current;
  const insets = useSafeAreaInsets();

  // Visibility control for smooth transitions
  useEffect(() => {
    if (isVisible) {
      // Fade in animation with scale
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 1,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start();

      // Show success icon briefly before exit if specified
      if (showSuccessIcon) {
        setTimeout(() => {
          Animated.timing(successFadeAnim, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }).start();
        }, 1000);
      }
    } else {
      // Fade out animation with scale
      Animated.parallel([
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 400,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.8,
          duration: 400,
          useNativeDriver: true,
        }),
      ]).start(() => {
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
      setTimeout(() => setShouldRender(false), 400);
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
          transform: [{ scale: scaleAnim }],
        },
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
            {/* Spinner or Success Icon */}
            <Animated.View
              style={[
                styles.spinnerContainer,
                {
                  opacity: showSuccessIcon
                    ? Animated.subtract(1, successFadeAnim)
                    : 1,
                },
              ]}
            >
              <ActivityIndicator
                size="large"
                color="rgba(255, 255, 255, 0.8)"
              />
            </Animated.View>

            {/* Success Icon */}
            {showSuccessIcon && (
              <Animated.View
                style={[styles.successContainer, { opacity: successFadeAnim }]}
              >
                <View style={styles.successIcon}>
                  <Text style={styles.checkmark}>✓</Text>
                </View>
              </Animated.View>
            )}

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
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
  },
  blurBackground: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.3)", // Light transparent overlay for blur effect
  },
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  content: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 40,
    paddingVertical: 30,
  },
  spinnerContainer: {
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  successContainer: {
    position: "absolute",
    alignItems: "center",
    justifyContent: "center",
  },
  successIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(16, 185, 129, 0.9)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
  },
  checkmark: {
    fontSize: 30,
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  message: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 1)",
    textAlign: "center",
    fontWeight: "500",
  },
});
