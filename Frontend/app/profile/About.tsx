import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Image,
  Linking,
  Alert,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { RootStackParamList } from "../navigation/AppNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const About: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

  const teamMembers = [
    {
      name: "Development Team",
      role: "App Development & Design",
      description: "Creating innovative solutions for student productivity",
    },
    {
      name: "AI Research Team",
      role: "RINA AI Assistant",
      description: "Developing intelligent tutoring capabilities",
    },
    {
      name: "UX/UI Team",
      role: "User Experience Design",
      description: "Crafting intuitive and beautiful interfaces",
    },
  ];

  const features = [
    {
      icon: "note",
      title: "Smart Note-Taking",
      description: "Organize your thoughts with our advanced note-taking system",
    },
    {
      icon: "task-alt",
      title: "Task Management",
      description: "Stay on top of your assignments and deadlines",
    },
    {
      icon: "smart-toy",
      title: "AI Assistant (RINA)",
      description: "Get instant help with your studies and questions",
    },
    {
      icon: "cloud-sync",
      title: "Cloud Sync",
      description: "Access your data anywhere, anytime",
    },
    {
      icon: "analytics",
      title: "Progress Tracking",
      description: "Monitor your academic journey and achievements",
    },
    {
      icon: "security",
      title: "Secure & Private",
      description: "Your data is protected with enterprise-grade security",
    },
  ];

  const handleLinkPress = (url: string, title: string) => {
    Alert.alert(
      title,
      "This link will be available in a future update.",
      [{ text: "OK" }]
    );
  };

  const handleFeedback = () => {
    const email = "feedback@togetha.app";
    const subject = "Feedback for Togetha App";
    const body = "I'd like to share my feedback about the app...";
    
    Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={["#A855F7", "#8B5CF6", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>About Togetha</Text>
          <View style={styles.placeholder} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* App Info */}
        <View style={styles.section}>
          <View style={styles.appLogoContainer}>
            <View style={styles.appLogo}>
              <Text style={styles.appLogoText}>T</Text>
            </View>
            <Text style={styles.appName}>Togetha</Text>
            <Text style={styles.appVersion}>Version 1.0.0</Text>
            <Text style={styles.appBuild}>Build 2024.1</Text>
          </View>
        </View>

        {/* Mission Statement */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Our Mission</Text>
          <View style={styles.missionCard}>
            <Text style={styles.missionText}>
              Togetha is designed to empower students in their academic journey by providing a comprehensive suite of tools for note-taking, task management, and AI-powered assistance. We believe that education should be accessible, organized, and enhanced by technology.
            </Text>
            <Text style={styles.missionSubtext}>
              "Together, we learn better" - that's the philosophy behind Togetha.
            </Text>
          </View>
        </View>

        {/* Key Features */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Key Features</Text>
          <View style={styles.featuresGrid}>
            {features.map((feature, index) => (
              <View key={index} style={styles.featureCard}>
                <View style={styles.featureIcon}>
                  <MaterialIcons
                    name={feature.icon as any}
                    size={24}
                    color="#6A009C"
                  />
                </View>
                <Text style={styles.featureTitle}>{feature.title}</Text>
                <Text style={styles.featureDescription}>
                  {feature.description}
                </Text>
              </View>
            ))}
          </View>
        </View>

        {/* Team */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Our Team</Text>
          <View style={styles.teamContainer}>
            {teamMembers.map((member, index) => (
              <View key={index} style={styles.teamCard}>
                <View style={styles.teamAvatar}>
                  <MaterialIcons name="group" size={24} color="#6A009C" />
                </View>
                <View style={styles.teamInfo}>
                  <Text style={styles.teamName}>{member.name}</Text>
                  <Text style={styles.teamRole}>{member.role}</Text>
                  <Text style={styles.teamDescription}>
                    {member.description}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        {/* Technology Stack */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Built With</Text>
          <View style={styles.techStack}>
            <View style={styles.techItem}>
              <MaterialIcons name="phone-android" size={20} color="#6A009C" />
              <Text style={styles.techText}>React Native</Text>
            </View>
            <View style={styles.techItem}>
              <MaterialIcons name="code" size={20} color="#6A009C" />
              <Text style={styles.techText}>TypeScript</Text>
            </View>
            <View style={styles.techItem}>
              <MaterialIcons name="storage" size={20} color="#6A009C" />
              <Text style={styles.techText}>Django Backend</Text>
            </View>
            <View style={styles.techItem}>
              <MaterialIcons name="cloud" size={20} color="#6A009C" />
              <Text style={styles.techText}>Cloud Infrastructure</Text>
            </View>
            <View style={styles.techItem}>
              <MaterialIcons name="psychology" size={20} color="#6A009C" />
              <Text style={styles.techText}>AI/ML Integration</Text>
            </View>
            <View style={styles.techItem}>
              <MaterialIcons name="security" size={20} color="#6A009C" />
              <Text style={styles.techText}>Enterprise Security</Text>
            </View>
          </View>
        </View>

        {/* Contact & Social */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Connect With Us</Text>
          <View style={styles.contactSection}>
            <TouchableOpacity
              style={styles.contactButton}
              onPress={handleFeedback}
            >
              <MaterialIcons name="feedback" size={20} color="#fff" />
              <Text style={styles.contactButtonText}>Send Feedback</Text>
            </TouchableOpacity>

            <View style={styles.socialLinks}>
              <TouchableOpacity
                style={styles.socialButton}
                onPress={() => handleLinkPress("https://togetha.app", "Website")}
              >
                <MaterialIcons name="language" size={24} color="#6A009C" />
                <Text style={styles.socialText}>Website</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.socialButton}
                onPress={() => handleLinkPress("https://twitter.com/togethaapp", "Twitter")}
              >
                <MaterialIcons name="alternate-email" size={24} color="#6A009C" />
                <Text style={styles.socialText}>Twitter</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.socialButton}
                onPress={() => handleLinkPress("https://instagram.com/togethaapp", "Instagram")}
              >
                <MaterialIcons name="camera-alt" size={24} color="#6A009C" />
                <Text style={styles.socialText}>Instagram</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>

        {/* Legal & Privacy */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Legal & Privacy</Text>
          <View style={styles.legalContainer}>
            <TouchableOpacity
              style={styles.legalItem}
              onPress={() => handleLinkPress("privacy", "Privacy Policy")}
            >
              <MaterialIcons name="privacy-tip" size={20} color="#6A009C" />
              <Text style={styles.legalText}>Privacy Policy</Text>
              <MaterialIcons name="chevron-right" size={20} color="#6c757d" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.legalItem}
              onPress={() => handleLinkPress("terms", "Terms of Service")}
            >
              <MaterialIcons name="description" size={20} color="#6A009C" />
              <Text style={styles.legalText}>Terms of Service</Text>
              <MaterialIcons name="chevron-right" size={20} color="#6c757d" />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.legalItem}
              onPress={() => handleLinkPress("licenses", "Open Source Licenses")}
            >
              <MaterialIcons name="article" size={20} color="#6A009C" />
              <Text style={styles.legalText}>Open Source Licenses</Text>
              <MaterialIcons name="chevron-right" size={20} color="#6c757d" />
            </TouchableOpacity>
          </View>
        </View>

        {/* App Info */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>App Information</Text>
          <View style={styles.infoContainer}>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Release Date</Text>
              <Text style={styles.infoValue}>December 2024</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Last Updated</Text>
              <Text style={styles.infoValue}>December 15, 2024</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Size</Text>
              <Text style={styles.infoValue}>45.2 MB</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Compatibility</Text>
              <Text style={styles.infoValue}>iOS 13.0+, Android 8.0+</Text>
            </View>
            <View style={styles.infoItem}>
              <Text style={styles.infoLabel}>Languages</Text>
              <Text style={styles.infoValue}>English, Tagalog</Text>
            </View>
          </View>
        </View>

        {/* Copyright */}
        <View style={styles.copyrightSection}>
          <Text style={styles.copyrightText}>
            © 2024 Togetha. All rights reserved.
          </Text>
          <Text style={styles.copyrightSubtext}>
            Made with ❤️ for students everywhere
          </Text>
        </View>

        <View style={styles.bottomPadding} />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 50 : 35,
    paddingBottom: 20,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    padding: 8,
  },
  headerTitle: {
    fontSize: 24,
    color: "#FFFFFF",
    fontFamily: "Inter-Bold",
    textAlign: "center",
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,
  },
  section: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 20,
    color: "#1E293B",
    fontFamily: "Inter-Bold",
    marginBottom: 16,
  },
  appLogoContainer: {
    alignItems: "center",
    paddingVertical: 20,
  },
  appLogo: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#6A009C",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  appLogoText: {
    fontSize: 36,
    color: "#FFFFFF",
    fontFamily: "Inter-Bold",
  },
  appName: {
    fontSize: 28,
    color: "#1E293B",
    fontFamily: "Inter-Bold",
    marginBottom: 4,
  },
  appVersion: {
    fontSize: 16,
    color: "#6c757d",
    fontFamily: "Inter-Medium",
    marginBottom: 2,
  },
  appBuild: {
    fontSize: 14,
    color: "#adb5bd",
    fontFamily: "Inter-Regular",
  },
  missionCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  missionText: {
    fontSize: 16,
    color: "#1E293B",
    fontFamily: "Inter-Regular",
    lineHeight: 24,
    marginBottom: 16,
  },
  missionSubtext: {
    fontSize: 14,
    color: "#6A009C",
    fontFamily: "Inter-SemiBold",
    fontStyle: "italic",
    textAlign: "center",
  },
  featuresGrid: {
    gap: 12,
  },
  featureCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  featureIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "#f0e6ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  featureTitle: {
    fontSize: 16,
    color: "#1E293B",
    fontFamily: "Inter-SemiBold",
    marginBottom: 4,
    flex: 1,
  },
  featureDescription: {
    fontSize: 14,
    color: "#6c757d",
    fontFamily: "Inter-Regular",
    lineHeight: 18,
    flex: 2,
  },
  teamContainer: {
    gap: 16,
  },
  teamCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  teamAvatar: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f0e6ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  teamInfo: {
    flex: 1,
  },
  teamName: {
    fontSize: 16,
    color: "#1E293B",
    fontFamily: "Inter-SemiBold",
    marginBottom: 4,
  },
  teamRole: {
    fontSize: 14,
    color: "#6A009C",
    fontFamily: "Inter-Medium",
    marginBottom: 4,
  },
  teamDescription: {
    fontSize: 14,
    color: "#6c757d",
    fontFamily: "Inter-Regular",
    lineHeight: 18,
  },
  techStack: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  techItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8f9fa",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    gap: 6,
  },
  techText: {
    fontSize: 14,
    color: "#1E293B",
    fontFamily: "Inter-Medium",
  },
  contactSection: {
    alignItems: "center",
    gap: 20,
  },
  contactButton: {
    backgroundColor: "#6A009C",
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  contactButtonText: {
    color: "#fff",
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
  },
  socialLinks: {
    flexDirection: "row",
    gap: 24,
  },
  socialButton: {
    alignItems: "center",
    gap: 8,
  },
  socialText: {
    fontSize: 14,
    color: "#6A009C",
    fontFamily: "Inter-Medium",
  },
  legalContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  legalItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f8f9fa",
  },
  legalText: {
    flex: 1,
    fontSize: 16,
    color: "#1E293B",
    fontFamily: "Inter-Regular",
    marginLeft: 12,
  },
  infoContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    gap: 12,
  },
  infoItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  infoLabel: {
    fontSize: 14,
    color: "#6c757d",
    fontFamily: "Inter-Regular",
  },
  infoValue: {
    fontSize: 14,
    color: "#1E293B",
    fontFamily: "Inter-Medium",
  },
  copyrightSection: {
    alignItems: "center",
    paddingVertical: 20,
    marginTop: 20,
  },
  copyrightText: {
    fontSize: 14,
    color: "#6c757d",
    fontFamily: "Inter-Regular",
    marginBottom: 4,
  },
  copyrightSubtext: {
    fontSize: 12,
    color: "#adb5bd",
    fontFamily: "Inter-Regular",
  },
  bottomPadding: {
    height: 20,
  },
});

export default About;
