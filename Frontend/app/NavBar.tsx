import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { RootStackParamList } from "./navigation/AppNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface NavbarProps {
  activeRoute?: keyof RootStackParamList;
  // Optional callback so parent can measure navbar height and position elements above it
  onLayoutHeight?: (height: number) => void;
}

export default function Navbar({ activeRoute = "Home", onLayoutHeight }: NavbarProps) {
  const navigation = useNavigation<NavigationProp>();
  const insets = useSafeAreaInsets();

  return (
    <View
      onLayout={(e) => {
        if (typeof onLayoutHeight === "function") {
          onLayoutHeight(e.nativeEvent.layout.height);
        }
      }}
      style={[
        styles.container,
        { paddingBottom: insets.bottom },
      ]}
    >
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
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    // Consistent clean appearance - no shadows
  },
  navbar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 16,
    paddingHorizontal: 16,
  },
  navItem: {
    alignItems: "center",
    flex: 1,
    paddingVertical: 8,
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
    width: 34,
    height: 34,
    tintColor: "#7F8C8D",
    alignSelf: "center",
  },
  activeChatbotIcon: {
    tintColor: "#AD00FF",
  },
});
