import React from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';
import PersonalizeSVG from '../../assets/illustrations/undraw_education_3vwh.svg';

interface WelcomePage3Props {
  onGetStartedPress: () => void;
}

const WelcomePage3: React.FC<WelcomePage3Props> = ({ onGetStartedPress }) => {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  return (
    <View style={[styles.slide, { 
      width, 
      minHeight: height, 
      padding: isLandscape ? 10 : 20,
      maxWidth: isLandscape ? '100%' : width
    }]}>
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
        }]}>Help us understand your path better.</Text>
        <TouchableOpacity
          style={[styles.getStartedButton, { 
            paddingVertical: isLandscape ? width * 0.008 : width * 0.03, 
            paddingHorizontal: isLandscape ? width * 0.03 : width * 0.08, 
            borderRadius: isLandscape ? width * 0.02 : width * 0.07,
            marginTop: isLandscape ? 3 : 10
          }]}
          onPress={onGetStartedPress}
        >
          <Text style={[styles.getStartedButtonText, { fontSize: isLandscape ? width * 0.018 : width * 0.045 }]}>Get Started</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  slide: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#F1D3FF',
  },
  contentContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    width: '100%',
  },
  topTitle: {
    color: '#6A009C',
    fontFamily: 'Lexend',
  },
  welcomeImage: {
    borderRadius: 10,
  },
  imageContainer: {
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    color: '#A600F4',
  },
  subtitle: {
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    color: '#000000',
  },
  getStartedButton: {
    backgroundColor: '#A32EDA',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 5,
    elevation: 5,
    alignSelf: 'center',
  },
  getStartedButtonText: {
    color: '#fff',
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
});

export default WelcomePage3;
