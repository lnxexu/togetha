import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState, useRef } from 'react';
import {
  StyleSheet,
  useWindowDimensions,
  StatusBar,
  Animated,
  View,
  Text,
  TouchableOpacity,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { OnboardingColors } from '../../constants/Colors';
import { getLayoutConfig, isLandscapeMode } from './utils/SafeAreaUtils';

// Import SVGs
import LearningSVG from '../../assets/illustrations/undraw_ideas_vn7a (1).svg';
import EducationSVG from '../../assets/illustrations/undraw_education_3vwh.svg';
import WelcomeSVG from '../../assets/illustrations/welcome.svg';

type WelcomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Welcome'>;

interface SlideData {
  id: number;
  title: string;
  subtitle: string;
  SvgComponent: React.ComponentType<any>;
  backgroundColor: [string, string];
}

const slides: SlideData[] = [
  {
    id: 1,
    title: "Welcome to Togetha",
    subtitle: "Your all-in-one productivity companion that brings together tasks, deadlines, and study materials in perfect harmony.",
    SvgComponent: WelcomeSVG,
    backgroundColor: ['#FAF5FF', '#F3E8FF'],
  },
  {
    id: 2,
    title: "Organize Your Life",
    subtitle: "Create, organize, and prioritize your tasks with intelligent features. Stay focused and never miss important deadlines again.",
    SvgComponent: LearningSVG,
    backgroundColor: ['#F0F9FF', '#E0F2FE'],
  },
  {
    id: 3,
    title: "Achieve Your Goals",
    subtitle: "Join thousands of students and professionals who stay productive and achieve their dreams with Togetha's powerful tools.",
    SvgComponent: EducationSVG,
    backgroundColor: ['#F0FDF4', '#DCFCE7'],
  },
];

const WelcomeScreen: React.FC = () => {
  const navigation = useNavigation<WelcomeScreenNavigationProp>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [currentSlide, setCurrentSlide] = useState(0);
  
  const slideAnimation = useRef(new Animated.Value(0)).current;
  const fadeAnimation = useRef(new Animated.Value(1)).current;
  const scaleAnimation = useRef(new Animated.Value(1)).current;
  
  const isLandscape = isLandscapeMode(width, height);
  const layoutConfig = getLayoutConfig(width, height, insets);

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      animateToNextSlide();
    } else {
      navigation.navigate('Signup');
    }
  };

  const handleSkip = () => {
    navigation.navigate('Login');
  };

  const animateToNextSlide = () => {
    // Fade out current content
    Animated.parallel([
      Animated.timing(fadeAnimation, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }),
      Animated.timing(scaleAnimation, {
        toValue: 0.9,
        duration: 200,
        useNativeDriver: true,
      }),
    ]).start(() => {
      // Change slide
      setCurrentSlide(prev => prev + 1);
      
      // Fade in new content
      Animated.parallel([
        Animated.timing(fadeAnimation, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnimation, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
      ]).start();
    });
  };

  const goToSlide = (index: number) => {
    if (index !== currentSlide) {
      Animated.parallel([
        Animated.timing(fadeAnimation, {
          toValue: 0,
          duration: 150,
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnimation, {
          toValue: 0.95,
          duration: 150,
          useNativeDriver: true,
        }),
      ]).start(() => {
        setCurrentSlide(index);
        Animated.parallel([
          Animated.timing(fadeAnimation, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }),
          Animated.timing(scaleAnimation, {
            toValue: 1,
            duration: 250,
            useNativeDriver: true,
          }),
        ]).start();
      });
    }
  };

  const currentSlideData = slides[currentSlide];

  return (
    <>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />
      <View style={styles.container}>
        <LinearGradient
          colors={currentSlideData.backgroundColor}
          style={[styles.gradientContainer, { height }]}
        >
          {/* Skip Button */}
          <TouchableOpacity 
            style={[styles.skipButton, { 
              top: Math.max(insets.top + (isLandscape ? 10 : 15), isLandscape ? 20 : 25),
              right: Math.min(width * 0.05, isLandscape ? 25 : 30),
            }]}
            onPress={handleSkip}
          >
            <Text style={[styles.skipText, {
              fontSize: Math.min(width * 0.032, 14),
            }]}>Skip</Text>
          </TouchableOpacity>

          {/* Brand Title */}
          <View style={[styles.brandContainer, {
            marginTop: Math.max(insets.top + (isLandscape ? 30 : 40), isLandscape ? 40 : 60),
            marginBottom: isLandscape ? 15 : 25,
          }]}>
            <Text style={[styles.brandTitle, {
              fontSize: Math.min(width * 0.08, isLandscape ? 28 : 36),
            }]}>Togetha</Text>
          </View>

          {/* Main Content */}
          <View style={styles.centerWrapper}>
            <Animated.View 
              style={[
                styles.contentContainer,
                {
                  opacity: fadeAnimation,
                  transform: [{ scale: scaleAnimation }],
                  width: '100%',
                  maxWidth: Math.min(width * 0.9, isLandscape ? 800 : 500),
                },
                isLandscape ? styles.landscapeContent : styles.portraitContent
              ]}
            >
              {/* SVG Illustration */}
              <View style={[
                styles.illustrationContainer,
                isLandscape && styles.landscapeIllustration,
                {
                  width: isLandscape ? Math.min(width * 0.4, 350) : '100%',
                  height: isLandscape ? Math.min(height * 0.6, 300) : Math.min(height * 0.4, 350),
                }
              ]}>
                <currentSlideData.SvgComponent
                  width={Math.min(
                    isLandscape ? Math.min(width * 0.35, 300) : Math.min(width * 0.8, 320),
                    isLandscape ? 300 : 320
                  )}
                  height={Math.min(
                    isLandscape ? Math.min(height * 0.5, 250) : Math.min(height * 0.35, 280),
                    isLandscape ? 250 : 280
                  )}
                  style={styles.illustration}
                />
              </View>

              {/* Text Content */}
              <View style={[
                styles.textContainer,
                isLandscape && styles.landscapeText,
                {
                  width: isLandscape ? Math.min(width * 0.5, 400) : '100%',
                  maxWidth: isLandscape ? 400 : width * 0.9,
                }
              ]}>
                <Text style={[styles.title, {
                  fontSize: Math.min(
                    isLandscape ? width * 0.025 : width * 0.06,
                    isLandscape ? 24 : 28
                  ),
                  textAlign: 'center',
                  lineHeight: Math.min(
                    isLandscape ? width * 0.035 : width * 0.08,
                    isLandscape ? 32 : 36
                  ),
                }]}>
                  {currentSlideData.title}
                </Text>
                <Text style={[styles.subtitle, {
                  fontSize: Math.min(
                    isLandscape ? width * 0.018 : width * 0.038,
                    isLandscape ? 14 : 16
                  ),
                  textAlign: 'center',
                  paddingHorizontal: isLandscape ? 0 : Math.min(width * 0.05, 20),
                  lineHeight: Math.min(
                    isLandscape ? width * 0.025 : width * 0.05,
                    isLandscape ? 20 : 24
                  ),
                }]}>
                  {currentSlideData.subtitle}
                </Text>
              </View>
            </Animated.View>
          </View>

          {/* Bottom Section */}
          <View style={[styles.bottomContainer, {
            paddingBottom: Math.max(insets.bottom + (isLandscape ? 15 : 25), isLandscape ? 25 : 35),
            paddingHorizontal: Math.min(width * 0.08, isLandscape ? 30 : 40),
            width: '100%',
            maxWidth: Math.min(width * 0.9, 400),
            alignSelf: 'center',
          }]}>
            {/* Progress Indicators */}
            <View style={styles.progressContainer}>
              {slides.map((_, index) => (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.progressDot,
                    index === currentSlide && styles.progressDotActive,
                    {
                      width: index === currentSlide ? 
                        Math.min(width * 0.06, isLandscape ? 18 : 24) : 
                        Math.min(width * 0.02, isLandscape ? 6 : 8),
                      height: Math.min(width * 0.02, isLandscape ? 6 : 8),
                    }
                  ]}
                  onPress={() => goToSlide(index)}
                />
              ))}
            </View>

            {/* Action Buttons */}
            <View style={[
              styles.buttonContainer, 
              isLandscape && styles.landscapeButtons,
              { 
                maxWidth: Math.min(width * 0.9, 340),
                width: '100%',
                paddingHorizontal: 5,
              }
            ]}>
              {currentSlide < slides.length - 1 ? (
                <>
                  <TouchableOpacity
                    style={[styles.secondaryButton, {
                      paddingVertical: Math.min(width * 0.035, isLandscape ? 14 : 16),
                      paddingHorizontal: Math.min(width * 0.03, isLandscape ? 12 : 16),
                    }]}
                    onPress={handleSkip}
                  >
                    <Text style={[styles.secondaryButtonText, {
                      fontSize: Math.min(width * 0.032, isLandscape ? 13 : 15),
                    }]}>Sign In</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.primaryButton, {
                      paddingVertical: Math.min(width * 0.035, isLandscape ? 14 : 16),
                      paddingHorizontal: Math.min(width * 0.03, isLandscape ? 12 : 16),
                    }]}
                    onPress={handleNext}
                  >
                    <Text style={[styles.primaryButtonText, {
                      fontSize: Math.min(width * 0.032, isLandscape ? 13 : 15),
                    }]}>Next</Text>
                  </TouchableOpacity>
                </>
              ) : (
                <TouchableOpacity
                  style={[styles.getStartedButton, {
                    paddingVertical: Math.min(width * 0.04, isLandscape ? 14 : 18),
                    paddingHorizontal: Math.min(width * 0.08, isLandscape ? 32 : 40),
                  }]}
                  onPress={handleNext}
                >
                  <Text style={[styles.getStartedButtonText, {
                    fontSize: Math.min(width * 0.04, isLandscape ? 16 : 18),
                  }]}>Get Started</Text>
                </TouchableOpacity>
              )}
            </View>
          </View>
        </LinearGradient>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#faf5ff',
  },
  gradientContainer: {
    flex: 1,
    width: '100%',
  },
  skipButton: {
    position: 'absolute',
    zIndex: 10,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  skipText: {
    color: OnboardingColors.primary.main,
    fontSize: 14,
    fontWeight: '600',
  },
  brandContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  brandTitle: {
    color: OnboardingColors.primary.main,
    fontFamily: 'Lexend',
    
    letterSpacing: 1,
    textAlign: 'center',
  },
  centerWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
    width: '100%',
  },
  contentContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
  portraitContent: {
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
  },
  landscapeContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 20,
  },
  illustrationContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  landscapeIllustration: {
    marginBottom: 0,
    marginRight: 0,
  },
  illustration: {
    shadowColor: OnboardingColors.shadow.purple,
    shadowOffset: {
      width: 0,
      height: 10,
    },
    shadowOpacity: 0.25,
    shadowRadius: 15,
    elevation: 10,
  },
  textContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  landscapeText: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: {
    fontWeight: '700',
    color: OnboardingColors.primary.main,
    letterSpacing: 0.5,
    marginBottom: 16,
    textAlign: 'center',
  },
  subtitle: {
    fontWeight: '500',
    color: OnboardingColors.text.secondary,
    letterSpacing: 0.2,
    textAlign: 'center',
  },
  bottomContainer: {
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  progressContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 30,
  },
  progressDot: {
    backgroundColor: `${OnboardingColors.primary.main}30`,
    borderRadius: 4,
    marginHorizontal: 4,
  },
  progressDotActive: {
    backgroundColor: OnboardingColors.primary.main,
  },
  buttonContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    maxWidth: 320,
    gap: 10,
  },
  landscapeButtons: {
    maxWidth: 280,
    gap: 8,
  },
  secondaryButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: OnboardingColors.primary.main,
    borderRadius: 12,
    width: '48%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  secondaryButtonText: {
    color: OnboardingColors.primary.main,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
  primaryButton: {
    backgroundColor: OnboardingColors.primary.main,
    borderRadius: 12,
    width: '48%',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: OnboardingColors.shadow.purple,
    shadowOffset: {
      width: 0,
      height: 6,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  primaryButtonText: {
    color: OnboardingColors.text.white,
    fontFamily: 'Inter-Bold',
    letterSpacing: 0.3,
  },
  getStartedButton: {
    backgroundColor: OnboardingColors.primary.main,
    borderRadius: 16,
    alignItems: 'center',
    width: '100%',
    maxWidth: 280,
    shadowColor: OnboardingColors.shadow.purple,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  getStartedButtonText: {
    color: OnboardingColors.text.white,
    fontFamily: 'Inter-Regular',
    letterSpacing: 0.5,
  },
});

export default WelcomeScreen;
