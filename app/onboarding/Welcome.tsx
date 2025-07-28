import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import {
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import Swiper from 'react-native-swiper';
import PersonalizeSVG from '../../assets/illustrations/undraw_education_3vwh.svg';
import LearningSVG from '../../assets/illustrations/undraw_ideas_vn7a (1).svg';
import type { RootStackParamList } from '../navigation/AppNavigator';

type WelcomeScreenNavigationProp = NativeStackNavigationProp<RootStackParamList, 'Welcome'>;

const WelcomeScreen: React.FC = () => {
  const navigation = useNavigation<WelcomeScreenNavigationProp>();
  const { width, height } = useWindowDimensions();
  
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F1D3FF' }}>
      <Swiper
        loop={false}
        showsButtons={false}
        dotStyle={styles.paginationDot}
        activeDotStyle={styles.paginationActiveDot}
        paginationStyle={styles.paginationContainer}
        testID="welcome-swiper"
      >
        {/* Page 1: Welcome Image with Title */}
        <View style={[styles.slide, { width, minHeight: height }]}>
          <View style={[styles.topSection, { marginTop: height * 0.05 }]}>
            <Text style={[styles.topTitle, { fontSize: Math.min(width * 0.08, 36) }]}>Togetha</Text>
            <View style={[styles.imageWrapper, { width: width * 0.7, height: width * 0.7, maxWidth: 350, maxHeight: 350 }]}>
              <Image
                source={require('../../assets/images/output-onlinepngtools.png')}
                style={styles.welcomeImage}
                resizeMode="contain"
              />
            </View>
          </View>
          <View style={[styles.textSection, { paddingHorizontal: width * 0.05, maxWidth: width * 0.9 }]}>
            <Text style={[styles.title, { fontSize: Math.min(width * 0.06, 28), marginBottom: height * 0.02 }]}>
              Gets things done with Togetha
            </Text>
            <Text style={[styles.subtitle, { 
              fontSize: Math.min(width * 0.04, 18), 
              lineHeight: Math.min(width * 0.06, 26),
              marginBottom: height * 0.04 
            }]}>
              No more juggling apps. With Togetha, your tasks, deadlines, and study materials are all in sync! So you can focus on what really matters.
            </Text>
            <TouchableOpacity
              style={[styles.loginButton, { 
                paddingVertical: height * 0.018, 
                paddingHorizontal: width * 0.08, 
                borderRadius: Math.min(width * 0.06, 25),
                minHeight: 50,
                justifyContent: 'center'
              }]}
              onPress={() => navigation.navigate('Login')}
            >
              <Text style={[styles.loginButtonText, { fontSize: Math.min(width * 0.042, 16) }]}>
                Already have an account? Sign In
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Page 2: Reach Your Goals */}
        <View style={[styles.slide, { width, minHeight: height }]}>
          <View style={[styles.imageContainer, { marginTop: height * 0.08, marginBottom: height * 0.05 }]}>
            <Text style={[styles.topTitle, { fontSize: Math.min(width * 0.08, 36), marginBottom: height * 0.03 }]}>Togetha</Text>
            <View style={[styles.svgContainer, { width: width * 0.7, height: width * 0.6, maxWidth: 350, maxHeight: 300 }]}>
              <LearningSVG width="100%" height="100%" style={styles.svgImage} />
            </View>
          </View>
          <View style={[styles.contentSection, { paddingHorizontal: width * 0.05, maxWidth: width * 0.9 }]}>
            <Text style={[styles.title, { 
              fontSize: Math.min(width * 0.06, 28), 
              marginBottom: height * 0.02 
            }]}>
              Add Tasks Effortlessly
            </Text>
            <Text style={[styles.subtitle, { 
              fontSize: Math.min(width * 0.04, 18),
              lineHeight: Math.min(width * 0.06, 26),
              marginBottom: height * 0.04 
            }]}>
              Get a clear to do of your task and stay organized with our intuitive task management system.
            </Text>
          </View>
        </View>

        {/* Page 3: Future Prospects */}
        <View style={[styles.slide, { width, minHeight: height }]}>
          <View style={styles.imageContainer}>
            <Text style={[styles.topTitle, { fontSize: width * 0.08 } ]}>Togetha</Text>
            <PersonalizeSVG width={width * 0.6} height={width * 0.6} style={styles.welcomeImage} />
          </View>
          <Text style={[styles.title, { fontSize: width * 0.05 } ]}>Let’s personalize your experience</Text>
          <Text style={[styles.subtitle, { fontSize: width * 0.035, maxWidth: width * 0.85 } ]}>Help us understand your path better.</Text>
          <TouchableOpacity
            style={[styles.getStartedButton, { paddingVertical: width * 0.03, paddingHorizontal: width * 0.08, borderRadius: width * 0.07 }]}
            onPress={() => navigation.navigate('Signup')}
          >
            <Text style={[styles.getStartedButtonText, { fontSize: width * 0.045 }]}>Get Started</Text>
          </TouchableOpacity>
        </View>
      </Swiper>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F1D3FF',
    paddingVertical: 40,
    paddingHorizontal: 20,
  },
  topSection: {
    alignItems: 'center',
    flex: 2,
    justifyContent: 'center',
  },
  topTitle: {
    color: '#6A009C',
    fontFamily: 'Lexend',
    fontWeight: 'bold',
    marginBottom: 20,
  },
  imageWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  welcomeImage: {
    width: '100%',
    height: '100%',
    borderRadius: 15,
  },
  imageContainer: {
    flex: 2,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  svgContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
    height: '100%',
  },
  svgImage: {
    borderRadius: 10,
  },
  textSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingBottom: 20,
  },
  contentSection: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingBottom: 40,
  },
  stripedBlock: {
    flexDirection: 'row',
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#7A52A3',
  },
  stripeBlue: {
    flex: 1,
    backgroundColor: '#6A5ACD',
  },
  stripeYellow: {
    flex: 1,
    backgroundColor: '#FFD700',
  },
  wireframeCube: {
    position: 'relative',
    transform: [{ rotateX: '30deg' }, { rotateY: '45deg' }],
  },
  cubeFace: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#7A52A3',
    backgroundColor: 'transparent',
  },
  cubeFaceTop: {
    transform: [{ rotateX: '90deg' }, { translateY: -60 }],
  },
  cubeFaceSide: {
    transform: [{ rotateY: '90deg' }, { translateX: 60 }],
  },
  title: {
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    color: '#A600F4',
    fontWeight: 'bold',
  },
  subtitle: {
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    color: '#333333',
    paddingHorizontal: 10,
  },
  paginationContainer: {
    bottom: 80,
  },
  paginationDot: {
    backgroundColor: 'rgba(138, 43, 226, 0.4)',
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 4,
  },
  paginationActiveDot: {
    backgroundColor: '#8A2BE2',
    width: 10,
    height: 10,
    borderRadius: 5,
    marginHorizontal: 4,
  },
  getStartedButton: {
    backgroundColor: '#A32EDA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    alignSelf: 'center',
    alignItems: 'center',
  },
  getStartedButtonText: {
    color: '#fff',
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    fontWeight: 'bold',
  },
  loginButton: {
    backgroundColor: 'transparent',
    borderWidth: 2,
    borderColor: '#A32EDA',
    alignSelf: 'center',
    alignItems: 'center',
  },
  loginButtonText: {
    color: '#A32EDA',
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    fontWeight: '600',
  },
});

export default WelcomeScreen;