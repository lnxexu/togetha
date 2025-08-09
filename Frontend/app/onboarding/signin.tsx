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
} from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import LoginIllustration from "../../assets/illustrations/undraw_access-account_aydp (1).svg";
import type { RootStackParamList } from "../navigation/AppNavigator";
import AuthService from "./service/AuthService";
import { API_URL, API_ENDPOINTS } from "@/constants/ApiConfig";
import { showSuccessToast, showErrorToast, showWarningToast } from "../utils/ToastUtils";

export default function SignIn() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  // Update the handleLogin function

  const handleLogin = async () => {
    console.log("Login attempt started with username:", username);

    if (!username.trim() || !password.trim()) {
      showErrorToast("Please enter both username and password");
      console.log("Login validation failed: empty username or password");
      return;
    }

    try {
      setIsLoading(true);

      // Before login attempt, explicitly logout any previous session to ensure clean state
      const authService = AuthService.getInstance();
      await authService.logout();

      // Add timeout to the request (10 seconds)
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 10000);

      try {
        // Perform login
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
                    const forceResponse = await fetch(`${API_URL}${API_ENDPOINTS.LOGIN}`, {
                      method: "POST",
                      headers: {
                        "Content-Type": "application/json",
                      },
                      body: JSON.stringify({
                        username,
                        password,  
                        force: true, // Indicate we want to force login
                      }),
                    });

                    if (forceResponse.ok) {
                      const data = await forceResponse.json();
                      if (data.token) {
                        // Store authentication data
                        await AsyncStorage.setItem("token", data.token);
                        await AsyncStorage.setItem("authToken", data.token);
                        await AsyncStorage.setItem("username", username);
                        await AsyncStorage.setItem(
                          "session_id",
                          data.session_id
                        );
                      }
                      showSuccessToast("Successfully logged in!");
                      navigation.reset({
                        index: 0,
                        routes: [{ name: "Home" }],
                      });
                    } else {
                      showErrorToast("Failed to force login. Please try again.");
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
      console.error("Login process error:", err);
      showErrorToast("An unexpected error occurred. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar barStyle="dark-content" />
      <View style={styles.formContainer}>
        <Text style={styles.appName}>Welcome Back!</Text>
        <LoginIllustration
          width={250}
          height={220}
          style={styles.loginIllustration}
        />

        <View style={styles.inputContainer}>
          <MaterialIcons
            name="person"
            size={24}
            color="#7F8C8D"
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            placeholder="Enter your username"
            placeholderTextColor="#7F8C8D"
            autoCapitalize="none"
            value={username}
            onChangeText={setUsername}
          />
        </View>

        <View style={styles.inputContainer}>
          <MaterialIcons
            name="lock"
            size={24}
            color="#7F8C8D"
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            placeholder="Enter your password"
            placeholderTextColor="#7F8C8D"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
          />
        </View>

        <TouchableOpacity onPress={() => {}}>
          <Text style={styles.forgotPassword}>Forgot Password?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signInButton}
          onPress={handleLogin}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.buttonText}>Log in</Text>
          )}
        </TouchableOpacity>

        <View style={styles.orContainer}>
          <View style={styles.orLine} />
          <Text style={styles.orText}>- OR LOG IN WITH -</Text>
          <View style={styles.orLine} />
        </View>

        <TouchableOpacity style={styles.googleButton}>
          <Image
            source={require("../../assets/images/pngtree-google-internet-icon-vector-png-image_9183287.png")}
            style={styles.googleLogo}
          />
          <Text style={styles.googleButtonText}>Google</Text>
        </TouchableOpacity>

        <View style={styles.footer}>
          <Text style={styles.footerText}>Don't have an account? </Text>
          <TouchableOpacity onPress={() => navigation.navigate("Signup")}>
            <Text style={styles.linkText}>Sign Up</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F1D3FF",
  },
  formContainer: {
    flex: 1,
    justifyContent: "center",
    paddingHorizontal: 20,
    paddingTop: 40,
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
  },
  signInButton: {
    backgroundColor: "#A32EDA",
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 20,
    marginBottom: 20,
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
});
