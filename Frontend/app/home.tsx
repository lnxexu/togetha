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

        // First try to get username from local storage for immediate display
        if (!forceRefresh) {
          const cachedUsername = await AsyncStorage.getItem("username");
          if (cachedUsername) {
            setUsername(cachedUsername);
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
      case 'view':
        navigation.navigate('TaskDetails', { taskId });
        break;
      case 'edit':
        navigation.navigate('editTaskId', { editTaskId: taskId });
        break;
      case 'complete':
        await taskService.markTaskComplete(taskId);
        // Refresh the tasks
        fetchTasks();
        Alert.alert('Success', 'Task marked as completed');
        break;
      case 'delete':
        Alert.alert(
          'Delete Task',
          'Are you sure you want to delete this task?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Delete',
              style: 'destructive',
              onPress: async () => {
                await taskService.deleteTask(taskId);
                fetchTasks();
                Alert.alert('Success', 'Task deleted successfully');
              },
            },
          ]
        );
        break;
    }
  } catch (error) {
    console.error('Error handling task action:', error);
    Alert.alert('Error', 'Failed to perform action');
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
            notesCounts = notes.reduce((counts: Record<string, number>, note: any) => {
              const folderId = note.folder ? note.folder.toString() : null;
              if (folderId) {
                counts[folderId] = (counts[folderId] || 0) + 1;
              }
              return counts;
            }, {});
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
      case "urgent_important":
        return "High";
      case "not_urgent_important":
        return "Medium";
      case "urgent_not_important":
        return "Medium";
      case "not_urgent_not_important":
        return "Low";
      default:
        return "Medium";
    }
  };

  // Helper function to map status from backend to UI
  const mapStatus = (status: string) => {
    switch (status) {
      case "not_started":
        return "Pending";
      case "in_progress":
        return "In Progress";
      case "completed":
        return "Completed";
      default:
        return "Pending";
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
    <SafeAreaWrapper style={styles.container} includeNavBar={true}>
      <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />

      {/* Header positioned behind content */}
      <Animated.View style={[
        {
          transform: [{ translateY: headerSlideAnim }],
        }
      ]}>
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
                  <View style={styles.profilePlaceholder}>
                    <Text style={styles.profileInitial}>
                      {username.charAt(0).toUpperCase()}
                    </Text>
                  </View>
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
        <Animated.View style={[
          styles.mainContentContainer,
          {
            opacity: fadeAnim,
            transform: [{ translateY: slideAnim }],
          }
        ]}>
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
            <Animated.View style={[
              styles.section,
              {
                opacity: contentFadeAnim,
                transform: [{ translateY: slideAnim }],
              }
            ]}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Quick Overview</Text>
              </View>
              {loadingQuickAccess ? (
                <SkeletonLoader type="dashboard" />
              ) : (
                <View style={styles.quickCardsGrid}>
                  {/* Quick Stats */}
                  <View style={[styles.quickCard, styles.tasksCard]}>
                    <Ionicons
                      name="checkmark-circle"
                      size={32}
                      color="#10B981"
                    />
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
                      <Text style={styles.cardSubtitle}>
                        Get help from RINA
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>
              )}
            </Animated.View>

            {/* Priority Tasks */}
            <Animated.View style={[
              styles.section,
              {
                opacity: contentFadeAnim,
                transform: [{ translateY: slideAnim }],
              }
            ]}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Today's Focus</Text>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate("AllItemsView", { viewType: "urgent-tasks" })
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
                                backgroundColor: getPriorityColor(
                                  task.priority
                                ),
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
                            onPress={() =>
                              handleTaskAction("complete", task.id)
                            }
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
            <Animated.View style={[
              styles.section,
              {
                opacity: contentFadeAnim,
                transform: [{ translateY: slideAnim }],
              }
            ]}>
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
                    onPress={() => navigation.navigate("Notes")}
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
                        { backgroundColor: `${folder.color}15` },
                        index === 0 && styles.firstFolderCard,
                      ]}
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate("Notes", { 
                        folderId: folder.id.toString(), 
                        folderName: folder.name 
                      })}
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
                        <Text style={styles.folderTitleHorizontal} numberOfLines={1}>
                          {folder.name}
                        </Text>
                        <Text style={styles.folderCountHorizontal}>
                          {folder.count}{" "}
                          {folder.count === 1 ? "note" : "notes"}
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

        {/* Navigation Bar - positioned to overlay content */}
        <View style={styles.navbarContainer}>
          <Navbar activeRoute="Home" />
        </View>
    </SafeAreaWrapper>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#ffffffff",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: 10,
    paddingBottom: 20,
    zIndex: 1,
  },
  mainContentContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: 120, // Reduced for better spacing
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 1000,
    overflow: "hidden",
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flex: 1,
  },
  headerGreeting: {
    flex: 1,
    paddingLeft: 12,
  },
  headerLeftSection: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    paddingTop: 20,
  },
  profilePicture: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: "hidden",
  },
  profilePlaceholder: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  profileInitial: {
    fontSize: 18,
    fontFamily: "Inter-Bold",
    color: "#FFFFFF",
    textTransform: "uppercase",
  },
  welcomeText: {
    fontSize: 16,
    fontFamily: "Lexend",
    color: "#ffffffff",
    lineHeight: 20,
  },
  nameText: {
    fontSize: 28,
    fontFamily: "Lexend",
    color: "#ffffffff",
    marginTop: 4,
    lineHeight: 32,
  },
  descriptionText: {
    fontSize: 14,
    fontFamily: "Lexend",
    color: "#ffffffff",
    marginTop: 8,
    lineHeight: 20,
    opacity: 0.9,
  },
  notificationIcon: {
    padding: 8,
  },

  notificationDot: {
    position: "absolute",
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#EF4444",
  },
  content: {
    flex: 1,
  },
  scrollContent: {
    paddingTop: 20,
    paddingBottom: 120, // Space for NavBar
  },
  section: {
    marginBottom: 24, // Reduced from 32
    position: "relative",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: "transparent",
    paddingHorizontal: 24,
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    lineHeight: 24,
    position: "relative",
    paddingLeft: 12,
  },
  seeAllText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#6A009C",
    paddingVertical: 6,
    paddingHorizontal: 12,
    backgroundColor: "#F1E6FF",
    borderRadius: 12,
    overflow: "hidden",
  },
  loaderContainer: {
    height: 150,
    justifyContent: "center",
    alignItems: "center",
  },
  errorContainer: {
    height: 150,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 24,
    backgroundColor: "#FEF2F2",
    borderRadius: 16,
  },
  errorText: {
    color: "#EF4444",
    fontFamily: "Inter-Medium",
    fontSize: 16,
    marginBottom: 8,
  },
  retryButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: "#6A009C",
    borderRadius: 8,
  },
  retryText: {
    color: "#FFFFFF",
    fontFamily: "Inter-Medium",
    fontSize: 14,
  },
  emptyContainer: {
    height: 180,
    justifyContent: "center",
    alignItems: "center",
    marginHorizontal: 24,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.6)",
    padding: 20,
  },
  emptyText: {
    color: "#94A3B8",
    fontFamily: "Inter-Medium",
    fontSize: 16,
    marginTop: 12,
    marginBottom: 16,
    textAlign: "center",
  },
  addButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: "#6A009C",
    borderRadius: 12,
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  addButtonText: {
    color: "#FFFFFF",
    fontFamily: "Inter-SemiBold",
    fontSize: 16,
  },
  quickAccessGrid: {
    flexDirection: "row",
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  quickCardsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 24,
    justifyContent: "space-between",
  },
  quickCard: {
    width: (width - 64) / 2, // Two cards per row with padding
    height: 150, // Fixed height for consistent 2x2 grid
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.6)",
  },
  tasksCard: {
    backgroundColor: "#F0FDF4", // Soft green background for tasks
    borderColor: "rgba(16, 185, 129, 0.2)",
  },
  notesCard: {
    backgroundColor: "#EFF6FF", // Soft blue background for notes
    borderColor: "rgba(59, 130, 246, 0.2)",
  },
  newNoteCard: {
    backgroundColor: "#FFFBEB", // Soft amber background for new note
    borderColor: "rgba(245, 158, 11, 0.2)",
  },
  rinaCard: {
    backgroundColor: "#F5F3FF", // Soft purple background for RINA
    borderColor: "rgba(139, 92, 246, 0.2)",
  },
  cardIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  cardValue: {
    fontSize: 28,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginBottom: 6,
    marginTop: 12,
  },
  cardTitle: {
    fontSize: 15,
    color: "#64748B",
    fontFamily: "Inter-SemiBold",
    textAlign: "center",
    lineHeight: 18,
  },
  cardSubtitle: {
    fontSize: 12,
    color: "#9CA3AF",
    fontFamily: "Inter-Regular",
    textAlign: "center",
    lineHeight: 16,
    marginTop: 4,
  },
  cardActionText: {
    fontSize: 17,
    color: "#1E293B",
    fontFamily: "Inter-Bold",
    textAlign: "center",
    lineHeight: 20,
    marginTop: 12,
  },
  quickAccessCardHorizontal: {
    backgroundColor: "#FFFFFF",
    width: width * 0.35,
    marginRight: 16,
    borderRadius: 20,
    padding: 20,
    alignItems: "center",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.1,
    shadowRadius: 16,
    elevation: 6,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.6)",
  },
  quickAccessIcon: {
    width: 54,
    height: 54,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  quickAccessTitle: {
    fontSize: 14,
    color: "#64748B",
    fontFamily: "Inter-Medium",
    textAlign: "center",
    marginBottom: 8,
    lineHeight: 18,
  },
  quickAccessCount: {
    fontSize: 18,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
  },
  horizontalScrollContainer: {
    paddingLeft: 24,
    paddingBottom: 24, // Add some padding at the bottom for better spacing
    paddingTop: 8, // Add padding at the top for better spacing
  },
  firstCard: {
    marginLeft: 0,
  },
  taskCardHorizontal: {
    backgroundColor: "#FFFFFF",
    width: width * 0.7,
    marginRight: 16,
    borderRadius: 20,
    padding: 20,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    position: "relative", // Enable positioning for child elements
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.6)",
  },

  borderLeft: {
    position: "absolute",
    height: 70, // Cover more of the card height
    width: 6,
    backgroundColor: "#6A009C",
    left: 0,
    top: 20, // Align with taskTitle's vertical position
    borderTopLeftRadius: 3,
    borderBottomLeftRadius: 3,
    shadowColor: "#000",
    shadowOffset: { width: 1, height: 0 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },

  taskTitle: {
    fontSize: 18,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginBottom: 6,
    lineHeight: 22,
  },
  taskCategory: {
    fontSize: 14,
    color: "#6A009C",
    fontFamily: "Inter-Medium",
    backgroundColor: "#EDE7F6", // Light background for category
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  priorityBadge: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    minWidth: 70,
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#D1D5DB", // Light border for badge
  },

  taskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  taskInfo: {
    flex: 1,
    paddingRight: 12,
  },

  taskCardWrapper: {
    position: "relative",
  },

  taskOptionsMenu: {
    position: "absolute",
    top: 60,
    right: 10,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 4,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.6)",
    zIndex: 1000,
    minWidth: 140,
  },

  taskOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 2,
  },

  taskOptionText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#374151",
    marginLeft: 8,
  },

  deleteOption: {
    backgroundColor: "#FEF2F2",
  },

  deleteOptionText: {
    color: "#EF4444",
  },

  taskBody: {
    marginBottom: 16,
  },
  taskTime: {
    fontSize: 14,
    color: "#64748B",
    fontFamily: "Inter-Medium",
  },

  priorityText: {
    fontSize: 11,
    color: "#FFFFFF",
    fontFamily: "Inter-Bold",
    textTransform: "uppercase",
  },
  taskDivider: {
    height: 1,
    backgroundColor: "#c9ccceff",
    marginVertical: 8,
    marginHorizontal: 5, // extend to card edges
    opacity: 0.9,
  },
  taskFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  taskStatus: {
    fontSize: 13,
    fontFamily: "Inter-Medium",
  },
  taskAction: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
  },
  foldersContainer: {
    paddingHorizontal: 24,
  },
  foldersGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  folderCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  folderContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  folderIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  folderInfo: {
    flex: 1,
  },
  folderTitle: {
    fontSize: 16,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginBottom: 4,
    lineHeight: 20,
  },
  folderCount: {
    fontSize: 14,
    color: "#64748B",
    fontFamily: "Inter-Medium",
  },
  navbarContainer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(248, 250, 252, 0.95)",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
  },
  // Horizontal Folders Styles
  foldersHorizontalContainer: {
    paddingLeft: 24,
    paddingRight: 12,
    paddingBottom: 4,
  },
  folderCardHorizontal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 20,
    padding: 18,
    marginRight: 12,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 8,
    borderWidth: 2,
    borderColor: "rgba(139, 92, 246, 0.15)",
    width: 160,
    minHeight: 120,
    position: "relative",
    overflow: "hidden",
  },
  firstFolderCard: {
    marginLeft: 0,
  },
  folderIconHorizontal: {
    width: 56,
    height: 56,
    borderRadius: 16,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    alignSelf: "center",
  },
  folderInfoHorizontal: {
    flex: 1,
    alignItems: "center",
  },
  folderTitleHorizontal: {
    fontSize: 14,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginBottom: 4,
    lineHeight: 18,
    textAlign: "center",
  },
  folderCountHorizontal: {
    fontSize: 12,
    color: "#64748B",
    fontFamily: "Inter-Medium",
    textAlign: "center",
  },
  folderArrowContainer: {
    position: "absolute",
    top: 12,
    right: 12,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.8)",
    justifyContent: "center",
    alignItems: "center",
  },
  folderBorderAccent: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    width: 4,
    borderTopLeftRadius: 20,
    borderBottomLeftRadius: 20,
    zIndex: 1,
  },
});
function fetchTasks() {
  throw new Error("Function not implemented.");
}

