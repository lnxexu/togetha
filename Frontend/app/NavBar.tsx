import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useEffect, useRef, useState } from "react";
import { Image, StyleSheet, Text, TouchableOpacity, View, Animated, Easing, Dimensions } from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
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

  // Animated horizontal shimmer to create a subtle 'liquid' moving background
  const { width } = Dimensions.get('window');
  const gradientWidth = width * 2; // make it wide so sliding looks continuous
  const translate = useRef(new Animated.Value(0)).current;
  // Animated version of LinearGradient so we can animate its translateX
  const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(translate, {
          toValue: -width,
          duration: 7000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.timing(translate, {
          toValue: 0,
          duration: 7000,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
      ])
    );

    loop.start();
    return () => loop.stop();
  }, [translate, width]);

  const [navHeight, setNavHeight] = useState<number>(0);

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
      {/* animated gradient behind the navbar */}
      <Animated.View
        pointerEvents="none"
        style={[
          styles.gradientWrapper,
          { height: (navHeight || 64) + insets.bottom, width: '100%' },
        ]}
      >
        <AnimatedLinearGradient
          colors={["#667eea", "#764ba2", "#f093fb"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[
            styles.gradient,
            { width: gradientWidth, transform: [{ translateX: translate }] },
          ]}
        />
      </Animated.View>

      <View
        style={styles.navbar}
        onLayout={(e) => {
          const h = e.nativeEvent.layout.height;
          if (h && h !== navHeight) setNavHeight(h);
        }}
      >
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
    backgroundColor: "transparent",
    borderTopWidth: 1,
    borderTopColor: "#E5E7EB",
    // Consistent clean appearance - no shadows
  },
  navbar: {
    flexDirection: "row",
    justifyContent: "space-around",
    alignItems: "center",
    paddingVertical: 5,
    paddingHorizontal: 16,
    backgroundColor: "rgba(255,255,255,0.85)", // slightly translucent so gradient peeks through
    zIndex: 1,
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
  gradientWrapper: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    overflow: 'hidden',
    zIndex: 0,
  },
  gradient: {
    height: '100%',
  },
});
