import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ScrollView,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Task } from "../types/Task";

interface TaskListViewProps {
  tasks: Task[];
  onTaskPress: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onMarkComplete: (taskId: string) => void;
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

type QuadrantData = {
  title: string;
  subtitle: string;
  color: string;
  borderColor: string;
  priority: string;
  icon:
    | "view-list"
    | "priority-high"
    | "event"
    | "person-add"
    | "not-interested";
};

const quadrants: Record<string, QuadrantData> = {
  all: {
    title: "All Tasks",
    subtitle: "View all tasks",
    // make the color have a contrast to the white
    color: "#3498db",
    borderColor: "#2980b9",
    priority: "all",
    icon: "view-list",
  },
  "urgent-important": {
    title: "Do First",
    subtitle: "Urgent & Important",
    color: "#D32F2F",
    borderColor: "#D32F2F",
    priority: "urgent-important",
    icon: "priority-high",
  },
  "not-urgent-important": {
    title: "Schedule",
    subtitle: "Important, Not Urgent",
    color: "#388E3C",
    borderColor: "#388E3C",
    priority: "not-urgent-important",
    icon: "event",
  },
  "urgent-not-important": {
    title: "Delegate",
    subtitle: "Urgent, Not Important",
    color: "#FFA000",
    borderColor: "#FFA000",
    priority: "urgent-not-important",
    icon: "person-add",
  },
  "not-urgent-not-important": {
    title: "Eliminate",
    subtitle: "Neither Urgent nor Important",
    color: "#757575",
    borderColor: "#757575",
    priority: "not-urgent-not-important",
    icon: "not-interested",
  },
};

const TaskListView: React.FC<TaskListViewProps> = ({
  tasks,
  onTaskPress,
  onDeleteTask,
  onMarkComplete,
  categories,
  selectedCategory,
  onCategoryChange,
}) => {
  // Change the default selected quadrant to 'urgent-important' instead of 'all'
  const [selectedQuadrant, setSelectedQuadrant] =
    useState<string>("urgent-important");

  const getTasksByQuadrant = (priority: string) => {
    return tasks.filter((task) => task.priority === priority);
  };

  const getFilteredTasks = () => {
    // When "all" is selected, return all tasks without filtering by priority
    if (selectedQuadrant === "all") {
      return tasks;
    }
    // Otherwise filter by the selected quadrant's priority
    return tasks.filter((task) => task.priority === selectedQuadrant);
  };
  const handleTaskLongPress = (task: Task) => {
    Alert.alert(task.title, "What would you like to do?", [
      { text: "View Details", onPress: () => onTaskPress(task.id) },
      {
        text: task.completed ? "Mark Incomplete" : "Mark Complete",
        onPress: () => onMarkComplete(task.id),
        style: "default",
      },
      {
        text: "Delete",
        onPress: () => onDeleteTask(task.id),
        style: "destructive",
      },
      { text: "Cancel", style: "cancel" },
    ]);
  };

  const renderTaskCard = ({ item: task }: { item: Task }) => {
    const quadrant = quadrants[task.priority];

    return (
      <TouchableOpacity
        style={[
          styles.taskCard,
          {
            borderColor: quadrant?.color || "#e9ecef",
            backgroundColor: quadrant?.color
              ? `${quadrant.color}15`
              : "#ffffff",
          },
          task.overdue && !task.completed && styles.overdueTask,
          task.completed && styles.completedTask,
        ]}
        onPress={() => onTaskPress(task.id)}
        onLongPress={() => handleTaskLongPress(task)}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardTopSection}>
            {task.priority && (
              <View
                style={[
                  styles.taskIcon,
                  { backgroundColor: quadrant?.color || "#ecf0f1" },
                ]}
              >
                <MaterialIcons
                  name={quadrant?.icon as any}
                  size={20}
                  color="#FFFFFF"
                />
              </View>
            )}
            <View style={styles.cardTextSection}>
              <Text
                style={[
                  styles.cardTitle,
                  task.completed && styles.completedTaskText,
                ]}
                numberOfLines={2}
              >
                {task.title}
              </Text>
              {task.due_datetime && (
                <Text
                  style={[styles.cardDate, task.overdue && styles.overdueText]}
                >
                  Due: {task.due_datetime.toLocaleDateString()}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.statusButton}
              onPress={() => onMarkComplete(task.id)}
            >
              <MaterialIcons
                name={
                  task.completed ? "check-circle" : "radio-button-unchecked"
                }
                size={20}
                color={task.completed ? "#27ae60" : "#bdc3c7"}
              />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderQuadrantSection = (quadrantKey: string) => {
    const quadrant = quadrants[quadrantKey];
    const quadrantTasks = getTasksByQuadrant(quadrant.priority);

    return (
      <View key={quadrantKey} style={styles.quadrantSection}>
        <View style={styles.sectionHeader}>
          <View style={[styles.titleCard, { backgroundColor: quadrant.color }]}>
            <View style={styles.titleIconContainer}>
              <MaterialIcons name={quadrant.icon} size={16} color="#FFFFFF" />
              <Text style={styles.quadrantTitle}>{quadrant.title}</Text>
            </View>
            <Text style={styles.quadrantSubtitle}>{quadrant.subtitle}</Text>
          </View>
          <View style={styles.taskCount}>
            <Text style={styles.taskCountText}>{quadrantTasks.length}</Text>
          </View>
        </View>
        {quadrantTasks.length === 0 ? (
          <View style={styles.emptyQuadrant}>
            <Text style={styles.emptyText}>No tasks in this category</Text>
          </View>
        ) : (
          <FlatList
            data={quadrantTasks}
            renderItem={renderTaskCard}
            keyExtractor={(item) => item.id}
            horizontal={true}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
            ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
          />
        )}
      </View>
    );
  };

  // Render the quadrant filter chips
  const renderQuadrantFilters = () => {
    return (
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.quadrantFiltersContainer}
      >
        {Object.entries(quadrants).map(([key, quadrant]) => (
          <TouchableOpacity
            key={key}
            style={[
              styles.quadrantFilterChip,
              selectedQuadrant === key && styles.activeQuadrantFilterChip,
              { borderColor: quadrant.color },
            ]}
            onPress={() => setSelectedQuadrant(key)}
          >
            <MaterialIcons
              name={quadrant.icon as any}
              size={16}
              color={selectedQuadrant === key ? "#FFFFFF" : quadrant.color}
              style={styles.quadrantFilterIcon}
            />
            <Text
              style={[
                styles.quadrantFilterText,
                selectedQuadrant === key && styles.activeQuadrantFilterText,
              ]}
            >
              {quadrant.title}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>
    );
  };

  // Render all tasks based on selected filter
  const renderAllTasks = () => {
    const filteredTasks = getFilteredTasks();

    if (filteredTasks.length === 0) {
      return (
        <View style={styles.emptyListContainer}>
          <MaterialIcons name="check-circle" size={48} color="#e0e0e0" />
          <Text style={styles.emptyListText}>No tasks found</Text>
          <Text style={styles.emptyListSubText}>
            No tasks in the {quadrants[selectedQuadrant]?.title} category
          </Text>
        </View>
      );
    }

    return (
      <FlatList
        data={filteredTasks}
        renderItem={renderTaskCard}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.tasksList}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.taskSeparator} />}
      />
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.filtersSection}>{renderQuadrantFilters()}</View>
      <View style={styles.tasksSection}>{renderAllTasks()}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContainer: {
    flex: 1,
  },
  matrixContainer: {
    paddingBottom: 20,
  },
  quadrantFiltersContainer: {
    flexDirection: "row",
    paddingHorizontal: 5,
    paddingVertical: 12,
    gap: 3,
    height: 60, // Fixed height instead of percentage
  },
  quadrantFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: "#ffffffff",
    backgroundColor: "transparent",
    marginRight: 8,
    height: 36,
  },
  activeQuadrantFilterChip: {
    backgroundColor: "#6A009C",
    borderColor: "#6A009C",
  },
  quadrantFilterIcon: {
    marginRight: 4,
  },
  quadrantFilterText: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#333",
  },
  activeQuadrantFilterText: {
    color: "#FFFFFF",
  },
  tasksList: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  taskSeparator: {
    height: 12,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 20,
    marginTop: 20, // Changed from top: -150
  },
  emptyListText: {
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: "#666",
    marginTop: 16,
  },
  emptyListSubText: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#999",
    marginTop: 8,
    textAlign: "center",
  },
  quadrantSection: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 15,
  },
  titleCard: {
    alignSelf: "flex-start",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    minWidth: 140,
  },
  quadrantTitle: {
    fontSize: 13,
    color: "#fff",
    fontFamily: "Inter-Medium",
  },
  taskCount: {
    backgroundColor: "#f8f9fa",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  taskCountText: {
    fontSize: 12,
    color: "#2c3e50",
    fontFamily: "Inter-Bold",
  },
  emptyQuadrant: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 12,
    color: "#bdc3c7",
    marginTop: 8,
    textAlign: "center",
    fontFamily: "Inter-Regular",
  },
  horizontalList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    minHeight: 130,
  },
  cardSeparator: {
    width: 12,
  },
  taskCard: {
    width: "100%",
    backgroundColor: "#ffffff",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    shadowColor: "#1E293B",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 5,
    marginBottom: 12,
  },
  overdueTask: {
    backgroundColor: "#FEF2F2",
    borderColor: "#EF4444",
    borderWidth: 2,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginBottom: 8,
  },
  cardContent: {
    flex: 1,
  },
  cardTopSection: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  taskIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  cardTextSection: {
    flex: 1,
  },
  statusButton: {
    padding: 2,
  },
  cardTitle: {
    fontSize: 16,
    color: "#1E293B",
    lineHeight: 20,
    fontFamily: "Inter-Bold",
    marginBottom: 4,
  },
  cardSubject: {
    fontSize: 11,
    color: "#AD00FF",
    marginBottom: 6,
    fontFamily: "Inter-Medium",
  },
  cardDescription: {
    fontSize: 12,
    color: "#7f8c8d",
    lineHeight: 16,
    marginBottom: 8,
    fontFamily: "Inter-Regular",
  },
  cardFooter: {
    marginTop: "auto",
  },
  cardDate: {
    fontSize: 14,
    color: "#64748B",
    fontFamily: "Inter-Medium",
    marginTop: 2,
  },
  overdueText: {
    color: "#e74c3c",
    fontWeight: "500",
  },
  completedTask: {
    opacity: 0.6,
    backgroundColor: "#F8F9FA !important",
  },
  completedTaskText: {
    textDecorationLine: "line-through",
    color: "#999",
  },
  titleContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 4,
  },
  titleIconContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  quadrantSubtitle: {
    fontSize: 10,
    color: "rgba(255,255,255,0.8)",
    fontFamily: "Inter-Regular",
    marginTop: 2,
  },
  filtersSection: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: "#f8f9fa",
    borderBottomWidth: 1,
    borderColor: "#e9ecef",
  },
  tasksSection: {
    flex: 1,
  },
});

export default TaskListView;
