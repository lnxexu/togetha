import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useState } from "react";
import {
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Animated,
  useWindowDimensions,
  ActivityIndicator,
  SafeAreaView,
} from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { RootStackParamList } from "../navigation/AppNavigator";
import Toast from "react-native-toast-message";
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  API_URL,
  API_ENDPOINTS,
  getUserTimezone,
} from "../../constants/ApiConfig";
import { OnboardingColors } from "../../constants/Colors";
import { showSuccessToast, showErrorToast } from "../utils/ToastUtils";
import {
  sendEmailVerification,
  verifyEmailAndSignup,
  validateEmail,
  validateUsername,
  validatePassword,
  testServerConnectivity,
} from '../services/EmailVerificationService';
import EmailVerificationModal from '../components/EmailVerificationModal';
import EnhancedLoadingScreen from '../components/EnhancedLoadingScreen';
import { getEnhancedSafeAreaConfig, getStatusBarConfig, getSafeAreaContainerStyle, getPlatformShadow } from '../utils/SafeAreaUtils';
import GoogleAuthService from "./service/GoogleAuthServiceWeb";

// Add type declaration for global.isRunningInExpoClient
declare global {
  // eslint-disable-next-line no-var
  var isRunningInExpoClient: boolean | undefined;
}

type SignUpScreenProp = NativeStackNavigationProp<RootStackParamList, "Signup">;

export default function SignUp() {
  const navigation = useNavigation<SignUpScreenProp>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const safeAreaConfig = getEnhancedSafeAreaConfig(insets, height, isLandscape);
  const statusBarConfig = getStatusBarConfig();
  const safeAreaStyle = getSafeAreaContainerStyle();
  const [formData, setFormData] = useState({
    username: "",
    email: "",
    password1: "",
    password2: "",
  });
  const [loading, setLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [showEmailVerification, setShowEmailVerification] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);
  const [emailVerificationLoading, setEmailVerificationLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);

  // Password visibility toggles
  const [showPassword1, setShowPassword1] = useState(false);
  const [showPassword2, setShowPassword2] = useState(false);

  const handleInputChange = (field: string, value: string) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const togglePasswordVisibility = (field: "password1" | "password2") => {
    if (field === "password1") {
      setShowPassword1(!showPassword1);
    } else {
      setShowPassword2(!showPassword2);
    }
  };

  const validateForm = () => {
    // Validate username
    if (!formData.username.trim()) {
      showErrorToast("Please enter your username");
      return false;
    }

    if (!validateUsername(formData.username)) {
      showErrorToast("Username must be 3-30 characters long and contain only letters, numbers, and underscores");
      return false;
    }

    // Validate email
    if (!formData.email.trim()) {
      showErrorToast("Please enter your email");
      return false;
    }

    if (!validateEmail(formData.email)) {
      showErrorToast("Please enter a valid email address");
      return false;
    }

    // Validate password
    if (!formData.password1) {
      showErrorToast("Please enter a password");
      return false;
    }

    const passwordValidation = validatePassword(formData.password1);
    if (!passwordValidation.isValid) {
      showErrorToast(passwordValidation.errors[0]);
      return false;
    }

    if (formData.password1 !== formData.password2) {
      showErrorToast("Passwords do not match");
      return false;
    }

    return true;
  };

  const handleSignUpInitiate = async () => {
    if (!validateForm()) return;

    setLoading(true);
    
    try {
      // Test server connectivity first
      const connectivityTest = await testServerConnectivity();
      console.log('Connectivity test result:', connectivityTest);
      
      if (!connectivityTest.success) {
        setLoading(false);
        showErrorToast(`Cannot connect to server: ${connectivityTest.message}`);
        return;
      }
      
      // Send email verification
      const result = await sendEmailVerification({
        email: formData.email,
        username: formData.username,
      });

      if (result.success) {
        setLoading(false);
        setShowEmailVerification(true);
        showSuccessToast("Verification code sent to your email!");
      } else {
        setLoading(false);
        showErrorToast(result.message);
      }
    } catch (error) {
      setLoading(false);
      showErrorToast("Failed to send verification email. Please try again.");
      console.error('Signup initiation error:', error);
    }
  };

  const handleGoogleSignUp = async () => {
    try {
      setIsGoogleLoading(true);

      const result = await GoogleAuthService.signInWithGoogle();

      if (result.success && result.token) {
        setIsGoogleLoading(false);
        setShowLoadingScreen(true);
        
        showSuccessToast(`Welcome ${result.user?.name || 'User'}! 🎉`);
        
        // Show loading screen then navigate
        setTimeout(() => {
          setShowLoadingScreen(false);
          navigation.reset({
            index: 0,
            routes: [{ name: "Home" }],
          });
        }, 2000);
      } else {
        throw new Error(result.error || 'Google sign-up failed');
      }
    } catch (error: any) {
      console.error('Google sign-up error:', error);
      showErrorToast(error.message || 'Google sign-up failed. Please try again.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleEmailVerification = async (verificationCode: string) => {
    setEmailVerificationLoading(true);
    
    try {
      const result = await verifyEmailAndSignup({
        email: formData.email,
        username: formData.username,
        password: formData.password1,
        verificationCode,
      });

      setEmailVerificationLoading(false);

      if (result.success) {
        setShowEmailVerification(false);
        setShowLoadingScreen(true);
        
        showSuccessToast("Account created successfully!");
        
        // Show loading screen for 3 seconds
        setTimeout(() => {
          setShowLoadingScreen(false);
          navigation.navigate("Login");
        }, 3000);
      } else {
        showErrorToast(result.message);
      }
    } catch (error) {
      setEmailVerificationLoading(false);
      showErrorToast("Verification failed. Please try again.");
    }
  };

  const handleResendVerification = async () => {
    setResendLoading(true);
    
    try {
      const result = await sendEmailVerification({
        email: formData.email,
        username: formData.username,
      });

      setResendLoading(false);

      if (result.success) {
        showSuccessToast("New verification code sent!");
      } else {
        showErrorToast(result.message);
      }
    } catch (error) {
      setResendLoading(false);
      showErrorToast("Failed to resend verification code.");
    }
  };

  // Show loading screen if active
  if (showLoadingScreen) {
    return (
      <EnhancedLoadingScreen 
        message="Creating Your Account"
        subMessage="Setting up your personalized workspace..."
        showLogo={true}
      />
    );
  }

  return (
    <>
      <StatusBar {...statusBarConfig} />
      <SafeAreaView style={[styles.safeArea, safeAreaStyle]}>
        <LinearGradient
          colors={['#FAF5FF', '#F3E8FF'] as const}
          style={styles.container}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ScrollView
              contentContainerStyle={[
                styles.scrollContainer,
                { 
                  minHeight: safeAreaConfig.minHeight,
                  paddingTop: safeAreaConfig.paddingTop,
                  paddingBottom: safeAreaConfig.paddingBottom,
                }
              ]}
              showsVerticalScrollIndicator={false}
        >
          <View style={[
            styles.formContainer,
            {
              paddingHorizontal: isLandscape ? width * 0.1 : 24,
              maxWidth: isLandscape ? width : '100%',
            }
          ]}>
            {/* Header Section */}
            <View style={styles.headerSection}>
              <Text style={[
                styles.welcomeTitle,
                {
                  fontSize: isLandscape ? width * 0.035 : 32,
                  marginBottom: isLandscape ? 8 : 12,
                }
              ]}>Create Account</Text>
              <Text style={[
                styles.welcomeSubtitle,
                {
                  fontSize: isLandscape ? width * 0.02 : 16,
                  marginBottom: isLandscape ? 20 : 32,
                }
              ]}>Join us and start organizing your life</Text>
            </View>

            {/* Form Section */}
            <View style={styles.formSection}>
              {/* Username Input */}
              <View style={[
                styles.inputContainer,
                { marginBottom: isLandscape ? 12 : 16 }
              ]}>
                <MaterialIcons
                  name="person-outline"
                  size={isLandscape ? 20 : 22}
                  color={OnboardingColors.input.icon}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[
                    styles.input,
                    { 
                      padding: isLandscape ? 12 : 16,
                      fontSize: isLandscape ? 14 : 16,
                    }
                  ]}
                  placeholder="Username"
                  placeholderTextColor={OnboardingColors.input.placeholder}
                  autoCapitalize="none"
                  value={formData.username}
                  onChangeText={(text) => handleInputChange("username", text)}
                  editable={!loading && !isGoogleLoading}
                />
              </View>

              {/* Email Input */}
              <View style={[
                styles.inputContainer,
                { marginBottom: isLandscape ? 12 : 16 }
              ]}>
                <MaterialIcons
                  name="email"
                  size={isLandscape ? 20 : 22}
                  color={OnboardingColors.input.icon}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[
                    styles.input,
                    { 
                      padding: isLandscape ? 12 : 16,
                      fontSize: isLandscape ? 14 : 16,
                    }
                  ]}
                  placeholder="Email address"
                  placeholderTextColor={OnboardingColors.input.placeholder}
                  keyboardType="email-address"
                  autoCapitalize="none"
                  value={formData.email}
                  onChangeText={(text) => handleInputChange("email", text)}
                  editable={!loading && !isGoogleLoading}
                />
              </View>

              {/* Password Input */}
              <View style={[
                styles.inputContainer,
                { marginBottom: isLandscape ? 12 : 16 }
              ]}>
                <MaterialIcons
                  name="lock-outline"
                  size={isLandscape ? 20 : 22}
                  color={OnboardingColors.input.icon}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[
                    styles.input,
                    { 
                      padding: isLandscape ? 12 : 16,
                      fontSize: isLandscape ? 14 : 16,
                      paddingRight: 50,
                    }
                  ]}
                  placeholder="Password"
                  placeholderTextColor={OnboardingColors.input.placeholder}
                  secureTextEntry={!showPassword1}
                  value={formData.password1}
                  onChangeText={(text) => handleInputChange("password1", text)}
                  editable={!loading && !isGoogleLoading}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => togglePasswordVisibility("password1")}
                  disabled={loading || isGoogleLoading}
                >
                  <MaterialIcons
                    name={showPassword1 ? "visibility" : "visibility-off"}
                    size={isLandscape ? 18 : 20}
                    color={OnboardingColors.input.icon}
                  />
                </TouchableOpacity>
              </View>

              {/* Confirm Password Input */}
              <View style={[
                styles.inputContainer,
                { marginBottom: isLandscape ? 16 : 24 }
              ]}>
                <MaterialIcons
                  name="lock-outline"
                  size={isLandscape ? 20 : 22}
                  color={OnboardingColors.input.icon}
                  style={styles.inputIcon}
                />
                <TextInput
                  style={[
                    styles.input,
                    { 
                      padding: isLandscape ? 12 : 16,
                      fontSize: isLandscape ? 14 : 16,
                      paddingRight: 50,
                    }
                  ]}
                  placeholder="Confirm password"
                  placeholderTextColor={OnboardingColors.input.placeholder}
                  secureTextEntry={!showPassword2}
                  value={formData.password2}
                  onChangeText={(text) => handleInputChange("password2", text)}
                  editable={!loading && !isGoogleLoading}
                />
                <TouchableOpacity
                  style={styles.passwordToggle}
                  onPress={() => togglePasswordVisibility("password2")}
                  disabled={loading || isGoogleLoading}
                >
                  <MaterialIcons
                    name={showPassword2 ? "visibility" : "visibility-off"}
                    size={isLandscape ? 18 : 20}
                    color={OnboardingColors.input.icon}
                  />
                </TouchableOpacity>
              </View>

              {/* Sign Up Button */}
              <TouchableOpacity
                style={[
                  styles.signUpButton,
                  {
                    paddingVertical: isLandscape ? 12 : 16,
                    marginBottom: isLandscape ? 12 : 16,
                    opacity: (loading || isGoogleLoading) ? 0.7 : 1,
                  }
                ]}
                onPress={handleSignUpInitiate}
                disabled={loading || isGoogleLoading}
              >
                {loading ? (
                  <ActivityIndicator color={OnboardingColors.text.white} size="small" />
                ) : (
                  <Text style={[
                    styles.buttonText,
                    { fontSize: isLandscape ? 15 : 16 }
                  ]}>Create Account</Text>
                )}
              </TouchableOpacity>

              {/* Divider */}
              <View style={[
                styles.divider,
                { marginVertical: isLandscape ? 12 : 20 }
              ]}>
                <View style={styles.dividerLine} />
                <Text style={[
                  styles.dividerText,
                  { fontSize: isLandscape ? 12 : 13 }
                ]}>Or sign up with</Text>
                <View style={styles.dividerLine} />
              </View>

              {/* Google Sign-Up Button */}
              <TouchableOpacity 
                style={[
                  styles.googleButton,
                  {
                    paddingVertical: isLandscape ? 10 : 14,
                    marginBottom: isLandscape ? 12 : 20,
                    opacity: (loading || isGoogleLoading) ? 0.7 : 1,
                  }
                ]}
                onPress={handleGoogleSignUp}
                disabled={loading || isGoogleLoading}
              >
                {isGoogleLoading ? (
                  <ActivityIndicator color={OnboardingColors.text.primary} size="small" />
                ) : (
                  <>
                    <Image
                      source={require("../../assets/images/pngtree-google-internet-icon-vector-png-image_9183287.png")}
                      style={[
                        styles.googleLogo,
                        {
                          width: isLandscape ? 20 : 22,
                          height: isLandscape ? 20 : 22,
                        }
                      ]}
                    />
                    <Text style={[
                      styles.googleButtonText,
                      { 
                        fontSize: isLandscape ? 14 : 15,
                        marginLeft: isLandscape ? 8 : 10,
                      }
                    ]}>Continue with Google</Text>
                  </>
                )}
              </TouchableOpacity>

              {/* Footer */}
              <View style={[
                styles.footer,
                { marginTop: isLandscape ? 12 : 24 }
              ]}>
                <Text style={[
                  styles.footerText,
                  { fontSize: isLandscape ? 13 : 14 }
                ]}>Already have an account? </Text>
                <TouchableOpacity 
                  onPress={() => navigation.navigate("Login")}
                  disabled={loading || isGoogleLoading}
                >
                  <Text style={[
                    styles.linkText,
                    { fontSize: isLandscape ? 13 : 14 }
                  ]}>Sign In</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Email Verification Modal */}
          <EmailVerificationModal
            visible={showEmailVerification}
            email={formData.email}
            username={formData.username}
            onClose={() => setShowEmailVerification(false)}
            onVerify={handleEmailVerification}
            onResend={handleResendVerification}
            loading={emailVerificationLoading}
            resendLoading={resendLoading}
          />

          <Toast />
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
    </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
  },
  container: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    justifyContent: "center",
  },
  formContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    width: "100%",
  },
  headerSection: {
    alignItems: "center",
    marginBottom: 20,
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: "800",
    color: OnboardingColors.primary.main,
    textAlign: "center",
    marginBottom: 8,
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: OnboardingColors.text.secondary,
    textAlign: "center",
    fontWeight: "400",
  },
  formSection: {
    width: "100%",
    maxWidth: 400,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: OnboardingColors.input.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: OnboardingColors.input.border,
    paddingHorizontal: 16,
    shadowColor: OnboardingColors.shadow.light,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: OnboardingColors.text.primary,
    fontWeight: "500",
  },
  passwordToggle: {
    padding: 8,
    marginLeft: 8,
  },
  signUpButton: {
    backgroundColor: OnboardingColors.primary.main,
    borderRadius: 16,
    shadowColor: OnboardingColors.shadow.purple,
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  buttonText: {
    color: OnboardingColors.text.white,
    fontSize: 16,
    fontWeight: "700",
    textAlign: "center",
  },
  divider: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: OnboardingColors.input.border,
  },
  dividerText: {
    marginHorizontal: 16,
    color: OnboardingColors.text.light,
    fontSize: 13,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: OnboardingColors.button.google,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: OnboardingColors.button.googleBorder,
    shadowColor: OnboardingColors.shadow.light,
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  googleLogo: {
    resizeMode: "contain",
  },
  googleButtonText: {
    color: OnboardingColors.text.primary,
    fontSize: 15,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
  },
  footerText: {
    color: OnboardingColors.text.secondary,
    fontSize: 14,
    fontWeight: "400",
  },
  linkText: {
    color: OnboardingColors.primary.main,
    fontSize: 14,
    fontWeight: "700",
  },
});
