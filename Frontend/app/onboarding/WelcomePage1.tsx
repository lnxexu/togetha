import React from 'react';
import {
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  useWindowDimensions,
  View,
} from 'react-native';

interface WelcomePage1Props {
  onLoginPress: () => void;
}

const WelcomePage1: React.FC<WelcomePage1Props> = ({ onLoginPress }) => {
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
          }]}>Gets things done with Togetha</Text>
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
              paddingVertical: isLandscape ? width * 0.005 : width * 0.025, 
              paddingHorizontal: isLandscape ? width * 0.025 : width * 0.06, 
              borderRadius: isLandscape ? width * 0.015 : width * 0.05,
              marginTop: isLandscape ? 5 : 15
            }]}
            onPress={onLoginPress}
          >
            <Text style={[styles.loginButtonText, { fontSize: isLandscape ? width * 0.016 : width * 0.04 }]}>Already have an account? Sign In</Text>
          </TouchableOpacity>
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
  topSection: {
    alignItems: 'center',
  },
  topTitle: {
    color: '#6A009C',
    fontFamily: 'Lexend',
  },
  welcomeImage: {
    borderRadius: 10,
  },
  textSection: {
    alignItems: 'center',
    width: '100%',
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
  loginButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#A32EDA',
    alignSelf: 'center',
  },
  loginButtonText: {
    color: '#A32EDA',
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
});

export default WelcomePage1;
