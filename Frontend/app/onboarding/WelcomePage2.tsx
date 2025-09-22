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
      height,
      padding: isLandscape ? 15 : 20,
    }]}>
      <View style={[
        styles.contentContainer,
        isLandscape ? styles.landscapeContentContainer : styles.portraitContentContainer
      ]}>
        <View style={[
          styles.imageContainer, 
          isLandscape ? styles.landscapeImageContainer : styles.portraitImageContainer
        ]}>
          <Text style={[styles.topTitle, { 
            fontSize: isLandscape ? Math.min(28, height * 0.06) : width * 0.08,
            marginBottom: isLandscape ? 8 : 10
          }]}>Togetha</Text>
          <LearningSVG 
            width={isLandscape ? Math.min(140, height * 0.3) : width * 0.6} 
            height={isLandscape ? Math.min(140, height * 0.3) : width * 0.6} 
            style={styles.welcomeImage} 
          />
        </View>
        <View style={[
          styles.textContainer,
          isLandscape ? styles.landscapeTextContainer : styles.portraitTextContainer
        ]}>
          <Text style={[styles.title, { 
            fontSize: isLandscape ? Math.min(20, height * 0.045) : width * 0.05,
            marginBottom: isLandscape ? 8 : 10
          }]}>Add Tasks Effortlessly</Text>
          <Text style={[styles.subtitle, { 
            fontSize: isLandscape ? Math.min(14, height * 0.032) : width * 0.035, 
            marginBottom: isLandscape ? 15 : 40,
          }]}>Get a clear to do of your task.</Text>
        </View>
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
  portraitContentContainer: {
    flexDirection: 'column',
    justifyContent: 'center',
    alignItems: 'center',
  },
  landscapeContentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    paddingHorizontal: 20,
  },
  imageContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  portraitImageContainer: {
    width: '100%',
    marginBottom: 20,
  },
  landscapeImageContainer: {
    flex: 0.45,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  portraitTextContainer: {
    width: '100%',
    alignItems: 'center',
  },
  landscapeTextContainer: {
    flex: 0.55,
    alignItems: 'center',
    justifyContent: 'center',
  },
  topTitle: {
    color: '#6A009C',
    fontFamily: 'Lexend',
    fontWeight: '800',
  },
  welcomeImage: {
    borderRadius: 10,
  },
  title: {
    fontFamily: 'Inter-Bold',
    textAlign: 'center',
    color: '#A600F4',
    fontWeight: '700',
  },
  subtitle: {
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    color: '#000000',
    lineHeight: 24,
    paddingHorizontal: 20,
  },
});

export default WelcomePage2;