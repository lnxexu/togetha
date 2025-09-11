import React, { useState, useCallback } from "react";
import { MaterialIcons, Ionicons, Entypo } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import Navbar from "../NavBar";
import EisenhowerMatrix from "./components/EisenhowerMatrix";
import TaskListView from "./components/TaskListView";
import { Task, TaskCategory } from "./types/Task";
import { LinearGradient } from "expo-linear-gradient";
import  taskService  from "./services/taskService";
import { categoryService } from "./services/categoryService";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getEnhancedSafeAreaConfig, getStatusBarConfig, getSafeAreaContainerStyle } from '../utils/SafeAreaUtils';
import EnhancedLoadingScreen from '../components/EnhancedLoadingScreen';
import SkeletonLoader from '../components/SkeletonLoader';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  Dimensions,
  Modal,
  SafeAreaView,
  StatusBar,
  useWindowDimensions,
  Animated,
  FlatList,
  TextInput,
} from "react-native";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const ToDo: React.FC = () => {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const isLandscape = width > height;
  const safeAreaConfig = getEnhancedSafeAreaConfig(insets, height, isLandscape);
  const statusBarConfig = getStatusBarConfig();
  const safeAreaStyle = getSafeAreaContainerStyle();
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const navigation = useNavigation<NavigationProp>();
  const [viewMode, setViewMode] = useState<"matrix" | "list">("matrix");
  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [selectedFilter, setSelectedFilter] = useState<
    "all" | "pending" | "completed" | "overdue"
  >("all");
  const [selectedCategory, setSelectedCategory] = useState<"all" | string>(
    "all"
  );

  // Enhanced states for improved calendar and UX
  const [selectedStatus, setSelectedStatus] = useState<
    "all" | "pending" | "completed" | "overdue"
  >("all");
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [calendarViewMode, setCalendarViewMode] = useState<"month" | "week">("month");
  const [animatedValue] = useState(new Animated.Value(0));
  const [showQuickFilters, setShowQuickFilters] = useState(false);
  
  // Selected date tasks modal state
  const [showDateTasksModal, setShowDateTasksModal] = useState(false);
  const [dateTasksModalDate, setDateTasksModalDate] = useState<Date | null>(null);
  
  // More vert menu state
  const [showMoreVertMenu, setShowMoreVertMenu] = useState(false);
  
  // Dropdown options
  const statusOptions = [
    { value: "all", label: "All Tasks" },
    { value: "pending", label: "Pending" },
    { value: "completed", label: "Completed" },
    { value: "overdue", label: "Overdue" },
  ];
  const viewOptions = [
    { value: "matrix", label: "Matrix View" },
    { value: "list", label: "List View" },
  ];

  // Dropdown handlers
  const handleStatusSelect = (
    status: "all" | "pending" | "completed" | "overdue"
  ) => {
    setSelectedStatus(status);
    setSelectedFilter(status);
  };

  // Enhanced date task handlers
  const handleCalendarDateClick = (date: Date) => {
    const tasksForDate = getTasksForDate(date);
    if (tasksForDate.length > 0) {
      setDateTasksModalDate(date);
      setShowDateTasksModal(true);
    }
    setSelectedDate(date);
  };

  const handleTaskClick = (taskId: string) => {
    navigation.navigate("TaskDetails", { taskId });
  };

  // Enhanced Calendar Functions with Google Calendar-like features
  const getWeekDates = () => {
    const startOfWeek = new Date(calendarDate);
    startOfWeek.setDate(calendarDate.getDate() - calendarDate.getDay());

    const weekDates = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(startOfWeek);
      date.setDate(startOfWeek.getDate() + i);
      weekDates.push(date);
    }
    return weekDates;
  };

  // Enhanced calendar days generation with better week handling
  const getCalendarDays = () => {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startDate = new Date(firstDay);
    startDate.setDate(startDate.getDate() - firstDay.getDay());

    const days = [];
    for (let i = 0; i < 42; i++) {
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      days.push(date);
    }
    return days;
  };

  // Get tasks for a specific date (Google Calendar style)
  const getTasksForDate = (date: Date) => {
    return tasks.filter(task => {
      if (!task.due_datetime) return false;
      const taskDate = new Date(task.due_datetime);
      return taskDate.toDateString() === date.toDateString();
    });
  };

  // Quick navigation functions
  const navigateToToday = () => {
    const today = new Date();
    setCalendarDate(today);
    setSelectedDate(today);
  };

  const navigateToPrevPeriod = () => {
    const newDate = new Date(calendarDate);
    if (calendarViewMode === "month") {
      newDate.setMonth(newDate.getMonth() - 1);
    } else {
      newDate.setDate(newDate.getDate() - 7);
    }
    setCalendarDate(newDate);
  };

  const navigateToNextPeriod = () => {
    const newDate = new Date(calendarDate);
    if (calendarViewMode === "month") {
      newDate.setMonth(newDate.getMonth() + 1);
    } else {
      newDate.setDate(newDate.getDate() + 7);
    }
    setCalendarDate(newDate);
  };

  const weekDates = getWeekDates();
  const calendarDays = getCalendarDays();
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const monthNames = [
    "Jan",
    "Feb",
    "Mar",
    "Apr",
    "May",
    "Jun",
    "Jul",
    "Aug",
    "Sep",
    "Oct",
    "Nov",
    "Dec",
  ];

  // Load tasks when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadTasks();
      loadCategories();
    }, [])
  );

  // Load categories function
  const loadCategories = async () => {
    try {
      const availableCategories = await categoryService.getCategories();
      setCategories(availableCategories);
    } catch (error) {
      console.error('Error loading categories:', error);
    }
  };

  // Initialize animation when modal opens
  React.useEffect(() => {
    if (showCalendarModal) {
      Animated.timing(animatedValue, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true,
      }).start();
    } else {
      animatedValue.setValue(0);
    }
  }, [showCalendarModal]);

  const loadTasks = async () => {
    try {
      setIsLoading(true);
      console.log("Fetching tasks from the server...");

      const loadedTasks = await taskService.getAllTasks();

      console.log(
        `Successfully loaded ${loadedTasks.length} tasks from the server`
      );
      setTasks(loadedTasks);
    } catch (error) {
      console.error("Error loading tasks:", error);
      Alert.alert(
        "Error",
        "Failed to load tasks. Please check your connection and try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddTask = (quadrant?: string) => {
    navigation.navigate("AddTask", { quadrant: quadrant as any });
  };

  const handleTaskPress = (taskId: string) => {
    navigation.navigate("TaskDetails", { taskId });
  };

  const handleDeleteTask = async (taskId: string) => {
    Alert.alert("Delete Task", "Are you sure you want to delete this task?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await taskService.deleteTask(taskId);
            await loadTasks();
          } catch (error) {
            Alert.alert("Error", "Failed to delete task");
          }
        },
      },
    ]);
  };

  const handleMarkComplete = async (taskId: string) => {
    try {
      await taskService.markTaskComplete(taskId);
      await loadTasks();
    } catch (error) {
      Alert.alert("Error", "Failed to update task");
    }
  };

  const filteredTasks = tasks
    .filter((task) => {
      // Filter by status/completion state
      if (selectedStatus === "completed") return task.completed;
      if (selectedStatus === "pending") return !task.completed && !task.overdue;
      if (selectedStatus === "overdue") return task.overdue && !task.completed;
      if (selectedStatus === "all") {
        // Additional filtering by the horizontal filter buttons
        if (selectedFilter === "completed") return task.completed;
        if (selectedFilter === "pending")
          return !task.completed && !task.overdue;
        if (selectedFilter === "overdue")
          return task.overdue && !task.completed;
      }
      return true;
    })
    .filter((task) => {
      // Filter by category/subject
      if (selectedCategory === "all") return true;
      return task.category === selectedCategory;
    });

  // Get category names for filtering (derived from categories state)
  const categoryNames = categories.map(cat => cat.name);

  const isDateSelected = (date: Date) => {
    return date.toDateString() === selectedDate.toDateString();
  };

  const isCurrentDate = (date: Date) => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  const isCurrentMonth = (date: Date) => {
    return date.getMonth() === calendarDate.getMonth();
  };

  const handleCalendarDateSelect = (date: Date) => {
    handleCalendarDateClick(date);
    setShowCalendarModal(false);
  };

  const getCurrentDateDisplay = () => {
    const today = new Date();
    return today.getDate().toString();
  };

  // More vert menu handlers
  const handleMoreVertPress = () => {
    setShowMoreVertMenu(!showMoreVertMenu);
  };

  const handleMarkAllCompleted = async () => {
    Alert.alert(
      "Mark All Completed",
      "Are you sure you want to mark all pending tasks as completed?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Mark All Completed",
          style: "default",
          onPress: async () => {
            try {
              const pendingTasks = tasks.filter(task => !task.completed);
              for (const task of pendingTasks) {
                await taskService.markTaskComplete(task.id);
              }
              await loadTasks();
              setShowMoreVertMenu(false);
              Alert.alert("Success", "All tasks marked as completed!");
            } catch (error) {
              Alert.alert("Error", "Failed to update tasks");
            }
          },
        },
      ]
    );
  };

  const handleDeleteAllCompleted = async () => {
    Alert.alert(
      "Delete All Completed",
      "Are you sure you want to delete all completed tasks? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete All",
          style: "destructive",
          onPress: async () => {
            try {
              const completedTasks = tasks.filter(task => task.completed);
              for (const task of completedTasks) {
                await taskService.deleteTask(task.id);
              }
              await loadTasks();
              setShowMoreVertMenu(false);
              Alert.alert("Success", "All completed tasks deleted!");
            } catch (error) {
              Alert.alert("Error", "Failed to delete tasks");
            }
          },
        },
      ]
    );
  };

  const handleRefreshTasks = async () => {
    setShowMoreVertMenu(false);
    await loadTasks();
  };

  const handleExportTasks = () => {
    setShowMoreVertMenu(false);
    navigation.navigate("CompletedTasks" as any);
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />
      <SafeAreaView style={[styles.container, safeAreaStyle]}>
        {/* Header */}
        <LinearGradient
          colors={["#A855F7", "#8B5CF6", "#7C3AED"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.header, { paddingTop: safeAreaConfig.paddingTop }]}
        >
        <View style={styles.headerTopRow}>
          <View style={styles.headerTitleSection}>
            <Text style={styles.title}>Tasks</Text>
          </View>
          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.calendarButton}
              onPress={() => setShowCalendarModal(true)}
            >
              <Ionicons
                name="calendar"
                size={24}
                color="#ffffffff"
                elevation={10}
                shadowColor="#2c2c2cff"
                shadowOffset={{ width: 0, height: 2 }}
                shadowOpacity={0.8}
                shadowRadius={8}
              />
              <View style={styles.currentDateIndicator} />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.viewToggleButton}
              onPress={() =>
                setViewMode(viewMode === "matrix" ? "list" : "matrix")
              }
            >
              <Ionicons
                name={viewMode === "matrix" ? "list" : "grid"}
                size={24}
                color="#ffffffff"
                elevation={10}
                shadowColor="#2c2c2cff"
                shadowOffset={{ width: 0, height: 2 }}
                shadowOpacity={0.8}
                shadowRadius={8}
              />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.moreVertButton}
              onPress={handleMoreVertPress}
            >
              <Entypo
                name="dots-three-vertical"
                size={20}
                color="#ffffffff"
                elevation={10}
                shadowColor="#2c2c2cff"
                shadowOffset={{ width: 0, height: 2 }}
                shadowOpacity={0.8}
                shadowRadius={8}
              />
            </TouchableOpacity>
          </View>
        </View>
        
        {/* Enhanced Calendar Modal with Google Calendar features */}
        <Modal
          visible={showCalendarModal}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowCalendarModal(false)}
        >
          <TouchableOpacity
            style={styles.modalOverlay}
            activeOpacity={1}
            onPress={() => setShowCalendarModal(false)}
          >
            <Animated.View 
              style={[
                styles.calendarModal,
                {
                  transform: [{
                    scale: animatedValue.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0.8, 1],
                    })
                  }],
                  opacity: animatedValue,
                }
              ]}
            >
              {/* Calendar Header with view toggles */}
              <View style={styles.calendarModalHeader}>
                <View style={styles.calendarControls}>
                  <TouchableOpacity
                    style={styles.calendarNavButton}
                    onPress={navigateToPrevPeriod}
                  >
                    <MaterialIcons name="chevron-left" size={24} color="#495057" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.monthYearContainer}
                    onPress={navigateToToday}
                  >
                    <Text style={styles.monthYearText}>
                      {calendarViewMode === "month" 
                        ? `${monthNames[calendarDate.getMonth()]} ${calendarDate.getFullYear()}`
                        : `Week of ${monthNames[calendarDate.getMonth()]} ${calendarDate.getDate()}`
                      }
                    </Text>
                    <Text style={styles.todayHint}>Tap to go to today</Text>
                  </TouchableOpacity>
                  
                  <TouchableOpacity
                    style={styles.calendarNavButton}
                    onPress={navigateToNextPeriod}
                  >
                    <MaterialIcons name="chevron-right" size={24} color="#495057" />
                  </TouchableOpacity>
                </View>

                {/* View Mode Toggle */}
                <View style={styles.viewModeToggle}>
                  <TouchableOpacity
                    style={[
                      styles.viewModeButton,
                      calendarViewMode === "month" && styles.activeViewModeButton
                    ]}
                    onPress={() => setCalendarViewMode("month")}
                  >
                    <Text style={[
                      styles.viewModeText,
                      calendarViewMode === "month" && styles.activeViewModeText
                    ]}>Month</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[
                      styles.viewModeButton,
                      calendarViewMode === "week" && styles.activeViewModeButton
                    ]}
                    onPress={() => setCalendarViewMode("week")}
                  >
                    <Text style={[
                      styles.viewModeText,
                      calendarViewMode === "week" && styles.activeViewModeText
                    ]}>Week</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Calendar Grid */}
              <View style={styles.calendarGrid}>
                {/* Day headers */}
                <View style={styles.dayHeadersRow}>
                  {dayNames.map((day) => (
                    <Text key={day} style={styles.dayHeader}>
                      {day}
                    </Text>
                  ))}
                </View>

                {/* Calendar Days */}
                <View style={styles.daysContainer}>
                  {(calendarViewMode === "month" ? calendarDays : getWeekDates()).map((date, index) => {
                    const dayTasks = getTasksForDate(date);
                    const hasOverdueTasks = dayTasks.some(task => task.overdue && !task.completed);
                    const hasCompletedTasks = dayTasks.some(task => task.completed);
                    
                    return (
                      <TouchableOpacity
                        key={index}
                        style={[
                          styles.calendarDay,
                          calendarViewMode === "month" && !isCurrentMonth(date) && styles.inactiveDay,
                          isCurrentDate(date) && styles.todayCalendarDay,
                          isDateSelected(date) && styles.selectedCalendarDay,
                        ]}
                        onPress={() => handleCalendarDateSelect(date)}
                      >
                        <Text
                          style={[
                            styles.calendarDayText,
                            calendarViewMode === "month" && !isCurrentMonth(date) && styles.inactiveDayText,
                            isCurrentDate(date) && styles.todayDayText,
                            isDateSelected(date) && styles.selectedDayText,
                          ]}
                        >
                          {date.getDate()}
                        </Text>
                        
                        {/* Task indicators */}
                        {dayTasks.length > 0 && (
                          <View style={styles.taskIndicators}>
                            {hasOverdueTasks && <View style={[styles.taskDot, styles.overdueDot]} />}
                            {hasCompletedTasks && <View style={[styles.taskDot, styles.completedDot]} />}
                            {dayTasks.length > 2 && (
                              <Text style={styles.taskCount}>+{dayTasks.length - 2}</Text>
                            )}
                          </View>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Today's Tasks Preview */}
              {getTasksForDate(selectedDate).length > 0 && (
                <View style={styles.tasksPreview}>
                  <Text style={styles.tasksPreviewTitle}>
                    Tasks for {selectedDate.toLocaleDateString()}
                  </Text>
                  <FlatList
                    data={getTasksForDate(selectedDate).slice(0, 3)}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    keyExtractor={(item) => item.id}
                    renderItem={({ item }) => (
                      <TouchableOpacity
                        style={styles.taskPreviewCard}
                        onPress={() => {
                          setShowCalendarModal(false);
                          handleTaskClick(item.id);
                        }}
                      >
                        <Text style={styles.taskPreviewTitle} numberOfLines={1}>
                          {item.title}
                        </Text>
                        <Text style={[
                          styles.taskPreviewStatus,
                          item.completed && styles.completedStatus,
                          item.overdue && !item.completed && styles.overdueStatus
                        ]}>
                          {item.completed ? 'Completed' : item.overdue ? 'Overdue' : 'Pending'}
                        </Text>
                      </TouchableOpacity>
                    )}
                  />
                </View>
              )}
            </Animated.View>
          </TouchableOpacity>
        </Modal>

        {/* Date Tasks Modal */}
        <Modal
          visible={showDateTasksModal}
          transparent={true}
          animationType="slide"
          onRequestClose={() => setShowDateTasksModal(false)}
        >
          <View style={styles.dateTasksModalOverlay}>
            <TouchableOpacity
              style={styles.dateTasksModalOverlay}
              activeOpacity={1}
              onPress={() => setShowDateTasksModal(false)}
            >
              <View style={styles.dateTasksModalContent}>
                <View style={styles.dateTasksModalHeader}>
                  <Text style={styles.dateTasksModalTitle}>
                    Tasks for {dateTasksModalDate?.toLocaleDateString()}
                  </Text>
                  <TouchableOpacity
                    style={styles.dateTasksModalCloseButton}
                    onPress={() => setShowDateTasksModal(false)}
                  >
                    <Ionicons name="close" size={24} color="#666" />
                  </TouchableOpacity>
                </View>
                
                <FlatList
                  data={dateTasksModalDate ? getTasksForDate(dateTasksModalDate) : []}
                  keyExtractor={(item) => item.id}
                  showsVerticalScrollIndicator={false}
                  renderItem={({ item }) => (
                    <TouchableOpacity
                      style={styles.dateTaskItem}
                      onPress={() => {
                        setShowDateTasksModal(false);
                        handleTaskClick(item.id);
                      }}
                    >
                      <View style={styles.dateTaskItemHeader}>
                        <Text style={styles.dateTaskItemTitle} numberOfLines={2}>
                          {item.title}
                        </Text>
                        <View style={[
                          styles.dateTaskItemStatus,
                          item.completed && styles.dateTaskStatusCompleted,
                          item.overdue && !item.completed && styles.dateTaskStatusOverdue,
                        ]}>
                          <Text style={styles.dateTaskItemStatusText}>
                            {item.completed ? 'Completed' : item.overdue ? 'Overdue' : 'Pending'}
                          </Text>
                        </View>
                      </View>
                      {item.description && (
                        <Text style={styles.dateTaskItemDescription} numberOfLines={2}>
                          {item.description}
                        </Text>
                      )}
                      <View style={styles.dateTaskItemFooter}>
                        <Text style={styles.dateTaskItemCategory}>
                          {item.category_name || 'No Category'}
                        </Text>
                        {item.due_time && (
                          <Text style={styles.dateTaskItemTime}>
                            {item.due_time}
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  )}
                  ListEmptyComponent={() => (
                    <View style={styles.dateTasksEmptyState}>
                      <Text style={styles.dateTasksEmptyText}>No tasks for this date</Text>
                    </View>
                  )}
                />
              </View>
            </TouchableOpacity>
          </View>
        </Modal>

        {/* More Vert Menu Modal */}
        <Modal
          visible={showMoreVertMenu}
          transparent={true}
          animationType="fade"
          onRequestClose={() => setShowMoreVertMenu(false)}
        >
          <TouchableOpacity
            style={styles.moreVertOverlay}
            activeOpacity={1}
            onPress={() => setShowMoreVertMenu(false)}
          >
            <View style={styles.moreVertMenuContainer}>
              <TouchableOpacity
                style={styles.moreVertMenuItem}
                onPress={handleMarkAllCompleted}
              >
                <MaterialIcons name="check-circle" size={20} color="#10B981" />
                <Text style={styles.moreVertMenuText}>Mark All Completed</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.moreVertMenuItem}
                onPress={handleDeleteAllCompleted}
              >
                <MaterialIcons name="delete-sweep" size={20} color="#EF4444" />
                <Text style={styles.moreVertMenuText}>Delete All Completed</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.moreVertMenuItem}
                onPress={handleRefreshTasks}
              >
                <MaterialIcons name="refresh" size={20} color="#6366F1" />
                <Text style={styles.moreVertMenuText}>Refresh Tasks</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.moreVertMenuItem}
                onPress={handleExportTasks}
              >
                <MaterialIcons name="visibility" size={20} color="#8B5CF6" />
                <Text style={styles.moreVertMenuText}>View All Completed</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={[styles.moreVertMenuItem, styles.moreVertMenuItemLast]}
                onPress={() => {
                  setShowMoreVertMenu(false);
                  navigation.navigate("TaskSettings" as any);
                }}
              >
                <MaterialIcons name="settings" size={20} color="#64748B" />
                <Text style={styles.moreVertMenuText}>Task Settings</Text>
              </TouchableOpacity>
            </View>
          </TouchableOpacity>
        </Modal>

        {/* Dropdown Backdrop - Only show in list view */}
        {viewMode === "list" && false && (
          <TouchableOpacity
            style={styles.dropdownBackdrop}
            activeOpacity={1}
            onPress={() => {}}
          />
        )}
      </LinearGradient>

      {/* Dashboard Card with clickable filters - overlaps header and content */}
      <View style={styles.dashboardCardWrapper}>
        <View style={styles.dashboardCardContainer}>
          <View style={styles.dashboardRow}>
            <TouchableOpacity
              style={[
                styles.dashboardCardItem,
                styles.dashboardCardItemWithBorder,
                selectedFilter === "pending" && styles.activeDashboardCard,
              ]}
              onPress={() => handleStatusSelect("pending")}
            >
              <Text style={[
                styles.dashboardNumber,
                selectedFilter === "pending" && styles.activeDashboardNumber
              ]}>
                {
                  tasks.filter((task) => !task.completed && !task.overdue)
                    .length
                }
              </Text>
              <Text style={[
                styles.dashboardLabel,
                selectedFilter === "pending" && styles.activeDashboardLabel
              ]}>Pending</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.dashboardCardItem,
                styles.dashboardCardItemWithBorder,
                selectedFilter === "completed" && styles.activeDashboardCard,
              ]}
              onPress={() => handleStatusSelect("completed")}
            >
              <Text style={[
                styles.dashboardNumber,
                selectedFilter === "completed" && styles.activeDashboardNumber
              ]}>
                {tasks.filter((task) => task.completed).length}
              </Text>
              <Text style={[
                styles.dashboardLabel,
                selectedFilter === "completed" && styles.activeDashboardLabel
              ]}>Completed</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[
                styles.dashboardCardItem,
                styles.dashboardCardItemWithBorder,
                selectedFilter === "overdue" && styles.activeDashboardCard,
              ]}
              onPress={() => handleStatusSelect("overdue")}
            >
              <Text style={[
                styles.dashboardNumber,
                selectedFilter === "overdue" && styles.activeDashboardNumber
              ]}>
                {tasks.filter((task) => task.overdue && !task.completed).length}
              </Text>
              <Text style={[
                styles.dashboardLabel,
                selectedFilter === "overdue" && styles.activeDashboardLabel
              ]}>Overdue</Text>
            </TouchableOpacity>
            <TouchableOpacity 
              style={[
                styles.dashboardCardItem,
                selectedFilter === "all" && styles.activeDashboardCard,
              ]}
              onPress={() => handleStatusSelect("all")}
            >
              <Text style={[
                styles.dashboardNumber,
                selectedFilter === "all" && styles.activeDashboardNumber
              ]}>
                {tasks.length}
              </Text>
              <Text style={[
                styles.dashboardLabel,
                selectedFilter === "all" && styles.activeDashboardLabel
              ]}>Total</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>



      {/* Enhanced Content Section with better navigation */}
      <View
        style={[
          styles.content,
          viewMode === "matrix" ? styles.contentMatrix : styles.contentList,
        ]}
      >
        {/* Loading State */}
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <SkeletonLoader type="tasks" count={viewMode === "matrix" ? 8 : 5} />
          </View>
        ) : (
          /* Content Views */
          viewMode === "matrix" ? (
            <EisenhowerMatrix
              tasks={filteredTasks}
              onTaskPress={handleTaskPress}
              onAddTask={handleAddTask}
              onDeleteTask={handleDeleteTask}
              onMarkComplete={handleMarkComplete}
              categories={categories}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
            />
          ) : (
            <TaskListView
              tasks={filteredTasks}
              onTaskPress={handleTaskPress}
              onDeleteTask={handleDeleteTask}
              onMarkComplete={handleMarkComplete}
              categories={categories}
              selectedCategory={selectedCategory}
              onCategoryChange={setSelectedCategory}
            />
          )
        )}
      </View>

      {/* Enhanced Floating Action Button with better positioning */}
      <TouchableOpacity
        style={[
          styles.addTaskButton,
          { bottom: Platform.OS === "ios" ? 110 : 105 } // Better positioning to avoid navbar
        ]}
        onPress={() => handleAddTask()}
      >
        <MaterialIcons name="add" size={32} color="#FFFFFF" />
        <View style={styles.fabRipple} />
      </TouchableOpacity>

      <Navbar activeRoute="ToDo" />
      </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 50 : 35,
    paddingBottom: 40,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 15,
    zIndex: 1000,
    overflow: "visible",
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 4,
  },
  headerTitleSection: {
    flex: 1,
  },
  title: {
    fontSize: 34,
    color: "#FFFFFF",
    fontFamily: "Lexend",
    letterSpacing: -0.5,
  },
  headerActions: {
    flexDirection: "row",
    gap: 12,
    alignItems: "center",
  },
  calendarButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    position: "relative",
  },
  currentDateIndicator: {
    position: "absolute",
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#FFD700",
    borderWidth: 1,
    borderColor: "#FFFFFF",
  },
  viewToggleButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  calendarModal: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 28,
    maxWidth: 420,
    width: "95%",
    maxHeight: "85%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 20 },
    shadowOpacity: 0.3,
    shadowRadius: 40,
    elevation: 20,
  },
  calendarModalHeader: {
    marginBottom: 24,
  },
  calendarControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  calendarNavButton: {
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#F1F5F9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  monthYearContainer: {
    flex: 1,
    alignItems: "center",
  },
  monthYearText: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    fontWeight: "700",
  },
  todayHint: {
    fontSize: 13,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    marginTop: 4,
    opacity: 0.8,
  },
  viewModeToggle: {
    flexDirection: "row",
    backgroundColor: "#F1F5F9",
    borderRadius: 12,
    padding: 4,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  viewModeButton: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 8,
    alignItems: "center",
  },
  activeViewModeButton: {
    backgroundColor: "#8B5CF6",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  viewModeText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    fontWeight: "500",
  },
  activeViewModeText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  taskIndicators: {
    position: "absolute",
    bottom: 3,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 3,
  },
  taskDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  overdueDot: {
    backgroundColor: "#EF4444",
    shadowColor: "#EF4444",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 1,
  },
  completedDot: {
    backgroundColor: "#10B981",
    shadowColor: "#10B981",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 1,
  },
  taskCount: {
    fontSize: 9,
    color: "#64748B",
    fontFamily: "Inter-Medium",
    fontWeight: "500",
  },
  tasksPreview: {
    marginTop: 20,
    paddingTop: 20,
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
  },
  tasksPreviewTitle: {
    fontSize: 15,
    fontFamily: "Inter-SemiBold",
    color: "#334155",
    marginBottom: 16,
    fontWeight: "600",
  },
  taskPreviewCard: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    minWidth: 140,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  taskPreviewTitle: {
    fontSize: 13,
    fontFamily: "Inter-Medium",
    color: "#334155",
    marginBottom: 6,
    fontWeight: "500",
  },
  taskPreviewStatus: {
    fontSize: 11,
    fontFamily: "Inter-Regular",
    color: "#64748B",
  },
  completedStatus: {
    color: "#10B981",
    fontWeight: "500",
  },
  overdueStatus: {
    color: "#EF4444",
    fontWeight: "500",
  },
  calendarGrid: {
    gap: 12,
  },
  dayHeadersRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 12,
    paddingHorizontal: 4,
  },
  dayHeader: {
    fontSize: 13,
    color: "#64748B",
    fontFamily: "Inter-Medium",
    textAlign: "center",
    flex: 1,
    fontWeight: "600",
  },
  daysContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 2,
    paddingHorizontal: 2,
  },
  calendarDay: {
    width: "13.5%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 12,
    margin: 1,
    backgroundColor: "transparent",
    position: "relative",
  },
  inactiveDay: {
    opacity: 0.4,
  },
  todayCalendarDay: {
    backgroundColor: "#8B5CF6",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  selectedCalendarDay: {
    backgroundColor: "#6366F1",
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  calendarDayText: {
    fontSize: 15,
    color: "#334155",
    fontFamily: "Inter-Medium",
    textAlign: "center",
    fontWeight: "600",
  },
  inactiveDayText: {
    color: "#CBD5E1",
  },
  todayDayText: {
    color: "#FFFFFF",
    fontFamily: "Inter-Bold",
    fontWeight: "700",
  },
  selectedDayText: {
    color: "#FFFFFF",
    fontFamily: "Inter-Bold",
    fontWeight: "700",
  },
  dropdownContainer: {
    marginTop: 20,
    marginBottom: 10,
    zIndex: 100,
    overflow: "visible",
  },
  dropdownRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
    zIndex: 100,
    overflow: "visible",
  },
  dropdown: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
    elevation: 2,
  },
  dropdownText: {
    fontSize: 14,
    color: "#495057",
    fontFamily: "Inter-Medium",
  },
  calendarContainer: {
    marginBottom: 8,
  },
  calendarScrollContent: {
    paddingHorizontal: 4,
  },
  dateItem: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginHorizontal: 4,
    borderRadius: 12,
    minWidth: 30,
  },
  selectedDateItem: {
    // Remove background color - no background highlighting
  },
  dashboardCardWrapper: {
    position: "absolute",
    top: Platform.OS === "ios" ? 120 : 105,
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 2000,
    elevation: 20,
  },
  dashboardCardContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    padding: 10,
    marginHorizontal: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 15,
    width: "90%",
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.1)",
  },
  dashboardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 12,
  },
  dashboardCardItem: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 16,
  },
  dashboardCardItemWithBorder: {
    borderRightWidth: 1,
    borderRightColor: "#F1F5F9",
  },
  activeDashboardCard: {
    backgroundColor: "#F0F4FF",
    borderWidth: 1,
    borderColor: "#8B5CF6",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  dashboardNumber: {
    fontSize: 24,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginBottom: 4,
    fontWeight: "800",
  },
  activeDashboardNumber: {
    color: "#8B5CF6",
    fontWeight: "800",
  },
  dashboardLabel: {
    fontSize: 13,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    textAlign: "center",
    fontWeight: "500",
  },
  activeDashboardLabel: {
    color: "#8B5CF6",
    fontWeight: "600",
  },
  dayText: {
    fontSize: 13,
    color: "#64748B",
    fontFamily: "Inter-Medium",
    marginBottom: 6,
    fontWeight: "500",
  },
  dateText: {
    fontSize: 17,
    color: "#334155",
    fontFamily: "Inter-SemiBold",
    fontWeight: "600",
  },
  selectedDateText: {
    color: "#8B5CF6",
    fontFamily: "Inter-SemiBold",
    fontWeight: "700",
  },
  viewToggleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  viewToggleText: {
    fontSize: 13,
    fontFamily: "Inter-Medium",
    color: "#8B5CF6",
    marginLeft: 6,
    fontWeight: "500",
  },
  
  content: {
    flex: 1,
    paddingBottom: 0, // Removed bottom padding to allow content behind navbar
  },
  contentMatrix: {
    paddingTop: Platform.OS === "ios" ? 200 : 185,
    paddingHorizontal: 20,
    paddingBottom: 0, // Removed bottom padding
  },
  contentList: {
    paddingTop: Platform.OS === "ios" ? 200 : 185,
    paddingHorizontal: 20,
    paddingBottom: 0, // Removed bottom padding
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#F8FAFC",
  },
  // Modern Filter and Dropdown Styles
  listViewFilters: {
    marginBottom: 20,
  },
  dropdownBackdrop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  dropdownFiltersContainer: {
    paddingHorizontal: 20,
    marginBottom: 16,
    zIndex: 1000,
  },
  dropdownFiltersRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 16,
  },
  filterDropdown: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  
  // Modern Dropdown Functionality
  dropdownWrapper: {
    flex: 1,
    position: "relative",
    zIndex: 1000,
    marginHorizontal: 4,
  },
  dropdownMenu: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 15,
    zIndex: 2000,
    maxHeight: 220,
    marginTop: 8,
  },
  dropdownMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  selectedDropdownItem: {
    backgroundColor: "#F0F4FF",
  },
  dropdownMenuText: {
    fontSize: 15,
    color: "#334155",
    fontFamily: "Inter-Medium",
    flex: 1,
    fontWeight: "500",
  },
  selectedDropdownText: {
    color: "#8B5CF6",
    fontFamily: "Inter-SemiBold",
    fontWeight: "600",
  },
  addTaskButton: {
    position: "absolute",
    right: 24,
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "#8B5CF6",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.3,
    shadowRadius: 24,
    elevation: 15,
    zIndex: 1000,
    bottom: Platform.OS === "ios" ? 115 : 110,
  },
  fabRipple: {
    position: "absolute",
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: "rgba(255,255,255,0.15)",
  },
  // Dashboard styles

  // Status buttons styles
  statusButtons: {
    flexDirection: "row",
    paddingHorizontal: 0,
    paddingVertical: 20,
    gap: 12,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 0,
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  activeStatusButton: {
    backgroundColor: "#8B5CF6",
    borderColor: "#8B5CF6",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 6,
  },
  statusButtonText: {
    fontSize: 15,
    fontFamily: "Inter-Medium",
    color: "#334155",
    fontWeight: "500",
  },
  activeStatusButtonText: {
    color: "#FFFFFF",
    fontFamily: "Inter-SemiBold",
    fontWeight: "600",
  },
  
  // Date Tasks Modal styles
  dateTasksModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.6)",
    justifyContent: "flex-end",
  },
  dateTasksModalContent: {
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: "85%",
    paddingTop: 24,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: -8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 15,
  },
  dateTasksModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingBottom: 20,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  dateTasksModalTitle: {
    fontSize: 20,
    fontFamily: "Inter-SemiBold",
    color: "#1E293B",
    fontWeight: "600",
  },
  dateTasksModalCloseButton: {
    padding: 12,
    borderRadius: 20,
    backgroundColor: "#F8FAFC",
  },
  dateTaskItem: {
    backgroundColor: "#FFFFFF",
    marginHorizontal: 24,
    marginVertical: 8,
    padding: 20,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  dateTaskItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  dateTaskItemTitle: {
    flex: 1,
    fontSize: 17,
    fontFamily: "Inter-SemiBold",
    color: "#1E293B",
    marginRight: 16,
    fontWeight: "600",
    lineHeight: 24,
  },
  dateTaskItemStatus: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "#F8FAFC",
  },
  dateTaskStatusCompleted: {
    backgroundColor: "#DCFCE7",
  },
  dateTaskStatusOverdue: {
    backgroundColor: "#FEE2E2",
  },
  dateTaskItemStatusText: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    fontWeight: "500",
  },
  dateTaskItemDescription: {
    fontSize: 15,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    marginBottom: 12,
    lineHeight: 22,
  },
  dateTaskItemFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F8FAFC",
  },
  dateTaskItemCategory: {
    fontSize: 13,
    fontFamily: "Inter-Medium",
    color: "#8B5CF6",
    fontWeight: "500",
  },
  dateTaskItemTime: {
    fontSize: 13,
    fontFamily: "Inter-Regular",
    color: "#94A3B8",
  },
  dateTasksEmptyState: {
    padding: 48,
    alignItems: "center",
  },
  dateTasksEmptyText: {
    fontSize: 17,
    fontFamily: "Inter-Regular",
    color: "#94A3B8",
    textAlign: "center",
  },
  
  // More Vert Button styles
  moreVertButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  
  // More Vert Menu styles
  moreVertOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.4)",
    justifyContent: "flex-start",
    alignItems: "flex-end",
    paddingTop: Platform.OS === "ios" ? 120 : 100,
    paddingRight: 20,
  },
  moreVertMenuContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    paddingVertical: 8,
    minWidth: 200,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 12,
    borderWidth: 1,
    borderColor: "rgba(148, 163, 184, 0.1)",
  },
  moreVertMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#F8FAFC",
  },
  moreVertMenuItemLast: {
    borderBottomWidth: 0,
  },
  moreVertMenuText: {
    fontSize: 15,
    fontFamily: "Inter-Medium",
    color: "#334155",
    marginLeft: 12,
    fontWeight: "500",
  },
});

export default ToDo;
