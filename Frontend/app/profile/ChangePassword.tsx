import React, { useState, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  TextInput,
  ScrollView,
  Platform,
  Alert,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Animated,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  sendPasswordChangeVerification,
  verifyAndChangePassword,
  validatePasswordStrength,
  type PasswordChangeData,
  type SecurityVerificationData
} from '../services/PasswordChangeService';
import { RootStackParamList } from "../navigation/AppNavigator";
import { userService } from "./services/userService";
import { API_URL, API_ENDPOINTS } from "../../constants/ApiConfig";
import { OnboardingColors } from "../../constants/Colors";
import Toast from "react-native-toast-message";
import { showSuccessToast, showErrorToast } from "../utils/ToastUtils";
import { getEnhancedSafeAreaConfig, getStatusBarConfig, getSafeAreaContainerStyle, getPlatformShadow } from "../utils/SafeAreaUtils";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import EnhancedLoadingScreen from '../components/EnhancedLoadingScreen';
import { SafeAreaWrapper } from "../components/SafeAreaWrapper";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const ChangePassword: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState<{
    currentPassword?: string;
    newPassword?: string;
    confirmPassword?: string;
  }>({});

  // Security verification states
  const [showSecurityModal, setShowSecurityModal] = useState(false);
  const [verificationCode, setVerificationCode] = useState("");
  const [isVerifyingIdentity, setIsVerifyingIdentity] = useState(false);
  const [securityStep, setSecurityStep] = useState<'email' | 'verify'>('email');
  const [userEmail, setUserEmail] = useState("");
  const [fadeAnim] = useState(new Animated.Value(0));

  // Animation effect
  React.useEffect(() => {
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 600,
      useNativeDriver: true,
    }).start();
  }, []);

  const validateForm = (): boolean => {
    const newErrors: any = {};

    // Current password validation
    if (!currentPassword.trim()) {
      newErrors.currentPassword = "Current password is required";
    }

    // New password validation
    if (!newPassword.trim()) {
      newErrors.newPassword = "New password is required";
    } else if (newPassword.length < 8) {
      newErrors.newPassword = "Password must be at least 8 characters long";
    } else if (!/(?=.*[a-z])/.test(newPassword)) {
      newErrors.newPassword = "Password must contain at least one lowercase letter";
    } else if (!/(?=.*[A-Z])/.test(newPassword)) {
      newErrors.newPassword = "Password must contain at least one uppercase letter";
    } else if (!/(?=.*\d)/.test(newPassword)) {
      newErrors.newPassword = "Password must contain at least one number";
    } else if (!/(?=.*[!@#$%^&*(),.?":{}|<>])/.test(newPassword)) {
      newErrors.newPassword = "Password must contain at least one special character";
    }

    // Confirm password validation
    if (!confirmPassword.trim()) {
      newErrors.confirmPassword = "Please confirm your new password";
    } else if (newPassword !== confirmPassword) {
      newErrors.confirmPassword = "Passwords do not match";
    }

    // Same password check
    if (currentPassword === newPassword && currentPassword.trim()) {
      newErrors.newPassword = "New password must be different from current password";
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Security verification: Send verification code to user's email
  const initiateSecurityVerification = async () => {
    if (!validateForm()) {
      return;
    }

    setIsVerifyingIdentity(true);
    try {
      // First, get user info to get their email
      const userInfo = await userService.getUserInfo();
      setUserEmail(userInfo.email || "");

      // Send verification code to user's email for identity confirmation
      const response = await fetch(`${API_URL}/users/send-password-change-verification/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${await AsyncStorage.getItem("userToken")}`,
        },
        body: JSON.stringify({ 
          email: userInfo.email,
          action: "password_change"
        }),
      });

      if (response.ok) {
        setShowSecurityModal(true);
        setSecurityStep('verify');
        showSuccessToast("Security verification code sent to your email");
      } else {
        const errorData = await response.json();
        if (response.status === 429) {
          showErrorToast("Too many requests. Please wait a few minutes before trying again.");
        } else {
          showErrorToast(errorData.message || "Failed to send verification code");
        }
      }
    } catch (error: any) {
      console.error("Error initiating security verification:", error);
      if (error.message && error.message.includes("Network request failed")) {
        showErrorToast("Cannot connect to server. Please check your internet connection.");
      } else {
        showErrorToast("Failed to initiate security verification. Please try again.");
      }
    } finally {
      setIsVerifyingIdentity(false);
    }
  };

  const verifyIdentityAndChangePassword = async () => {
    if (!verificationCode.trim()) {
      showErrorToast("Please enter the verification code");
      return;
    }

    if (verificationCode.length !== 6) {
      showErrorToast("Verification code must be 6 digits");
      return;
    }

    setLoading(true);
    try {
      // Verify the security code and change password
      const response = await fetch(`${API_URL}/users/verify-password-change/`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${await AsyncStorage.getItem("userToken")}`,
        },
        body: JSON.stringify({
          verification_code: verificationCode,
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        showSuccessToast("Password changed successfully! 🎉");
        setShowSecurityModal(false);
        
        // Clear form
        setCurrentPassword("");
        setNewPassword("");
        setConfirmPassword("");
        setVerificationCode("");
        setErrors({});
        
        // Navigate back after a short delay
        setTimeout(() => {
          navigation.goBack();
        }, 1500);
      } else {
        // Better error handling
        if (response.status === 400) {
          if (data.message && data.message.includes("verification")) {
            showErrorToast("Invalid verification code. Please check and try again.");
          } else if (data.message && data.message.includes("password")) {
            showErrorToast("Current password is incorrect. Please try again.");
          } else {
            showErrorToast(data.message || "Invalid information provided");
          }
        } else if (response.status === 410) {
          showErrorToast("Verification code has expired. Please request a new one.");
        } else {
          showErrorToast(data.message || "Failed to change password");
        }
      }
    } catch (error: any) {
      console.error("Error changing password:", error);
      if (error.message && error.message.includes("Network request failed")) {
        showErrorToast("Cannot connect to server. Please check your internet connection.");
      } else {
        showErrorToast("An error occurred while changing password. Please try again.");
      }
    } finally {
      setLoading(false);
    }
  };

  const handleChangePassword = async () => {
    // Initiate security verification instead of directly changing password
    await initiateSecurityVerification();
  };

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

    if (score <= 2) return { strength: 'weak', score: Math.min(score * 20, 100), color: '#EF4444' };
    if (score <= 4) return { strength: 'medium', score: Math.min(score * 17, 100), color: '#F59E0B' };
    return { strength: 'strong', score: Math.min(score * 17, 100), color: '#22C55E' };
  };

  const passwordStrength = getPasswordStrength(newPassword);

  return (
    <SafeAreaWrapper>
    <LinearGradient
      colors={OnboardingColors.background.gradient as [string, string]}
      style={styles.container}
    >
      {/* Background Gradient Effect */}
      <View style={styles.backgroundGradient}>
        <View style={[styles.gradientCircle, styles.gradientCircle1]} />
        <View style={[styles.gradientCircle, styles.gradientCircle2]} />
        <View style={[styles.gradientCircle, styles.gradientCircle3]} />
      </View>

      {/* Enhanced Header */}
      <LinearGradient
        colors={[OnboardingColors.primary.main, OnboardingColors.primary.dark, OnboardingColors.primary.light]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color={OnboardingColors.text.white} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Change Password</Text>
          <View style={styles.placeholder} />
        </View>
      </LinearGradient>

      {/* Content */}
      <Animated.View 
        style={[
          styles.content, 
          { opacity: fadeAnim, transform: [{ translateY: fadeAnim.interpolate({
            inputRange: [0, 1],
            outputRange: [30, 0]
          }) }] }
        ]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.formContainer}>
            {/* Security Notice */}
            <View style={styles.securityNotice}>
              <MaterialIcons name="security" size={24} color="#8B5CF6" />
              <Text style={styles.securityNoticeText}>
                For your security, we'll send a verification code to your email before changing your password.
              </Text>
            </View>

            <Text style={styles.description}>
              Please enter your current password and choose a new secure password.
            </Text>

          {/* Current Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Current Password</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={[
                  styles.input,
                  errors.currentPassword && styles.inputError,
                ]}
                value={currentPassword}
                onChangeText={(text) => {
                  setCurrentPassword(text);
                  if (errors.currentPassword) {
                    setErrors({ ...errors, currentPassword: undefined });
                  }
                }}
                placeholder="Enter your current password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showCurrentPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowCurrentPassword(!showCurrentPassword)}
              >
                <MaterialIcons
                  name={showCurrentPassword ? "visibility-off" : "visibility"}
                  size={24}
                  color="#6B7280"
                />
              </TouchableOpacity>
            </View>
            {errors.currentPassword && (
              <Text style={styles.errorText}>{errors.currentPassword}</Text>
            )}
          </View>

          {/* New Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>New Password</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={[
                  styles.input,
                  errors.newPassword && styles.inputError,
                ]}
                value={newPassword}
                onChangeText={(text) => {
                  setNewPassword(text);
                  if (errors.newPassword) {
                    setErrors({ ...errors, newPassword: undefined });
                  }
                }}
                placeholder="Enter your new password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showNewPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowNewPassword(!showNewPassword)}
              >
                <MaterialIcons
                  name={showNewPassword ? "visibility-off" : "visibility"}
                  size={24}
                  color="#6B7280"
                />
              </TouchableOpacity>
            </View>
            {errors.newPassword && (
              <Text style={styles.errorText}>{errors.newPassword}</Text>
            )}

            {/* Password Strength Indicator */}
            {newPassword.length > 0 && (
              <View style={styles.strengthContainer}>
                <View style={styles.strengthBar}>
                  <View
                    style={[
                      styles.strengthFill,
                      { 
                        width: `${passwordStrength.score}%`,
                        backgroundColor: passwordStrength.color,
                      },
                    ]}
                  />
                </View>
                <Text
                  style={[
                    styles.strengthText,
                    { color: passwordStrength.color },
                  ]}
                >
                  {passwordStrength.strength.charAt(0).toUpperCase() + 
                   passwordStrength.strength.slice(1)} password
                </Text>
              </View>
            )}
          </View>

          {/* Confirm Password */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm New Password</Text>
            <View style={styles.inputContainer}>
              <TextInput
                style={[
                  styles.input,
                  errors.confirmPassword && styles.inputError,
                ]}
                value={confirmPassword}
                onChangeText={(text) => {
                  setConfirmPassword(text);
                  if (errors.confirmPassword) {
                    setErrors({ ...errors, confirmPassword: undefined });
                  }
                }}
                placeholder="Confirm your new password"
                placeholderTextColor="#9CA3AF"
                secureTextEntry={!showConfirmPassword}
                autoCapitalize="none"
                autoCorrect={false}
              />
              <TouchableOpacity
                style={styles.eyeButton}
                onPress={() => setShowConfirmPassword(!showConfirmPassword)}
              >
                <MaterialIcons
                  name={showConfirmPassword ? "visibility-off" : "visibility"}
                  size={24}
                  color="#6B7280"
                />
              </TouchableOpacity>
            </View>
            {errors.confirmPassword && (
              <Text style={styles.errorText}>{errors.confirmPassword}</Text>
            )}
          </View>

          {/* Password Requirements */}
          <View style={styles.requirementsContainer}>
            <Text style={styles.requirementsTitle}>Password Requirements:</Text>
            <View style={styles.requirementsList}>
              <View style={styles.requirement}>
                <MaterialIcons
                  name={newPassword.length >= 8 ? "check-circle" : "radio-button-unchecked"}
                  size={16}
                  color={newPassword.length >= 8 ? "#22C55E" : "#9CA3AF"}
                />
                <Text style={[
                  styles.requirementText,
                  newPassword.length >= 8 && styles.requirementMet
                ]}>
                  At least 8 characters
                </Text>
              </View>
              <View style={styles.requirement}>
                <MaterialIcons
                  name={/(?=.*[a-z])/.test(newPassword) ? "check-circle" : "radio-button-unchecked"}
                  size={16}
                  color={/(?=.*[a-z])/.test(newPassword) ? "#22C55E" : "#9CA3AF"}
                />
                <Text style={[
                  styles.requirementText,
                  /(?=.*[a-z])/.test(newPassword) && styles.requirementMet
                ]}>
                  One lowercase letter
                </Text>
              </View>
              <View style={styles.requirement}>
                <MaterialIcons
                  name={/(?=.*[A-Z])/.test(newPassword) ? "check-circle" : "radio-button-unchecked"}
                  size={16}
                  color={/(?=.*[A-Z])/.test(newPassword) ? "#22C55E" : "#9CA3AF"}
                />
                <Text style={[
                  styles.requirementText,
                  /(?=.*[A-Z])/.test(newPassword) && styles.requirementMet
                ]}>
                  One uppercase letter
                </Text>
              </View>
              <View style={styles.requirement}>
                <MaterialIcons
                  name={/(?=.*[!@#$%^&*(),.?":{}|<>])/.test(newPassword) ? "check-circle" : "radio-button-unchecked"}
                  size={16}
                  color={/(?=.*[!@#$%^&*(),.?":{}|<>])/.test(newPassword) ? "#22C55E" : "#9CA3AF"}
                />
                <Text style={[
                  styles.requirementText,
                  /(?=.*[!@#$%^&*(),.?":{}|<>])/.test(newPassword) && styles.requirementMet
                ]}>
                  One special character
                </Text>
              </View>
            </View>
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity
              style={styles.cancelButton}
              onPress={() => navigation.goBack()}
              disabled={loading || isVerifyingIdentity}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.saveButton,
                (loading || isVerifyingIdentity) && styles.saveButtonDisabled,
              ]}
              onPress={handleChangePassword}
              disabled={loading || isVerifyingIdentity}
            >
              {isVerifyingIdentity ? (
                <View style={styles.buttonLoadingContent}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                  <Text style={[styles.saveButtonText, { marginLeft: 8 }]}>
                    Verifying...
                  </Text>
                </View>
              ) : (
                <View style={styles.buttonContent}>
                  <MaterialIcons name="security" size={18} color="#FFFFFF" />
                  <Text style={[styles.saveButtonText, { marginLeft: 6 }]}>
                    Secure Change
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
      </Animated.View>

      {/* Security Verification Modal */}
      <Modal
        transparent={true}
        visible={showSecurityModal}
        animationType="fade"
        onRequestClose={() => setShowSecurityModal(false)}
      >
        <View style={styles.modalOverlay}>
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : "height"}
            style={styles.modalKeyboardView}
          >
            <View style={styles.securityModalContent}>
              {/* Security Icon */}
              <View style={styles.securityIconContainer}>
                <MaterialIcons name="verified-user" size={50} color="#10B981" />
              </View>
              
              <Text style={styles.securityModalTitle}>Identity Verification</Text>
              <Text style={styles.securityModalSubtitle}>
                We've sent a security code to{"\n"}
                <Text style={styles.emailHighlight}>{userEmail}</Text>
                {"\n"}Enter the code to verify your identity.
              </Text>

              {/* Code Input */}
              <View style={styles.securityCodeContainer}>
                <Text style={styles.codeInputLabel}>Security Code</Text>
                <TextInput
                  style={styles.securityCodeInput}
                  placeholder="Enter 6-digit code"
                  placeholderTextColor="#9CA3AF"
                  keyboardType="numeric"
                  maxLength={6}
                  value={verificationCode}
                  onChangeText={setVerificationCode}
                  textAlign="center"
                />
              </View>

              {/* Security Modal Buttons */}
              <View style={styles.securityModalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.securityCancelButton]}
                  onPress={() => {
                    setShowSecurityModal(false);
                    setVerificationCode("");
                  }}
                >
                  <Text style={styles.securityCancelButtonText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.modalButton,
                    styles.securityConfirmButton,
                    { opacity: loading ? 0.8 : 1 },
                  ]}
                  onPress={verifyIdentityAndChangePassword}
                  disabled={loading}
                >
                  {loading ? (
                    <View style={styles.buttonLoadingContent}>
                      <ActivityIndicator color="#FFFFFF" size="small" />
                      <Text style={[styles.securityConfirmButtonText, { marginLeft: 8 }]}>
                        Changing...
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.buttonContent}>
                      <MaterialIcons name="lock-reset" size={18} color="#FFFFFF" />
                      <Text style={[styles.securityConfirmButtonText, { marginLeft: 6 }]}>
                        Change Password
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
    </LinearGradient>
    </SafeAreaWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
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
  gradientCircle1: {
    width: 300,
    height: 300,
    backgroundColor: OnboardingColors.primary.main,
    top: -150,
    right: -100,
  },
  gradientCircle2: {
    width: 200,
    height: 200,
    backgroundColor: OnboardingColors.primary.light,
    top: 200,
    left: -50,
  },
  gradientCircle3: {
    width: 150,
    height: 150,
    backgroundColor: OnboardingColors.primary.accent,
    bottom: 150,
    right: -30,
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 70 : 50,
    paddingBottom: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
  },
  headerTitle: {
    fontSize: 24,
    color: OnboardingColors.text.white,
    fontFamily: "Inter-Bold",
    textAlign: "center",
    flex: 1,
    textShadowColor: "rgba(0, 0, 0, 0.3)",
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 24,
    zIndex: 1,
  },
  formContainer: {
    backgroundColor: OnboardingColors.input.background,
    borderRadius: 24,
    padding: 28,
    shadowColor: OnboardingColors.shadow.medium,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: `${OnboardingColors.primary.main}1A`,
  },
  securityNotice: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${OnboardingColors.primary.main}1A`,
    borderRadius: 16,
    padding: 16,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: OnboardingColors.primary.main,
  },
  securityNoticeText: {
    flex: 1,
    fontSize: 14,
    color: OnboardingColors.text.secondary,
    fontFamily: "Inter-Medium",
    lineHeight: 20,
    marginLeft: 12,
  },
  description: {
    fontSize: 16,
    color: OnboardingColors.text.secondary,
    fontFamily: "Inter-Regular",
    lineHeight: 24,
    marginBottom: 32,
    textAlign: "center",
  },
  inputGroup: {
    marginBottom: 24,
  },
  label: {
    fontSize: 16,
    color: OnboardingColors.text.primary,
    fontFamily: "Inter-SemiBold",
    marginBottom: 8,
  },
  inputContainer: {
    position: "relative",
  },
  input: {
    backgroundColor: OnboardingColors.background.secondary,
    borderWidth: 2,
    borderColor: OnboardingColors.input.border,
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 16,
    paddingRight: 55,
    fontSize: 16,
    color: OnboardingColors.text.primary,
    fontFamily: "Inter-Regular",
    shadowColor: OnboardingColors.shadow.light,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  inputError: {
    borderColor: OnboardingColors.status.error,
    backgroundColor: `${OnboardingColors.status.error}0D`,
  },
  eyeButton: {
    position: "absolute",
    right: 16,
    top: 16,
    width: 28,
    height: 28,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 14,
    backgroundColor: `${OnboardingColors.input.icon}1A`,
  },
  errorText: {
    fontSize: 14,
    color: OnboardingColors.status.error,
    fontFamily: "Inter-Medium",
    marginTop: 8,
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
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  requirementsContainer: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 20,
    marginBottom: 32,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  requirementsTitle: {
    fontSize: 16,
    color: "#1F2937",
    fontFamily: "Inter-Bold",
    marginBottom: 16,
  },
  requirementsList: {
    gap: 12,
  },
  requirement: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  requirementText: {
    fontSize: 14,
    color: "#6B7280",
    fontFamily: "Inter-Regular",
  },
  requirementMet: {
    color: "#059669",
    fontFamily: "Inter-Medium",
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 16,
  },
  buttonContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  buttonLoadingContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  cancelButton: {
    flex: 1,
    backgroundColor: OnboardingColors.button.secondary,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 2,
    borderColor: OnboardingColors.input.border,
  },
  cancelButtonText: {
    fontSize: 16,
    color: OnboardingColors.text.secondary,
    fontFamily: "Inter-Bold",
  },
  saveButton: {
    flex: 1,
    backgroundColor: OnboardingColors.primary.main,
    borderRadius: 16,
    paddingVertical: 16,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: OnboardingColors.primary.main,
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  saveButtonDisabled: {
    backgroundColor: OnboardingColors.text.light,
    shadowOpacity: 0.1,
  },
  saveButtonText: {
    fontSize: 16,
    color: OnboardingColors.text.white,
    fontFamily: "Inter-Bold",
  },

  // Security Modal Styles
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalKeyboardView: {
    width: "100%",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  securityModalContent: {
    backgroundColor: "#FFFFFF",
    borderRadius: 28,
    padding: 32,
    width: "100%",
    maxWidth: 420,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.4,
    shadowRadius: 24,
    elevation: 20,
    borderWidth: 1,
    borderColor: "rgba(139, 92, 246, 0.1)",
  },
  securityIconContainer: {
    alignItems: "center",
    marginBottom: 20,
    backgroundColor: "rgba(16, 185, 129, 0.1)",
    width: 88,
    height: 88,
    borderRadius: 44,
    justifyContent: "center",
    alignSelf: "center",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
  },
  securityModalTitle: {
    fontSize: 24,
    fontFamily: "Inter-Bold",
    color: "#1F2937",
    marginBottom: 12,
    textAlign: "center",
  },
  securityModalSubtitle: {
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: "#6B7280",
    marginBottom: 28,
    textAlign: "center",
    lineHeight: 24,
  },
  emailHighlight: {
    color: "#8B5CF6",
    fontFamily: "Inter-Bold",
  },
  securityCodeContainer: {
    marginBottom: 28,
  },
  codeInputLabel: {
    fontSize: 16,
    fontFamily: "Inter-Bold",
    color: "#374151",
    marginBottom: 12,
    textAlign: "center",
  },
  securityCodeInput: {
    backgroundColor: "#F8FAFC",
    borderRadius: 16,
    padding: 18,
    fontSize: 22,
    color: "#1F2937",
    fontFamily: "Inter-Bold",
    textAlign: "center",
    borderWidth: 2,
    borderColor: "#E2E8F0",
    letterSpacing: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  securityModalButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
    width: "100%",
    marginTop: 8,
  },
  modalButton: {
    paddingVertical: 16,
    paddingHorizontal: 20,
    borderRadius: 16,
    flex: 1,
    marginHorizontal: 6,
    minHeight: 52,
    justifyContent: "center",
    alignItems: "center",
  },
  securityCancelButton: {
    backgroundColor: "#F3F4F6",
    borderWidth: 2,
    borderColor: "#E5E7EB",
  },
  securityCancelButtonText: {
    color: "#6B7280",
    fontSize: 16,
    fontFamily: "Inter-Bold",
    textAlign: "center",
  },
  securityConfirmButton: {
    backgroundColor: "#8B5CF6",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  securityConfirmButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter-Bold",
    textAlign: "center",
  },
});

export default ChangePassword;
