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
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { RootStackParamList } from "../navigation/AppNavigator";
import Navbar from "../NavBar";
import AuthService from "../onboarding/service/AuthService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { userService, UserProfile, UserProgress } from "./services/userService";
import { API_URL } from "../../constants/ApiConfig";

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
      loadUserData();
    }, [])
  );

  const loadUserData = async () => {
    try {
      setLoading(true);

      // Get username from AsyncStorage first for immediate display
      const storedUsername = await AsyncStorage.getItem("username");
      if (storedUsername) {
        setUsername(storedUsername);
      }

      // Try fetching user data with proper error handling
      let userInfo: UserProfile = {};
      let userProfile: UserProfile = {};

      try {
        userInfo = await userService.getUserInfo();
        //  Format date_joined to a more readable format e.g. "January 1, 2023"
        if (userInfo.date_joined) {
          userInfo.date_joined = new Date(userInfo.date_joined).toLocaleDateString();
        }
        console.log("User info data:", userInfo);
      } catch (infoError) {
        console.error("Error loading user info:", infoError);
        // Continue execution even if this fails
      }

      try {
        userProfile = await userService.getUserProfile();
        if (userProfile.date_joined) {
          // Format date_joined to a more readable format
          

        }
      } catch (profileError) {
        console.error("Error loading user profile:", profileError);
        // Continue execution even if this fails
      }

      const profile = { ...userInfo, ...userProfile };

      if (Object.keys(profile).length > 0) {
        setUserData(profile);

        // Format the date_joined to a more readable format
        if (profile.date_joined) {
          profile.date_joined = new Date(
            profile.date_joined
          ).toLocaleDateString();
        }

        // Update stored username if different
        if (profile.username && profile.username !== storedUsername) {
          await AsyncStorage.setItem("username", profile.username);
          setUsername(profile.username);
        }
      }

      // Fetch progress data with fallback
      const progressData = await userService.getUserProgress();
      setProgress(progressData);
      console.log("User progress data:", progressData);
    } catch (error) {
      console.error("Error loading user data:", error);
      Alert.alert(
        "Error",
        "Some profile data could not be loaded. Please try again later."
      );
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
    navigation.navigate('EditProfile');
  };

  const handleChangeProfilePicture = () => {
    Alert.alert('Change Profile Picture', 'This feature will be implemented soon!');
  };

  const handleClearCache = () => {
    Alert.alert(
      'Clear Cache',
      'This will clear app cache and temporary files. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Clear', style: 'destructive', onPress: () => {
          Alert.alert('Success', 'Cache cleared successfully!');
        }}
      ]
    );
  };

  const handleExportData = () => {
    Alert.alert('Export Data', 'Your data export will be available soon!');
  };

  const handleDeleteAccount = () => {
    Alert.alert(
      'Delete Account',
      'This action cannot be undone. All your data will be permanently deleted.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Delete', style: 'destructive', onPress: () => {
          Alert.alert('Account Deletion', 'This feature will be implemented with proper authentication.');
        }}
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
          <TouchableOpacity style={styles.logoutButton} onPress={handleLogout}>
            <MaterialIcons name="logout" size={24} color="#FF5722" />
          </TouchableOpacity>
        </View>

        <View style={styles.profileSection}>
          <View style={styles.profilePicContainer}>
            {userData?.profilePicture ? (
              <Image
                source={{
                  uri: userData.profilePicture.startsWith("http")
                    ? userData.profilePicture
                    : `${API_URL}${userData.profilePicture}`,
                }}
                style={styles.profilePic}
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
              {userData?.name || username || "User"}
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

          <TouchableOpacity style={styles.settingItem}>
            <View style={styles.settingLeft}>
              <MaterialIcons name="help" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Help & Support</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>

          <TouchableOpacity style={styles.settingItem}>
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
              <Text style={[styles.settingText, styles.dangerText]}>Delete Account</Text>
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
    backgroundColor: '#fff',
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 24,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  settingItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  settingLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  settingText: {
    marginLeft: 16,
    fontSize: 16,
    color: '#1E293B',
    fontFamily: 'Inter-Medium',
  },
  dangerItem: {
    borderWidth: 1,
    borderColor: '#ffebee',
  },
  dangerText: {
    color: '#FF5722',
  },
});

export default Profile;
