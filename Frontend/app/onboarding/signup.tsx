import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState, useEffect } from 'react';
import {
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Alert,
  Animated
} from "react-native";
import type { RootStackParamList } from '../navigation/AppNavigator';
import Toast from 'react-native-toast-message';
import { KeyboardAvoidingView, Platform, ScrollView, Modal } from 'react-native';

type SignUpScreenProp = NativeStackNavigationProp<RootStackParamList, 'Signup'>;

// API URL configuration
const API_BASE_URL = __DEV__ 
  ? Platform.OS === 'android'
    ? 'http://10.0.2.2:8000'  // Android emulator 
    : 'http://localhost:8000'  // iOS simulator
  : 'https://your-production-api-url.com';  // Production API

export default function SignUp() {
  const navigation = useNavigation<SignUpScreenProp>();
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password1: '',
    password2: ''
  });
  const [loading, setLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const fadeAnim = useState(new Animated.Value(0))[0];

  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const showToast = (message: string, type: 'success' | 'error' | 'info') => {
    Toast.show({
      type: type,
      text1: type === 'success' ? 'Success' : type === 'error' ? 'Error' : 'Info',
      text2: message,
      position: 'top',
      visibilityTime: 4000,
    });
  };

  const validateForm = () => {
    if (!formData.username.trim()) {
      showToast('Please enter your username', 'error');
      return false;
    }

    if (!formData.email.trim()) {
      showToast('Please enter your email', 'error');
      return false;
    }

    if (!formData.password1) {
      showToast('Please enter a password', 'error');
      return false;
    }

    if (formData.password1 !== formData.password2) {
      showToast('Passwords do not match', 'error');
      return false;
    }

    return true;
  };

  const handleSignUpInitiate = () => {
    if (validateForm()) {
      setShowConfirmation(true);
    }
  };

  const handleSignUp = async () => {
    setShowConfirmation(false);
    setLoading(true);

    try {
      // Prepare the data in format expected by Django backend
      const signupData = {
        username: formData.username,
        email: formData.email,
        password: formData.password1
      };

      console.log('Sending data:', signupData);

      const response = await fetch(`${API_BASE_URL}/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(signupData),
      });

      console.log('Response status:', response.status);

      const data = await response.json();
      console.log('Response data:', data);

      if (response.ok) {
        showToast('Account created successfully!', 'success');

        // Wait a moment before navigating to the login page
        setTimeout(() => {
          navigation.navigate('Login');
        }, 2000);
      } else {
        // Handle different types of errors
        let errorMessage = 'Registration failed';

        if (data.username) {
          errorMessage = Array.isArray(data.username) ? data.username[0] : data.username;
        } else if (data.email) {
          errorMessage = Array.isArray(data.email) ? data.email[0] : data.email;
        } else if (data.password) {
          errorMessage = Array.isArray(data.password) ? data.password[0] : data.password;
        }

        showToast(errorMessage, 'error');
      }
    } catch (error) {
      showToast('Network error. Please try again.', 'error');
      console.error('Signup error:', error);
    } finally {
      setLoading(false);
    }
  };
    return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView style={styles.container} contentContainerStyle={{ flexGrow: 1 }}>
        <StatusBar barStyle="dark-content" />

        <View style={styles.formContainer}>
          <Text style={styles.appName}>Welcome onboard!</Text>
          <Text style={styles.title}>Let's help you meet up your tasks</Text>

          <View style={styles.inputContainer}>
            <MaterialIcons name="person" size={20} color="#7F8C8D" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter your username"
              placeholderTextColor="#7F8C8D"
              keyboardType="default"
              autoCapitalize="none"
              value={formData.username}
              onChangeText={(text) => handleInputChange('username', text)}
            />
          </View>

          <View style={styles.inputContainer}>
            <MaterialIcons name="email" size={20} color="#7F8C8D" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter your email"
              placeholderTextColor="#7F8C8D"
              keyboardType="email-address"
              autoCapitalize="none"
              value={formData.email}
              onChangeText={(text) => handleInputChange('email', text)}
            />
          </View>

          <View style={styles.inputContainer}>
            <MaterialIcons name="lock" size={20} color="#7F8C8D" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Enter password"
              placeholderTextColor="#7F8C8D"
              secureTextEntry
              value={formData.password1}
              onChangeText={(text) => handleInputChange('password1', text)}
            />
          </View>

          <View style={styles.inputContainer}>
            <MaterialIcons name="lock" size={20} color="#7F8C8D" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor="#7F8C8D"
              secureTextEntry
              value={formData.password2}
              onChangeText={(text) => handleInputChange('password2', text)}
            />
          </View>

          <TouchableOpacity
            style={[styles.signUpButton, loading && styles.buttonDisabled]}
            onPress={handleSignUpInitiate}
            disabled={loading}
          >
            <Text style={styles.buttonText}>
              {loading ? 'Signing Up...' : 'Sign Up'}
            </Text>
          </TouchableOpacity>

          {/* Rest of your component */}
          <View style={styles.orContainer}>
            <View style={styles.orLine} />
            <Text style={styles.orText}>- OR SIGN UP WITH -</Text>
            <View style={styles.orLine} />
          </View>

          <TouchableOpacity style={styles.googleButton}>
            <Image
              source={require('../../assets/images/pngtree-google-internet-icon-vector-png-image_9183287.png')}
              style={styles.googleLogo}
            />
            <Text style={styles.googleButtonText}>Google</Text>
          </TouchableOpacity>

          <View style={styles.footer}>
            <Text style={styles.footerText}>Already have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate('Login')}>
              <Text style={styles.linkText}>Sign In</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Add Confirmation Modal */}
        <Modal
          transparent={true}
          visible={showConfirmation}
          animationType="fade"
          onRequestClose={() => setShowConfirmation(false)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalContent}>
              <Text style={styles.modalTitle}>Confirm Registration</Text>
              <Text style={styles.modalText}>
                Are you sure you want to create an account with the provided information?
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.cancelButton]}
                  onPress={() => setShowConfirmation(false)}
                >
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.confirmButton]}
                  onPress={handleSignUp}
                >
                  <Text style={styles.confirmButtonText}>Confirm</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>

        {/* Toast component needs to be included */}
        <Toast />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContent: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 22,
    width: '90%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  modalTitle: {
    fontSize: 20,
    fontFamily: 'Inter-Bold',
    color: '#6A009C',
    marginBottom: 15,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 16,
    fontFamily: 'Inter-Regular',
    color: '#2C3E50',
    marginBottom: 20,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    width: '100%',
  },
  modalButton: {
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 8,
    flex: 1,
    marginHorizontal: 5,
  },
  cancelButton: {
    backgroundColor: '#F1F1F1',
  },
  cancelButtonText: {
    color: '#333',
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
  confirmButton: {
    backgroundColor: '#A32EDA',
  },
  confirmButtonText: {
    color: 'white',
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  container: {
    flex: 1,
    backgroundColor: '#F1D3FF',
  },
  formContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingTop: 40,
  },
  appName: {
    fontSize: 28,
    fontFamily: 'Inter-Bold',
    color: "#6A009C",
    textAlign: "center",
    marginBottom: 10,
  },
  title: {
    fontSize: 15,
    fontFamily: 'Inter-Regular',
    color: "#2C3E50",
    marginBottom: 20,
    textAlign: "center",
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: "#F5F6F8",
    borderRadius: 10,
    marginBottom: 15,
    paddingHorizontal: 10,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    padding: 15,
    fontSize: 15,
    color: "#2C3E50",
    fontFamily: 'Inter-Regular',
  },
  signUpButton: {
    backgroundColor: "#A32EDA",
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 20,
    marginBottom: 20,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    textAlign: "center",
  },
  orContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 20,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#E0E0E0',
  },
  orText: {
    marginHorizontal: 10,
    color: "#7F8C8D",
    fontSize: 14,
    fontFamily: 'Inter-Regular',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  googleLogo: {
    width: 24,
    height: 24,
  },
  googleButtonText: {
    marginLeft: 10,
    color: "#333333",
    fontSize: 18,
    fontFamily: 'Inter-Bold',
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
  },
  footerText: {
    color: "#7F8C8D",
    fontSize: 15,
  },
  linkText: {
    color: "#AD00FF",
    fontSize: 15,
    fontFamily: 'Inter-Bold',
  },
  toast: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    backgroundColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    zIndex: 1000,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  successToast: {
    backgroundColor: '#60A760',
  },
  errorToast: {
    backgroundColor: '#E74C3C',
  },
  toastIcon: {
    marginRight: 8,
  },
  toastText: {
    color: 'white',
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
  },
});