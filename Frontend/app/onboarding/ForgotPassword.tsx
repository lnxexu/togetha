import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useState } from "react";
import {
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  useWindowDimensions,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Modal,
  Image,
  Animated,
  SafeAreaView,
} from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Toast from "react-native-toast-message";
import type { RootStackParamList } from "../navigation/AppNavigator";
import { API_URL, API_ENDPOINTS } from "../../constants/ApiConfig";
import { OnboardingColors } from "../../constants/Colors";
import { showSuccessToast, showErrorToast } from "../utils/ToastUtils";
import { getEnhancedSafeAreaConfig, getStatusBarConfig, getSafeAreaContainerStyle } from '../utils/SafeAreaUtils';
import EnhancedLoadingScreen from '../components/EnhancedLoadingScreen';

type ForgotPasswordScreenProp = NativeStackNavigationProp<
  RootStackParamList,
  "ForgotPassword"
>;

export default function ForgotPassword() {
  const navigation = useNavigation<ForgotPasswordScreenProp>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const safeAreaConfig = getEnhancedSafeAreaConfig(insets, height, isLandscape, 'onboarding');
  const statusBarConfig = getStatusBarConfig('onboarding');

  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isVerifyLoading, setIsVerifyLoading] = useState(false);
  const [showVerificationModal, setShowVerificationModal] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [resetToken, setResetToken] = useState("");
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(50));

  // Password strength calculation
  const getPasswordStrength = (password: string): { 
    strength: 'weak' | 'medium' | 'strong'; 
    score: number;
    color: string;
  } => {
    let score = 0;
    
    if (password.length >= 8) score += 1;
    if (password.length >= 12) score += 1;
    if (/(?=.*[a-z])/.test(password)) score += 1;
    if (/(?=.*[A-Z])/.test(password)) score += 1;
    if (/(?=.*\d)/.test(password)) score += 1;
    if (/(?=.*[!@#$%^&*(),.?":{}|<>])/.test(password)) score += 1;

    if (score <= 2) return { strength: 'weak', score: Math.min(score * 17, 100), color: OnboardingColors.status.error };
    if (score <= 4) return { strength: 'medium', score: Math.min(score * 17, 100), color: OnboardingColors.status.warning };
    return { strength: 'strong', score: Math.min(score * 17, 100), color: OnboardingColors.status.success };
  };

  const passwordStrength = getPasswordStrength(newPassword);

  const validateEmail = (email: string) => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  };

  // Animation effect
  React.useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
    ]).start();
  }, []);

  const handleForgotPassword = async () => {
    if (!email.trim()) {
      showErrorToast("Please enter your email address");
      return;
    }

    if (!validateEmail(email)) {
      showErrorToast("Please enter a valid email address");
      return;
    }

    try {
      setIsLoading(true);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000); // Increased timeout

      const response = await fetch(`${API_URL}${API_ENDPOINTS.FORGOT_PASSWORD}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok) {
        showSuccessToast(
          "Password reset code sent to your email. Please check your inbox and spam folder."
        );
        setShowVerificationModal(true);
      } else {
        // Better error handling with specific messages
        if (response.status === 404) {
          showErrorToast("No account found with this email address");
        } else if (response.status === 429) {
          showErrorToast("Too many requests. Please wait a few minutes before trying again");
        } else {
          showErrorToast(
            data.message || data.error || "Failed to send reset code. Please try again."
          );
        }
      }
    } catch (error) {
      console.error("Forgot password error:", error);
      if (error instanceof DOMException && error.name === "AbortError") {
        showErrorToast("Request timed out. Please check your internet connection and try again.");
      } else if (
        error instanceof TypeError &&
        error.message === "Network request failed"
      ) {
        showErrorToast(
          "Cannot connect to server. Please check your internet connection."
        );
      } else {
        showErrorToast(
          "An unexpected error occurred. Please try again later."
        );
      }
    } finally {
      setIsLoading(false);
    }
  };

  const handleVerifyAndResetPassword = async () => {
    // Enhanced validation
    if (!verificationCode.trim()) {
      showErrorToast("Please enter the verification code");
      return;
    }

    if (verificationCode.length !== 6) {
      showErrorToast("Verification code must be 6 digits");
      return;
    }

    if (!newPassword.trim()) {
      showErrorToast("Please enter a new password");
      return;
    }

    if (newPassword.length < 8) {
      showErrorToast("Password must be at least 8 characters long");
      return;
    }

    if (!/(?=.*[a-z])/.test(newPassword)) {
      showErrorToast("Password must contain at least one lowercase letter");
      return;
    }

    if (!/(?=.*[A-Z])/.test(newPassword)) {
      showErrorToast("Password must contain at least one uppercase letter");
      return;
    }

    if (!/(?=.*\d)/.test(newPassword)) {
      showErrorToast("Password must contain at least one number");
      return;
    }

    if (newPassword !== confirmPassword) {
      showErrorToast("Passwords do not match");
      return;
    }

    try {
      setIsVerifyLoading(true);

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch(`${API_URL}${API_ENDPOINTS.VERIFY_RESET_CODE}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          verification_code: verificationCode.trim(),
          new_password: newPassword,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const data = await response.json();

      if (response.ok) {
        showSuccessToast(
          "Password reset successful! You can now login with your new password."
        );
        setShowVerificationModal(false);
        
        // Clear all form data
        setEmail("");
        setVerificationCode("");
        setNewPassword("");
        setConfirmPassword("");
        
        // Navigate back to login after a brief delay
        setTimeout(() => {
          navigation.navigate("Login");
        }, 1500);
      } else {
        // Better error handling
        if (response.status === 400) {
          showErrorToast("Invalid verification code. Please check and try again.");
        } else if (response.status === 410) {
          showErrorToast("Verification code has expired. Please request a new one.");
        } else {
          showErrorToast(
            data.message || data.error || "Failed to reset password. Please try again."
          );
        }
      }
    } catch (error) {
      console.error("Password reset error:", error);
      if (error instanceof DOMException && error.name === "AbortError") {
        showErrorToast("Request timed out. Please try again.");
      } else if (
        error instanceof TypeError &&
        error.message === "Network request failed"
      ) {
        showErrorToast(
          "Cannot connect to server. Please check your internet connection."
        );
      } else {
        showErrorToast(
          "An unexpected error occurred. Please try again later."
        );
      }
    } finally {
      setIsVerifyLoading(false);
    }
  };

  const togglePasswordVisibility = (field: "new" | "confirm") => {
    if (field === "new") {
      setShowNewPassword(!showNewPassword);
    } else {
      setShowConfirmPassword(!showConfirmPassword);
    }
  };

  return (
    <>
      <StatusBar {...statusBarConfig} />
      <SafeAreaView style={getSafeAreaContainerStyle('onboarding')}>
        <LinearGradient
          colors={OnboardingColors.background.gradient as [string, string]}
          style={styles.container}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === "ios" ? "padding" : "height"}
          >
            <ScrollView
              style={styles.scrollView}
              contentContainerStyle={[
                styles.scrollContainer,
                {
                  minHeight: safeAreaConfig.minHeight,
                  paddingTop: safeAreaConfig.contentPaddingTop,
                  paddingBottom: safeAreaConfig.contentPaddingBottom,
                },
              ]}
              showsVerticalScrollIndicator={false}
            >
        {/* Background Gradient Effect */}


        <Animated.View
          style={[
            styles.formContainer,
            {
              paddingHorizontal: isLandscape ? width * 0.1 : 20,
              paddingTop: isLandscape ? 20 : 60,
              maxWidth: isLandscape ? width : "100%",
              opacity: fadeAnim,
              transform: [{ translateY: slideAnim }],
            },
          ]}
        >
          {/* Header */}
          <View style={styles.header}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <MaterialIcons name="arrow-back" size={24} color={OnboardingColors.text.white} />
            </TouchableOpacity>
          </View>

          {/* Lock Icon */}
          <View style={styles.iconContainer}>
            <View style={styles.lockIconBackground}>
              <MaterialIcons name="lock-reset" size={40} color={OnboardingColors.primary.main} />
            </View>
          </View>

          <Text
            style={[
              styles.title,
              {
                fontSize: isLandscape ? width * 0.03 : 32,
                marginBottom: isLandscape ? 5 : 8,
              },
            ]}
          >
            Forgot Password?
          </Text>
          
          <Text
            style={[
              styles.subtitle,
              {
                fontSize: isLandscape ? width * 0.018 : 16,
                marginBottom: isLandscape ? 20 : 40,
              },
            ]}
          >
            Don't worry! It happens. Please enter the email address associated with your account.
          </Text>

          {/* Email Input */}
          <View
            style={[
              styles.inputContainer,
              { marginBottom: isLandscape ? 15 : 25 },
            ]}
          >
            <View style={styles.inputIconContainer}>
              <MaterialIcons
                name="email"
                size={isLandscape ? 20 : 22}
                color={OnboardingColors.primary.main}
              />
            </View>
            <TextInput
              style={[
                styles.input,
                {
                  padding: isLandscape ? 12 : 16,
                  fontSize: isLandscape ? 14 : 16,
                },
              ]}
              placeholder="Enter your email address"
              placeholderTextColor={OnboardingColors.input.placeholder}
              keyboardType="email-address"
              autoCapitalize="none"
              value={email}
              onChangeText={setEmail}
              autoFocus
            />
          </View>

          {/* Send Code Button */}
          <TouchableOpacity
            style={[
              styles.sendButton,
              {
                paddingVertical: isLandscape ? 12 : 16,
                marginTop: isLandscape ? 10 : 20,
                opacity: isLoading ? 0.8 : 1,
                transform: [{ scale: isLoading ? 0.98 : 1 }],
              },
            ]}
            onPress={handleForgotPassword}
            disabled={isLoading}
          >
            {isLoading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator color={OnboardingColors.text.white} size="small" />
                <Text style={[styles.buttonText, { marginLeft: 10 }]}>
                  Sending...
                </Text>
              </View>
            ) : (
              <View style={styles.buttonContent}>
                <MaterialIcons name="send" size={20} color={OnboardingColors.text.white} />
                <Text
                  style={[
                    styles.buttonText,
                    { fontSize: isLandscape ? 14 : 16, marginLeft: 8 },
                  ]}
                >
                  Send Reset Code
                </Text>
              </View>
            )}
          </TouchableOpacity>

          {/* Back to Login Link */}
          <View
            style={[
              styles.footer,
              { marginTop: isLandscape ? 30 : 40 },
            ]}
          >
            <Text
              style={[
                styles.footerText,
                { fontSize: isLandscape ? 13 : 15 },
              ]}
            >
              Remember your password?{" "}
            </Text>
            <TouchableOpacity 
              onPress={() => navigation.navigate("Login")}
              style={styles.linkButton}
            >
              <Text
                style={[
                  styles.linkText,
                  { fontSize: isLandscape ? 13 : 15 },
                ]}
              >
                Sign In
              </Text>
            </TouchableOpacity>
          </View>
        </Animated.View>

        {/* Enhanced Verification Modal */}
        <Modal
          transparent={true}
          visible={showVerificationModal}
          animationType="fade"
          onRequestClose={() => setShowVerificationModal(false)}
        >
          <View style={styles.modalOverlay}>
            <KeyboardAvoidingView
              behavior={Platform.OS === "ios" ? "padding" : "height"}
              style={styles.modalKeyboardView}
            >
              <View style={styles.modalContent}>
                {/* Success Icon */}
                <View style={styles.modalIconContainer}>
                  <MaterialIcons name="mark-email-read" size={50} color={OnboardingColors.status.success} />
                </View>
                
                <Text style={styles.modalTitle}>Verification Code Sent!</Text>
                <Text style={styles.modalSubtitle}>
                  We've sent a 6-digit verification code to{"\n"}
                  <Text style={styles.emailHighlight}>{email}</Text>
                </Text>

                {/* Code Input with Individual Boxes */}
                <View style={styles.codeInputContainer}>
                  <Text style={styles.codeInputLabel}>Enter Verification Code</Text>
                  <TextInput
                    style={styles.codeInput}
                    placeholder="Enter 6-digit code"
                    placeholderTextColor={OnboardingColors.input.placeholder}
                    keyboardType="numeric"
                    maxLength={6}
                    value={verificationCode}
                    onChangeText={setVerificationCode}
                    textAlign="center"
                  />
                </View>

                {/* Enhanced Password Inputs */}
                <View style={styles.passwordSection}>
                  <Text style={styles.passwordSectionTitle}>Create New Password</Text>
                  
                  <View style={[styles.inputContainer, styles.modalInputContainer]}>
                    <View style={styles.inputIconContainer}>
                      <MaterialIcons name="lock" size={20} color={OnboardingColors.primary.main} />
                    </View>
                    <TextInput
                      style={[styles.input, styles.modalInput]}
                      placeholder="New password"
                      placeholderTextColor={OnboardingColors.input.placeholder}
                      secureTextEntry={!showNewPassword}
                      value={newPassword}
                      onChangeText={setNewPassword}
                    />
                    <TouchableOpacity
                      style={styles.passwordToggle}
                      onPress={() => togglePasswordVisibility("new")}
                    >
                      <MaterialIcons
                        name={showNewPassword ? "visibility" : "visibility-off"}
                        size={20}
                        color={OnboardingColors.primary.main}
                      />
                    </TouchableOpacity>
                  </View>

                  {/* Password Strength Indicator */}
                  {newPassword.length > 0 && (
                    <View style={styles.strengthContainer}>
                      <View style={styles.strengthBar}>
                        <View 
                          style={[
                            styles.strengthFill, 
                            { 
                              width: `${passwordStrength.score}%`,
                              backgroundColor: passwordStrength.color
                            }
                          ]} 
                        />
                      </View>
                      <Text style={[styles.strengthText, { color: passwordStrength.color }]}>
                        {passwordStrength.strength} password
                      </Text>
                    </View>
                  )}

                  <View style={[styles.inputContainer, styles.modalInputContainer]}>
                    <View style={styles.inputIconContainer}>
                      <MaterialIcons name="lock-outline" size={20} color={OnboardingColors.primary.main} />
                    </View>
                    <TextInput
                      style={[styles.input, styles.modalInput]}
                      placeholder="Confirm new password"
                      placeholderTextColor={OnboardingColors.input.placeholder}
                      secureTextEntry={!showConfirmPassword}
                      value={confirmPassword}
                      onChangeText={setConfirmPassword}
                    />
                    <TouchableOpacity
                      style={styles.passwordToggle}
                      onPress={() => togglePasswordVisibility("confirm")}
                    >
                      <MaterialIcons
                        name={showConfirmPassword ? "visibility" : "visibility-off"}
                        size={20}
                        color={OnboardingColors.primary.main}
                      />
                    </TouchableOpacity>
                  </View>
                </View>

                {/* Enhanced Modal Buttons */}
                <View style={styles.modalButtons}>
                  <TouchableOpacity
                    style={[styles.modalButton, styles.cancelButton]}
                    onPress={() => setShowVerificationModal(false)}
                  >
                    <Text style={styles.cancelButtonText}>Cancel</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.modalButton,
                      styles.confirmButton,
                      { opacity: isVerifyLoading ? 0.8 : 1 },
                    ]}
                    onPress={handleVerifyAndResetPassword}
                    disabled={isVerifyLoading}
                  >
                    {isVerifyLoading ? (
                      <View style={styles.loadingContainer}>
                        <ActivityIndicator color={OnboardingColors.text.white} size="small" />
                        <Text style={[styles.confirmButtonText, { marginLeft: 8 }]}>
                          Resetting...
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.buttonContent}>
                        <MaterialIcons name="check-circle" size={18} color={OnboardingColors.text.white} />
                        <Text style={[styles.confirmButtonText, { marginLeft: 6 }]}>
                          Reset Password
                        </Text>
                      </View>
                    )}
                  </TouchableOpacity>
                </View>
              </View>
            </KeyboardAvoidingView>
          </View>
        </Modal>

        <Toast />
      </ScrollView>
    </KeyboardAvoidingView>
    </LinearGradient>
    </SafeAreaView>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  backgroundGradient: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  gradientCircle: {
    position: "absolute",
    borderRadius: 200,
    opacity: 0.1,
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
    zIndex: 1,
  },
  header: {
    width: "100%",
    maxWidth: 400,
    marginBottom: 20,
  },
  backButton: {
    padding: 12,
    alignSelf: "flex-start",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderRadius: 12,
  },
  iconContainer: {
    alignItems: "center",
    marginBottom: 20,
  },
  lockIconBackground: {
    width: 80,
    height: 80,
    backgroundColor: OnboardingColors.text.white,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: OnboardingColors.primary.main,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  title: {
    fontSize: 32,
    fontFamily: "Inter-Bold",
    color: OnboardingColors.text.primary,
    textAlign: "center",
    marginBottom: 8,
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  subtitle: {
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: OnboardingColors.text.secondary,
    marginBottom: 40,
    textAlign: "center",
    lineHeight: 24,
    paddingHorizontal: 20,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: OnboardingColors.input.background,
    borderRadius: 16,
    marginBottom: 25,
    paddingHorizontal: 16,
    position: "relative",
    width: "100%",
    maxWidth: 400,
    shadowColor: OnboardingColors.shadow.light,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: OnboardingColors.input.border,
  },
  inputIconContainer: {
    width: 40,
    height: 40,
    backgroundColor: `${OnboardingColors.primary.main}1A`,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  input: {
    flex: 1,
    padding: 16,
    fontSize: 16,
    color: OnboardingColors.text.primary,
    fontFamily: "Inter-Regular",
  },
  passwordToggle: {
    padding: 12,
    position: "absolute",
    right: 10,
  },
  sendButton: {
    backgroundColor: OnboardingColors.primary.main,
    paddingVertical: 16,
    borderRadius: 16,
    marginTop: 20,
    width: "100%",
    maxWidth: 400,
    shadowColor: OnboardingColors.primary.main,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  loadingContainer: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonText: {
    color: OnboardingColors.text.white,
    fontSize: 16,
    fontFamily: "Inter-Bold",
    textAlign: "center",
    marginLeft: 8,
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 40,
    width: "100%",
    maxWidth: 400,
  },
  footerText: {
    color: OnboardingColors.text.secondary,
    fontSize: 15,
    fontFamily: "Inter-Regular",
  },
  linkButton: {
    paddingHorizontal: 4,
  },
  linkText: {
    color: OnboardingColors.primary.main,
    fontSize: 15,
    fontFamily: "Inter-Bold",
    textDecorationLine: "underline",
  },

  // Enhanced Modal styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalKeyboardView: {
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  modalContent: {
    backgroundColor: OnboardingColors.input.background,
    borderRadius: 24,
    padding: 28,
    width: "100%",
    maxWidth: 420,
    shadowColor: OnboardingColors.shadow.heavy,
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.3,
    shadowRadius: 20,
    elevation: 15,
    borderWidth: 1,
    borderColor: `${OnboardingColors.primary.main}1A`,
  },
  modalIconContainer: {
    alignItems: "center",
    marginBottom: 16,
    backgroundColor: `${OnboardingColors.status.success}1A`,
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignSelf: "center",
  },
  modalTitle: {
    fontSize: 22,
    fontFamily: "Inter-Bold",
    color: OnboardingColors.text.primary,
    marginBottom: 8,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 15,
    fontFamily: "Inter-Regular",
    color: OnboardingColors.text.secondary,
    marginBottom: 24,
    textAlign: "center",
    lineHeight: 22,
  },
  emailHighlight: {
    color: OnboardingColors.primary.main,
    fontFamily: "Inter-Bold",
  },
  codeInputContainer: {
    marginBottom: 24,
  },
  codeInputLabel: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: OnboardingColors.text.primary,
    marginBottom: 8,
    textAlign: "center",
  },
  codeInput: {
    backgroundColor: OnboardingColors.background.secondary,
    borderRadius: 12,
    padding: 16,
    fontSize: 18,
    color: OnboardingColors.text.primary,
    fontFamily: "Inter-Bold",
    textAlign: "center",
    borderWidth: 2,
    borderColor: OnboardingColors.input.border,
    letterSpacing: 4,
  },
  passwordSection: {
    marginBottom: 24,
  },
  passwordSectionTitle: {
    fontSize: 16,
    fontFamily: "Inter-Bold",
    color: OnboardingColors.text.primary,
    marginBottom: 12,
    textAlign: "center",
  },
  modalInputContainer: {
    marginBottom: 16,
    backgroundColor: OnboardingColors.background.secondary,
    borderColor: OnboardingColors.input.border,
  },
  modalInput: {
    fontSize: 15,
    padding: 14,
  },
  strengthContainer: {
    marginTop: 12,
  },
  strengthBar: {
    height: 6,
    backgroundColor: OnboardingColors.input.border,
    borderRadius: 3,
    overflow: "hidden",
    marginBottom: 8,
  },
  strengthFill: {
    height: "100%",
    borderRadius: 3,
  },
  strengthText: {
    fontSize: 14,
    fontFamily: "Inter-Bold",
    textTransform: "uppercase" as const,
    letterSpacing: 0.5,
  },
  modalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 8,
  },
  modalButton: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderRadius: 12,
    flex: 1,
    marginHorizontal: 6,
    minHeight: 48,
    justifyContent: "center",
    alignItems: "center",
  },
  cancelButton: {
    backgroundColor: OnboardingColors.button.secondary,
    borderWidth: 1,
    borderColor: OnboardingColors.input.border,
  },
  cancelButtonText: {
    color: OnboardingColors.text.secondary,
    fontSize: 16,
    fontFamily: "Inter-Medium",
    textAlign: "center",
  },
  confirmButton: {
    backgroundColor: OnboardingColors.primary.main,
    shadowColor: OnboardingColors.primary.main,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  confirmButtonText: {
    color: OnboardingColors.text.white,
    fontSize: 16,
    fontFamily: "Inter-Bold",
    textAlign: "center",
  },
});
