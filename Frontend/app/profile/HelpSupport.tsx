import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Platform,
  Alert,
  Linking,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { RootStackParamList } from "../navigation/AppNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const HelpSupport: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

  const helpSections = [
    {
      title: "Getting Started",
      items: [
        { title: "How to create your first note", icon: "note-add" },
        { title: "Setting up tasks and reminders", icon: "task" },
        { title: "Using the AI chatbot (RINA)", icon: "smart-toy" },
        { title: "Organizing your workspace", icon: "folder" },
      ],
    },
    {
      title: "Features Guide",
      items: [
        { title: "Note-taking and formatting", icon: "edit" },
        { title: "Task management system", icon: "check-circle" },
        { title: "PDF import and annotation", icon: "picture-as-pdf" },
        { title: "Progress tracking", icon: "trending-up" },
      ],
    },
    {
      title: "Account & Settings",
      items: [
        { title: "Managing your profile", icon: "person" },
        { title: "Privacy and security", icon: "security" },
        { title: "Notification settings", icon: "notifications" },
        { title: "Data backup and sync", icon: "cloud" },
      ],
    },
    {
      title: "Troubleshooting",
      items: [
        { title: "App crashes or freezes", icon: "warning" },
        { title: "Login and authentication issues", icon: "login" },
        { title: "Sync problems", icon: "sync-problem" },
        { title: "Performance optimization", icon: "speed" },
      ],
    },
  ];

  const contactOptions = [
    {
      title: "Email Support",
      description: "Get help via email within 24 hours",
      icon: "email",
      action: () => handleEmailSupport(),
    },
    {
      title: "Live Chat",
      description: "Chat with our support team",
      icon: "chat",
      action: () => handleLiveChat(),
    },
    {
      title: "Community Forum",
      description: "Connect with other users",
      icon: "forum",
      action: () => handleCommunityForum(),
    },
    {
      title: "Video Tutorials",
      description: "Watch step-by-step guides",
      icon: "play-circle-filled",
      action: () => handleVideoTutorials(),
    },
  ];

  const faqItems = [
    {
      question: "How do I sync my data across devices?",
      answer: "Your data is automatically synced when you're logged in to your account. Make sure you have an internet connection and are using the same account on all devices.",
    },
    {
      question: "Can I export my notes and tasks?",
      answer: "Yes! Go to Profile > Settings > Data & Support > Export Data to download your information in various formats.",
    },
    {
      question: "How does the AI chatbot work?",
      answer: "RINA is our AI assistant that can help you with study questions, task organization, and provide academic support. Simply type your questions in the chat interface.",
    },
    {
      question: "Is my data secure?",
      answer: "We use enterprise-grade encryption to protect your data. All information is stored securely and we never share your personal data with third parties.",
    },
    {
      question: "How do I reset my password?",
      answer: "On the login screen, tap 'Forgot Password' and follow the instructions sent to your email address.",
    },
  ];

  const handleEmailSupport = () => {
    const email = "support@togetha.app";
    const subject = "Help Request - Togetha App";
    const body = "Please describe your issue here...";
    
    Linking.openURL(`mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`);
  };

  const handleLiveChat = () => {
    Alert.alert(
      "Live Chat",
      "Live chat feature will be available soon! For now, please use email support.",
      [{ text: "OK" }]
    );
  };

  const handleCommunityForum = () => {
    Alert.alert(
      "Community Forum",
      "Community forum will be available in the next update!",
      [{ text: "OK" }]
    );
  };

  const handleVideoTutorials = () => {
    Alert.alert(
      "Video Tutorials",
      "Video tutorials are coming soon! Check back in future updates.",
      [{ text: "OK" }]
    );
  };

  const handleHelpItemPress = (item: { title: string; icon: string }) => {
    Alert.alert(
      item.title,
      "This help article will be available in a future update. For immediate assistance, please contact our support team.",
      [{ text: "OK" }]
    );
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
          <Text style={styles.headerTitle}>Help & Support</Text>
          <View style={styles.placeholder} />
        </View>
      </LinearGradient>

      <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
        {/* Quick Contact */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Need Immediate Help?</Text>
          <View style={styles.contactGrid}>
            {contactOptions.map((option, index) => (
              <TouchableOpacity
                key={index}
                style={styles.contactCard}
                onPress={option.action}
              >
                <View style={styles.contactIcon}>
                  <MaterialIcons
                    name={option.icon as any}
                    size={24}
                    color="#6A009C"
                  />
                </View>
                <Text style={styles.contactTitle}>{option.title}</Text>
                <Text style={styles.contactDescription}>
                  {option.description}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Help Topics */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Help Topics</Text>
          {helpSections.map((section, sectionIndex) => (
            <View key={sectionIndex} style={styles.helpSection}>
              <Text style={styles.helpSectionTitle}>{section.title}</Text>
              <View style={styles.helpItems}>
                {section.items.map((item, itemIndex) => (
                  <TouchableOpacity
                    key={itemIndex}
                    style={styles.helpItem}
                    onPress={() => handleHelpItemPress(item)}
                  >
                    <MaterialIcons
                      name={item.icon as any}
                      size={20}
                      color="#6A009C"
                    />
                    <Text style={styles.helpItemText}>{item.title}</Text>
                    <MaterialIcons
                      name="chevron-right"
                      size={20}
                      color="#6c757d"
                    />
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          ))}
        </View>

        {/* Frequently Asked Questions */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Frequently Asked Questions</Text>
          <View style={styles.faqContainer}>
            {faqItems.map((faq, index) => (
              <View key={index} style={styles.faqItem}>
                <Text style={styles.faqQuestion}>{faq.question}</Text>
                <Text style={styles.faqAnswer}>{faq.answer}</Text>
              </View>
            ))}
          </View>
        </View>

        {/* Contact Information */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Contact Information</Text>
          <View style={styles.contactInfo}>
            <View style={styles.contactInfoItem}>
              <MaterialIcons name="email" size={20} color="#6A009C" />
              <Text style={styles.contactInfoText}>support@togetha.app</Text>
            </View>
            <View style={styles.contactInfoItem}>
              <MaterialIcons name="access-time" size={20} color="#6A009C" />
              <Text style={styles.contactInfoText}>
                Support Hours: 9 AM - 6 PM (Mon-Fri)
              </Text>
            </View>
            <View style={styles.contactInfoItem}>
              <MaterialIcons name="language" size={20} color="#6A009C" />
              <Text style={styles.contactInfoText}>
                Available in English, Tagalog
              </Text>
            </View>
          </View>
        </View>

        {/* Additional Resources */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Additional Resources</Text>
          <View style={styles.resourcesContainer}>
            <TouchableOpacity style={styles.resourceItem}>
              <MaterialIcons name="school" size={24} color="#6A009C" />
              <View style={styles.resourceContent}>
                <Text style={styles.resourceTitle}>Study Tips & Guides</Text>
                <Text style={styles.resourceDescription}>
                  Improve your study efficiency with our curated guides
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#6c757d" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.resourceItem}>
              <MaterialIcons name="update" size={24} color="#6A009C" />
              <View style={styles.resourceContent}>
                <Text style={styles.resourceTitle}>What's New</Text>
                <Text style={styles.resourceDescription}>
                  Latest features and updates
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#6c757d" />
            </TouchableOpacity>

            <TouchableOpacity style={styles.resourceItem}>
              <MaterialIcons name="feedback" size={24} color="#6A009C" />
              <View style={styles.resourceContent}>
                <Text style={styles.resourceTitle}>Send Feedback</Text>
                <Text style={styles.resourceDescription}>
                  Help us improve Togetha
                </Text>
              </View>
              <MaterialIcons name="chevron-right" size={20} color="#6c757d" />
            </TouchableOpacity>
          </View>
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
  contactGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },
  contactCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    width: "48%",
    alignItems: "center",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  contactIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: "#f0e6ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  contactTitle: {
    fontSize: 14,
    color: "#1E293B",
    fontFamily: "Inter-SemiBold",
    textAlign: "center",
    marginBottom: 4,
  },
  contactDescription: {
    fontSize: 12,
    color: "#6c757d",
    fontFamily: "Inter-Regular",
    textAlign: "center",
  },
  helpSection: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  helpSectionTitle: {
    fontSize: 16,
    color: "#1E293B",
    fontFamily: "Inter-SemiBold",
    marginBottom: 12,
  },
  helpItems: {
    gap: 8,
  },
  helpItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: "#f8f9fa",
  },
  helpItemText: {
    flex: 1,
    fontSize: 14,
    color: "#1E293B",
    fontFamily: "Inter-Regular",
    marginLeft: 12,
  },
  faqContainer: {
    gap: 16,
  },
  faqItem: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  faqQuestion: {
    fontSize: 16,
    color: "#1E293B",
    fontFamily: "Inter-SemiBold",
    marginBottom: 8,
  },
  faqAnswer: {
    fontSize: 14,
    color: "#6c757d",
    fontFamily: "Inter-Regular",
    lineHeight: 20,
  },
  contactInfo: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    gap: 12,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  contactInfoItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  contactInfoText: {
    fontSize: 14,
    color: "#1E293B",
    fontFamily: "Inter-Regular",
  },
  resourcesContainer: {
    gap: 12,
  },
  resourceItem: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 16,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  resourceContent: {
    flex: 1,
    marginLeft: 12,
  },
  resourceTitle: {
    fontSize: 16,
    color: "#1E293B",
    fontFamily: "Inter-SemiBold",
    marginBottom: 4,
  },
  resourceDescription: {
    fontSize: 14,
    color: "#6c757d",
    fontFamily: "Inter-Regular",
  },
  bottomPadding: {
    height: 20,
  },
});

export default HelpSupport;
