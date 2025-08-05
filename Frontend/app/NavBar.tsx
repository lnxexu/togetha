import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { RootStackParamList } from "./navigation/AppNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface NavbarProps {
  activeRoute?: keyof RootStackParamList;
}

export default function Navbar({ activeRoute = "Home" }: NavbarProps) {
  const navigation = useNavigation<NavigationProp>();

  return (
    <View style={styles.container}>
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
            name="person"
            size={24}
            color={activeRoute === "Profile" ? "#AD00FF" : "#7F8C8D"}
          />
          <Text
            style={[
              styles.navText,
              activeRoute === "Profile" && styles.activeNavText,
            ]}
          >
            Profile
          </Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: "absolute",
    bottom: 20,
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: 16,
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
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
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
