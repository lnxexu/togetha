import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import { Image, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { RootStackParamList } from './navigation/AppNavigator';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface NavbarProps {
  activeRoute?: keyof RootStackParamList;
}

export default function Navbar({ activeRoute = 'Home' }: NavbarProps) {
  const navigation = useNavigation<NavigationProp>();

  return (
    <View style={styles.navbar}>
      <TouchableOpacity 
        style={styles.navItem}
        onPress={() => navigation.navigate('Home')}
      >
        <MaterialIcons 
          name="home" 
          size={24} 
          color={activeRoute === 'Home' ? "#AD00FF" : "#7F8C8D"} 
        />
        <Text style={[
          styles.navText, 
          activeRoute === 'Home' && styles.activeNavText
        ]}>
          Home
        </Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.navItem}
        onPress={() => navigation.navigate('PDFs')}
      >
        <MaterialIcons 
          name="menu-book" 
          size={24} 
          color={activeRoute === 'PDFs' ? "#AD00FF" : "#7F8C8D"} 
        />
        <Text style={[
          styles.navText,
          activeRoute === 'PDFs' && styles.activeNavText
        ]}>
          PDFs
        </Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.navItem}
        onPress={() => navigation.navigate('RINA')}
      >
        <Image 
          source={require('../assets/images/1538298822.png')} 
          style={styles.chatbotIcon}
        />
        <Text style={[
          styles.navText,
          activeRoute === 'RINA' && styles.activeNavText
        ]}>
          RINA
        </Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.navItem}
        onPress={() => navigation.navigate('Notes')}
      >
        <MaterialIcons 
          name="edit-note" 
          size={24} 
          color={activeRoute === 'Notes' ? "#AD00FF" : "#7F8C8D"} 
        />
        <Text style={[
          styles.navText,
          activeRoute === 'Notes' && styles.activeNavText
        ]}>
          Notes
        </Text>
      </TouchableOpacity>

      <TouchableOpacity 
        style={styles.navItem}
        onPress={() => navigation.navigate('Profile')}
      >
        <MaterialIcons 
          name="person" 
          size={24} 
          color={activeRoute === 'Profile' ? "#AD00FF" : "#7F8C8D"} 
        />
        <Text style={[
          styles.navText,
          activeRoute === 'Profile' && styles.activeNavText
        ]}>
          Profile
        </Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  navbar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingVertical: 12,
    paddingBottom: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  navItem: {
    alignItems: 'center',
  },
  navText: {
    fontSize: 11,
    color: '#7F8C8D',
    marginTop: 4,
  },
  activeNavText: {
    color: '#AD00FF',
  },
  chatbotIcon: {
    width: 24,
    height: 24,
  },
});