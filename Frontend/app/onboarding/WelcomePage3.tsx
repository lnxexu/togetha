import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import PersonalizeSVG from '../../assets/illustrations/undraw_education_3vwh.svg';
import { OnboardingColors } from '../../constants/Colors';
import { getSafeAreaConfig } from './utils/SafeAreaUtils';

interface WelcomePage3Props {
  onGetStartedPress: () => void;
}

const WelcomePage3: React.FC<WelcomePage3Props> = ({ onGetStartedPress }) => {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const safeAreaConfig = getSafeAreaConfig(insets, height, isLandscape);

  return (
    <LinearGradient
      colors={['#FAF5FF', '#F3E8FF'] as const}
      style={[styles.slide, { 
        width, 
        minHeight: safeAreaConfig.minHeight, 
        paddingTop: isLandscape ? 10 : 20,
        paddingBottom: safeAreaConfig.paddingBottom,
        paddingHorizontal: isLandscape ? 10 : 20,
        maxWidth: isLandscape ? '100%' : width
      }]}
    >
      <View style={[styles.contentContainer, { 
        flex: 1,
        maxWidth: isLandscape ? '100%' : width * 0.9
      }]}>
        <View style={[styles.imageContainer, { marginBottom: isLandscape ? 5 : 20 }]}>
          <Text style={[styles.topTitle, { 
            fontSize: isLandscape ? width * 0.035 : width * 0.08,
            marginBottom: isLandscape ? 3 : 10
          }]}>Togetha</Text>
          <PersonalizeSVG 
            width={isLandscape ? width * 0.18 : width * 0.6} 
            height={isLandscape ? width * 0.18 : width * 0.6} 
            style={styles.welcomeImage} 
          />
        </View>
        <Text style={[styles.title, { 
          fontSize: isLandscape ? width * 0.02 : width * 0.05,
          marginBottom: isLandscape ? 3 : 10
        }]}>Let's personalize your experience</Text>
        <Text style={[styles.subtitle, { 
          fontSize: isLandscape ? width * 0.015 : width * 0.035, 
          maxWidth: isLandscape ? '100%' : width * 0.85,
          marginBottom: isLandscape ? 10 : 40,
          paddingHorizontal: isLandscape ? 20 : 20
        }]}>Join thousands of students and professionals who stay organized and achieve their goals with Togetha.</Text>
        <TouchableOpacity
          style={[styles.getStartedButton, { 
            paddingVertical: isLandscape ? width * 0.01 : width * 0.03, 
            paddingHorizontal: isLandscape ? width * 0.03 : width * 0.08, 
            borderRadius: isLandscape ? width * 0.02 : width * 0.07,
            marginTop: isLandscape ? 3 : 10
          }]}
          onPress={onGetStartedPress}
        >
          <Text style={[styles.getStartedButtonText, { fontSize: isLandscape ? width * 0.018 : width * 0.045 }]}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </LinearGradient>
  );
};

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  topTitle: {
    color: OnboardingColors.primary.main,
    fontWeight: '800',
    letterSpacing: 1,
  },
  welcomeImage: {
    borderRadius: 20,
    shadowColor: OnboardingColors.shadow.purple,
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  imageContainer: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
    color: OnboardingColors.primary.main,
    letterSpacing: 0.5,
  },
  subtitle: {
    fontWeight: '500',
    textAlign: 'center',
    color: OnboardingColors.text.secondary,
    lineHeight: 24,
  },
  getStartedButton: {
    backgroundColor: OnboardingColors.primary.main,
    shadowColor: OnboardingColors.shadow.purple,
    shadowOffset: { 
      width: 0, 
      height: 6 
    },
    shadowOpacity: 0.4,
    shadowRadius: 10,
    elevation: 8,
    alignSelf: 'center',
  },
  getStartedButtonText: {
    color: OnboardingColors.text.white,
    fontWeight: '700',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
});

export default WelcomePage3;
