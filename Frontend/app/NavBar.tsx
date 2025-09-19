import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useRef, useEffect } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View, Platform } from "react-native";
import { useSafeAreaInsets, EdgeInsets } from "react-native-safe-area-context";
import { RootStackParamList } from "./navigation/AppNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface NavbarProps {
  activeRoute?: keyof RootStackParamList;
}

export default function Navbar({ activeRoute = "Home" }: NavbarProps) {
  const navigation = useNavigation<NavigationProp>();
  const currentInsets = useSafeAreaInsets();
  const stableInsets = useRef<EdgeInsets>(currentInsets);
  const isFirstRender = useRef(true);

  // Maintain stable bottom insets to prevent navigation bar transparency issues
  useEffect(() => {
    if (isFirstRender.current && currentInsets.bottom > 0) {
      stableInsets.current = currentInsets;
      isFirstRender.current = false;
    }
  }, [currentInsets]);

  // Calculate consistent bottom padding for Android navigation bar
  const safeBottomPadding = Platform.OS === 'android' 
    ? Math.max(stableInsets.current.bottom, 20) + 10 // Ensure minimum spacing above Android nav bar
    : stableInsets.current.bottom + 20; // iOS safe area + padding

  return (
    <View style={[styles.container, { bottom: safeBottomPadding }]}>
      <View style={styles.navbar}>
        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate("Home")}
        >
          <Ionicons
            name="home"
            size={24}
            color={activeRoute === "Home" ? "#AD00FF" : "#7F8C8D"}
          />
          <Text
            style={[
              styles.navText,
              activeRoute === "Home" && styles.activeNavText,
            ]}
          >
            Home
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate("ToDo")}
        >
          <Ionicons
            name="checkbox"
            size={24}
            color={activeRoute === "ToDo" ? "#AD00FF" : "#7F8C8D"}
          />
          <Text
            style={[
              styles.navText,
              activeRoute === "ToDo" && styles.activeNavText,
            ]}
          >
            To Do
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate("RINA")}
        >
          <Image
            source={require("../assets/images/1538298822.png")}
            style={[
              styles.chatbotIcon,
              activeRoute === "RINA" && styles.activeChatbotIcon,
            ]}
          />
          <Text
            style={[
              styles.navText,
              activeRoute === "RINA" && styles.activeNavText,
            ]}
          >
            RINA
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate("Notes")}
        >
          <Ionicons
            name="document-text"
            size={24}
            color={activeRoute === "Notes" ? "#AD00FF" : "#7F8C8D"}
          />
          <Text
            style={[
              styles.navText,
              activeRoute === "Notes" && styles.activeNavText,
            ]}
          >
            Notes
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.navItem}
          onPress={() => navigation.navigate("Profile")}
        >
          <Ionicons
            name="person-circle"
            size={24}
            color={activeRoute === "Profile" ? "#AD00FF" : "#7F8C8D"}
          />
          <Text
            style={[
              styles.navText,
              activeRoute === "Profile" && styles.activeNavText,
            ]}
          >
            Settings
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 16,
    zIndex: 1000, // Ensure navbar is always on top
    elevation: 10, // Android elevation
  },
  navbar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    backgroundColor: "#ffffffff",
    borderRadius: 30,
    paddingVertical: 12,
    width: "100%",
    maxWidth: 400,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4, // Increased shadow for better visibility
    },
    shadowOpacity: 0.15, // Slightly more opacity
    shadowRadius: 8, // Increased radius
    elevation: 8, // Increased elevation for Android
    borderWidth: 1,
    borderColor: "#f0f0f0",
  },
  navItem: {
    alignItems: "center",
    width: 60,
  },
  navText: {
    fontSize: 11,
    color: "#7F8C8D",
    fontFamily: "Inter-Regular",
    marginTop: 4,
  },
  activeNavText: {
    color: "#AD00FF",
    fontFamily: "Inter-Medium",
  },
  chatbotIcon: {
    width: 50,
    height: 30,
    tintColor: "#7F8C8D",
  },
  activeChatbotIcon: {
    tintColor: "#AD00FF",
  },
});
