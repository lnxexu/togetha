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


// Ensure the API URL is set correctly
// const API_URL = 'http://192.168.0.153:8000';
// const API_URL = 'http://localhost:8081';
// const API_URL = 'http://127.0.0.1:8000';
const API_URL = "http://10.0.2.2:8000";




export default function SignIn() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");

  const handleLogin = async () => {
    console.log("Login attempt started with username:", username);
    
    if (!username.trim() || !password.trim()) {
      setError("Please enter both username and password");
      console.log("Login validation failed: empty username or password");
      return;
    }

    try {
      setIsLoading(true);
      setError("");
      
      console.log(`Making API request to ${API_URL}/login`);
      console.log("Request payload:", { username, password: "***" });
      
      const response = await fetch(`${API_URL}/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          username,
          password,
        }),
      });

      console.log("Response status:", response.status);
      console.log("Response headers:", JSON.stringify(response.headers, null, 2));
      
      const data = await response.json();
      console.log("Response data:", JSON.stringify(data, null, 2));

      if (!response.ok) {
        console.log("Login failed with server error:", data.error);
        throw new Error(data.error || "Login failed");
      }

      // Store the auth token
      console.log("Login successful, storing auth token and user data");
      await AsyncStorage.setItem("authToken", data.token);
      await AsyncStorage.setItem("userData", JSON.stringify(data.user));
      
      // Navigate to home screen
      console.log("Navigating to Home screen");
      navigation.reset({
        index: 0,
        routes: [{ name: "Home" }],
      });
    } catch (err) {
      console.error("Login error:", err);
      console.log("Error type:", typeof err);
      console.log("Error details:", JSON.stringify(err, null, 2));
      setError(err instanceof Error ? err.message : "Login failed. Please try again.");
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

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

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
  errorText: {
    color: "#E74C3C",
    fontSize: 14,
    textAlign: "center",
    marginBottom: 15,
    fontFamily: "Inter-Regular",
  },
});