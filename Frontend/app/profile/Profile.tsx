import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  ScrollView,
  Platform,
  Animated,   
  Alert,
  RefreshControl,
  ActivityIndicator,
  StatusBar,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { LinearGradient } from "expo-linear-gradient";
import { RootStackParamList } from "../navigation/AppNavigator";
import { SafeAreaWrapper } from "../components/SafeAreaWrapper";
import Navbar from "../NavBar";
import AuthService from "../onboarding/service/AuthService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { userService, UserProfile } from "./services/userService";
import { progressService, ProgressSummary, DailyProgress } from "./services/progressService";
import { utilityService } from "./services/utilityService";
import { API_URL, joinUrl, normalizeToHttps, toAbsoluteMediaUrl, getAlternateMediaUrls } from "../../constants/ApiConfig";
import * as ImagePicker from "expo-image-picker";

// Lightweight skeleton component for profile loading
const Skeleton: React.FC<{ style?: any; width?: number | string; height?: number | string; circle?: boolean }> = ({ style, width = '100%', height = 16, circle = false }) => {
  return (
    <View
      style={[
        {
          backgroundColor: '#e9e9ef',
          borderRadius: circle ? 999 : 8,
          width,
          height,
          overflow: 'hidden',
        },
        style,
      ]}
    />
  );
};

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const Profile: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const [userData, setUserData] = useState<UserProfile | null>(null);
  const [progressSummary, setProgressSummary] = useState<ProgressSummary[]>([]);
  const [dailyProgress, setDailyProgress] = useState<DailyProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [username, setUsername] = useState<string>("");
  const [selectedLanguage, setSelectedLanguage] = useState<string>("English");
  const [selectedTheme, setSelectedTheme] = useState<string>("Light");
  const [authToken, setAuthToken] = useState<string>("");
  const [imageUri, setImageUri] = useState<string | null>(null);
  const [altTried, setAltTried] = useState(false);

  // Load auth token
  useFocusEffect(
    useCallback(() => {
      const loadAuthToken = async () => {
        const token = await AsyncStorage.getItem("authToken");
        if (token) {
          setAuthToken(token);
        }
      };
      loadAuthToken();
    }, [])
  );

  // Load user data when screen is focused
  useFocusEffect(
    useCallback(() => {
      setUserData(null);
      loadUserData();
      return () => {};
    }, [])
  );

  // Animated value used to drive header/profile collapse on scroll
  const scrollY = useRef(new Animated.Value(0)).current;

  // Use diffClamp to smoothly limit the scroll value and avoid sudden jumps
  const clampedScroll = useRef(Animated.diffClamp(scrollY, 0, 140)).current;

  // Smoothly interpolate profile height from 120 -> 20 over the clamped scroll range.
  const profileHeight = clampedScroll.interpolate({
    inputRange: [0, 40, 100, 140],
    outputRange: [120, 100, 48, 20],
    extrapolate: 'clamp',
  });

  // Opacity fades progressively with a gentler curve so elements don't disappear abruptly
  const profileOpacity = clampedScroll.interpolate({
    inputRange: [0, 40, 100, 140],
    outputRange: [1, 0.95, 0.6, 0],
    extrapolate: 'clamp',
  });

  // Subtle upward translation as header collapses for smoother visual flow
  const headerTranslateY = clampedScroll.interpolate({
    inputRange: [0, 140],
    outputRange: [0, -28],
    extrapolate: 'clamp',
  });

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
        const initialPic = profile.profile?.profile_picture_url
          ? toAbsoluteMediaUrl(profile.profile.profile_picture_url, { cacheBust: true })
          : null;
        setImageUri(initialPic);
        setAltTried(false);

        // Update AsyncStorage with new values
        await AsyncStorage.setItem("username", profile.username || "");
      }

      // Fetch enhanced progress data
      const [summary, progressData] = await Promise.all([
        progressService.getProgressSummary('month'),
        progressService.getProgressData('month', true)
      ]);
      
      setProgressSummary(summary);
      setDailyProgress(progressData.daily_progress);

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
    // Show skeleton layout while fetching profile
    return (
      <SafeAreaWrapper disableTopSafeArea={true}>
        <View style={styles.rootContainer}>
                <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />
          <Animated.View style={[styles.header, { transform: [{ translateY: headerTranslateY }], opacity: profileOpacity }]}>
            <LinearGradient
              colors={["#A855F7", "#8B5CF6", "#7C3AED"]}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.headerTop}>
              <View style={styles.titleSection}>
                <Skeleton width={200} height={32} style={{ backgroundColor: '#ffffff20' }} />
              </View>
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Skeleton width={36} height={36} circle style={{ marginRight: 8, backgroundColor: '#ffffff20' }} />
                <Skeleton width={36} height={36} circle style={{ backgroundColor: '#ffffff20' }} />
              </View>
            </View>

            <View style={[styles.profileSection, { marginTop: 8 }]}>
              <View style={styles.profilePicContainer}>
                <Skeleton width={'100%'} height={'100%'} circle />
              </View>
              <View style={styles.userInfo}>
                <Skeleton width={180} height={24} style={{ marginBottom: 8 }} />
                <Skeleton width={120} height={18} style={{ marginBottom: 6 }} />
                <Skeleton width={140} height={14} />
              </View>
            </View>
          </Animated.View>

          <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
            <View style={{ paddingHorizontal: 8, paddingTop: 8 }}>
              <Skeleton width={160} height={22} style={{ marginBottom: 12 }} />

              <View style={{ flexDirection: 'row', justifyContent: 'space-between', gap: 12 }}>
                <Skeleton width={'30%'} height={90} />
                <Skeleton width={'30%'} height={90} />
                <Skeleton width={'30%'} height={90} />
              </View>

              <View style={{ marginTop: 20 }}>
                <Skeleton width={200} height={20} style={{ marginBottom: 12 }} />
                {Array.from({ length: 4 }).map((_, i) => (
                  <View key={i} style={{ marginBottom: 12 }}>
                    <Skeleton width={'100%'} height={56} />
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>

          <Navbar activeRoute="Profile" />
        </View>
      </SafeAreaWrapper>
    );
  }

  // Updated functional handlers
  const handleEditProfile = () => {
    navigation.navigate("EditProfile");
  };

  const handleClearCache = async () => {
    Alert.alert(
      "Clear Cache",
      "This will clear app cache and temporary files. Continue?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Clear",
          style: "destructive",
          onPress: async () => {
            try {
              await utilityService.clearAppCache();
              Alert.alert("Success", "Cache cleared successfully!");
            } catch (error) {
              Alert.alert("Error", error instanceof Error ? error.message : "Failed to clear cache");
            }
          },
        },
      ]
    );
  };

  const handlePrivacySettings = () => {
    navigation.navigate('PrivacySecurity');
  };

  const handleLanguageSettings = () => {
    navigation.navigate('Language');
  };

  const handleThemeSettings = () => {
    navigation.navigate('Themes');
  };

  const handleNotificationSettings = () => {
    Alert.alert(
      "Notification Settings",
      "Choose what notifications you want to receive:",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Task Reminders",
          onPress: () => {
            Alert.alert("Task Reminders", "Get notified about upcoming tasks and deadlines. Currently enabled.");
          }
        },
        {
          text: "Achievement Notifications",
          onPress: () => {
            Alert.alert("Achievements", "Receive notifications when you complete goals or reach milestones. Currently enabled.");
          }
        },
        {
          text: "Daily Summary",
          onPress: () => {
            Alert.alert("Daily Summary", "Get a summary of your daily progress. Currently enabled for 6 PM.");
          }
        }
      ]
    );
  };

  const handleStorageSettings = () => {
    navigation.navigate('StorageData');
  };

  const handleExportData = async () => {
    Alert.alert(
      "Export Data",
      "This will export all your data including tasks, notes, and progress statistics.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Export",
          onPress: async () => {
            try {
              await utilityService.exportUserData();
            } catch (error) {
              Alert.alert("Error", error instanceof Error ? error.message : "Failed to export data");
            }
          },
        },
      ]
    );
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

        // Update local state with the new profile picture URL
        setUserData((prev) =>
          prev
            ? {
                ...prev,
                profile: {
                  ...prev.profile,
                  profile_picture_url: updatedProfile.profile?.profile_picture_url,
                },
              }
            : prev
        );

        // Store in AsyncStorage for persistence
        if (updatedProfile.profile?.profile_picture_url) {
          const pic = toAbsoluteMediaUrl(updatedProfile.profile.profile_picture_url, { cacheBust: true });
          setImageUri(pic);
          setAltTried(false);
          await AsyncStorage.setItem("userProfilePicture", pic);
        }

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

  return (
  <SafeAreaWrapper disableTopSafeArea={true}>
      <View style={styles.rootContainer}>
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

<Animated.View
  style={[
    styles.profileSection,
    { height: profileHeight, opacity: profileOpacity },
  ]}
>
  <View style={styles.profilePicContainer}>
    {imageUri ? (
      <Image
        source={{ 
          uri: imageUri,
          headers: authToken ? {
            'Authorization': `Token ${authToken}`
          } : undefined
        }}
        style={styles.profilePic}
        resizeMode="cover"
        onError={() => {
          if (!imageUri) return;
          if (!altTried) {
            const alts = getAlternateMediaUrls(imageUri);
            if (alts.length > 0) {
              try {
                const u = new URL(alts[0]);
                u.searchParams.set('t', Date.now().toString());
                console.warn('Profile picture 404 – retrying with alternate host:', u.toString());
                setImageUri(u.toString());
                setAltTried(true);
                return;
              } catch {}
            }
          }
          setImageUri(null);
        }}
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
</Animated.View>
      </LinearGradient>

      {/* Content */}
<Animated.ScrollView
  style={styles.content}
  showsVerticalScrollIndicator={false}
  refreshControl={
    <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={["#6A009C"]} />
  }
  onScroll={Animated.event(
    [{ nativeEvent: { contentOffset: { y: scrollY } } }],
    { useNativeDriver: false } // height animation needs false
  )}
  scrollEventThrottle={16}
>

        <View style={styles.progressHeader}>
          <Text style={styles.sectionTitle}>Quick Overview</Text>
        </View>

        {/* Quick Stats - Tasks, Notes, and Time Usage */}
        <View style={styles.quickStatsContainer}>
          <View style={styles.quickStatCard}>
            <MaterialIcons name="assignment-turned-in" size={32} color="#4CAF50" />
            <Text style={styles.quickStatValue}>
              {progressSummary.find(item => item.title.includes('Tasks'))?.value || 0}
            </Text>
            <Text style={styles.quickStatLabel}>Tasks Completed</Text>
            <Text style={styles.quickStatPeriod}>This Month</Text>
          </View>

          <View style={styles.quickStatCard}>
            <MaterialIcons name="note" size={32} color="#2196F3" />
            <Text style={styles.quickStatValue}>
              {progressSummary.find(item => item.title.includes('Notes'))?.value || 0}
            </Text>
            <Text style={styles.quickStatLabel}>Notes Made</Text>
            <Text style={styles.quickStatPeriod}>This Month</Text>
          </View>

          <View style={styles.quickStatCard}>
            <MaterialIcons name="schedule" size={32} color="#FF9800" />
            <Text style={styles.quickStatValue}>
              {dailyProgress.length > 0 ? 
                Math.round(dailyProgress.reduce((acc, day) => acc + (day.tasks + day.notes) * 0.5, 0)) : 0}h
            </Text>
            <Text style={styles.quickStatLabel}>Time Usage</Text>
            <Text style={styles.quickStatPeriod}>Estimated</Text>
          </View>
        </View>

        {/* Quick Action for Full Dashboard */}
        {progressSummary.length > 0 && (
          <TouchableOpacity
            style={styles.dashboardButton}
            onPress={() => {
              navigation.navigate("Dashboard");
            }}
          >
            <MaterialIcons name="dashboard" size={20} color="#FFFFFF" />
            <Text style={styles.dashboardButtonText}>View Full Dashboard & Analytics</Text>
            <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        )}

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

          <TouchableOpacity 
            style={styles.settingItem}
            onPress={handlePrivacySettings}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="security" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Privacy & Security</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.settingItem}
            onPress={() => navigation.navigate("ChangePassword")}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="lock" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Change Password</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.settingItem}
            onPress={handleNotificationSettings}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="notifications" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Notifications</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>
        </View>

        {/* App Settings */}
        <Text style={styles.sectionTitle}>App Settings</Text>

        <View style={styles.settingsContainer}>
          <TouchableOpacity 
            style={styles.settingItem}
            onPress={handleLanguageSettings}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="language" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Language</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.settingItem}
            onPress={handleThemeSettings}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="dark-mode" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Theme</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleStorageSettings}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="storage" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Storage & Data</Text>
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
        </View>

        {/* Backup & Sync */}
        <Text style={styles.sectionTitle}>Backup & Sync</Text>

        <View style={styles.settingsContainer}>
          <TouchableOpacity
            style={styles.settingItem}
            onPress={handleExportData}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="cloud-download" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Export Data</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.settingItem}
            onPress={() => {
              Alert.alert(
                "Auto Backup",
                "Automatically backup your data to ensure it's never lost:",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Setup Cloud Backup",
                    onPress: () => {
                      Alert.alert("Cloud Backup", "Connect your Google Drive or iCloud account to automatically backup your tasks, notes, and progress data.");
                    }
                  }
                ]
              );
            }}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="cloud-upload" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Auto Backup</Text>
            </View>
            <MaterialIcons name="chevron-right" size={24} color="#6c757d" />
          </TouchableOpacity>
        </View>

        {/* Data & Support */}
        <Text style={styles.sectionTitle}>Support</Text>

        <View style={styles.settingsContainer}>
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
            onPress={() => {
              Alert.alert(
                "Send Feedback",
                "Help us improve the app by sharing your thoughts:",
                [
                  { text: "Cancel", style: "cancel" },
                  {
                    text: "Report Bug",
                    onPress: () => {
                      Alert.alert("Bug Report", "Thank you for helping us improve! Please describe the issue you encountered and we'll investigate it.");
                    }
                  },
                  {
                    text: "Suggest Feature",
                    onPress: () => {
                      Alert.alert("Feature Request", "We'd love to hear your ideas! Please describe the feature you'd like to see added.");
                    }
                  }
                ]
              );
            }}
          >
            <View style={styles.settingLeft}>
              <MaterialIcons name="feedback" size={24} color="#6A009C" />
              <Text style={styles.settingText}>Send Feedback</Text>
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
  </Animated.ScrollView>

      <Navbar activeRoute="Profile" />
      </View>
    </SafeAreaWrapper>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    paddingHorizontal: 24,
    paddingTop: 40,
    paddingBottom: 50,
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
  },
  sectionTitle: {
    fontSize: 20,
    color: "#1E293B",
    fontFamily: "Inter-Bold",
    marginBottom: 16,
    marginTop: 8,
  },
  progressContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
    paddingHorizontal: 4,
  },
  progressScrollView: {
    marginBottom: 24,
  },
  progressCard: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    flex: 1,
    minWidth: '45%',
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 12,
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
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
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
  chartsContainer: {
    gap: 16,
    marginBottom: 24,
  },
  dashboardButton: {
    backgroundColor: '#6A009C',
    borderRadius: 16,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    shadowColor: '#6A009C',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
    gap: 8,
  },
  dashboardButtonText: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Inter-SemiBold',
    flex: 1,
    textAlign: 'center',
  },
  quickStatsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 20,
    marginBottom: 16,
    gap: 12,
  },
  quickStatCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  quickStatValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1E293B',
    marginTop: 8,
    marginBottom: 4,
    fontFamily: 'Lexend',
  },
  quickStatLabel: {
    fontSize: 14,
    color: '#64748B',
    textAlign: 'center',
    fontFamily: 'Inter-Medium',
  },
  quickStatPeriod: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 2,
    fontFamily: 'Inter-Regular',
  },
});

export default Profile;
