import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Platform,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { RootStackParamList } from "../navigation/AppNavigator";
import Navbar from "../NavBar";
import AuthService from "../onboarding/service/AuthService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { userService, UserProfile, UserProgress } from "./services/userService";
import { API_URL } from "../../constants/ApiConfig";
import * as ImagePicker from "expo-image-picker";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const Profile: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [progress, setProgress] = useState<UserProgress | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [username, setUsername] = useState<string>("");

  // Load user data when screen is focused
  useFocusEffect(
    useCallback(() => {
      setUserData(null);
      loadUserData();
      return () => {};
    }, [])
  );

  const loadUserData = async () => {
    try {
      setLoading(true);

      // Clear cache before fetching new data
      await userService.clearProfileCache();

      // Get fresh data from the server
      const userInfo = await userService.getUserInfo(true);
      // Combine profile data
      const profile = { ...userInfo };

      if (Object.keys(profile).length > 0) {
        // Format dates if needed
        if (profile.date_joined) {
          profile.date_joined = new Date(
            profile.date_joined
          ).toLocaleDateString();
        }

        // Update state
        setUserData(profile);
        setUsername(profile.username || "");

        // Update AsyncStorage with new values
        await AsyncStorage.setItem("username", profile.username || "");
      }

      // Fetch progress data
      const progressData = await userService.getUserProgress();
      setProgress(progressData);
    } catch (error) {
      console.error("Error loading user data:", error);
      Alert.alert("Error", "Failed to load profile data. Please try again.");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  const onRefresh = () => {
    setRefreshing(true);
    loadUserData();
  };

  const handleLogout = () => {
    // Add a confirmation dialog before logout
    Alert.alert(
      "Logout",
      "Are you sure you want to logout?",
      [
        {
          text: "Cancel",
          style: "cancel",
        },
        {
          text: "Logout",
          onPress: handleLogoutConfirmed,
          style: "destructive",
        },
      ],
      { cancelable: true }
    );
  };

  const handleLogoutConfirmed = async () => {
    try {
      await AuthService.getInstance().logout();
      await AsyncStorage.removeItem("username");
      navigation.reset({
        index: 0,
        routes: [{ name: "Login" }],
      });
    } catch (error) {
      console.error("Logout error:", error);
      alert("Failed to logout. Please try again.");
    }
  };

  const handleManageProfile = () => {
    navigation.navigate("ManageProfile");
  };

  if (loading && !userData) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6A009C" />
          <Text style={styles.loadingText}>Loading profile...</Text>
        </View>
        <Navbar activeRoute="Profile" />
      </View>
    );
  }

  const progressData = [
    {
      title: "Tasks Completed",
      value: progress?.tasksCompleted || 0,
      icon: "check-circle",
      color: "#4CAF50",
      description: "Total tasks completed this month",
    },
    {
      title: "Notes Created",
      value: progress?.notesCreated || 0,
      icon: "note",
      color: "#2196F3",
      description: "Notes created this month",
    },
  ];

  const handleEditProfile = () => {
    navigation.navigate("EditProfile");
  };

  const handleChangeProfilePicture = async () => {
    try {
      // Request permission to access the photo library
      const { status } =
        await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (status !== "granted") {
        Alert.alert(
          "Permission Required",
          "Please allow access to your photo library to change your profile picture."
        );
        return;
      }

      // Launch the image picker
      const result = await ImagePicker.launchImageLibraryAsync({
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.7,
      });

      if (!result.canceled && result.assets && result.assets.length > 0) {
        const selectedImage = result.assets[0];

        // Create form data
        const formData = new FormData();
        formData.append("profile_picture", {
          uri: selectedImage.uri,
          name: selectedImage.fileName || "profile-picture.jpg",
          type: "image/jpeg",
        } as any);

        // Upload the image
        const updatedProfile = await userService.updateProfilePicture(formData);

        // Update local state
        setUserData((prev) =>
          prev
            ? {
                ...prev,
                profile: {
                  ...prev.profile,
                  profile_picture: updatedProfile.profile?.profile_picture,
                },
              }
            : prev
        );

        // Store in AsyncStorage for persistence
        await AsyncStorage.setItem(
          "userProfilePicture",
          updatedProfile.profile?.profile_picture ?? ""
        );

        Alert.alert("Success", "Profile picture updated successfully!");
      }
    } catch (error) {
      console.error("Error changing profile picture:", error);
      Alert.alert(
        "Error",
        "Failed to update profile picture. Please try again."
      );
    }
  };

  const handleClearCache = () => {
    Alert.alert(
      "Clear Cache",
      "This will clear app cache and temporary files. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: () => {
            Alert.alert("Success", "Cache cleared successfully!");
          },
        },
      ]
    );
  };

  const handleExportData = () => {
    Alert.alert("Export Data", "Your data export will be available soon!");
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      "Delete Account",
      "This action cannot be undone. All your data will be permanently deleted.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            Alert.alert(
              "Account Deletion",
              "This feature will be implemented with proper authentication."
            );
          },
        },
      ]
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
        <View style={styles.headerTop}>
          <View style={styles.titleSection}>
            <Text style={styles.settingsTitle}>Settings</Text>
          </View>
          <TouchableOpacity
            style={styles.menuItem}
            onPress={() => navigation.navigate("Logs")}
          >
            <View style={styles.menuItemIcon}>
              <MaterialIcons name="history" size={24} color="#ffffffff" />
            </View>
          </TouchableOpacity>
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <MaterialIcons name="logout" size={24} color="#FF5722" />
          </TouchableOpacity>
        </View>

        <View style={styles.profileSection}>
          <View style={styles.profilePicContainer}>
            {userData?.profile?.profile_picture ? (
              <Image
                source={{ uri: `${API_URL}${userData.profile.profile_picture}` }}
                style={styles.profilePic}
                resizeMode="cover"
              />
            ) : (
              <View style={styles.defaultProfilePic}>
                <Text style={styles.avatarText}>
                  {username ? username.charAt(0).toUpperCase() : "U"}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.userInfo}>
            <Text style={styles.userName}>
              {userData?.profile?.full_name || username || "User"}
            </Text>
            <Text style={styles.userUsername}>@{username || "username"}</Text>
            <Text style={styles.joinDate}>
              Member since {userData?.date_joined || "N/A"}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* Content */}
      <ScrollView
        style={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={["#6A009C"]}
          />
        }
      >
        <View style={styles.progressHeader}>
          <Text style={styles.sectionTitle}>Your Progress</Text>
        </View>

        <View style={styles.progressContainer}>
          {progressData.map((item, index) => (
            <View key={index} style={styles.progressCard}>
              <View style={styles.progressHeader}>
                <View
                  style={[
                    styles.iconContainer,
                    { backgroundColor: `${item.color}20` },
                  ]}
                >
                  <MaterialIcons
                    name={item.icon as any}
                    size={24}
                    color={item.color}
                  />
                </View>
                <View style={styles.progressInfo}>
                  <Text style={styles.progressTitle}>{item.title}</Text>
                  <Text style={styles.progressDescription}>
                    {item.description}
                  </Text>
                </View>
              </View>
              <Text style={[styles.progressValue, { color: item.color }]}>
                {item.value}
              </Text>
            </View>
          ))}
        </View>

        {/* Profile Management */}
        <Text style={styles.sectionTitle}>Profile Management</Text>

        <View style={styles.settingsContainer}>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleEditProfile}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="edit" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Edit Profile</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleChangeProfilePicture}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="photo-camera" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Change Profile Picture</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>
        </View>

        {/* Account Settings */}
        <Text style={styles.sectionTitle}>Account Settings</Text>

        <View style={styles.settingsContainer}>
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="notifications" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Notifications</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="security" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Privacy & Security</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="lock" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Change Password</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>
        </View>

        {/* App Settings */}
        <Text style={styles.sectionTitle}>App Settings</Text>

        <View style={styles.settingsContainer}>
          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="language" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Language</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="dark-mode" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Theme</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => navigation.navigate("Logs")}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="history" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Activity Logs</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleClearCache}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="clear-all" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Clear Cache</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>
        </View>

        {/* Data & Support */}
        <Text style={styles.sectionTitle}>Data & Support</Text>

        <View style={styles.settingsContainer}>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleExportData}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="download" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Export Data</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.settingItem}
            onPress={() => navigation.navigate("HelpSupport")}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="help" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Help & Support</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.settingItem}
            onPress={() => navigation.navigate("About")}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="info" size={24} color="#6A009C" />
              <Text style={styles.settingText}>About</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>
        </View>

        {/* Danger Zone */}
        <Text style={styles.sectionTitle}>Danger Zone</Text>

        <View style={styles.settingsContainer}>
          <TouchableOpacity
            style={[styles.settingItem, styles.dangerItem]}
            onPress={handleDeleteAccount}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="delete-forever" size={24} color="#FF5722" />
              <Text style={[styles.settingText, styles.dangerText]}>
                Delete Account
              </Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#FF5722" />
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Navbar activeRoute="Profile" />
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
  headerTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 20,
  },
  titleSection: {
    flex: 1,
  },
  settingsTitle: {
    fontSize: 32,
    color: "#FFFFFF",
    fontFamily: "Lexend",
  },

  logoutButton: {
    flexDirection: "row",
    alignItems: "center",

    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: "#FF5722",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },

  profileSection: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
  },
  profilePicContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    overflow: "hidden",
  },
  profilePic: {
    width: "100%",
    height: "100%",
    borderRadius: 40,
  },
  defaultProfilePic: {
    width: "100%",
    height: "100%",
    borderRadius: 40,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  userInfo: {
    flex: 1,
  },
  userName: {
    fontSize: 24,
    color: "#FFFFFF",
    fontFamily: "Inter-Bold",
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.8)",
    fontFamily: "Inter-Medium",
    marginBottom: 2,
  },
  joinDate: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.7)",
    fontFamily: "Inter-Regular",
  },

  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 20,

    marginBottom: 100, // Adjusted for Navbar height
  },
  sectionTitle: {
    fontSize: 20,
    color: "#1E293B",
    fontFamily: "Inter-Bold",
    marginBottom: 16,
    marginTop: 8,
  },
  progressContainer: {
    gap: 12,
    marginBottom: 32,
  },
  progressCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  progressHeader: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  progressInfo: {
    flex: 1,
  },
  progressTitle: {
    fontSize: 16,
    color: "#1E293B",
    fontFamily: "Inter-SemiBold",
    marginBottom: 4,
  },
  progressDescription: {
    fontSize: 14,
    color: "#6c757d",
    fontFamily: "Inter-Regular",
  },
  progressValue: {
    fontSize: 28,
    fontFamily: "Inter-Bold",
  },
  quickActionsContainer: {
    gap: 12,
    marginBottom: 32,
  },
  quickActionCard: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 20,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  quickActionIcon: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: "#f0e6ff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  quickActionTitle: {
    fontSize: 18,
    color: "#1E293B",
    fontFamily: "Inter-Bold",
    marginBottom: 4,
    flex: 1,
  },
  quickActionDescription: {
    fontSize: 14,
    color: "#6c757d",
    fontFamily: "Inter-Regular",
    flex: 2,
    marginRight: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 18,
    color: "#6A009C",
    fontFamily: "Inter-Medium",
  },
  lastUpdatedText: {
    fontSize: 12,
    color: "#adb5bd",
    fontFamily: "Inter-Regular",
  },
  avatarText: {
    fontSize: 36,
    color: "#6A009C",
    fontFamily: "Inter-Bold",
  },
  userUsername: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.8)",
    fontFamily: "Inter-Medium",
    marginBottom: 2,
  },
  settingsContainer: {
    backgroundColor: "#fff",
    borderRadius: 16,
    overflow: "hidden",
    marginBottom: 24,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  settingItem: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f8f9fa",
  },
  settingLeft: {
    flexDirection: "row",
    alignItems: "center",
  },
  settingText: {
    marginLeft: 16,
    fontSize: 16,
    color: "#1E293B",
    fontFamily: "Inter-Medium",
  },
  dangerItem: {
    borderWidth: 1,
    borderColor: "#ffebee",
  },
  dangerText: {
    color: "#FF5722",
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 7,
    paddingHorizontal: 16,

  },
  menuItemIcon: {
    width: 24,
    height: 24,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  menuItemText: {
    fontSize: 16,
    color: "#1E293B",
    fontFamily: "Inter-Regular",
  },
});

export default Profile;
