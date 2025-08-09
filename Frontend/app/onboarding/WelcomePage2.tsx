import React from 'react';
import {
  StyleSheet,
  Text,
  useWindowDimensions,
  View,
} from 'react-native';
import LearningSVG from '../../assets/illustrations/undraw_ideas_vn7a (1).svg';

const WelcomePage2: React.FC = () => {
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
        }]}>Get a clear to do of your task.</Text>
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
});

export default WelcomePage2;
