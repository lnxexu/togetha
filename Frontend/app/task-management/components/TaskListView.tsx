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
import { Task, TaskCategory } from "../types/Task";

interface TaskListViewProps {
  tasks: Task[];
  onTaskPress: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onMarkComplete: (taskId: string) => void;
  categories: TaskCategory[];
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
  const [selectedQuadrant, setSelectedQuadrant] = useState<string>("all");
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);

  const getFilteredTasks = () => {
    let filteredTasks = tasks;
    
    // Filter by quadrant
    if (selectedQuadrant !== "all") {
      filteredTasks = filteredTasks.filter((task) => task.priority === selectedQuadrant);
    }
    
    // Filter by category
    if (selectedCategory !== "all") {
      filteredTasks = filteredTasks.filter((task) => task.category === selectedCategory);
    }
    
    return filteredTasks;
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
            borderLeftColor: quadrant?.color || "#e9ecef",
            borderLeftWidth: 3,
          },
          task.overdue && !task.completed && styles.overdueTask,
          task.completed && styles.completedTask,
        ]}
        onPress={() => onTaskPress(task.id)}
        onLongPress={() => handleTaskLongPress(task)}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
            <View style={styles.leftSection}>
              <TouchableOpacity
                style={styles.checkbox}
                onPress={() => onMarkComplete(task.id)}
              >
                <MaterialIcons
                  name={task.completed ? "check-box" : "check-box-outline-blank"}
                  size={20}
                  color={
                    task.completed
                      ? "#27ae60"
                      : task.overdue
                      ? "#e74c3c"
                      : "#7f8c8d"
                  }
                />
              </TouchableOpacity>
              
              <View style={styles.taskInfo}>
                <Text
                  style={[
                    styles.taskTitle,
                    task.completed && styles.completedTaskTitle,
                    task.overdue && !task.completed && styles.overdueTaskTitle,
                  ]}
                  numberOfLines={2}
                >
                  {task.title}
                </Text>
                
                {task.description && (
                  <Text
                    style={[
                      styles.taskDescription,
                      task.completed && styles.completedTaskDescription,
                    ]}
                    numberOfLines={1}
                  >
                    {task.description}
                  </Text>
                )}
              </View>
            </View>

            {task.priority && (
              <View
                style={[
                  styles.priorityBadge,
                  { backgroundColor: quadrant?.color || "#ecf0f1" },
                ]}
              >
                <MaterialIcons
                  name={quadrant?.icon || "view-list"}
                  size={10}
                  color="#fff"
                />
              </View>
            )}
          </View>

          <View style={styles.taskMeta}>
            <View style={styles.metaLeft}>
              {task.category && (
                <View style={styles.categoryTag}>
                  <Text style={styles.categoryText}>{task.category}</Text>
                </View>
              )}
            </View>
            
            {task.due_datetime && (
              <View style={styles.dueDateContainer}>
                <MaterialIcons name="schedule" size={12} color="#6c757d" />
                <Text style={styles.dueDateText}>
                  {new Date(task.due_datetime).toLocaleDateString()}
                </Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
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
          <View style={styles.emptyStateIconContainer}>
            <MaterialIcons name="assignment" size={64} color="#E2E8F0" />
          </View>
          <Text style={styles.emptyListText}>No tasks found</Text>
          <Text style={styles.emptyListSubText}>
            {selectedQuadrant === "all" 
              ? "Start by creating your first task to get organized!" 
              : `No tasks in the ${quadrants[selectedQuadrant]?.title} category yet.`}
          </Text>
          <TouchableOpacity 
            style={styles.emptyStateButton}
            onPress={() => {/* Navigate to create task */}}
          >
            <MaterialIcons name="add" size={20} color="#FFFFFF" />
            <Text style={styles.emptyStateButtonText}>Add Your First Task</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <FlatList
        data={filteredTasks}
        renderItem={renderTaskCard}
        keyExtractor={(item) => String(item.id)}
        contentContainerStyle={styles.tasksList}
        showsVerticalScrollIndicator={false}
        ItemSeparatorComponent={() => <View style={styles.taskSeparator} />}
      />
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.filtersSection}>
        {/* Category Filter Section */}
        <View style={styles.categoryFilterContainer}>
          <Text style={styles.categoryFilterLabel}>Filter by Category:</Text>
          <TouchableOpacity
            style={styles.categoryFilterDropdown}
            onPress={() => setShowCategoryDropdown(!showCategoryDropdown)}
          >
            <View style={styles.categoryFilterButton}>
              <View style={styles.categoryFilterContent}>
                {selectedCategory === "all" ? (
                  <Text style={styles.categoryFilterText}>All Categories</Text>
                ) : (
                  <>
                    <View 
                      style={[
                        styles.categoryFilterColorIndicator, 
                        { 
                          backgroundColor: categories.find(cat => cat.name === selectedCategory)?.color || '#6c757d' 
                        }
                      ]} 
                    />
                    <Text style={styles.categoryFilterText}>
                      {categories.find(cat => cat.name === selectedCategory)?.name || selectedCategory}
                    </Text>
                  </>
                )}
              </View>
              <MaterialIcons
                name={showCategoryDropdown ? "keyboard-arrow-up" : "keyboard-arrow-down"}
                size={20}
                color="#6c757d"
              />
            </View>
          </TouchableOpacity>

          {/* Category Dropdown Options */}
          {showCategoryDropdown && (
            <View style={styles.categoryFilterOptions}>
              <TouchableOpacity
                style={[
                  styles.categoryFilterOption,
                  selectedCategory === "all" && styles.selectedCategoryFilterOption,
                ]}
                onPress={() => {
                  onCategoryChange("all");
                  setShowCategoryDropdown(false);
                }}
              >
                <Text style={[
                  styles.categoryFilterOptionText,
                  selectedCategory === "all" && styles.selectedCategoryFilterOptionText,
                ]}>
                  All Categories
                </Text>
                {selectedCategory === "all" && (
                  <MaterialIcons name="check" size={16} color="#8B5CF6" />
                )}
              </TouchableOpacity>
              
              {categories.map((category) => (
                <TouchableOpacity
                  key={category.id}
                  style={[
                    styles.categoryFilterOption,
                    selectedCategory === category.name && styles.selectedCategoryFilterOption,
                  ]}
                  onPress={() => {
                    onCategoryChange(category.name);
                    setShowCategoryDropdown(false);
                  }}
                >
                  <View style={styles.categoryFilterOptionContent}>
                    <View 
                      style={[
                        styles.categoryFilterColorIndicator, 
                        { backgroundColor: category.color || '#6c757d' }
                      ]} 
                    />
                    <Text style={[
                      styles.categoryFilterOptionText,
                      selectedCategory === category.name && styles.selectedCategoryFilterOptionText,
                    ]}>
                      {category.name}
                    </Text>
                  </View>
                  {selectedCategory === category.name && (
                    <MaterialIcons name="check" size={16} color="#8B5CF6" />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </View>
        {renderQuadrantFilters()}
      </View>
      <View style={styles.tasksSection}>{renderAllTasks()}</View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  filtersSection: {
    marginBottom: 16,
  },
  // Category Filter Styles
  categoryFilterContainer: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    marginTop: 30,
    marginBottom: 8,
  },
  categoryFilterLabel: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    marginRight: 12,
  },
  categoryFilterDropdown: {
    flex: 1,
  },
  categoryFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  categoryFilterContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  categoryFilterColorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  categoryFilterText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#374151",
    flex: 1,
  },
  categoryFilterOptions: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1000,
    marginTop: 4,
    overflow: "hidden",
    maxHeight: 200,
  },
  categoryFilterOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  selectedCategoryFilterOption: {
    backgroundColor: "#F0F9FF",
  },
  categoryFilterOptionContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  categoryFilterOptionText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#374151",
  },
  selectedCategoryFilterOptionText: {
    color: "#8B5CF6",
  },
  tasksSection: {
    flex: 1,
  },
  quadrantFiltersContainer: {
    flexDirection: "row",
    paddingHorizontal: 5,
    paddingVertical: 8,
    gap: 6,
  },
  quadrantFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
    backgroundColor: "transparent",
    marginRight: 6,
  },
  activeQuadrantFilterChip: {
    backgroundColor: "#6A009C",
    borderColor: "#6A009C",
  },
  quadrantFilterIcon: {
    marginRight: 4,
  },
  quadrantFilterText: {
    fontSize: 11,
    fontFamily: "Inter-Medium",
    color: "#333",
    fontWeight: "500",
  },
  activeQuadrantFilterText: {
    color: "#FFFFFF",
  },
  tasksList: {
    paddingHorizontal: 0,
    paddingVertical: 4,
  },
  taskSeparator: {
    height: 4,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingVertical: 40,
    minHeight: 400,
  },
  emptyStateIconContainer: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    borderWidth: 2,
    borderColor: "#E2E8F0",
    borderStyle: "dashed",
  },
  emptyListText: {
    fontSize: 18,
    fontFamily: "Inter-SemiBold",
    color: "#374151",
    marginBottom: 6,
    textAlign: "center",
  },
  emptyListSubText: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    marginBottom: 24,
    textAlign: "center",
    lineHeight: 20,
    maxWidth: 260,
  },
  emptyStateButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#8B5CF6",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: "#8B5CF6",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  emptyStateButtonText: {
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: "#FFFFFF",
    marginLeft: 8,
  },
  taskCard: {
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: "#f1f5f9",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.04,
    shadowRadius: 8,
    elevation: 2,
    marginHorizontal: 16,
    marginBottom: 8,
    overflow: 'hidden',
  },
  overdueTask: {
    backgroundColor: "#FFF5F5",
    borderLeftColor: "#EF4444",
    borderLeftWidth: 6,
    shadowColor: "#EF4444",
    shadowOpacity: 0.15,
  },
  completedTask: {
    backgroundColor: "#F0FDF4",
    borderLeftColor: "#22C55E",
    borderLeftWidth: 6,
    opacity: 0.85,
    shadowColor: "#22C55E",
    shadowOpacity: 0.1,
  },
  cardContent: {
    flex: 1,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 8,
  },
  leftSection: {
    flexDirection: "row",
    alignItems: "flex-start",
    flex: 1,
    gap: 10,
  },
  taskInfo: {
    flex: 1,
  },
  checkbox: {
    padding: 2,
    borderRadius: 6,
  },
  priorityBadge: {
    width: 20,
    height: 20,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  taskTitle: {
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: "#1E293B",
    marginBottom: 4,
    lineHeight: 20,
    letterSpacing: -0.1,
    fontWeight: "600",
  },
  completedTaskTitle: {
    textDecorationLine: "line-through",
    color: "#6b7280",
  },
  overdueTaskTitle: {
    color: "#dc2626",
  },
  taskDescription: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    marginBottom: 8,
    lineHeight: 18,
    letterSpacing: 0,
  },
  completedTaskDescription: {
    textDecorationLine: "line-through",
    opacity: 0.6,
  },
  taskMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  metaLeft: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  categoryTag: {
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  categoryText: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#475569",
    fontWeight: "600",
  },
  dueDateContainer: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
  },
  dueDateText: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    fontWeight: "500",
  },
});

export default TaskListView;
