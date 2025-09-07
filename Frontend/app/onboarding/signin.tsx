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
  Alert,
  ActivityIndicator,
  useWindowDimensions,
  ScrollView,
  Platform,
  SafeAreaView,
} from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import LoginIllustration from "../../assets/illustrations/undraw_access-account_aydp (1).svg";
import type { RootStackParamList } from "../navigation/AppNavigator";
import AuthService from "./service/AuthService";
import GoogleAuthService from './service/GoogleAuthServiceWeb';
import { OnboardingColors } from "../../constants/Colors";
import {
  showSuccessToast,
  showErrorToast,
} from "../utils/ToastUtils";
import LoadingScreen from '../components/LoadingScreen';
import { getEnhancedSafeAreaConfig, getStatusBarConfig, getSafeAreaContainerStyle, getPlatformShadow } from '../utils/SafeAreaUtils';


export default function SignIn() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const safeAreaConfig = getEnhancedSafeAreaConfig(insets, height, isLandscape);
  const statusBarConfig = getStatusBarConfig();
  const safeAreaStyle = getSafeAreaContainerStyle();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isGoogleLoading, setIsGoogleLoading] = useState(false);
  const [showLoadingScreen, setShowLoadingScreen] = useState(false);
  const [error, setError] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const handleGoogleSignIn = async () => {
    try {
      setIsGoogleLoading(true);
      setError("");

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
        throw new Error(result.error || 'Google sign-in failed');
      }
    } catch (error: any) {
      console.error('Google sign-in error:', error);
      showErrorToast(error.message || 'Google sign-in failed. Please try again.');
    } finally {
      setIsGoogleLoading(false);
    }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      showErrorToast("Please enter both username and password");
      return;
    }

    try {
      setIsLoading(true);
      setError("");

      // Before login attempt, explicitly logout any previous session to ensure clean state
      const authService = AuthService.getInstance();
      await authService.logout();

      // Add timeout to the request (10 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);
      try {
        // Perform login with the updated method that handles CSRF
        const response = await authService.login(username, password);
        clearTimeout(timeoutId);

        // Show loading screen for professional look
        setIsLoading(false);
        setShowLoadingScreen(true);

        showSuccessToast("Login successful! Welcome back.");

        // Show loading screen for 2 seconds then navigate
        setTimeout(() => {
          setShowLoadingScreen(false);
          // Force reload app state by resetting to Home screen
          navigation.reset({
            index: 0,
            routes: [{ name: "Home" }],
          });
        }, 2000);
      } catch (loginError: any) {
        clearTimeout(timeoutId);

        // Check if this is a session conflict error
        if (
          loginError.message &&
          loginError.message.includes("already in use")
        ) {
          // Show session conflict dialog
          Alert.alert(
            "Account Already In Use",
            "Your account is already logged in on another device. Would you like to log out of all other devices and login here?",
            [
              {
                text: "Cancel",
                style: "cancel",
              },
              {
                text: "Yes, Log Out Other Sessions",
                onPress: async () => {
                  try {
                    // Force login by adding force parameter
                    setIsLoading(true);

                    // API call to force logout other sessions
                    const forceLoginResponse = await authService.login(
                      username,
                      password,
                      true // Force login
                    );

                    if (forceLoginResponse) {
                      // Handle successful force login
                      setIsLoading(false);
                      setShowLoadingScreen(true);
                      
                      showSuccessToast("Successfully logged in!");
                      
                      // Show loading screen then navigate
                      setTimeout(() => {
                        setShowLoadingScreen(false);
                        navigation.reset({
                          index: 0,
                          routes: [{ name: "Home" }],
                        });
                      }, 2000);
                    } else {
                      showErrorToast(
                        "Failed to force login. Please try again."
                      );
                    }
                  } catch (error) {
                    console.error("Force login error:", error);
                    showErrorToast("Network error. Please try again.");
                  } finally {
                    setIsLoading(false);
                  }
                },
              },
            ]
          );
        } else {
          // Handle other login errors
          showErrorToast(
            loginError.message || "Login failed. Please check your credentials."
          );
        }
      }
    } catch (err: any) {
      showErrorToast("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <>
      <StatusBar {...statusBarConfig} />
      
      {/* Main Content */}
      <SafeAreaView style={[styles.safeArea, safeAreaStyle]}>
        <LinearGradient
          colors={['#FAF5FF', '#F3E8FF'] as const}
          style={styles.container}
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
            ]}>Welcome Back!</Text>
            <Text style={[
              styles.welcomeSubtitle,
              {
                fontSize: isLandscape ? width * 0.02 : 16,
                marginBottom: isLandscape ? 15 : 24,
              }
            ]}>Sign in to continue your journey</Text>
          </View>

          {/* Illustration */}
          <View style={styles.illustrationContainer}>
            <LoginIllustration
              width={isLandscape ? width * 0.2 : 200}
              height={isLandscape ? width * 0.16 : 160}
            />
          </View>

          {/* Error Message */}
          {error ? (
            <View style={styles.errorContainer}>
              <MaterialIcons name="error-outline" size={20} color={OnboardingColors.status.error} />
              <Text style={styles.errorText}>{error}</Text>
            </View>
          ) : null}

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
                placeholder="Username or email"
                placeholderTextColor={OnboardingColors.input.placeholder}
                autoCapitalize="none"
                value={username}
                onChangeText={setUsername}
                editable={!isLoading && !isGoogleLoading}
              />
            </View>

            {/* Password Input */}
            <View style={[
              styles.inputContainer,
              { marginBottom: isLandscape ? 8 : 12 }
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
                secureTextEntry={!showPassword}
                value={password}
                onChangeText={setPassword}
                editable={!isLoading && !isGoogleLoading}
              />
              <TouchableOpacity
                style={styles.passwordToggle}
                onPress={() => setShowPassword(!showPassword)}
                disabled={isLoading || isGoogleLoading}
              >
                <MaterialIcons
                  name={showPassword ? "visibility" : "visibility-off"}
                  size={isLandscape ? 18 : 20}
                  color={OnboardingColors.input.icon}
                />
              </TouchableOpacity>
            </View>

            {/* Forgot Password */}
            <TouchableOpacity 
              onPress={() => navigation.navigate("ForgotPassword")}
              disabled={isLoading || isGoogleLoading}
              style={styles.forgotPasswordContainer}
            >
              <Text style={[
                styles.forgotPassword,
                { 
                  fontSize: isLandscape ? 13 : 14,
                }
              ]}>Forgot Password?</Text>
            </TouchableOpacity>

            {/* Sign In Button */}
            <TouchableOpacity
              style={[
                styles.signInButton,
                {
                  paddingVertical: isLandscape ? 12 : 16,
                  marginTop: isLandscape ? 12 : 20,
                  marginBottom: isLandscape ? 12 : 16,
                  opacity: (isLoading || isGoogleLoading) ? 0.7 : 1,
                }
              ]}
              onPress={handleLogin}
              disabled={isLoading || isGoogleLoading}
            >
              {isLoading ? (
                <ActivityIndicator color={OnboardingColors.text.white} size="small" />
              ) : (
                <Text style={[
                  styles.buttonText,
                  { fontSize: isLandscape ? 15 : 16 }
                ]}>Sign In</Text>
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
              ]}>Or continue with</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Google Sign-In Button */}
            <TouchableOpacity 
              style={[
                styles.googleButton,
                {
                  paddingVertical: isLandscape ? 10 : 14,
                  marginBottom: isLandscape ? 12 : 20,
                  opacity: (isLoading || isGoogleLoading) ? 0.7 : 1,
                }
              ]}
              onPress={handleGoogleSignIn}
              disabled={isLoading || isGoogleLoading}
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
              ]}>Don't have an account? </Text>
              <TouchableOpacity 
                onPress={() => navigation.navigate("Signup")}
                disabled={isLoading || isGoogleLoading}
              >
                <Text style={[
                  styles.linkText,
                  { fontSize: isLandscape ? 13 : 14 }
                ]}>Sign Up</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </ScrollView>
    </LinearGradient>
    </SafeAreaView>

    {/* Loading Screen Overlay */}
    {showLoadingScreen && (
      <LoadingScreen 
        message="Signing You In"
        isVisible={showLoadingScreen}
        onAnimationComplete={() => {
        }}
      />
    )}
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
  illustrationContainer: {
    alignItems: "center",
    marginBottom: 32,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: `${OnboardingColors.status.error}15`,
    padding: 12,
    borderRadius: 12,
    marginBottom: 16,
    width: "100%",
    maxWidth: 400,
  },
  errorText: {
    color: OnboardingColors.status.error,
    fontSize: 14,
    marginLeft: 8,
    flex: 1,
    fontWeight: "500",
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
  forgotPasswordContainer: {
    alignSelf: "flex-end",
    marginBottom: 24,
  },
  forgotPassword: {
    color: OnboardingColors.primary.main,
    fontSize: 14,
    fontWeight: "600",
  },
  signInButton: {
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
