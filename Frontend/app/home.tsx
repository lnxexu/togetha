import { MaterialIcons } from "@expo/vector-icons";
import { Ionicons } from "@expo/vector-icons";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useState, useEffect } from "react";
import {
  Dimensions,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Alert,
  Animated,
  Image,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { SafeAreaWrapper } from "./components/SafeAreaWrapper";
import Navbar from "./NavBar";
import { RootStackParamList } from "./navigation/AppNavigator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, API_ENDPOINTS } from "../constants/ApiConfig";
import AuthService from "./onboarding/service/AuthService";
// taskService for managing tasks
import taskService from "./task-management/services/taskService";
import SkeletonLoader from "./components/SkeletonLoader";
import { notesCountUtils } from "./utils/NotesCountUtils";
import { folderCacheUtils } from "./utils/FolderCacheUtils";
import { WelcomeAnimationUtils } from "./utils/WelcomeAnimationUtils";

const { width } = Dimensions.get("window");

// Quick Stats data
const initialQuickStats = [
  {
    id: 1,
    title: "Tasks Today",
    value: "0/3",
    icon: "check-circle",
    color: "#10B981",
    type: "stat",
  },
  {
    id: 2,
    title: "Notes Created",
    value: "0",
    icon: "note-add",
    color: "#3B82F6",
    type: "stat",
  },
];

// Quick Actions data
const initialQuickActions = [
  {
    id: 3,
    title: "New Note",
    icon: "note-add",
    color: "#F59E0B",
    type: "action",
    action: "Notes",
  },
  {
    id: 4,
    title: "Ask RINA",
    icon: "psychology",
    color: "#8B5CF6",
    type: "action",
    action: "RINA",
  },
];

// Get current week dates
const getCurrentWeek = () => {
  const today = new Date();
  const week = [];
  for (let i = 0; i < 7; i++) {
    const date = new Date(today);
    date.setDate(today.getDate() - today.getDay() + i);
    week.push({
      day: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][i],
      date: date.getDate(),
      isToday: date.getDate() === today.getDate(),
    });
  }
  return week;
};

export default function Home() {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const weekDates = getCurrentWeek();
  const [username, setUsername] = useState("User");
  const [profilePicture, setProfilePicture] = useState<string | null>(null);
  // State for data - combine stats and actions
  const [quickCards] = useState([...initialQuickStats, ...initialQuickActions]);
  const [priorityTasks, setPriorityTasks] = useState<any[]>([]);
  const [todayTasksCount, setTodayTasksCount] = useState({
    completed: 0,
    total: 0,
  });
  const [showTaskOptions, setShowTaskOptions] = useState<string | null>(null);
  const [notesCount, setNotesCount] = useState(0);
  const [notesFolders, setNotesFolders] = useState<any[]>([]);

  // Animation state
  const [fadeAnim] = useState(new Animated.Value(0));
  const [slideAnim] = useState(new Animated.Value(30));
  const [headerSlideAnim] = useState(new Animated.Value(-100));
  const [contentFadeAnim] = useState(new Animated.Value(0));

  // Loading states
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingQuickAccess, setLoadingQuickAccess] = useState(true);
  const [loadingFolders, setLoadingFolders] = useState(true);

  // Error states
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [foldersError, setFoldersError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Greeting based on time of day
  const getGreeting = () => {
    // Get current time in utc VALUES
    const date = new Date();
    const hours = new Date(date).getHours();
    if (hours < 12) {
      return "Good Morning";
    } else if (hours < 18) {
      return "Good Afternoon";
    } else {
      return "Good Evening";
    }
  };

  // Entry animation effect
  useEffect(() => {
    // Check if we're coming from login for special animation
    const fromLogin = WelcomeAnimationUtils.isFromLogin();

    if (fromLogin) {
      // Start entrance animations when component mounts from login
      const welcomeAnimation = WelcomeAnimationUtils.createWelcomeAnimation(
        fadeAnim,
        slideAnim,
        headerSlideAnim,
        contentFadeAnim,
        fromLogin
      );

      welcomeAnimation.start();
    } else {
      // No animations from other pages - set values immediately
      fadeAnim.setValue(1);
      slideAnim.setValue(0);
      headerSlideAnim.setValue(0);
      contentFadeAnim.setValue(1);
    }
  }, []);

  useEffect(() => {
    // Close task options menu when user touches outside
    const handleOutsideClick = () => {
      if (showTaskOptions) {
        setShowTaskOptions(null);
      }
    };

    return () => {
      // Cleanup if needed
    };
  }, [showTaskOptions]);

  useEffect(() => {
    // Create function to verify authentication
    const verifyAuth = async () => {
      const authService = AuthService.getInstance();
      const isValid = await authService.testToken();

      if (!isValid) {
        // If token is invalid, navigate to login
        navigation.navigate("Login");
      }
    };

    verifyAuth();

    // Also listen for when screen comes into focus to refresh data
    const unsubscribe = navigation.addListener("focus", () => {
      // Force refresh all data when screen is focused
      refreshAllData();
      // Also refresh notes count specifically
      refreshNotesCount();
    });

    const refreshAllData = async () => {
      setLoading(true);

      try {
        // Clear all cached data
        await AsyncStorage.multiRemove([
          "username",
          "userProfilePicture",
          "notesCount",
          "priorityTasks",
          "notesFolders",
          "todayTasksCount",
        ]);

        // Ensure we're using the right token key
        const token =
          (await AsyncStorage.getItem("token")) ||
          (await AsyncStorage.getItem("authToken"));

        if (!token) {
          navigation.navigate("Login");
          return;
        }

        // Fetch username directly from server
        const response = await fetch(
          `${API_URL}${API_ENDPOINTS.USER_PROFILE}`,
          {
            headers: {
              Authorization: `Token ${token}`,
              "Cache-Control": "no-cache, no-store, must-revalidate",
            },
          }
        );

        if (response.ok) {
          const data = await response.json();
          if (data.username) {
            setUsername(data.username);
            await AsyncStorage.setItem("username", data.username);
          }
        }

        // The useEffects will handle the rest of data fetching
      } catch (error) {
        console.error("Error refreshing data:", error);
      } finally {
        setLoading(false);
      }
    };

    return unsubscribe;
  }, [navigation]);

  // Fetch user info with optimized error handling
  useEffect(() => {
    const fetchUserInfo = async (forceRefresh = false) => {
      try {
        setLoading(true);

        // First try to get username and profile picture from local storage for immediate display
        if (!forceRefresh) {
          const cachedUsername = await AsyncStorage.getItem("username");
          if (cachedUsername) {
            setUsername(cachedUsername);
          }
          
          const cachedProfilePic = await AsyncStorage.getItem("userProfilePicture");
          if (cachedProfilePic) {
            setProfilePicture(`${API_URL}${cachedProfilePic}`);
          }
        }

        const token = await AsyncStorage.getItem("authToken");
        if (!token) {
          console.log("No auth token found");
          return;
        }

        // Using Promise.race to use whichever endpoint responds first
        const endpoints = [
          fetch(`${API_URL}/auth/user/`, {
            method: "GET",
            headers: {
              Authorization: `Token ${token}`,
              "Cache-Control": "no-cache",
            },
          }),
          fetch(`${API_URL}${API_ENDPOINTS.USER_PROFILE}`, {
            method: "GET",
            headers: {
              Authorization: `Token ${token}`,
              "Cache-Control": "no-cache",
            },
          }),
        ];

        // Wait for the fastest response
        const fastestResponse = await Promise.race(endpoints);

        if (fastestResponse.ok) {
          const contentType = fastestResponse.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const userData = await fastestResponse.json();
            if (userData) {
              const extractedUsername =
                userData.username || userData.name || userData.user?.username;
              if (extractedUsername) {
                setUsername(extractedUsername);
                // Cache the username for faster loading next time
                await AsyncStorage.setItem("username", extractedUsername);
                return;
              }
            }
          }
        }

        // If the fastest endpoint didn't work, try the other one
        const allResponses = await Promise.allSettled(endpoints);
        for (const result of allResponses) {
          if (result.status === "fulfilled" && result.value.ok) {
            try {
              const contentType = result.value.headers.get("content-type");
              if (contentType && contentType.includes("application/json")) {
                const userData = await result.value.json();
                if (userData) {
                  const extractedUsername =
                    userData.username ||
                    userData.name ||
                    userData.user?.username;
                  if (extractedUsername) {
                    setUsername(extractedUsername);
                    await AsyncStorage.setItem("username", extractedUsername);
                    return;
                  }
                }
              }
            } catch (error) {
              console.warn("Error processing response:", error);
            }
          }
        }
      } catch (error) {
        console.error("Error in user info fetch process:", error);
        // Keep using default or cached username
      } finally {
        setLoading(false);
      }
    };

    fetchUserInfo();
  }, []);

  // Fetch notes count for Quick Stats with optimized caching
  useEffect(() => {
    const fetchNotesCount = async () => {
      try {
        setLoadingQuickAccess(true);

        // Try to get cached count first for immediate display
        const cachedCount = await notesCountUtils.getCachedCount();
        setNotesCount(cachedCount);

        // Subscribe to notes count changes
        const unsubscribe = notesCountUtils.subscribe((newCount) => {
          setNotesCount(newCount);
        });

        // Fetch fresh count from server
        await notesCountUtils.refreshCount();

        // Return cleanup function
        return unsubscribe;
      } catch (error) {
        console.error("Error setting up notes count:", error);
      } finally {
        setLoadingQuickAccess(false);
      }
    };

    fetchNotesCount();
  }, []);

  // Function to refresh notes count - can be called when returning from notes screen
  const refreshNotesCount = async () => {
    try {
      await notesCountUtils.refreshCount();
    } catch (error) {
      console.error("Error refreshing notes count:", error);
    }
  };

  const handleTaskAction = async (action: string, taskId: string) => {
    try {
      switch (action) {
        case "view":
          navigation.navigate("TaskDetails", { taskId });
          break;
        case "edit":
          navigation.navigate("editTaskId", { editTaskId: taskId });
          break;
        case "complete":
          await taskService.markTaskComplete(taskId);
          // Refresh the tasks
          fetchTasks();
          Alert.alert("Success", "Task marked as completed");
          break;
        case "delete":
          Alert.alert(
            "Delete Task",
            "Are you sure you want to delete this task?",
            [
              { text: "Cancel", style: "cancel" },
              {
                text: "Delete",
                style: "destructive",
                onPress: async () => {
                  await taskService.deleteTask(taskId);
                  fetchTasks();
                  Alert.alert("Success", "Task deleted successfully");
                },
              },
            ]
          );
          break;
      }
    } catch (error) {
      console.error("Error handling task action:", error);
      Alert.alert("Error", "Failed to perform action");
    } finally {
      setShowTaskOptions(null);
    }
  };

  // Fetch priority tasks with optimized performance
  useEffect(() => {
    const fetchTasks = async () => {
      try {
        setLoadingTasks(true);
        setTasksError(null);

        // Try to get cached tasks first for immediate display
        const cachedTasks = await AsyncStorage.getItem("priorityTasks");
        if (cachedTasks) {
          setPriorityTasks(JSON.parse(cachedTasks));
        }

        const token = await AsyncStorage.getItem("authToken");
        if (!token) {
          navigation.navigate("Login");
          return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000);

        try {
          const response = await fetch(
            `${API_URL}${API_ENDPOINTS.TASKS}?filter=active`,
            {
              headers: {
                Authorization: `Token ${token}`,
                "Cache-Control": "no-cache",
              },
              signal: controller.signal,
            }
          );

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error("Failed to fetch tasks");
          }

          const tasks = await response.json();

          // Transform the tasks data with proper priority sorting
          const transformedTasks = tasks
            .filter((task: any) => !task.completed)
            .sort((a: any, b: any) => {
              // Sort by priority: urgent-important > not-urgent-important > urgent-not-important > not-urgent-not-important
              const priorityOrder = {
                "urgent-important": 4,
                "not-urgent-important": 3,
                "urgent-not-important": 2,
                "not-urgent-not-important": 1,
              };

              const aPriority =
                priorityOrder[a.priority as keyof typeof priorityOrder] || 1;
              const bPriority =
                priorityOrder[b.priority as keyof typeof priorityOrder] || 1;

              if (aPriority !== bPriority) {
                return bPriority - aPriority;
              }

              // If same priority, sort by due date (earliest first)
              if (a.due_datetime && b.due_datetime) {
                return (
                  new Date(a.due_datetime).getTime() -
                  new Date(b.due_datetime).getTime()
                );
              }

              // If one has due date and other doesn't, prioritize the one with due date
              if (a.due_datetime && !b.due_datetime) return -1;
              if (!a.due_datetime && b.due_datetime) return 1;

              // If neither has due date, sort by created date (newest first)
              return (
                new Date(b.created_at).getTime() -
                new Date(a.created_at).getTime()
              );
            })
            .slice(0, 5) // Get top 5 priority tasks
            .map((task: any) => ({
              id: task.id,
              title: task.title,
              description: task.description,
              category: task.category || "General",
              time: task.due_datetime
                ? new Date(task.due_datetime).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "No due time",
              priority: mapPriority(task.priority),
              status: task.completed ? "Completed" : "Pending",
              due_datetime: task.due_datetime,
              created_at: task.created_at,
              updated_at: task.updated_at,
            }));

          setPriorityTasks(transformedTasks);

          // Update today's tasks count
          const today = new Date();
          const todayTasks = tasks.filter((task: any) => {
            if (!task.due_datetime) return false;
            const taskDate = new Date(task.due_datetime);
            return taskDate.toDateString() === today.toDateString();
          });
          const completedTodayTasks = todayTasks.filter(
            (task: any) => task.completed
          );
          setTodayTasksCount({
            completed: completedTodayTasks.length,
            total: todayTasks.length,
          });

          // Cache the tasks for faster loading next time
          await AsyncStorage.setItem(
            "priorityTasks",
            JSON.stringify(transformedTasks)
          );
        } catch (error: any) {
          if (error.name === "AbortError") {
            console.warn("Fetch tasks request timed out");
          } else {
            throw error;
          }
        }
      } catch (error) {
        console.error("Error fetching tasks:", error);
        setTasksError("Failed to load tasks");
      } finally {
        setLoadingTasks(false);
      }
    };

    fetchTasks();

    // Set up a refresh interval
    const refreshInterval = setInterval(fetchTasks, 60000); // Refresh every minute

    // Clean up on component unmount
    return () => clearInterval(refreshInterval);
  }, []);

  // Fetch notes folders with optimized performance
  useEffect(() => {
    const fetchNotesFolders = async () => {
      try {
        setLoadingFolders(true);
        setFoldersError(null);

        // Try to get cached folders first for immediate display
        const cachedFolders = await AsyncStorage.getItem("notesFolders");
        if (cachedFolders) {
          setNotesFolders(JSON.parse(cachedFolders));
        }

        const token = await AsyncStorage.getItem("authToken");
        if (!token) {
          navigation.navigate("Login");
          return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        try {
          // Fetch actual folders from the database
          const response = await fetch(
            `${API_URL}${API_ENDPOINTS.NOTE_FOLDERS}`,
            {
              headers: {
                Authorization: `Token ${token}`,
                "Cache-Control": "no-cache",
              },
              signal: controller.signal,
            }
          );

          clearTimeout(timeoutId);

          if (!response.ok) {
            throw new Error("Failed to fetch folders");
          }

          const folders = await response.json();

          // Fetch notes to get accurate count per folder
          const notesResponse = await fetch(
            `${API_URL}${API_ENDPOINTS.NOTES}`,
            {
              headers: {
                Authorization: `Token ${token}`,
                "Cache-Control": "no-cache",
              },
              signal: controller.signal,
            }
          );

          let notesCounts: Record<string, number> = {};

          if (notesResponse.ok) {
            const notes = await notesResponse.json();
            // Count notes per folder
            notesCounts = notes.reduce(
              (counts: Record<string, number>, note: any) => {
                const folderId = note.folder ? note.folder.toString() : null;
                if (folderId) {
                  counts[folderId] = (counts[folderId] || 0) + 1;
                }
                return counts;
              },
              {}
            );
          }

          // Transform folders data to match the expected format with accurate counts
          const foldersArray = folders.map((folder: any) => ({
            id: folder.id,
            name: folder.name,
            color: getFolderColor(folder.name),
            count: notesCounts[folder.id.toString()] || 0,
          }));

          setNotesFolders(foldersArray);

          // Cache the result for faster loading next time
          await AsyncStorage.setItem(
            "notesFolders",
            JSON.stringify(foldersArray)
          );
        } catch (error: any) {
          if (error.name === "AbortError") {
            console.warn("Fetch folders request timed out");
          } else {
            throw error;
          }
        }
      } catch (error) {
        console.error("Error fetching notes folders:", error);
        setFoldersError("Failed to load folders");
      } finally {
        setLoadingFolders(false);
      }
    };

    // Initial fetch
    fetchNotesFolders();

    // Subscribe to cache invalidation events
    const unsubscribe = folderCacheUtils.subscribe(() => {
      fetchNotesFolders();
    });

    // Set up a refresh interval for folders
    const refreshInterval = setInterval(fetchNotesFolders, 60000); // Refresh every minute

    // Clean up on component unmount
    return () => {
      clearInterval(refreshInterval);
      unsubscribe();
    };
  }, []);

  // Helper function to get folder color based on folder name
  const getFolderColor = (folderName: string) => {
    const colors = [
      "#3B82F6", // Blue
      "#10B981", // Green
      "#F59E0B", // Amber
      "#EF4444", // Red
      "#8B5CF6", // Purple
      "#06B6D4", // Cyan
      "#84CC16", // Lime
      "#F97316", // Orange
      "#EC4899", // Pink
      "#6366F1", // Indigo
    ];

    // Use a simple hash function to consistently assign colors
    let hash = 0;
    for (let i = 0; i < folderName.length; i++) {
      hash = folderName.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  // Helper function to map priority from backend to UI
  const mapPriority = (priority: string) => {
    switch (priority) {
      case "urgent-important":
        return "High";
      case "not-urgent-important":
        return "Medium";
      case "urgent-not-important":
        return "Medium";
      case "not-urgent-not-important":
        return "Low";
      default:
        return "Medium";
    }
  };

  const getPriorityColor = (priority: "High" | "Medium" | "Low" | string) => {
    switch (priority) {
      case "High":
        return "#FF6B6B";
      case "Medium":
        return "#FFD93D";
      case "Low":
        return "#6BCF7F";
      default:
        return "#A8A8A8";
    }
  };

  return (
    <SafeAreaWrapper disableTopSafeArea={true}>
      <View style={styles.rootContainer}>
        <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />

        {/* Header positioned behind content */}
        <Animated.View
          style={[
            {
              transform: [{ translateY: headerSlideAnim }],
            },
          ]}
        >
        <LinearGradient
          colors={["#A855F7", "#8B5CF6", "#7C3AED"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <View style={styles.headerLeftSection}>
              <TouchableOpacity
                style={styles.profilePicture}
                onPress={() => navigation.navigate("EditProfile")}
                activeOpacity={0.7}
              >
                {profilePicture ? (
                  <Image
                    source={{ uri: profilePicture }}
                    style={styles.profileImage}
                    resizeMode="cover"
                  />
                ) : (
                  <View style={styles.profilePlaceholder}>
                    <Text style={styles.profileInitial}>
                      {username.charAt(0).toUpperCase()}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>

              <View style={styles.headerGreeting}>
                <Text style={styles.welcomeText}>{getGreeting()},</Text>
                <Text style={styles.nameText}>{username}! 👋</Text>
              </View>
            </View>

            <TouchableOpacity
              style={styles.notificationIcon}
              onPress={() => navigation.navigate("Notifications")}
            >
              <Ionicons
                name="notifications"
                size={22}
                color="#fcfcfcff"
                elevation={10}
                shadowColor="#2c2c2cff"
                shadowOffset={{ width: 0, height: 2 }}
                shadowOpacity={0.8}
                shadowRadius={8}
              />
              <View style={styles.notificationDot} />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </Animated.View>

      {/* Main Content Container positioned above header */}
      <Animated.View
        style={[
          styles.mainContentContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          },
        ]}
      >
        <ScrollView
          style={styles.content}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={async () => {
                // Refresh all data sources
                setLoading(true);

                // Clear cache to force fresh data
                await AsyncStorage.multiRemove([
                  "username",
                  "userProfilePicture",
                  "notesCount",
                  "priorityTasks",
                  "notesFolders",
                  "todayTasksCount",
                ]);

                // Re-run all the fetch useEffects and refresh notes count
                const token = await AsyncStorage.getItem("authToken");
                if (!token) {
                  navigation.navigate("Login");
                  return;
                }

                // Explicitly refresh notes count
                await notesCountUtils.refreshCount();

                // The useEffects will run automatically
                setLoading(false);
              }}
              colors={["#6A009C"]}
              tintColor="#6A009C"
            />
          }
        >
          {/* Quick Stats & Actions */}
          <Animated.View
            style={[
              styles.section,
              {
                opacity: contentFadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Quick Overview</Text>
            </View>
            {loadingQuickAccess ? (
              <SkeletonLoader type="dashboard" />
            ) : (
              <View style={styles.quickCardsGrid}>
                {/* Quick Stats */}
                <View style={[styles.quickCard, styles.tasksCard]}>
                  <Ionicons name="checkmark-circle" size={32} color="#10B981" />
                  <Text style={styles.cardValue}>
                    {todayTasksCount.completed}/{todayTasksCount.total}
                  </Text>
                  <Text style={styles.cardTitle}>Tasks Today</Text>
                  <Text style={styles.cardSubtitle}>Focus on your tasks</Text>
                </View>

                <View style={[styles.quickCard, styles.notesCard]}>
                  <Ionicons name="document-text" size={32} color="#3B82F6" />
                  <Text style={styles.cardValue}>{notesCount}</Text>
                  <Text style={styles.cardTitle}>Notes Created</Text>
                  <Text style={styles.cardSubtitle}>
                    Keep track of your notes
                  </Text>
                </View>

                {/* Quick Actions */}
                <TouchableOpacity
                  onPress={() => navigation.navigate("Notes")}
                  activeOpacity={0.7}
                >
                  <View style={[styles.quickCard, styles.newNoteCard]}>
                    <Ionicons name="add-circle" size={32} color="#F59E0B" />
                    <Text style={styles.cardActionText}>New Note</Text>
                    <Text style={styles.cardSubtitle}>Create a new note</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={() => navigation.navigate("RINA")}
                  activeOpacity={0.7}
                >
                  <View style={[styles.quickCard, styles.rinaCard]}>
                    <Ionicons
                      name="chatbubble-ellipses"
                      size={32}
                      color="#8B5CF6"
                    />
                    <Text style={styles.cardActionText}>Ask RINA</Text>
                    <Text style={styles.cardSubtitle}>Get help from RINA</Text>
                  </View>
                </TouchableOpacity>
              </View>
            )}
          </Animated.View>

          {/* Priority Tasks */}
          <Animated.View
            style={[
              styles.section,
              {
                opacity: contentFadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Today's Focus</Text>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate("AllItemsView", {
                    viewType: "urgent-tasks",
                  })
                }
              >
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            {loadingTasks ? (
              <SkeletonLoader type="tasks" count={3} />
            ) : tasksError ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{tasksError}</Text>
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() =>
                    navigation.navigate("AddTask", {
                      quadrant: "urgent-important",
                    })
                  }
                >
                  <Text style={styles.retryText}>View All Tasks</Text>
                </TouchableOpacity>
              </View>
            ) : priorityTasks.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialIcons name="task-alt" size={48} color="#CBD5E0" />
                <Text style={styles.emptyText}>No priority tasks yet</Text>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() =>
                    navigation.navigate("AddTask", {
                      quadrant: "urgent-important",
                    })
                  }
                >
                  <Text style={styles.addButtonText}>Add a Task</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.horizontalScrollContainer}
              >
                {priorityTasks.map((task, index) => (
                  <View key={task.id} style={styles.taskCardWrapper}>
                    <TouchableOpacity
                      style={[
                        styles.taskCardHorizontal,
                        index === 0 && styles.firstCard,
                      ]}
                      activeOpacity={0.8}
                      onPress={() =>
                        navigation.navigate("TaskDetails", {
                          taskId: task.id,
                        })
                      }
                    >
                      <View style={styles.borderLeft} />
                      <View style={styles.taskHeader}>
                        <View style={styles.taskInfo}>
                          <Text style={styles.taskTitle} numberOfLines={2}>
                            {task.title}
                          </Text>
                          <Text style={styles.taskCategory}>
                            {task.category}
                          </Text>
                        </View>
                        <View
                          style={[
                            styles.priorityBadge,
                            {
                              backgroundColor: getPriorityColor(task.priority),
                            },
                          ]}
                        >
                          <Text style={styles.priorityText}>
                            {task.priority}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.taskBody}>
                        <Text style={styles.taskTime}>{task.time}</Text>
                      </View>

                      <View style={styles.taskDivider} />

                      <View style={styles.taskFooter}>
                        <View style={styles.statusContainer}>
                          <View
                            style={[
                              styles.statusDot,
                              {
                                backgroundColor:
                                  task.status === "Completed"
                                    ? "#10B981"
                                    : task.status === "In Progress"
                                    ? "#F59E0B"
                                    : "#EF4444",
                              },
                            ]}
                          />
                          <Text
                            style={[
                              styles.taskStatus,
                              {
                                color:
                                  task.status === "Completed"
                                    ? "#10B981"
                                    : task.status === "In Progress"
                                    ? "#F59E0B"
                                    : "#EF4444",
                              },
                            ]}
                          >
                            {task.status}
                          </Text>
                        </View>

                        <TouchableOpacity
                          style={styles.taskAction}
                          onPress={(e) => {
                            e.stopPropagation();
                            setShowTaskOptions(
                              showTaskOptions === task.id ? null : task.id
                            );
                          }}
                        >
                          <MaterialIcons
                            name="more-vert"
                            size={18}
                            color="#9CA3AF"
                          />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>

                    {/* Task Options Menu */}
                    {showTaskOptions === task.id && (
                      <View style={styles.taskOptionsMenu}>
                        <TouchableOpacity
                          style={styles.taskOption}
                          onPress={() => handleTaskAction("view", task.id)}
                        >
                          <MaterialIcons
                            name="visibility"
                            size={16}
                            color="#4F46E5"
                          />
                          <Text style={styles.taskOptionText}>
                            View Details
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.taskOption}
                          onPress={() => handleTaskAction("edit", task.id)}
                        >
                          <MaterialIcons
                            name="edit"
                            size={16}
                            color="#059669"
                          />
                          <Text style={styles.taskOptionText}>Edit Task</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={styles.taskOption}
                          onPress={() => handleTaskAction("complete", task.id)}
                        >
                          <MaterialIcons
                            name="check-circle"
                            size={16}
                            color="#10B981"
                          />
                          <Text style={styles.taskOptionText}>
                            Mark Complete
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          style={[styles.taskOption, styles.deleteOption]}
                          onPress={() => handleTaskAction("delete", task.id)}
                        >
                          <MaterialIcons
                            name="delete"
                            size={16}
                            color="#EF4444"
                          />
                          <Text
                            style={[
                              styles.taskOptionText,
                              styles.deleteOptionText,
                            ]}
                          >
                            Delete
                          </Text>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                ))}
              </ScrollView>
            )}
          </Animated.View>

          {/* Notes Folders */}
          <Animated.View
            style={[
              styles.section,
              {
                opacity: contentFadeAnim,
                transform: [{ translateY: slideAnim }],
              },
            ]}
          >
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Notes Folders</Text>
              <TouchableOpacity onPress={() => navigation.navigate("Notes")}>
                <Text style={styles.seeAllText}>See All</Text>
              </TouchableOpacity>
            </View>
            {loadingFolders ? (
              <SkeletonLoader type="notes" count={3} />
            ) : foldersError ? (
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{foldersError}</Text>
              </View>
            ) : notesFolders.length === 0 ? (
              <View style={styles.emptyContainer}>
                <MaterialIcons name="folder" size={48} color="#CBD5E0" />
                <Text style={styles.emptyText}>No folders yet</Text>
                <TouchableOpacity
                  style={styles.addButton}
                  onPress={() => navigation.navigate("NoteEditor")}
                >
                  <Text style={styles.addButtonText}>Create Note</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.foldersHorizontalContainer}
              >
                {notesFolders.map((folder, index) => (
                  <TouchableOpacity
                    key={folder.id}
                    style={[
                      styles.folderCardHorizontal,
                      { backgroundColor: "#FFFFFF" },
                      index === 0 && styles.firstFolderCard,
                    ]}
                    activeOpacity={0.8}
                    onPress={() =>
                      navigation.navigate("Notes", {
                        folderId: folder.id.toString(),
                        folderName: folder.name,
                      })
                    }
                  >
                    {/* Colored left border accent */}
                    <View
                      style={[
                        styles.folderBorderAccent,
                        { backgroundColor: folder.color },
                      ]}
                    />
                    <View
                      style={[
                        styles.folderIconHorizontal,
                        { backgroundColor: `${folder.color}25` },
                      ]}
                    >
                      <MaterialIcons
                        name="folder"
                        size={28}
                        color={folder.color}
                      />
                    </View>
                    <View style={styles.folderInfoHorizontal}>
                      <Text
                        style={styles.folderTitleHorizontal}
                        numberOfLines={1}
                      >
                        {folder.name}
                      </Text>
                      <Text style={styles.folderCountHorizontal}>
                        {folder.count} {folder.count === 1 ? "note" : "notes"}
                      </Text>
                    </View>
                    <View style={styles.folderArrowContainer}>
                      <MaterialIcons
                        name="arrow-forward-ios"
                        size={16}
                        color={folder.color}
                      />
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            )}
          </Animated.View>

          {/* Bottom spacing reduced for NavBar */}
          <View style={{ height: 20 }} />
        </ScrollView>
      </Animated.View>

      {/* Navigation Bar - consistent clean styling */}
      <Navbar activeRoute="Home" />
      </View>
    </SafeAreaWrapper>
  );
}

const styles = StyleSheet.create({
  // Root and layout
  rootContainer: {
    flex: 1,
    backgroundColor: "#F6F7FB",
  },
  container: {
    flex: 1,
    backgroundColor: "transparent",
  },

  // Header / hero
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 70,
    paddingBottom: "100%",
    zIndex: 1000,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: "#0b1020",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 6,
  },

  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  headerLeftSection: {
    flexDirection: "row",
    alignItems: "center",
  },
  profilePicture: {
    width: 52,
    height: 52,
    borderRadius: 14,
    overflow: "hidden",
    backgroundColor: "rgba(255,255,255,0.14)",
    justifyContent: "center",
    alignItems: "center",
  },
  profileImage: {
    width: 52,
    height: 52,
    borderRadius: 14,
  },
  profilePlaceholder: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.18)",
    justifyContent: "center",
    alignItems: "center",
  },
  profileInitial: {
    fontSize: 18,
    color: "#FFFFFF",
    fontWeight: "700",
  },
  headerGreeting: {
    marginLeft: 12,
  },
  welcomeText: {
    fontSize: 13,
    color: "rgba(255,255,255,0.9)",
    fontFamily: "Lexend"
  },
  nameText: {
    fontSize: 22,
    color: "#FFFFFF",
    fontFamily: "Lexend",
    marginTop: 2,
  },
  notificationIcon: {
    padding: 6,
    marginLeft: 8,
  },
  notificationDot: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 6,
    backgroundColor: "#FF5252",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },

  // Main content container that sits above the header
  mainContentContainer: {
    flex: 1,
    backgroundColor: "#F6F7FB",
    marginTop: 140,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 18,
    zIndex: 1,
  },

  content: { flex: 1 },
  scrollContent: {
    paddingTop: 8,
    paddingBottom: 28,
    paddingHorizontal: 18,
  },

  // Sections
  section: { marginBottom: 20 },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  sectionTitle: { fontSize: 18, color: "#33333", fontFamily: "Inter-Bold" },
  seeAllText: {
    fontSize: 13,
    color: "#6C2BD9",
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    backgroundColor: "rgba(108,43,217,0.08)",
  },

  // Loaders / empty / errors
  loaderContainer: { height: 140, justifyContent: "center", alignItems: "center" },
  errorContainer: {
    minHeight: 120,
    justifyContent: "center",
    alignItems: "center",
    padding: 16,
    borderRadius: 14,
    backgroundColor: "#FFF6F6",
  },
  errorText: { color: "#D9534F", fontSize: 14, fontWeight: "600" },
  retryButton: { marginTop: 8 },
  retryText: { color: "#6C2BD9", fontWeight: "700" },

  emptyContainer: {
    minHeight: 140,
    justifyContent: "center",
    alignItems: "center",
    padding: 18,
    borderRadius: 16,
    backgroundColor: "#FFFFFF",
    shadowColor: "#0b1020",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.04,
    shadowRadius: 14,
    elevation: 3,
  },
  emptyText: { color: "#6B7280", fontSize: 15, marginTop: 10, textAlign: "center" },
  addButton: {
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 20,
    backgroundColor: "#6C2BD9",
    borderRadius: 12,
  },
  addButtonText: { color: "#FFFFFF", fontWeight: "700" },

  // Quick cards grid - modern rounded cards with soft shadows
  quickCardsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "space-between" },
  quickCard: {
    width: (width - 54) / 2,
    minHeight: 140,
    borderRadius: 16,
    padding: 14,
    marginBottom: 14,
    backgroundColor: "#FFFFFF",
    shadowColor: "#0b1020",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.03,
    shadowRadius: 18,
    elevation: 4,
    borderWidth: 0,
    justifyContent: "space-between",
    alignItems: "center", // center card inner content

  },
  tasksCard: { backgroundColor: "#F7FFFA" },
  notesCard: { backgroundColor: "#F6FBFF" },
  newNoteCard: { backgroundColor: "#FFFBF1" },
  rinaCard: { backgroundColor: "#FBF8FF" },
  cardValue: { fontSize: 26, fontWeight: "800", color: "#0f1724" },
  cardTitle: { fontSize: 13, color: "#6B7280",  fontFamily: "Inter-Regular", textAlign: "center"},
  cardSubtitle: { fontSize: 12, color: "#9CA3AF", fontFamily: "Inter-Regular", textAlign: "center" },
  cardActionText: { fontSize: 16, fontWeight: "700", color: "#0f1724" },

  // Horizontal lists and cards
  horizontalScrollContainer: { paddingLeft: 6, paddingBottom: 12, paddingTop: 6 },
  taskCardHorizontal: {
    backgroundColor: "#FFFFFF",
    width: width * 0.74,
    marginRight: 14,
    borderRadius: 14,
    padding: 14,
    shadowColor: "#0b1020",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.03,
    shadowRadius: 18,
    elevation: 4,
    borderWidth: 0,
  },
  firstCard: { marginLeft: 6 },
  borderLeft: {
    position: "absolute",
    height: 64,
    width: 6,
    left: 0,
    top: 18,
    borderTopLeftRadius: 6,
    borderBottomLeftRadius: 6,
  },
  taskTitle: { fontSize: 16, fontFamily: "Inter-Bold", color: "#0f1724", marginBottom: 6 },
  taskCategory: {
    fontSize: 12,
    color: "#6C2BD9",
    backgroundColor: "rgba(108,43,217,0.08)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    alignSelf: "flex-start",
  },
  priorityBadge: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 999, minWidth: 64, alignItems: "center" },
  priorityText: { fontSize: 11, color: "#FFFFFF", fontWeight: "800", textTransform: "uppercase" },
  taskHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 },
  taskInfo: { flex: 1, paddingRight: 8 },
  taskBody: { marginBottom: 10 },
  taskTime: { fontSize: 13, color: "#6B7280" },
  taskDivider: { height: 1, backgroundColor: "#EEF2F7", marginVertical: 8 },
  taskFooter: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  statusContainer: { flexDirection: "row", alignItems: "center" },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  taskStatus: { fontSize: 13, color: "#374151", fontWeight: "600" },
  taskAction: { padding: 8, borderRadius: 10, backgroundColor: "#F3F4F6" },
  taskCardWrapper: { position: "relative" },

  taskOptionsMenu: {
    position: "absolute",
    top: 56,
    right: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 6,
    paddingHorizontal: 6,
    shadowColor: "#0b1020",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.06,
    shadowRadius: 12,
    elevation: 6,
    minWidth: 150,
  },
  taskOption: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8 },
  taskOptionText: { fontSize: 14, color: "#374151", marginLeft: 10, fontWeight: "600" },
  deleteOption: { backgroundColor: "#FFF5F5" },
  deleteOptionText: { color: "#E11D48", fontWeight: "700" },

  // Folders
  foldersHorizontalContainer: { paddingLeft: 6, paddingRight: 6, paddingBottom: 8 },
  folderCardHorizontal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 14,
    marginRight: 12,
    width: 160,
    minHeight: 110,
    shadowColor: "#0b1020",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.03,
    shadowRadius: 14,
    elevation: 3,
    position: "relative",
    overflow: Platform.OS === "android" ? "hidden" : "visible",
  },
  firstFolderCard: { marginLeft: 6 },
  folderBorderAccent: { position: "absolute", left: 0, top: 0, bottom: 0, width: 6, borderTopLeftRadius: 14, borderBottomLeftRadius: 14 },
  folderIconHorizontal: { width: 44, height: 44, borderRadius: 12, justifyContent: "center", alignItems: "center", alignSelf: "center", marginBottom: 8 },
  folderInfoHorizontal: { flex: 1, alignItems: "center" },
  folderTitleHorizontal: { fontSize: 14, fontFamily: "Inter-Bold", color: "#0f1724", textAlign: "center" },
  folderCountHorizontal: { fontSize: 12, color: "#6B7280", marginTop: 4 },
  folderArrowContainer: { position: "absolute", top: 10, right: 10, width: 28, height: 28, borderRadius: 14, backgroundColor: "rgba(255,255,255,0.9)", justifyContent: "center", alignItems: "center" },
});
function fetchTasks() {
  throw new Error("Function not implemented.");
}
