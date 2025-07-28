import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React, { useState } from 'react';
import {
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Animated
} from "react-native";
import type { RootStackParamList } from '../navigation/AppNavigator';
import Toast from 'react-native-toast-message';
import { KeyboardAvoidingView, Platform, ScrollView, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Add type declaration for global.isRunningInExpoClient
declare global {
  // eslint-disable-next-line no-var
  var isRunningInExpoClient: boolean | undefined;
}

type SignUpScreenProp = NativeStackNavigationProp<RootStackParamList, 'Signup'>;

// Django server URL configured for proper mobile access
const API_BASE_URL = __DEV__
  ? Platform.OS === 'android'
    ? global.isRunningInExpoClient
      ? 'http://192.168.0.153:8000'  // Expo Go on Android (use your actual IP)
      : 'http://10.0.2.2:8000'     // Android emulator
    : 'http://localhost:8000'      // iOS simulator
  : 'https://yourproductionserver.com';

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

  // Password visibility toggles
  const [showPassword1, setShowPassword1] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);

  // Add this function to detect network connectivity
  const checkNetworkConnectivity = async () => {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      
      const response = await fetch('https://www.google.com', {
        method: 'HEAD',
        signal: controller.signal
      });
      
      clearTimeout(timeoutId);
      return response.status >= 200 && response.status < 300;
    } catch (error) {
      console.log('Network connectivity check failed:', error);
      return false;
    }
  };


  const handleInputChange = (field: string, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const togglePasswordVisibility = (field: 'password1' | 'password2') => {
    if (field === 'password1') {
      setShowPassword1(!showPassword1);
    } else {
      setShowPassword2(!showPassword2);
    }
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
      // First check if device is connected to internet
      const isConnected = await checkNetworkConnectivity();
      if (!isConnected) {
        showToast('No internet connection. Please check your network settings.', 'error');
        setLoading(false);
        return;
      }

      const signupData = {
        username: formData.username,
        email: formData.email,
        password: formData.password1
      };

      console.log('Sending data:', signupData);
      console.log('API URL:', `${API_BASE_URL}/signup`);
      console.log('Platform:', Platform.OS);
      console.log('Running in Expo?', global.isRunningInExpoClient ? 'Yes' : 'No');

      // Add timeout to the fetch request
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

      const response = await fetch(`${API_BASE_URL}/signup`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json',
        },
        body: JSON.stringify(signupData),
        signal: controller.signal
      });

      clearTimeout(timeoutId);
      console.log('Response received, status:', response.status);

      const data = await response.json();
      console.log('Response data:', data);

      if (response.ok) {
        showToast('Account created successfully!', 'success');
        // Save user data or token if provided
        if (data.token) {
          await AsyncStorage.setItem('userToken', data.token);
        }
        // Navigate to login or next screen
        setTimeout(() => {
          navigation.navigate('Login');
        }, 1000);
      } else {
        // Handle server error responses
        const errorMessage = data.message || data.error || 'Signup failed. Please try again.';
        showToast(errorMessage, 'error');
      }
    } catch (error) {
      console.error('Signup error:', error);

      // Enhanced error reporting
      if (error instanceof DOMException && error.name === 'AbortError') {
        showToast('Request timed out. Server may be down or unreachable.', 'error');
      } else if (error instanceof TypeError && error.message === 'Network request failed') {
        showToast(`Cannot connect to server. Please check that your backend is running at ${API_BASE_URL}`, 'error');
      } else {
        showToast(`Error: ${error instanceof Error ? error.message : 'Unknown error'}`, 'error');
      }
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
              secureTextEntry={!showPassword1}
              value={formData.password1}
              onChangeText={(text) => handleInputChange('password1', text)}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => togglePasswordVisibility('password1')}
            >
              <Ionicons
                name={showPassword1 ? "eye-off" : "eye"}
                size={22}
                color="#7F8C8D"
              />
            </TouchableOpacity>
          </View>

          <View style={styles.inputContainer}>
            <MaterialIcons name="lock" size={20} color="#7F8C8D" style={styles.inputIcon} />
            <TextInput
              style={styles.input}
              placeholder="Confirm password"
              placeholderTextColor="#7F8C8D"
              secureTextEntry={!showPassword2}
              value={formData.password2}
              onChangeText={(text) => handleInputChange('password2', text)}
            />
            <TouchableOpacity
              style={styles.passwordToggle}
              onPress={() => togglePasswordVisibility('password2')}
            >
              <Ionicons
                name={showPassword2 ? "eye-off" : "eye"}
                size={22}
                color="#7F8C8D"
              />
            </TouchableOpacity>
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

        {/* Confirmation Modal */}
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

        <Toast />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  // Existing styles remain the same
  passwordToggle: {
    padding: 8,
    position: 'absolute',
    right: 10,
  },
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
    position: 'relative',
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