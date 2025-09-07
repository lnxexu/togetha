import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  useWindowDimensions,
  StatusBar,
  Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Swiper from 'react-native-swiper';
import type { RootStackParamList } from '../navigation/AppNavigator';
import { OnboardingColors } from '../../constants/Colors';
import WelcomePage1 from './WelcomePage1';
import WelcomePage2 from './WelcomePage2';
import WelcomePage3 from './WelcomePage3';
import { getPaginationBottomPosition, getStatusBarConfig, getSafeAreaContainerStyle } from './utils/SafeAreaUtils';

type WelcomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Welcome'>;

const WelcomeScreen: React.FC = () => {
  const navigation = useNavigation<WelcomeScreenNavigationProp>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const statusBarConfig = getStatusBarConfig();
  const safeAreaStyle = getSafeAreaContainerStyle();
  const paginationBottom = getPaginationBottomPosition(insets, isLandscape);
  
  const handleLoginPress = () => {
    navigation.navigate('Login');
  };

  const handleGetStartedPress = () => {
    navigation.navigate('Signup');
  };
  
  return (
    <>
      <StatusBar {...statusBarConfig} />
      <SafeAreaView style={[styles.container, safeAreaStyle, { paddingTop: insets.top }]}>
        <Swiper
          loop={false}
          showsButtons={false}
          dotStyle={styles.paginationDot}
          activeDotStyle={styles.paginationActiveDot}
          paginationStyle={[
            styles.paginationContainer, 
            { bottom: paginationBottom }
          ]}
          testID="welcome-swiper"
        >
          <WelcomePage1 onLoginPress={handleLoginPress} />
          <WelcomePage2 />
          <WelcomePage3 onGetStartedPress={handleGetStartedPress} />
        </Swiper>
      </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#FAF5FF',
  },
  paginationContainer: {
    
  },
  paginationDot: {
    backgroundColor: `${OnboardingColors.primary.main}40`,
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 4,
  },
  paginationActiveDot: {
    backgroundColor: OnboardingColors.primary.main,
    width: 24,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 4,
  },
});

export default WelcomeScreen;
