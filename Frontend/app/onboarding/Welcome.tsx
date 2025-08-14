import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import {
  SafeAreaView,
  StyleSheet,
  useWindowDimensions,
} from 'react-native';
import Swiper from 'react-native-swiper';
import type { RootStackParamList } from '../navigation/AppNavigator';
import WelcomePage1 from './WelcomePage1';
import WelcomePage2 from './WelcomePage2';
import WelcomePage3 from './WelcomePage3';

type WelcomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Welcome'>;

const WelcomeScreen: React.FC = () => {
  const navigation = useNavigation<WelcomeScreenNavigationProp>();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  
  const handleLoginPress = () => {
    navigation.navigate('Login');
  };

  const handleGetStartedPress = () => {
    navigation.navigate('Signup');
  };
  
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F1D3FF' }}>
      <Swiper
        loop={false}
        showsButtons={false}
        dotStyle={styles.paginationDot}
        activeDotStyle={styles.paginationActiveDot}
        paginationStyle={[styles.paginationContainer, { bottom: isLandscape ? 30 : 50 }]}
        testID="welcome-swiper"
      >
        <WelcomePage1 onLoginPress={handleLoginPress} />
        <WelcomePage2 />
        <WelcomePage3 onGetStartedPress={handleGetStartedPress} />
      </Swiper>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  paginationContainer: {
    
  },
  paginationDot: {
    backgroundColor: 'rgba(138, 43, 226, 0.4)',
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 3,
  },
  paginationActiveDot: {
    backgroundColor: '#8A2BE2',
    width: 8,
    height: 8,
    borderRadius: 4,
    marginHorizontal: 3,
  },
});

export default WelcomeScreen;
