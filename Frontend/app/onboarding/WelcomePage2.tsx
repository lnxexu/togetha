import React from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LearningSVG from '../../assets/illustrations/undraw_ideas_vn7a (1).svg';
import { OnboardingColors } from '../../constants/Colors';
import { getSafeAreaConfig } from './utils/SafeAreaUtils';

const WelcomePage2: React.FC = () => {
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
          <LearningSVG 
            width={isLandscape ? width * 0.18 : width * 0.6} 
            height={isLandscape ? width * 0.18 : width * 0.6} 
            style={styles.welcomeImage} 
          />
        </View>
        <Text style={[styles.title, { 
          fontSize: isLandscape ? width * 0.02 : width * 0.05,
          marginBottom: isLandscape ? 3 : 10
        }]}>Add Tasks Effortlessly</Text>
        <Text style={[styles.subtitle, { 
          fontSize: isLandscape ? width * 0.015 : width * 0.035, 
          maxWidth: isLandscape ? '100%' : width * 0.85,
          marginBottom: isLandscape ? 10 : 40,
          paddingHorizontal: isLandscape ? 20 : 20
        }]}>Create, organize, and prioritize your tasks with ease. Stay on top of your goals and never miss important deadlines.</Text>
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
});

export default WelcomePage2;
