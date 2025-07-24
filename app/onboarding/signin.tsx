import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React from "react";
import {
  Image,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import LoginIllustration from "../../assets/illustrations/undraw_access-account_aydp (1).svg";
import type { RootStackParamList } from "../navigation/AppNavigator";

export default function SignIn() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();

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
            name="email"
            size={24}
            color="#7F8C8D"
            style={styles.inputIcon}
          />
          <TextInput
            style={styles.input}
            placeholder="Enter your email or username"
            placeholderTextColor="#7F8C8D"
            autoCapitalize="none"
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
          />
        </View>

        <TouchableOpacity onPress={() => {}}>
          <Text style={styles.forgotPassword}>Forgot Password?</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.signInButton}
          onPress={() => navigation.navigate("Home")}
        >
          <Text style={styles.buttonText}>Log in</Text>
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
    paddingVertical: 15, // Add this line
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
