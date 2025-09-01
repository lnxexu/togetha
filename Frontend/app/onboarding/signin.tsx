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
} from "react-native";
import LoginIllustration from "../../assets/illustrations/undraw_access-account_aydp (1).svg";
import type { RootStackParamList } from "../navigation/AppNavigator";
import AuthService from "./service/AuthService";
import {
  showSuccessToast,
  showErrorToast,
} from "../utils/ToastUtils";

export default function SignIn() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

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

        showSuccessToast("Login successful! Welcome back.");

        // Force reload app state by resetting to Home screen
        navigation.reset({
          index: 0,
          routes: [{ name: "Home" }],
        });
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
                      showSuccessToast("Successfully logged in!");
                      navigation.reset({
                        index: 0,
                        routes: [{ name: "Home" }],
                      });
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
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <ScrollView 
        contentContainerStyle={[
          styles.scrollContainer,
          { 
            minHeight: height,
            paddingVertical: isLandscape ? 10 : 40,
          }
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View style={[
          styles.formContainer,
          {
            paddingHorizontal: isLandscape ? width * 0.1 : 20,
            maxWidth: isLandscape ? width : '100%',
          }
        ]}>
          <Text style={[
            styles.appName,
            {
              fontSize: isLandscape ? width * 0.03 : 28,
              marginBottom: isLandscape ? 5 : 10,
            }
          ]}>Welcome Back!</Text>
          <LoginIllustration
            width={isLandscape ? width * 0.15 : 250}
            height={isLandscape ? width * 0.13 : 220}
            style={[
              styles.loginIllustration,
              { marginBottom: isLandscape ? 10 : 20 }
            ]}
          />

          {error ? <Text style={styles.errorText}>{error}</Text> : null}

          <View style={[
            styles.inputContainer,
            { marginBottom: isLandscape ? 8 : 15 }
          ]}>
            <MaterialIcons
              name="person"
              size={isLandscape ? 20 : 24}
              color="#7F8C8D"
              style={styles.inputIcon}
            />
            <TextInput
              style={[
                styles.input,
                { 
                  padding: isLandscape ? 10 : 15,
                  fontSize: isLandscape ? 14 : 15,
                }
              ]}
              placeholder="Enter your username"
              placeholderTextColor="#7F8C8D"
              autoCapitalize="none"
              value={username}
              onChangeText={setUsername}
            />
          </View>

          <View style={[
            styles.inputContainer,
            { marginBottom: isLandscape ? 8 : 15 }
          ]}>
            <MaterialIcons
              name="lock"
              size={isLandscape ? 20 : 24}
              color="#7F8C8D"
              style={styles.inputIcon}
            />
            <TextInput
              style={[
                styles.input,
                { 
                  padding: isLandscape ? 10 : 15,
                  fontSize: isLandscape ? 14 : 15,
                }
              ]}
              placeholder="Enter your password"
              placeholderTextColor="#7F8C8D"
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
          </View>

          <TouchableOpacity onPress={() => {}}>
            <Text style={[
              styles.forgotPassword,
              { 
                marginBottom: isLandscape ? 10 : 20,
                fontSize: isLandscape ? 12 : 14,
              }
            ]}>Forgot Password?</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.signInButton,
              {
                paddingVertical: isLandscape ? 10 : 15,
                marginTop: isLandscape ? 10 : 20,
                marginBottom: isLandscape ? 10 : 20,
              }
            ]}
            onPress={handleLogin}
            disabled={isLoading}
          >
            {isLoading ? (
              <ActivityIndicator color="#FFFFFF" />
            ) : (
              <Text style={[
                styles.buttonText,
                { fontSize: isLandscape ? 14 : 16 }
              ]}>Log in</Text>
            )}
          </TouchableOpacity>

          <View style={[
            styles.orContainer,
            { marginVertical: isLandscape ? 10 : 20 }
          ]}>
            <View style={styles.orLine} />
            <Text style={[
              styles.orText,
              { fontSize: isLandscape ? 12 : 14 }
            ]}>- OR LOG IN WITH -</Text>
            <View style={styles.orLine} />
          </View>

          <TouchableOpacity style={[
            styles.googleButton,
            {
              paddingVertical: isLandscape ? 8 : 12,
              marginBottom: isLandscape ? 10 : 20,
            }
          ]}>
            <Image
              source={require("../../assets/images/pngtree-google-internet-icon-vector-png-image_9183287.png")}
              style={[
                styles.googleLogo,
                {
                  width: isLandscape ? 20 : 24,
                  height: isLandscape ? 20 : 24,
                }
              ]}
            />
            <Text style={[
              styles.googleButtonText,
              { 
                fontSize: isLandscape ? 16 : 18,
                marginLeft: isLandscape ? 8 : 10,
              }
            ]}>Google</Text>
          </TouchableOpacity>

          <View style={[
            styles.footer,
            { marginTop: isLandscape ? 10 : 20 }
          ]}>
            <Text style={[
              styles.footerText,
              { fontSize: isLandscape ? 13 : 15 }
            ]}>Don't have an account? </Text>
            <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
              <Text style={[
                styles.linkText,
                { fontSize: isLandscape ? 13 : 15 }
              ]}>Sign Up</Text>
            </TouchableOpacity>
          </View>
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1D3FF",
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
  appName: {
    fontSize: 28,
    fontFamily: "Inter-Bold",
    color: "#6A009C",
    textAlign: "center",
    marginBottom: 10,
  },
  loginIllustration: {
    alignSelf: "center",
    marginBottom: 20,
  },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F5F6F8",
    borderRadius: 10,
    marginBottom: 15,
    paddingHorizontal: 10,
    width: "100%",
    maxWidth: 400,
  },
  inputIcon: {
    marginRight: 10,
  },
  input: {
    flex: 1,
    padding: 15,
    fontSize: 15,
    color: "#2C3E50",
    fontFamily: "Inter-Regular",
  },
  forgotPassword: {
    color: "#AD00FF",
    textAlign: "right",
    marginBottom: 20,
    fontSize: 14,
    fontFamily: "Inter-Regular",
    width: "100%",
    maxWidth: 400,
  },
  signInButton: {
    backgroundColor: "#A32EDA",
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 20,
    marginBottom: 20,
    width: "100%",
    maxWidth: 400,
  },
  buttonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter-Bold",
    textAlign: "center",
  },
  orContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 20,
    width: "100%",
    maxWidth: 400,
  },
  orLine: {
    flex: 1,
    height: 1,
    backgroundColor: "#E0E0E0",
  },
  orText: {
    marginHorizontal: 10,
    color: "#7F8C8D",
    fontSize: 14,
    fontWeight: "600",
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    paddingVertical: 12,
    borderRadius: 10,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: "#E0E0E0",
    width: "100%",
    maxWidth: 400,
  },
  googleLogo: {
    width: 24,
    height: 24,
  },
  googleButtonText: {
    marginLeft: 10,
    color: "#333333",
    fontSize: 18,
    fontFamily: "Inter-Bold",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: 20,
    width: "100%",
    maxWidth: 400,
  },
  footerText: {
    color: "#7F8C8D",
    fontSize: 15,
  },
  linkText: {
    color: "#AD00FF",
    fontSize: 15,
    fontFamily: "Inter-Bold",
  },
  errorText: {
    color: "#E74C3C",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 15,
    fontFamily: "Inter-Regular",
    width: "100%",
    maxWidth: 400,
  },
});
