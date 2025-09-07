import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { OnboardingColors } from '../../constants/Colors';
import { getSafeAreaConfig } from './utils/SafeAreaUtils';

interface WelcomePage1Props {
  onLoginPress: () => void;
}

const WelcomePage1: React.FC<WelcomePage1Props> = ({ onLoginPress }) => {
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
        <View style={[styles.topSection, { marginBottom: isLandscape ? 5 : 20 }]}>
          <Text style={[styles.topTitle, { 
            fontSize: isLandscape ? width * 0.035 : width * 0.08,
            marginBottom: isLandscape ? 3 : 10
          }]}>Togetha</Text>
          <Image
            source={require('../../assets/images/output-onlinepngtools.png')}
            style={[styles.welcomeImage, { 
              width: isLandscape ? width * 0.18 : width * 0.6, 
              height: isLandscape ? width * 0.18 : width * 0.6, 
              maxWidth: isLandscape ? 140 : 300, 
              maxHeight: isLandscape ? 140 : 300 
            }]}
            resizeMode="contain"
          />
        </View>
        <View style={styles.textSection}>
          <Text style={[styles.title, { 
            fontSize: isLandscape ? width * 0.02 : width * 0.05,
            marginBottom: isLandscape ? 3 : 10
          }]}>Get things done with Togetha</Text>
          <Text style={[styles.subtitle, { 
            fontSize: isLandscape ? width * 0.015 : width * 0.035, 
            maxWidth: isLandscape ? '100%' : width * 0.85,
            marginBottom: isLandscape ? 10 : 40,
            paddingHorizontal: isLandscape ? 20 : 20
          }]}>
            No more juggling apps. With Togetha, your tasks, deadlines, and study materials are all in sync! So you can focus on what really matters.
          </Text>
          <TouchableOpacity
            style={[styles.loginButton, { 
              paddingVertical: isLandscape ? width * 0.008 : width * 0.025, 
              paddingHorizontal: isLandscape ? width * 0.025 : width * 0.06, 
              borderRadius: isLandscape ? width * 0.02 : width * 0.05,
              marginTop: isLandscape ? 5 : 15
            }]}
            onPress={onLoginPress}
          >
            <Text style={[styles.loginButtonText, { fontSize: isLandscape ? width * 0.016 : width * 0.04 }]}>Already have an account? Sign In</Text>
          </TouchableOpacity>
        </View>
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
  topSection: {
    alignItems: 'center',
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
  textSection: {
    alignItems: 'center',
    width: '100%',
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
  loginButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: OnboardingColors.primary.main,
    alignSelf: 'center',
    shadowColor: OnboardingColors.shadow.light,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  loginButtonText: {
    color: OnboardingColors.primary.main,
    fontWeight: '600',
    textAlign: 'center',
  },
});

export default WelcomePage1;
