import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Animated,
  Dimensions,
  StatusBar,
  Platform,
  SafeAreaView,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OnboardingColors } from '../../constants/Colors';

// BlurView alternative - using semi-transparent overlay
const BlurAlternative = ({ intensity, style, tint, children }: any) => (
  <View 
    style={[
      style,
      {
        backgroundColor: tint === 'dark' 
          ? `rgba(0, 0, 0, ${Math.min(intensity / 100 * 0.6, 0.6)})` 
          : `rgba(255, 255, 255, ${Math.min(intensity / 100 * 0.3, 0.3)})`
      }
    ]}
  >
    {children}
  </View>
);

interface LoadingScreenProps {
  message?: string;
  subMessage?: string;
  showLogo?: boolean;
  showQuotes?: boolean;
  blurIntensity?: number;
}

const { width, height } = Dimensions.get('window');

// Motivational quotes for long loading times
const motivationalQuotes = [
  "Great things take time to build...",
  "Success is a journey, not a destination.",
  "Every expert was once a beginner.",
  "Progress, not perfection.",
  "Your future self will thank you.",
  "Dream it. Plan it. Do it.",
  "Believe in yourself and all that you are.",
  "The best time to plant a tree was 20 years ago. The second best time is now.",
  "Small steps lead to big changes.",
  "You're closer than you think.",
  "Focus on progress, not perfection.",
  "Make today amazing!",
];

export default function EnhancedLoadingScreen({ 
  message = "Loading...", 
  subMessage = "Please wait while we set things up",
  showLogo = true,
  showQuotes = true,
  blurIntensity = 80
}: LoadingScreenProps) {
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const quoteOpacity = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const insets = useSafeAreaInsets();
  
  // State for motivational quotes
  const [currentQuote, setCurrentQuote] = useState(0);
  const [showMotivationalQuotes, setShowMotivationalQuotes] = useState(false);

  // Show motivational quotes after 3 seconds of loading
  useEffect(() => {
    const quoteTimer = setTimeout(() => {
      if (showQuotes) {
        setShowMotivationalQuotes(true);
        Animated.timing(quoteOpacity, {
          toValue: 1,
          duration: 800,
          useNativeDriver: true,
        }).start();
      }
    }, 3000);

    return () => clearTimeout(quoteTimer);
  }, [showQuotes]);

  // Cycle through quotes every 4 seconds
  useEffect(() => {
    if (showMotivationalQuotes) {
      const interval = setInterval(() => {
        Animated.sequence([
          Animated.timing(quoteOpacity, {
            toValue: 0,
            duration: 300,
            useNativeDriver: true,
          }),
          Animated.timing(quoteOpacity, {
            toValue: 1,
            duration: 300,
            useNativeDriver: true,
          }),
        ]).start();
        
        setCurrentQuote((prev) => (prev + 1) % motivationalQuotes.length);
      }, 4000);

      return () => clearInterval(interval);
    }
  }, [showMotivationalQuotes]);

  useEffect(() => {
    // Main container animation
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 1000,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        tension: 50,
        friction: 7,
        useNativeDriver: true,
      }),
    ]).start();

    // Continuous rotation for loading spinner
    const rotateAnimation = Animated.loop(
      Animated.timing(rotateAnim, {
        toValue: 1,
        duration: 2000,
        useNativeDriver: true,
      })
    );
    rotateAnimation.start();

    // Pulse animation for the container
    const pulseAnimation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );
    pulseAnimation.start();

    return () => {
      rotateAnimation.stop();
      pulseAnimation.stop();
    };
  }, []);

  const spin = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '360deg'],
  });

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar 
        barStyle="light-content" 
        backgroundColor="transparent" 
        translucent 
      />
      
      {/* Background with Gradient */}
      <LinearGradient
        colors={[OnboardingColors.primary.dark, OnboardingColors.primary.main, OnboardingColors.primary.light]}
        style={styles.background}
      >
        {/* Blur Overlay */}
        <BlurAlternative 
          intensity={blurIntensity} 
          style={styles.blurContainer}
          tint="dark"
        >
          <Animated.View
            style={[
              styles.container,
              {
                opacity: fadeAnim,
                transform: [
                  { scale: scaleAnim },
                  { scale: pulseAnim }
                ],
                paddingTop: Math.max(insets.top, 20),
                paddingBottom: Math.max(insets.bottom, 20),
              },
            ]}
          >
            {/* Logo/Icon Section */}
            {showLogo && (
              <Animated.View style={styles.logoContainer}>
                <View style={styles.logoBackground}>
                  <Animated.View
                    style={[
                      styles.spinnerContainer,
                      { transform: [{ rotate: spin }] }
                    ]}
                  >
                    <MaterialIcons 
                      name="autorenew" 
                      size={50} 
                      color={OnboardingColors.primary.main} 
                    />
                  </Animated.View>
                </View>
              </Animated.View>
            )}

            {/* Loading Text */}
            <View style={styles.textContainer}>
              <Text style={styles.mainMessage}>{message}</Text>
              <Text style={styles.subMessage}>{subMessage}</Text>
            </View>

            {/* Enhanced Spinner with Rings */}
            <View style={styles.spinnerSection}>
              <Animated.View 
                style={[
                  styles.spinnerRing,
                  { transform: [{ rotate: spin }] }
                ]}
              >
                <View style={styles.spinnerDot} />
              </Animated.View>
              <Animated.View 
                style={[
                  styles.spinnerRingInner,
                  { transform: [{ rotate: spin }] }
                ]}
              >
                <View style={styles.spinnerDotInner} />
              </Animated.View>
            </View>

            {/* Motivational Quotes */}
            {showMotivationalQuotes && (
              <Animated.View 
                style={[
                  styles.quoteContainer,
                  { opacity: quoteOpacity }
                ]}
              >
                <MaterialIcons 
                  name="format-quote" 
                  size={24} 
                  color={OnboardingColors.text.white} 
                  style={styles.quoteIcon}
                />
                <Text style={styles.quoteText}>
                  {motivationalQuotes[currentQuote]}
                </Text>
              </Animated.View>
            )}
          </Animated.View>
        </BlurAlternative>
      </LinearGradient>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: OnboardingColors.primary.dark,
  },
  background: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blurContainer: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    width: '100%',
  },
  logoContainer: {
    marginBottom: 40,
    alignItems: 'center',
  },
  logoBackground: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: OnboardingColors.text.white,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: OnboardingColors.shadow.purple,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
  },
  spinnerContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    alignItems: 'center',
    marginBottom: 50,
  },
  mainMessage: {
    fontSize: 28,
    fontWeight: '700',
    color: OnboardingColors.text.white,
    textAlign: 'center',
    marginBottom: 12,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    textShadowColor: 'rgba(0, 0, 0, 0.3)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subMessage: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.8)',
    textAlign: 'center',
    lineHeight: 24,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    paddingHorizontal: 20,
  },
  spinnerSection: {
    position: 'relative',
    width: 80,
    height: 80,
    marginBottom: 40,
  },
  spinnerRing: {
    position: 'absolute',
    width: 80,
    height: 80,
    borderRadius: 40,
    borderWidth: 3,
    borderColor: 'transparent',
    borderTopColor: OnboardingColors.text.white,
    borderRightColor: OnboardingColors.text.white,
  },
  spinnerRingInner: {
    position: 'absolute',
    top: 10,
    left: 10,
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2,
    borderColor: 'transparent',
    borderTopColor: 'rgba(255, 255, 255, 0.6)',
    borderLeftColor: 'rgba(255, 255, 255, 0.6)',
  },
  spinnerDot: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 12,
    height: 12,
    borderRadius: 6,
    backgroundColor: OnboardingColors.text.white,
  },
  spinnerDotInner: {
    position: 'absolute',
    top: -4,
    left: -4,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.6)',
  },
  quoteContainer: {
    position: 'absolute',
    bottom: 80,
    left: 40,
    right: 40,
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 20,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  quoteIcon: {
    marginBottom: 10,
    opacity: 0.8,
  },
  quoteText: {
    fontSize: 16,
    color: OnboardingColors.text.white,
    textAlign: 'center',
    fontStyle: 'italic',
    lineHeight: 22,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif',
    fontWeight: '400',
  },
});
