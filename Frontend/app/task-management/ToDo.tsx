import React, { useState, useCallback } from "react";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import Navbar from "../NavBar";
import EisenhowerMatrix from "./components/EisenhowerMatrix";
import TaskListView from "./components/TaskListView";
import { Task } from "./types/Task";
import { LinearGradient } from "expo-linear-gradient";
import  taskService  from "./services/taskService";
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
  
  // Search functionality states
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearchBar, setShowSearchBar] = useState(false);
  
  // Selected date tasks modal state
  const [showDateTasksModal, setShowDateTasksModal] = useState(false);
  const [dateTasksModalDate, setDateTasksModalDate] = useState<Date | null>(null);
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

  // Search functionality
  const toggleSearch = () => {
    setShowSearchBar(!showSearchBar);
    if (showSearchBar) {
      setSearchQuery(""); // Clear search when closing
    }
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
    }, [])
  );

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
    })
    .filter((task) => {
      // Filter by search query
      if (searchQuery === "") return true;
      
      const searchLower = searchQuery.toLowerCase();
      const titleMatch = task.title.toLowerCase().includes(searchLower);
      const descriptionMatch = task.description?.toLowerCase().includes(searchLower) || false;
      const categoryMatch = task.category_name?.toLowerCase().includes(searchLower) || false;
      
      return titleMatch || descriptionMatch || categoryMatch;
    });

  const categories = [
    ...new Set(
      tasks
        .map((task) => task.category)
        .filter((category): category is string => Boolean(category))
    ),
  ];

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

  return (
    <>
      <StatusBar {...statusBarConfig} />
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
              style={styles.searchButton}
              onPress={toggleSearch}
            >
              <Ionicons
                name={showSearchBar ? "close" : "search"}
                size={24}
                color="#ffffff"
              />
            </TouchableOpacity>
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
          </View>
        </View>
        
        {/* Search Bar */}
        {showSearchBar && (
          <View style={styles.searchBarContainer}>
            <View style={styles.searchInputContainer}>
              <Ionicons name="search" size={20} color="#999" />
              <TextInput
                style={styles.searchInput}
                placeholder="Search tasks..."
                placeholderTextColor="#999"
                value={searchQuery}
                onChangeText={setSearchQuery}
                autoFocus={showSearchBar}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery("")}>
                  <Ionicons name="close-circle" size={20} color="#999" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        )}

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
              tasks={tasks}
              onTaskPress={handleTaskPress}
              onAddTask={handleAddTask}
              onDeleteTask={handleDeleteTask}
              onMarkComplete={handleMarkComplete}
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
        <MaterialIcons name="add" size={28} color="#ffffffff" />
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
    backgroundColor: "#ffffffff",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 50 : 35,
    paddingBottom: 35, // Make this a bit larger for overlap
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 1000,
    overflow: "visible",
  },
  headerTopRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerTitleSection: {
    flex: 1,
  },
  title: {
    fontSize: 32,
    color: "#ffffffff",
    fontFamily: "Lexend",
    marginBottom: 4,
  },
  headerActions: {
    flexDirection: "row",
    gap: 8,
  },
  calendarButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",

    position: "relative",
  },
  calendarButtonText: {
    fontSize: 16,
    color: "#6A009C",
    fontFamily: "Inter-Bold",
  },
  currentDateIndicator: {
    position: "absolute",
    bottom: 6,
    right: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#ffffffff",
  },
  viewToggleButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
  },
  calendarModal: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 24,
    maxWidth: 400,
    width: "95%",
    maxHeight: "80%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  calendarModalHeader: {
    marginBottom: 20,
  },
  calendarControls: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  calendarNavButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f8f9fa",
  },
  monthYearContainer: {
    flex: 1,
    alignItems: "center",
  },
  monthYearText: {
    fontSize: 18,
    fontFamily: "Inter-Bold",
    color: "#495057",
  },
  todayHint: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#6c757d",
    marginTop: 2,
  },
  viewModeToggle: {
    flexDirection: "row",
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 2,
  },
  viewModeButton: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 6,
    alignItems: "center",
  },
  activeViewModeButton: {
    backgroundColor: "#AD00FF",
  },
  viewModeText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#6c757d",
  },
  activeViewModeText: {
    color: "#fff",
  },
  taskIndicators: {
    position: "absolute",
    bottom: 2,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 2,
  },
  taskDot: {
    width: 4,
    height: 4,
    borderRadius: 2,
  },
  overdueDot: {
    backgroundColor: "#e74c3c",
  },
  completedDot: {
    backgroundColor: "#27ae60",
  },
  taskCount: {
    fontSize: 8,
    color: "#6c757d",
    fontFamily: "Inter-Medium",
  },
  tasksPreview: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e9ecef",
  },
  tasksPreviewTitle: {
    fontSize: 14,
    fontFamily: "Inter-SemiBold",
    color: "#495057",
    marginBottom: 12,
  },
  taskPreviewCard: {
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    padding: 8,
    marginRight: 8,
    minWidth: 120,
  },
  taskPreviewTitle: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#495057",
    marginBottom: 4,
  },
  taskPreviewStatus: {
    fontSize: 10,
    fontFamily: "Inter-Regular",
    color: "#6c757d",
  },
  completedStatus: {
    color: "#27ae60",
  },
  overdueStatus: {
    color: "#e74c3c",
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  monthNavButton: {
    padding: 8,
    borderRadius: 8,
  },
  calendarGrid: {
    gap: 8,
  },
  dayHeadersRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 8,
  },
  dayHeader: {
    fontSize: 12,
    color: "#6c757d",
    fontFamily: "Inter-Medium",
    textAlign: "center",
    flex: 1,
  },
  daysContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 0, // Remove gap to prevent wrapping issues
  },
  calendarDay: {
    width: "14.28%", // Exactly 1/7 of the container width
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
    margin: 0,
    padding: 0,
    backgroundColor: "transparent", // No background color for normal days
    shadowColor: "#000",
  },
  inactiveDay: {
    opacity: 0.3,
  },
  todayCalendarDay: {
    backgroundColor: "#AD00FF",
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 2,
  },
  selectedCalendarDay: {
    backgroundColor: "#6A009C",
    borderRadius: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 2,
  },
  calendarDayText: {
    fontSize: 14,
    color: "#495057",
    fontFamily: "Inter-Medium",
    textAlign: "center",
    fontWeight: "600",
    paddingVertical: 4,
    paddingHorizontal: 8,
    backgroundColor: "transparent", // No background color for normal days
  },
  inactiveDayText: {
    color: "#adb5bd",
  },
  todayDayText: {
    color: "#fff",
    fontFamily: "Inter-Bold",
  },
  selectedDayText: {
    color: "#fff",
    fontFamily: "Inter-Bold",
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
    top: Platform.OS === "ios" ? 110 : 95, // Just below the header, adjust as needed
    left: 0,
    right: 0,
    alignItems: "center",
    zIndex: 2000,
    elevation: 20,
  },
  dashboardCardContainer: {
    backgroundColor: "#fff",
    borderRadius: 20,
    padding: 10,
    marginHorizontal: 24,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 10,
    width: "90%",
  },
  dashboardRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
  },
  dashboardCardItem: {
    flex: 1,
    alignItems: "center",
  },
  dashboardCardItemWithBorder: {
    borderRightWidth: 1,
    borderRightColor: "#e0e0e0",
  },
  activeDashboardCard: {
    backgroundColor: "#f0e6ff",
    borderRadius: 8,
    marginHorizontal: 2,
  },
  dashboardNumber: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#6A009C",
    marginBottom: 4,
  },
  activeDashboardNumber: {
    color: "#AD00FF",
    fontWeight: "bold",
  },
  dashboardLabel: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#535151ff",
    textAlign: "center",
  },
  activeDashboardLabel: {
    color: "#AD00FF",
    fontWeight: "600",
  },
  dayText: {
    fontSize: 12,
    color: "#6c757d",
    fontFamily: "Inter-Medium",
    marginBottom: 4,
  },
  dateText: {
    fontSize: 16,
    color: "#495057",
    fontFamily: "Inter-SemiBold",
  },
  selectedDateText: {
    color: "#AD00FF",
    fontFamily: "Inter-SemiBold",
    fontWeight: "bold",
  },
  viewToggle: {
    flexDirection: "row",
    marginHorizontal: 20,
    marginBottom: 15,
    backgroundColor: "#e9ecef",
    borderRadius: 25,
    padding: 4,
  },
  toggleButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 10,
    borderRadius: 20,
  },
  activeToggle: {
    backgroundColor: "#AD00FF",
  },
  toggleText: {
    marginLeft: 5,
    fontSize: 14,
    color: "#AD00FF",
    fontFamily: "Inter-Medium",
  },
  activeToggleText: {
    color: "#fff",
  },

  content: {
    flex: 1,
    paddingBottom: 120, // Enhanced space for navbar
  },
  contentMatrix: {
    paddingTop: Platform.OS === "ios" ? 190 : 175, // Better spacing for dashboard
    paddingHorizontal: 20,
  },
  contentList: {
    paddingTop: Platform.OS === "ios" ? 190 : 175,
    paddingHorizontal: 20,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  viewToggleContainer: {
    flexDirection: "row",
    alignItems: "center",
  },
  viewToggleText: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#6A009C",
    marginLeft: 4,
  },
  // List view filter styles
  listViewFilters: {
    marginBottom: 15,
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
    marginBottom: 10,
    zIndex: 1000,
  },
  dropdownFiltersRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 12,
  },
  filterDropdown: {
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
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 2,
  },
  // Landscape-specific styles
  landscapeLayout: {
    flexDirection: "column", // Changed to column for stacked layout
    marginTop: 20,
    gap: 12, // Reduced gap for better spacing
  },
  dropdownContainerLandscape: {
    width: "100%", // Full width instead of flex
    marginTop: 0,
    marginBottom: 0,
  },
  dropdownRowLandscape: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8, // Smaller gap for landscape
  },
  dropdownColumnLandscape: {
    flexDirection: "column",
    gap: 8,
  },
  dropdownLandscape: {
    flex: 1, // Equal width for all dropdowns
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 10, // Reduced padding for better fit
    paddingVertical: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
    elevation: 2,
  },
  calendarContainerLandscape: {
    width: "100%", // Full width instead of flex
    marginBottom: 0,
  },
  calendarScrollContentLandscape: {
    paddingHorizontal: 2,
    alignItems: "center",
  },
  dateItemLandscape: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginHorizontal: 2,
    minWidth: 50,
  },
  dayTextLandscape: {
    fontSize: 10,
    marginBottom: 2,
  },
  dateTextLandscape: {
    fontSize: 14,
  },
  // Dropdown functionality styles
  dropdownWrapper: {
    flex: 1,
    position: "relative",
    zIndex: 1000,
    marginHorizontal: 2,
  },
  dropdownMenu: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#ffffff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 15,
    zIndex: 2000,
    maxHeight: 200,
    marginTop: 4,
  },
  dropdownMenuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#f8f9fa",
  },
  selectedDropdownItem: {
    backgroundColor: "#f0e6ff",
  },
  dropdownMenuText: {
    fontSize: 14,
    color: "#495057",
    fontFamily: "Inter-Medium",
    flex: 1,
  },
  selectedDropdownText: {
    color: "#AD00FF",
    fontFamily: "Inter-SemiBold",
    fontWeight: "600",
  },
  addTaskButton: {
    position: "absolute",
    right: 24,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#6366F1",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.24,
    shadowRadius: 16,
    elevation: 12,
    zIndex: 1000,
  },
  fabRipple: {
    position: "absolute",
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  // Dashboard styles

  // Status buttons styles
  statusButtons: {
    flexDirection: "row",
    paddingHorizontal: 0,
    paddingVertical: 16,
    gap: 8,
  },
  statusButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 0,
    borderRadius: 8,
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#e9ecef",
    alignItems: "center",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  activeStatusButton: {
    backgroundColor: "#6A009C",
    borderColor: "#6A009C",
  },
  statusButtonText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#495057",
  },
  activeStatusButtonText: {
    color: "#fff",
    fontFamily: "Inter-SemiBold",
  },
  
  // Search functionality styles
  searchButton: {
    marginRight: 12,
    padding: 8,
    borderRadius: 20,
  },
  searchBarContainer: {
    paddingHorizontal: 20,
    paddingBottom: 15,
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.9)",
    borderRadius: 25,
    paddingHorizontal: 15,
    paddingVertical: 12,
    gap: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: "#333",
  },
  
  // Date Tasks Modal styles
  dateTasksModalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "flex-end",
  },
  dateTasksModalContent: {
    backgroundColor: "#fff",
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: "80%",
    paddingTop: 20,
  },
  dateTasksModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#f0f0f0",
  },
  dateTasksModalTitle: {
    fontSize: 18,
    fontFamily: "Inter-SemiBold",
    color: "#333",
  },
  dateTasksModalCloseButton: {
    padding: 8,
  },
  dateTaskItem: {
    backgroundColor: "#fff",
    marginHorizontal: 20,
    marginVertical: 6,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  dateTaskItemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  dateTaskItemTitle: {
    flex: 1,
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: "#333",
    marginRight: 12,
  },
  dateTaskItemStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    backgroundColor: "#f0f0f0",
  },
  dateTaskStatusCompleted: {
    backgroundColor: "#d4edda",
  },
  dateTaskStatusOverdue: {
    backgroundColor: "#f8d7da",
  },
  dateTaskItemStatusText: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#666",
  },
  dateTaskItemDescription: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#666",
    marginBottom: 8,
    lineHeight: 20,
  },
  dateTaskItemFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  dateTaskItemCategory: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#8B5CF6",
  },
  dateTaskItemTime: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#999",
  },
  dateTasksEmptyState: {
    padding: 40,
    alignItems: "center",
  },
  dateTasksEmptyText: {
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: "#999",
  },
});

export default ToDo;
