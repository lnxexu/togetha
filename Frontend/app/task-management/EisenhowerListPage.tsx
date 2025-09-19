import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  Platform,
  TextInput,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RouteProp } from "@react-navigation/native";
import { RootStackParamList } from "../navigation/AppNavigator";
import { Task } from "./types/Task";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type EisenhowerListRouteProp = RouteProp<RootStackParamList, "EisenhowerList">;

interface QuadrantData {
  title: string;
  subtitle: string;
  color: string;
  borderColor: string;
  priority: string;
}

const priorityIcons: Record<string, string> = {
  "urgent-important": "priority-high",
  "not-urgent-important": "event",
  "urgent-not-important": "person-add",
  "not-urgent-not-important": "not-interested",
};

const quadrants: Record<string, QuadrantData> = {
  "urgent-important": {
    title: "Urgent & Important",
    subtitle: "DO FIRST",
    color: "#f8d5dbff", // match EisenhowerMatrix
    borderColor: "#D32F2F",
    priority: "urgent-important",
  },
  "not-urgent-important": {
    title: "Not Urgent & Important",
    subtitle: "SCHEDULE",
    color: "#d1f5d4ff", // match EisenhowerMatrix
    borderColor: "#388E3C",
    priority: "not-urgent-important",
  },
  "urgent-not-important": {
    title: "Urgent & Not Important",
    subtitle: "DELEGATE",
    color: "#faeec8ff", // match EisenhowerMatrix
    borderColor: "#FFA000",
    priority: "urgent-not-important",
  },
  "not-urgent-not-important": {
    title: "Not Urgent & Not Important",
    subtitle: "ELIMINATE",
    color: "#ceccccff", // match EisenhowerMatrix
    borderColor: "#757575",
    priority: "not-urgent-not-important",
  },
};

const EisenhowerListPage: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<EisenhowerListRouteProp>();
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);

  const { tasks: serializedTasks, quadrant } = route.params;
  const quadrantData = quadrants[quadrant];

  const tasks = serializedTasks.map((task) => ({
    ...task,
    createdAt: new Date(task.createdAt),
    due_datetime: task.due_datetime ? new Date(task.due_datetime) : null,
    updatedAt: task.updatedAt ? new Date(task.updatedAt) : undefined,
    completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
  }));

  const quadrantTasks = serializedTasks.filter(
    (task) => task.priority === quadrant
  );

  // Filter tasks based on search query
  const filteredTasks = quadrantTasks.filter((task) =>
    task.title.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const handleSearchToggle = () => {
    if (isSearchExpanded) {
      setSearchQuery("");
      setIsSearchExpanded(false);
    } else {
      setIsSearchExpanded(true);
    }
  };

  const handleTaskPress = (taskId: string) => {
    navigation.navigate("TaskDetails", { taskId });
  };

  const handleBackPress = () => {
    navigation.goBack();
  };

  const handleTaskLongPress = (task: Task) => {
    Alert.alert(task.title, "What would you like to do?", [
      { text: "View Details", onPress: () => handleTaskPress(task.id) },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const renderTaskItem = ({ item: task }: { item: Task }) => {
    let timeString = "--:--";
    let dateString = "";
    if (task.due_datetime) {
      const due =
        typeof task.due_datetime === "string"
          ? new Date(task.due_datetime)
          : task.due_datetime;
      if (!isNaN(due.getTime())) {
        // Use due_time if available, otherwise extract time from due_datetime with proper timezone handling
        if (task.due_time) {
          timeString = task.due_time;
        } else {
          // Format time in Philippine timezone (GMT+8)
          console.log(due);
          // use utc values
          timeString = due.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit',
            hour12: true,
            timeZone: 'UTC'
          });
        }
        dateString = due.toLocaleDateString('en-US', {
          timeZone: 'UTC'
        });
      }
    } else if (task.due_time) {
      // If only due_time is available without due_datetime
      timeString = task.due_time;
    }

    // MOVE THESE INSIDE THE FUNCTION
    const taskQuadrant = task.priority || quadrant;
    const cardColor = quadrants[taskQuadrant]?.color || "#fff";
    const iconName = priorityIcons[taskQuadrant] || "ellipse";

    return (
      <View style={styles.taskRowOuter}>
        {/* Time OUTSIDE the card */}
        <View style={styles.contentLeft}>
          <Text style={styles.timeText}>{timeString}</Text>
        </View>

        {/* These are now absolutely positioned */}
        <View style={styles.circleAboveDivider} />
        <View style={styles.verticalDivider} />

        <TouchableOpacity
          style={[
            styles.taskCard,
            { backgroundColor: cardColor },
            task.overdue && !task.completed && styles.overdueTask,
            task.completed && styles.completedTask,
          ]}
          onPress={() => handleTaskPress(task.id)}
          onLongPress={() => handleTaskLongPress(task)}
        >
          <View style={styles.iconAndContentRow}>
            <View
              style={[
                styles.iconCard,
                {
                  backgroundColor:
                    quadrants[taskQuadrant]?.borderColor || "#fff",
                },
              ]}
            >
              <MaterialIcons
                name={iconName as any}
                size={28}
                color="#ffffffff"
                style={styles.cardIcon}
              />
            </View>
            <View style={styles.taskContent}>
              <View style={styles.taskHeader}>
                <View style={styles.taskTextSection}>
                  <Text
                    style={[
                      styles.taskTitle,
                      task.completed && styles.completedTaskTitle,
                    ]}
                    numberOfLines={2}
                  >
                    {task.title}
                  </Text>
                  {task.description && (
                    <Text style={styles.taskDescription} numberOfLines={2}>
                      {task.description}
                    </Text>
                  )}
                  {task.due_datetime && (
                    <Text
                      style={[
                        styles.taskDate,
                        task.overdue && styles.overdueText,
                      ]}
                    >
                      Due: {dateString}
                    </Text>
                  )}
                </View>

                {/* Checkbox in outlined card */}
                <TouchableOpacity
                  style={[
                    styles.checkboxCard,
                    task.completed && styles.checkboxCardCompleted,
                  ]}
                  onPress={() => {
                    /* Add your toggle completion logic here */
                  }}
                >
                  <MaterialIcons
                    name="check"
                    size={20}
                    color={task.completed ? "#fff" : "#999999ff"}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      </View>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <MaterialIcons name="task-alt" size={64} color="#bdc3c7" />
      <Text style={styles.emptyTitle}>No tasks in this quadrant</Text>
      <Text style={styles.emptyDescription}>
        Tasks added to this priority level will appear here
      </Text>
    </View>
  );

  return (
    <View style={styles.rootContainer}>
      {/* Header with LinearGradient positioned behind content */}
      <LinearGradient
        colors={["#A855F7", "#8B5CF6", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <View style={styles.headerTopRow}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={handleBackPress}
            >
              <Ionicons name="chevron-back" size={24} color="#fff" />
            </TouchableOpacity>
            <View style={styles.headerTitleSection}>
              <Text style={styles.title}>{quadrantData.title}</Text>
              <Text style={styles.subtitle}>{quadrantData.subtitle}</Text>
            </View>
            <View style={styles.taskCountContainer}>
              <Text style={styles.taskCountText}>{quadrantTasks.length}</Text>
            </View>
          </View>
        </View>
      </LinearGradient>

      {/* Main Content Container positioned above header */}
      <View style={styles.mainContentContainer}>
        <View style={styles.content}>
          {/* Column Titles */}
          <View style={styles.columnHeaderRow}>
            <View style={styles.columnHeaderLeft}>
              <Text style={styles.columnHeaderText}>Time</Text>
            </View>
            <View style={styles.columnHeaderDividerSpace} />
            <View style={styles.columnHeaderRight}>
              <Text style={styles.columnHeaderText}>Task</Text>
            </View>
            <View style={styles.searchContainer}>
              {!isSearchExpanded ? (
                <TouchableOpacity 
                  style={styles.searchIconButton}
                  onPress={handleSearchToggle}
                >
                  <Ionicons 
                    name="search" 
                    size={20} 
                    color="#6A009C" 
                  />
                </TouchableOpacity>
              ) : (
                <View style={styles.searchInputContainer}>
                  <Ionicons 
                    name="search" 
                    size={16} 
                    color="#94a3b8" 
                    style={styles.searchIcon}
                  />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Search tasks..."
                    placeholderTextColor="#94a3b8"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    autoFocus={true}
                  />
                  <TouchableOpacity 
                    onPress={handleSearchToggle}
                    style={styles.clearButton}
                  >
                    <Ionicons name="close-circle" size={16} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          </View>

          <FlatList
            data={filteredTasks}
            renderItem={renderTaskItem}
            keyExtractor={(item) => item.id}
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.listContainer}
            ListEmptyComponent={renderEmptyState}
            ItemSeparatorComponent={() => <View style={styles.separator} />}
          />
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  container: {
    flex: 1,
    backgroundColor: "#FFFFFF",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 60 : 45,
    paddingBottom: "100%",
    zIndex: 1,
  },
  headerContent: {
    flex: 1,
  },
  mainContentContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    marginTop: 160, // Adjust so it sits below the header
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 10,
    zIndex: 1000,
    overflow: "hidden",
  },
  headerTopRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  headerTitleSection: {
    flex: 1,
  },
  title: {
    fontSize: 22,
    color: "#FFFFFF",
    fontFamily: "Lexend",
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 14,
    color: "rgba(255, 255, 255, 0.8)",
    fontFamily: "Inter-Medium",
    marginTop: 2,
  },
  taskCountContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 32,
    alignItems: "center",
  },
  taskCountText: {
    color: "#6A009C",
    fontWeight: "bold",
    fontSize: 16,
    fontFamily: "Inter-Bold",
  },

  content: {
    flex: 1,
    paddingTop: 30,
    paddingBottom: 100,
  },

  columnHeaderRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 6,
    marginLeft: 10,
    marginRight: 10,
  },
  columnHeaderLeft: {
    width: 60,
    alignItems: "center",
    justifyContent: "center",
  },
  columnHeaderDividerSpace: {
    width: 36, 
  },
  columnHeaderRight: {
    flex: 1,
    paddingLeft: 10,
  },
  columnHeaderText: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#6A009C",
  },
  searchContainer: {
    flex: 1,
    marginLeft: 10,
    marginRight: 10,
    maxWidth: '100%',
    justifyContent: "flex-end",
    alignItems: "flex-end",
  },
  searchIconButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: "#f8fafc",
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 1,
    borderColor: "#e2e8f0",
  },
  searchInputContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f8fafc",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: "#e2e8f0",
    width: "100%",
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#1e293b",
    paddingVertical: 0,
  },
  clearButton: {
    marginLeft: 8,
    padding: 2,
  },
  listContainer: {
    paddingHorizontal: 24,
    paddingTop: 20,
    flexGrow: 1,
  },
  taskCard: {
    borderRadius: 12,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 15,
    flex: 1,
    minHeight: 70,
    marginLeft: 10,
  },
  iconAndContentRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  iconCard: {
    padding: 10,
    borderRadius: 12,
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  cardIcon: {
    color: "#ffffffff",
  },
  overdueTask: {
    borderLeftColor: "#e74c3c",
    backgroundColor: "#fdf2f2",
  },
  completedTask: {
    backgroundColor: "#f8f9fa",
    opacity: 0.7,
  },
  taskRowOuter: {
    flexDirection: "row",
    alignItems: "stretch",
    marginBottom: 0,
    width: "100%",
    position: "relative", // Add this
  },
  contentLeft: {
    width: 60,
    justifyContent: "center",
    alignItems: "center",
    minHeight: 70,
    marginRight: 10,
    paddingTop: 21, // Circle height (14) + gap (7)
  },
  timeText: {
    fontSize: 18,
    color: "#64748B",
    fontFamily: "Inter-Medium",
  },
  circleAboveDivider: {
    position: "absolute",
    left: 30, // Half of contentLeft width (60/2) minus half of circle width (14/2)
    top: 0,
    width: 14,
    height: 14,
    borderRadius: 7,
    marginLeft: 20, // Gap between circle and divider
    backgroundColor: "transparent",
    borderWidth: 2,
    borderColor: "#dbdbdbff", // or use the quadrant color if you want
    zIndex: 2,
  },
  verticalDivider: {
    position: "absolute",
    left: 36, // Half of contentLeft width (60/2)
    top: 20, // Half of circle height (14/2) + gap (14px)
    bottom: 0,
    width: 1,
    marginLeft: 20, // Gap between circle and divider
    backgroundColor: "#dbdbdbff",
    zIndex: 1,
  },

  taskContent: {
    flex: 1,
  },
  taskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  taskTextSection: {
    flex: 1,
    marginRight: 12,
  },
  taskTitle: {
    fontSize: 16,
    color: "#2c3e50",
    fontFamily: "Inter-SemiBold",
    lineHeight: 20,
    marginBottom: 4,
  },
  completedTaskTitle: {
    color: "#95a5a6",
    textDecorationLine: "line-through",
  },
  taskDescription: {
    fontSize: 14,
    color: "#64748B",
    fontFamily: "Inter-Regular",
    lineHeight: 18,
    marginBottom: 8,
  },
  taskDate: {
    fontSize: 12,
    color: "#64748B",
    fontFamily: "Inter-Medium",
  },
  overdueText: {
    color: "#e74c3c",
    fontWeight: "600",
  },
  checkboxCard: {
    width: 40,
    height: 40,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e0e0e0",
    backgroundColor: "#fff",
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  checkboxCardCompleted: {
    backgroundColor: "#27ae5f83",
    borderColor: "#27ae60",
  },
  statusButton: {
    padding: 4,
  },
  categoryContainer: {
    marginTop: 12,
    alignSelf: "flex-start",
  },
  categoryText: {
    fontSize: 12,
    color: "#6A009C",
    fontFamily: "Inter-Medium",
    backgroundColor: "#f3e8ff",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  separator: {
    height: 12,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 20,
    color: "#64748B",
    fontFamily: "Inter-SemiBold",
    marginTop: 16,
    marginBottom: 8,
    textAlign: "center",
  },
  emptyDescription: {
    fontSize: 14,
    color: "#94a3b8",
    fontFamily: "Inter-Regular",
    textAlign: "center",
    lineHeight: 20,
  },
});

export default EisenhowerListPage;
