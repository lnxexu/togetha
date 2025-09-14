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
            borderLeftWidth: 4,
            backgroundColor: quadrant?.color
              ? `${quadrant.color}08`
              : "#ffffff",
          },
          task.overdue && !task.completed && styles.overdueTask,
          task.completed && styles.completedTask,
        ]}
        onPress={() => onTaskPress(task.id)}
        onLongPress={() => handleTaskLongPress(task)}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardHeader}>
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
            
            {task.priority && (
              <View
                style={[
                  styles.priorityBadge,
                  { backgroundColor: quadrant?.color || "#ecf0f1" },
                ]}
              >
                <MaterialIcons
                  name={quadrant?.icon || "view-list"}
                  size={12}
                  color="#fff"
                />
              </View>
            )}
          </View>

          <View style={styles.cardBody}>
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

            <View style={styles.taskMeta}>
              {task.category && (
                <View style={styles.categoryTag}>
                  <Text style={styles.categoryText}>{task.category}</Text>
                </View>
              )}
              
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
        keyExtractor={(item) => item.id}
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
    paddingVertical: 20,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
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
    paddingVertical: 12,
    gap: 8,
  },
  quadrantFilterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: "transparent",
    marginRight: 8,
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
    paddingHorizontal: 0,
    paddingVertical: 8,
  },
  taskSeparator: {
    height: 8,
  },
  emptyListContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 32,
    paddingTop: 80,
  },
  emptyStateIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: "#F8FAFC",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 2,
    borderColor: "#E2E8F0",
    borderStyle: "dashed",
  },
  emptyListText: {
    fontSize: 20,
    fontFamily: "Inter-SemiBold",
    color: "#374151",
    marginBottom: 8,
    textAlign: "center",
  },
  emptyListSubText: {
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    marginBottom: 32,
    textAlign: "center",
    lineHeight: 24,
    maxWidth: 280,
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
    borderRadius: 16,
    padding: 20,
    borderWidth: 0,
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    marginHorizontal: 16,
    marginBottom: 12,
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
    alignItems: "center",
    marginBottom: 16,
  },
  checkbox: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
  },
  priorityBadge: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardBody: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 18,
    fontFamily: "Inter-SemiBold",
    color: "#1E293B",
    marginBottom: 6,
    lineHeight: 24,
    letterSpacing: -0.2,
  },
  completedTaskTitle: {
    textDecorationLine: "line-through",
    color: "#6b7280",
  },
  overdueTaskTitle: {
    color: "#dc2626",
  },
  taskDescription: {
    fontSize: 15,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    marginBottom: 12,
    lineHeight: 22,
    letterSpacing: -0.1,
  },
  completedTaskDescription: {
    textDecorationLine: "line-through",
    opacity: 0.6,
  },
  taskMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
  },
  categoryTag: {
    backgroundColor: "#F8FAFC",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
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
    gap: 6,
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  dueDateText: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    fontWeight: "500",
  },
});

export default TaskListView;
