import { MaterialIcons } from "@expo/vector-icons";
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
import Navbar from "./NavBar";
import { RootStackParamList } from "./navigation/AppNavigator";
import AsyncStorage from "@react-native-async-storage/async-storage";

const { width } = Dimensions.get("window");

// API URL
const API_URL = "http://10.0.2.2:8000"; // For Android emulator
// const API_URL = "http://localhost:8000"; // For iOS simulator

const initialQuickAccess = [
  {
    id: 1,
    title: "Your Notes",
    icon: "note",
    count: "0",
    color: "#667EEA",
  },
  {
    id: 2,
    title: "Study Materials",
    icon: "library-books",
    count: "0",
    color: "#F093FB",
  },
  {
    id: 3,
    title: "Ask RINA",
    icon: "psychology",
    count: "AI",
    color: "#4FACFE",
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
  // State for data
  const [quickAccess, setQuickAccess] = useState(initialQuickAccess);
  const [priorityTasks, setPriorityTasks] = useState<any[]>([]);
  const [recentActivity, setRecentActivity] = useState<any[]>([]);

  // Loading states
  const [loadingTasks, setLoadingTasks] = useState(true);
  const [loadingActivity, setLoadingActivity] = useState(true);
  const [loadingQuickAccess, setLoadingQuickAccess] = useState(true);

  // Error states
  const [tasksError, setTasksError] = useState<string | null>(null);
  const [activityError, setActivityError] = useState<string | null>(null);
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
          fetch(`${API_URL}/auth/user/`, {
            method: "GET",
            headers: {
              "Authorization": `Token ${token}`,
              "Cache-Control": "no-cache"
            },
          }),
          fetch(`${API_URL}/get_username/`, {
            method: "GET",
            headers: {
              "Authorization": `Token ${token}`,
              "Cache-Control": "no-cache"
            },
          })
        ];

        // Wait for the fastest response
        const fastestResponse = await Promise.race(endpoints);
        
        if (fastestResponse.ok) {
          const contentType = fastestResponse.headers.get("content-type");
          if (contentType && contentType.includes("application/json")) {
            const userData = await fastestResponse.json();
            if (userData) {
              const extractedUsername = userData.username || userData.name || userData.user?.username;
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
          if (result.status === 'fulfilled' && result.value.ok) {
            try {
              const contentType = result.value.headers.get("content-type");
              if (contentType && contentType.includes("application/json")) {
                const userData = await result.value.json();
                if (userData) {
                  const extractedUsername = userData.username || userData.name || userData.user?.username;
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

  // Fetch notes count for Quick Access with optimized caching
  useEffect(() => {
    const fetchNotesCount = async () => {
      try {
        setLoadingQuickAccess(true);
        
        // Try to get cached count first for immediate display
        const cachedCount = await AsyncStorage.getItem("notesCount");
        if (cachedCount) {
          const updatedQuickAccess = [...quickAccess];
          const noteIndex = updatedQuickAccess.findIndex(item => item.title === "Your Notes");
          if (noteIndex !== -1) {
            updatedQuickAccess[noteIndex].count = cachedCount;
            setQuickAccess(updatedQuickAccess);
          }
        }
        
        const token = await AsyncStorage.getItem("authToken");
        if (!token) {
          navigation.navigate("Login");
          return;
        }

        const response = await fetch(`${API_URL}/note_taking/notes/`, {
          headers: {
            "Authorization": `Token ${token}`,
            "Cache-Control": "no-cache"
          },
        });

        if (response.ok) {
          const notes = await response.json();

          // Update the notes count in quickAccess
          const updatedQuickAccess = [...quickAccess];
          const noteIndex = updatedQuickAccess.findIndex(item => item.title === "Your Notes");
          if (noteIndex !== -1) {
            const count = notes.length.toString();
            updatedQuickAccess[noteIndex].count = count;
            setQuickAccess(updatedQuickAccess);
            
            // Cache the count for faster loading next time
            await AsyncStorage.setItem("notesCount", count);
          }
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
          const response = await fetch(`${API_URL}/task_manager/tasks/?filter=active`, {
            headers: {
              "Authorization": `Token ${token}`,
              "Cache-Control": "no-cache"
            },
            signal: controller.signal
          });
          
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
              const priorityOrder = { urgent_important: 3, not_urgent_important: 2, urgent_not_important: 1, not_urgent_not_important: 0 };
              return priorityOrder[b.priority as keyof typeof priorityOrder] - priorityOrder[a.priority as keyof typeof priorityOrder];
            })
            .slice(0, 3) // Get top 3 priority tasks
            .map((task: any) => ({
              id: task.id,
              title: task.text,
              subject: task.category ? task.category.name : "General",
              time: task.due_date ? new Date(task.due_date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : "No due date",
              priority: mapPriority(task.priority),
              status: mapStatus(task.status),
            }));

          setPriorityTasks(transformedTasks);
          
          // Cache the tasks for faster loading next time
          await AsyncStorage.setItem("priorityTasks", JSON.stringify(transformedTasks));
        } catch (error: any) {
          if (error.name === 'AbortError') {
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

  // Fetch recent activity with optimized performance
  useEffect(() => {
    const fetchRecentActivity = async () => {
      try {
        setLoadingActivity(true);
        setActivityError(null);

        // Try to get cached activity first for immediate display
        const cachedActivity = await AsyncStorage.getItem("recentActivity");
        if (cachedActivity) {
          setRecentActivity(JSON.parse(cachedActivity));
        }

        const token = await AsyncStorage.getItem("authToken");
        if (!token) {
          navigation.navigate("Login");
          return;
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 10000); // 10 second timeout

        try {
          // Fetch notes and tasks for recent activity in parallel
          const [notesResponse, tasksResponse] = await Promise.all([
            fetch(`${API_URL}/note_taking/notes/`, {
              headers: { 
                "Authorization": `Token ${token}`,
                "Cache-Control": "no-cache"
              },
              signal: controller.signal
            }),
            fetch(`${API_URL}/task_manager/tasks/`, {
              headers: { 
                "Authorization": `Token ${token}`,
                "Cache-Control": "no-cache"
              },
              signal: controller.signal
            })
          ]);

          clearTimeout(timeoutId);

          if (!notesResponse.ok || !tasksResponse.ok) {
            throw new Error("Failed to fetch activity data");
          }

          // Process responses in parallel
          const [notes, tasks] = await Promise.all([
            notesResponse.json(),
            tasksResponse.json()
          ]);

          // Pre-compute the current date to avoid creating multiple Date objects
          const now = new Date();

          // Process notes and tasks in parallel using map
          const noteActivities = notes.map((note: any) => ({
            id: note.id,
            type: "note",
            title: note.title || "Untitled Note",
            subject: getSubjectFromTags(note.tags),
            time: formatTimeAgo(new Date(note.updated_at), now),
            updatedAt: new Date(note.updated_at),
          }));

          const taskActivities = tasks.map((task: any) => ({
            id: task.id,
            type: "task",
            title: task.text || "Unnamed Task",
            subject: task.category?.name || "General",
            time: formatTimeAgo(new Date(task.updated_at), now),
            updatedAt: new Date(task.updated_at),
          }));

          // Combine activities
          const combinedActivity = [...noteActivities, ...taskActivities];

          // Sort by most recent
          combinedActivity.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime());
          
          const recentActivities = combinedActivity.slice(0, 5); // Get top 5
          setRecentActivity(recentActivities);
          
          // Cache the result for faster loading next time
          await AsyncStorage.setItem("recentActivity", JSON.stringify(recentActivities));
          
        } catch (error: any) {
          if (error.name === 'AbortError') {
            console.warn("Fetch activity request timed out");
          } else {
            throw error;
          }
        }
      } catch (error) {
        console.error("Error fetching recent activity:", error);
        setActivityError("Failed to load activity");
      } finally {
        setLoadingActivity(false);
      }
    };

    fetchRecentActivity();
    
    // Set up a refresh interval for recent activity
    const refreshInterval = setInterval(fetchRecentActivity, 60000); // Refresh every minute
    
    // Clean up on component unmount
    return () => clearInterval(refreshInterval);
  }, []);

  // Helper function to get subject from tags
  const getSubjectFromTags = (tags: any[]) => {
    if (!tags || tags.length === 0) return "General";
    return typeof tags[0] === 'object' ? tags[0].name : tags[0];
  };

  // Helper function to format time ago with improved performance
  const formatTimeAgo = (date: Date, now?: Date) => {
    // Use provided now or create a new Date
    const currentTime = now || new Date();
    const diffInMs = currentTime.getTime() - date.getTime();
    
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInMinutes < 1) {
      return "Just now";
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes} ${diffInMinutes === 1 ? 'minute' : 'minutes'} ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours} ${diffInHours === 1 ? 'hour' : 'hours'} ago`;
    } else {
      return `${diffInDays} ${diffInDays === 1 ? 'day' : 'days'} ago`;
    }
  };

  // Helper function to map priority from backend to UI
  const mapPriority = (priority: string) => {
    switch (priority) {
      case 'urgent_important':
        return 'High';
      case 'not_urgent_important':
        return 'Medium';
      case 'urgent_not_important':
        return 'Medium';
      case 'not_urgent_not_important':
        return 'Low';
      default:
        return 'Medium';
    }
  };

  // Helper function to map status from backend to UI
  const mapStatus = (status: string) => {
    switch (status) {
      case 'not_started':
        return 'Pending';
      case 'in_progress':
        return 'In Progress';
      case 'completed':
        return 'Completed';
      default:
        return 'Pending';
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

  const getActivityIcon = (
    type: string
  ): keyof typeof MaterialIcons.glyphMap => {
    switch (type) {
      case 'note':
        return 'note';
      case 'task':
        return 'check-circle';
      case 'quiz':
        return 'quiz';
      case 'study':
        return 'school';
      default:
        return 'history';
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#F8FAFC" />

      <ScrollView 
        style={styles.content} 
        showsVerticalScrollIndicator={false}
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
                "recentActivity"
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
        {/* Header with animation effect */}
        <View style={styles.header}>
          <View style={styles.headerGreeting}>
            {/* Base the greeting on the time of day in the user's timezone */}
            <Text style={styles.welcomeText}>{getGreeting()},</Text>
            <Text style={styles.nameText}>{username}! 👋</Text>
          </View>
          <TouchableOpacity style={styles.notificationIcon}>
            <View style={styles.notificationIconContainer}>
              <MaterialIcons name="notifications" size={22} color="#6A009C" />
              <View style={styles.notificationDot} />
            </View>
          </TouchableOpacity>
        </View>

        {/* Quick Access */}
        <View style={styles.section}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>Quick Access</Text>
          </View>
          {loadingQuickAccess ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color="#6A009C" />
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalScrollContainer}
            >
              {quickAccess.map((item, index) => (
                <TouchableOpacity
                  key={item.id}
                  style={[
                    styles.quickAccessCardHorizontal,
                    index === 0 && styles.firstCard,
                  ]}
                  activeOpacity={0.7}
                  onPress={() => {
                    if (item.title === "Your Notes") {
                      navigation.navigate("Notes");
                    } else if (item.title === "Ask RINA") {
                      navigation.navigate("RINA");
                    }
                  }}
                >
                  <View
                    style={[
                      styles.quickAccessIcon,
                      { backgroundColor: item.color },
                    ]}
                  >
                    <MaterialIcons
                      name={getActivityIcon(item.icon)}
                      size={24}
                      color="#FFFFFF"
                    />
                  </View>
                  <Text style={styles.quickAccessTitle}>{item.title}</Text>
                  <Text style={styles.quickAccessCount}>{item.count}</Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Priority Tasks */}
        <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Priority Tasks</Text>
          <TouchableOpacity onPress={() => navigation.navigate("AllItemsView", { viewType: 'tasks' })}>
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
                onPress={() => navigation.navigate("AddTask", { quadrant: 'urgent-important' })}
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
                onPress={() => navigation.navigate("AddTask", { quadrant: 'urgent-important' })}
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
                  onPress={() => navigation.navigate("AddTask", { quadrant: task.priority.toLowerCase() })}
                >
                  <View style={styles.borderLeft} />
                  <View style={styles.taskHeader}>
                    <View style={styles.taskInfo}>
                      <Text style={styles.taskTitle} numberOfLines={2}>
                        {task.title}
                      </Text>
                      <Text style={styles.taskSubject}>{task.subject}</Text>
                    </View>
                    <View
                      style={[
                        styles.priorityBadge,
                        { backgroundColor: getPriorityColor(task.priority) },
                      ]}
                    >
                      <Text style={styles.priorityText}>{task.priority}</Text>
                    </View>
                  </View>

                  <View style={styles.taskBody}>
                    <Text style={styles.taskTime}>{task.time}</Text>
                  </View>

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
                      <MaterialIcons name="more-vert" size={18} color="#9CA3AF" />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Recent Activity */}
        <View style={styles.section}>
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>Recent Activity</Text>
          <TouchableOpacity onPress={() => navigation.navigate("AllItemsView", { viewType: 'activity' })}>
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>          {loadingActivity ? (
            <View style={styles.loaderContainer}>
              <ActivityIndicator size="large" color="#6A009C" />
            </View>
          ) : activityError ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{activityError}</Text>
            </View>
          ) : recentActivity.length === 0 ? (
            <View style={styles.emptyContainer}>
              <MaterialIcons name="history" size={48} color="#CBD5E0" />
              <Text style={styles.emptyText}>No recent activity</Text>
            </View>
          ) : (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.horizontalScrollContainer}
            >
              {recentActivity.map((activity, index) => (
                <TouchableOpacity
                  key={`${activity.type}-${activity.id}`}
                  style={[
                    styles.activityCardHorizontal,
                    index === 0 && styles.firstCard,
                  ]}
                  activeOpacity={0.8}
                  onPress={() => {
                    if (activity.type === 'note') {
                      navigation.navigate("Notes");
                    } else if (activity.type === 'task') {
                      navigation.navigate("TaskDetails", {
                        taskId: activity.id,
                      });
                    }
                  }}
                >
                  <View style={styles.activityIcon}>
                    <MaterialIcons
                      name={getActivityIcon(activity.type)}
                      size={20}
                      color="#6A009C"
                    />
                  </View>
                  <View style={styles.activityContent}>
                    <Text style={styles.activityTitle} numberOfLines={2}>
                      {activity.title}
                    </Text>
                    <Text style={styles.activitySubject}>{activity.subject}</Text>
                    <Text style={styles.activityTime}>{activity.time}</Text>
                  </View>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}
        </View>

        {/* Bottom spacing for navbar */}
        <View style={{ height: 20 }} />
      </ScrollView>

      {/* Navigation Bar */}
      <Navbar activeRoute="Home" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8fafc",
    paddingBottom: 80, // Space for the navbar
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 20 : 40,
    paddingBottom: 24,
    backgroundColor: "#F8FAFC",
    borderBottomWidth: 1,
    borderBottomColor: "rgba(226, 232, 240, 0.6)",
  },
  headerGreeting: {
    flex: 1,
  },
  welcomeText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    lineHeight: 20,
  },
  nameText: {
    fontSize: 28,
    fontFamily: "Inter-Bold",
    color: "#6A009C",
    marginTop: 4,
    lineHeight: 32,
  },
  notificationIcon: {
    padding: 8,
  },
  notificationIconContainer: {
    position: "relative",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 4,
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
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorContainer: {
    height: 150,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 24,
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
  },
  errorText: {
    color: '#EF4444',
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    marginBottom: 8,
  },
  retryButton: {
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    backgroundColor: '#6A009C',
    borderRadius: 8,
  },
  retryText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-Medium',
    fontSize: 14,
  },
  emptyContainer: {
    height: 180,
    justifyContent: 'center',
    alignItems: 'center',
    marginHorizontal: 24,
    backgroundColor: '#FFFFFF',
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
    color: '#94A3B8',
    fontFamily: 'Inter-Medium',
    fontSize: 16,
    marginTop: 12,
    marginBottom: 16,
    textAlign: 'center',
  },
  addButton: {
    marginTop: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    backgroundColor: '#6A009C',
    borderRadius: 12,
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  addButtonText: {
    color: '#FFFFFF',
    fontFamily: 'Inter-SemiBold',
    fontSize: 16,
  },
  quickAccessGrid: {
    flexDirection: "row",
    paddingHorizontal: 24,
    justifyContent: "space-between",
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
    backgroundColor: "#f8fafc", // Ensure horizontal scroll area has background color
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
  taskSubject: {
    fontSize: 14,
    color: "#6A009C",
    fontFamily: "Inter-Medium",
    backgroundColor: "#EDE7F6", // Light background for subject
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
  activityCardHorizontal: {
    backgroundColor: "#FFFFFF",
    width: width * 0.65,
    marginRight: 16,
    borderRadius: 16,
    padding: 16,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.6)",
  },
  activityIcon: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: "#f1e6ff",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
    alignSelf: "flex-start",
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  activityContent: {
    flex: 1,
  },
  activityTitle: {
    fontSize: 15,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginBottom: 6,
    lineHeight: 18,
  },
  activitySubject: {
    fontSize: 12,
    color: "#6A009C",
    fontFamily: "Inter-Medium",
    backgroundColor: "#f2e5f8ff",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    alignSelf: "flex-start",
    marginBottom: 8,
  },
  activityTime: {
    fontSize: 12,
    color: "#64748B",
    fontFamily: "Inter-Regular",
  },
});