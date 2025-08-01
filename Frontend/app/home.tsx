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
  SafeAreaView,
  Platform,
  ActivityIndicator,
  RefreshControl,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import Navbar from "./NavBar";
import { RootStackParamList } from "./navigation/AppNavigator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_BASE_URL, API_ENDPOINTS } from "../constants/ApiConfig";

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
  const [notesCount, setNotesCount] = useState(0);
  const [notesFolders, setNotesFolders] = useState<any[]>([]);

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
    // Get current time in user's timezone
    const date = new Date().toLocaleDateString("en-US", {
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    const hours = new Date(date).getHours();
    if (hours < 12) {
      return "Good Morning";
    } else if (hours < 18) {
      return "Good Afternoon";
    } else {
      return "Good Evening";
    }
  };

  // Fetch user info with optimized error handling
  useEffect(() => {
    const fetchUserInfo = async () => {
      try {
        setLoading(true);

        // First try to get username from local storage for immediate display
        const cachedUsername = await AsyncStorage.getItem("username");
        if (cachedUsername) {
          setUsername(cachedUsername);
          // Still continue to fetch from API for the latest data
        } else {
          setUsername("User"); // Default while fetching
        }

        const token = await AsyncStorage.getItem("authToken");
        if (!token) {
          console.log("No auth token found");
          return;
        }

        // Using Promise.race to use whichever endpoint responds first
        const endpoints = [
          fetch(`${API_BASE_URL}/auth/user/`, {
            method: "GET",
            headers: {
              Authorization: `Token ${token}`,
              "Cache-Control": "no-cache",
            },
          }),
          fetch(`${API_BASE_URL}${API_ENDPOINTS.GET_USERNAME}`, {
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
        const cachedCount = await AsyncStorage.getItem("notesCount");
        if (cachedCount) {
          setNotesCount(parseInt(cachedCount));
        }

        const token = await AsyncStorage.getItem("authToken");
        if (!token) {
          navigation.navigate("Login");
          return;
        }

        const response = await fetch(`${API_BASE_URL}${API_ENDPOINTS.NOTES}`, {
          headers: {
            Authorization: `Token ${token}`,
            "Cache-Control": "no-cache",
          },
        });

        if (response.ok) {
          const notes = await response.json();
          const count = notes.length;
          setNotesCount(count);

          // Cache the count for faster loading next time
          await AsyncStorage.setItem("notesCount", count.toString());
        }
      } catch (error) {
        console.error("Error fetching notes count:", error);
      } finally {
        setLoadingQuickAccess(false);
      }
    };

    fetchNotesCount();
  }, []);

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
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        try {
          const response = await fetch(
            `${API_BASE_URL}${API_ENDPOINTS.TASKS}?filter=active`,
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

          // Transform the tasks data to match our UI structure
          const transformedTasks = tasks
            .filter((task: any) => !task.completed)
            .sort((a: any, b: any) => {
              // Sort by priority: high > medium > low
              const priorityOrder = {
                urgent_important: 3,
                not_urgent_important: 2,
                urgent_not_important: 1,
                not_urgent_not_important: 0,
              };
              return (
                priorityOrder[b.priority as keyof typeof priorityOrder] -
                priorityOrder[a.priority as keyof typeof priorityOrder]
              );
            })
            .slice(0, 3) // Get top 3 priority tasks
            .map((task: any) => ({
              id: task.id,
              title: task.text,
              category: task.category ? task.category.name : "General",
              time: task.due_date
                ? new Date(task.due_date).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  })
                : "No due date",
              priority: mapPriority(task.priority),
              status: mapStatus(task.status),
            }));

          setPriorityTasks(transformedTasks);

          // Update today's tasks count
          const today = new Date();
          const todayTasks = tasks.filter((task: any) => {
            if (!task.due_date) return false;
            const taskDate = new Date(task.due_date);
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
          // Fetch notes to organize by folders
          const response = await fetch(
            `${API_BASE_URL}${API_ENDPOINTS.NOTES}`,
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
            throw new Error("Failed to fetch notes for folders");
          }

          const notes = await response.json();

          // Organize notes by folders/categories
          const folderMap = new Map();

          // Add unorganized notes folder first
          folderMap.set("Unorganized", {
            id: "unorganized",
            name: "Unorganized",
            color: "#94A3B8", // Gray color for unorganized
            notes: [],
            count: 0,
          });

          // Process notes and categorize them
          notes.forEach((note: any) => {
            if (note.tags && note.tags.length > 0) {
              // Use the first tag as the folder
              const folderTag = note.tags[0];
              const folderName =
                typeof folderTag === "object" ? folderTag.name : folderTag;

              if (!folderMap.has(folderName)) {
                folderMap.set(folderName, {
                  id: folderName.toLowerCase().replace(/\s+/g, "-"),
                  name: folderName,
                  color: getFolderColor(folderName),
                  notes: [],
                  count: 0,
                });
              }

              const folder = folderMap.get(folderName);
              folder.notes.push(note);
              folder.count++;
            } else {
              // Add to unorganized folder
              const unorganizedFolder = folderMap.get("Unorganized");
              unorganizedFolder.notes.push(note);
              unorganizedFolder.count++;
            }
          });

          // Convert map to array and sort by most recent activity
          const foldersArray = Array.from(folderMap.values())
            .filter((folder) => folder.count > 0) // Only show folders with notes
            .sort((a, b) => {
              // Sort unorganized first, then by count
              if (a.name === "Unorganized") return -1;
              if (b.name === "Unorganized") return 1;
              return b.count - a.count;
            })
            .slice(0, 5); // Get top 5 folders

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

    fetchNotesFolders();

    // Set up a refresh interval for folders
    const refreshInterval = setInterval(fetchNotesFolders, 60000); // Refresh every minute

    // Clean up on component unmount
    return () => clearInterval(refreshInterval);
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
    <View style={styles.rootContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      {/* Container for both header and content */}
      <View style={styles.container}>
        {/* Header positioned behind content */}
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

        {/* Main Content Container positioned above header */}
        <View style={styles.mainContentContainer}>
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

                  // Re-run all the fetch useEffects
                  const token = await AsyncStorage.getItem("authToken");
                  if (!token) {
                    navigation.navigate("Login");
                    return;
                  }

                  // The useEffects will run automatically
                  setLoading(false);
                }}
                colors={["#6A009C"]}
                tintColor="#6A009C"
              />
            }
          >
            {/* Quick Stats & Actions */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Quick Overview</Text>
              </View>
              {loadingQuickAccess ? (
                <View style={styles.loaderContainer}>
                  <ActivityIndicator size="large" color="#6A009C" />
                </View>
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
            </View>

            {/* Priority Tasks */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Today's Focus</Text>
                <TouchableOpacity
                  onPress={() =>
                    navigation.navigate("AllItemsView", { viewType: "tasks" })
                  }
                >
                  <Text style={styles.seeAllText}>See All</Text>
                </TouchableOpacity>
              </View>
              {loadingTasks ? (
                <View style={styles.loaderContainer}>
                  <ActivityIndicator size="large" color="#6A009C" />
                </View>
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
                    <TouchableOpacity
                      key={task.id}
                      style={[
                        styles.taskCardHorizontal,
                        index === 0 && styles.firstCard,
                      ]}
                      activeOpacity={0.8}
                      onPress={() =>
                        navigation.navigate("AddTask", {
                          quadrant: task.priority.toLowerCase(),
                        })
                      }
                    >
                      <View style={styles.borderLeft} />
                      <View style={styles.taskHeader}>
                        <View style={styles.taskInfo}>
                          <Text style={styles.taskTitle} numberOfLines={2}>
                            {task.title}
                          </Text>
                          <Text style={styles.taskCategory}>{task.category}</Text>
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
                      {/* Divider between time and footer */}
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
                        <TouchableOpacity style={styles.taskAction}>
                          <MaterialIcons
                            name="more-vert"
                            size={18}
                            color="#9CA3AF"
                          />
                        </TouchableOpacity>
                      </View>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}
            </View>

            {/* Notes Folders */}
            <View style={styles.section}>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Notes Folders</Text>
                <TouchableOpacity onPress={() => navigation.navigate("Notes")}>
                  <Text style={styles.seeAllText}>See All</Text>
                </TouchableOpacity>
              </View>
              {loadingFolders ? (
                <View style={styles.loaderContainer}>
                  <ActivityIndicator size="large" color="#6A009C" />
                </View>
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
                <View style={styles.foldersContainer}>
                  {notesFolders.map((folder, index) => (
                    <TouchableOpacity
                      key={folder.id}
                      style={[
                        styles.folderCard,
                        { backgroundColor: `${folder.color}15` },
                      ]}
                      activeOpacity={0.8}
                      onPress={() => navigation.navigate("Notes")}
                    >
                      <View style={styles.folderContent}>
                        <View
                          style={[
                            styles.folderIcon,
                            { backgroundColor: `${folder.color}30` },
                          ]}
                        >
                          <MaterialIcons
                            name="folder"
                            size={24}
                            color={folder.color}
                          />
                        </View>
                        <View style={styles.folderInfo}>
                          <Text style={styles.folderTitle} numberOfLines={1}>
                            {folder.name}
                          </Text>
                          <Text style={styles.folderCount}>
                            {folder.count}{" "}
                            {folder.count === 1 ? "note" : "notes"}
                          </Text>
                        </View>
                      </View>
                      <MaterialIcons
                        name="chevron-right"
                        size={20}
                        color={folder.color}
                      />
                    </TouchableOpacity>
                  ))}
                </View>
              )}
            </View>

            {/* Bottom spacing for navbar */}
            <View style={{ height: 100 }} />
          </ScrollView>
        </View>

        {/* Navigation Bar - positioned to overlay content */}
        <View style={styles.navbarContainer}>
          <Navbar activeRoute="Home" />
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: "#ffffffff",
  },
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
    paddingTop: Platform.OS === "ios" ? 50 : 35,
    paddingBottom: 100,
    zIndex: 1,
  },
  mainContentContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: 160, // Position it below the header
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
    paddingTop: 20, // Reduced since content is in separate container
    paddingBottom: 100,
  },
  section: {
    marginBottom: 32,
    position: "relative",
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
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
    backgroundColor: '#c9ccceff',
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
    borderColor: "rgba(226, 232, 240, 0.3)",
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
});
