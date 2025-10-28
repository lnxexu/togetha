import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Animated,
  useWindowDimensions,
  FlatList,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Task, TaskCategory } from "../types/Task";
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../../navigation/AppNavigator";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

interface EisenhowerMatrixProps {
  tasks: Task[];
  onTaskPress: (taskId: string) => void;
  onAddTask: (quadrant: string) => void;
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
    | "priority-high"
    | "event"
    | "person-add"
    | "not-interested"
    | "add-circle-outline"
    | "check-box-outline-blank";
};

const quadrants: Record<string, QuadrantData> = {
  "urgent-important": {
    title: "Do First",
    subtitle: "Urgent & Important",
    color: "#FFEBEE",
    borderColor: "#D32F2F",
    priority: "urgent-important",
    icon: "priority-high",
  },
  "not-urgent-important": {
    title: "Schedule",
    subtitle: "Important, Not Urgent",
    color: "#E8F5E9",
    borderColor: "#388E3C",
    priority: "not-urgent-important",
    icon: "event",
  },
  "urgent-not-important": {
    title: "Delegate",
    subtitle: "Urgent, Not Important",
    color: "#FFF8E1",
    borderColor: "#FFA000",
    priority: "urgent-not-important",
    icon: "person-add",
  },
  "not-urgent-not-important": {
    title: "Eliminate",
    subtitle: "Neither Urgent nor Important",
    color: "#E0E0E0",
    borderColor: "#757575",
    priority: "not-urgent-not-important",
    icon: "not-interested",
  },
};

const EisenhowerMatrix: React.FC<EisenhowerMatrixProps> = ({
  tasks,
  onTaskPress,
  onAddTask,
  onDeleteTask,
  onMarkComplete,
  categories,
  selectedCategory,
  onCategoryChange,
}) => {
  const navigation = useNavigation<NavigationProp>();
  const { width, height } = useWindowDimensions();
  
  // State for category filter dropdown
  const [showCategoryDropdown, setShowCategoryDropdown] = useState(false);
  
  // Determine if we should show mobile or tablet/landscape layout
  const isLandscape = width > height;
  const isTablet = width >= 768; // iPad mini width
  const isMobile = !isTablet && !isLandscape;
  
  // State for mobile quadrant navigation
  const [currentQuadrantIndex, setCurrentQuadrantIndex] = useState(0);
  const quadrantKeys = Object.keys(quadrants);

  const showMatrixHelp = () => {
    Alert.alert(
      "Eisenhower Matrix",
      "The Eisenhower Matrix helps you prioritize tasks based on urgency and importance:\n\n" +
        "• Do First: Urgent and important tasks that require immediate attention\n" +
        "• Schedule: Important but not urgent tasks that you should plan time for\n" +
        "• Delegate: Urgent but less important tasks that could be delegated\n" +
        "• Eliminate: Neither urgent nor important tasks that you might reconsider",
      [{ text: "Got it" }]
    );
  };
  const getTasksByQuadrant = (priority: string) => {
    // Filter by quadrant priority
    let filteredTasks = tasks.filter(
      (task) => task.priority === priority && !task.completed
    );
    
    // Also filter by selected category
    if (selectedCategory !== "all") {
      filteredTasks = filteredTasks.filter(
        (task) => task.category === selectedCategory
      );
    }
    
    return filteredTasks;
  };

  const handleTaskLongPress = (task: Task) => {
    Alert.alert(task.title, "What would you like to do?", [
      { text: "View Details", onPress: () => onTaskPress(task.id) },
      {
        text: "Mark Complete",
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

  const renderQuadrant = (quadrantKey: string, isMobileView: boolean = false) => {
    const quadrant = quadrants[quadrantKey];
    const quadrantTasks = getTasksByQuadrant(quadrant.priority);

    return (
      <View
        key={quadrantKey}
        style={[
          isMobileView ? styles.mobileQuadrant : styles.quadrant,
          {
            backgroundColor: quadrant.color,
            borderLeftColor: quadrant.borderColor,
            borderLeftWidth: 4,
            borderColor: "transparent",
          },
        ]}
      >
        <View
          style={[
            styles.quadrantHeader,
            { backgroundColor: quadrant.borderColor },
          ]}
        >
          <MaterialIcons name={quadrant.icon} size={20} color="#ffffff" />
          <Text style={styles.quadrantTitle}>{quadrant.title}</Text>
          <TouchableOpacity
            style={styles.seeAllButton}
                  onPress={() =>
                    navigation.navigate('EisenhowerList', {
                      tasks: tasks.map((task) => ({
                        ...task,
                        created_at: task.created_at ? task.created_at.toString() : task.created_at,
                        due_datetime: task.due_datetime
                          ? (task.due_datetime instanceof Date ? task.due_datetime.toISOString() : task.due_datetime)
                          : task.due_datetime,
                        updatedAt: task.updated_at ? task.updated_at.toString() : task.updated_at,
                        completedAt: task.completed_at ? task.completed_at.toString() : task.completed_at,
                      })),
                      quadrant: quadrant.priority,
                    })
                  }
          >
            <Text style={styles.seeAllText}>See All</Text>
          </TouchableOpacity>
        </View>
        <Text style={styles.quadrantSubtitle}>{quadrant.subtitle}</Text>
        <ScrollView
          style={styles.taskList}
          showsVerticalScrollIndicator={false}
        >
          {quadrantTasks.length === 0 ? (
            <TouchableOpacity
              style={styles.emptyQuadrant}
              onPress={() => onAddTask(quadrant.priority)}
            >
              <View style={styles.emptyQuadrantIconContainer}>
                <MaterialIcons
                  name="add-circle-outline"
                  size={40}
                  color="#A855F7"
                />
              </View>
              <Text style={styles.emptyText}>Add your first task</Text>
              <Text style={styles.emptySubText}>Tap to get started</Text>
            </TouchableOpacity>
          ) : (
            quadrantTasks.map((task) => (
              <View key={task.id} style={styles.taskRow}>
                <TouchableOpacity
                  style={styles.checkbox}
                  onPress={() => onMarkComplete(task.id)}
                >
                  <MaterialIcons
                    name="check-box-outline-blank"
                    size={16}
                    color={task.overdue ? "#e74c3c" : "#7f8c8d"}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.taskTextContainer}
                  onPress={() => onTaskPress(task.id)}
                  onLongPress={() => handleTaskLongPress(task)}
                >
                  <Text
                    style={[
                      styles.taskText,
                      task.overdue && styles.overdueTaskText,
                    ]}
                    numberOfLines={2}
                  >
                    {task.title}
                  </Text>
                </TouchableOpacity>
              </View>
            ))
          )}
        </ScrollView>
      </View>
    );
  };



  const renderMobileMatrix = () => {
    return (
      <View style={styles.mobileContainer}>
        <FlatList
          data={quadrantKeys}
          horizontal
          pagingEnabled={true}
          showsHorizontalScrollIndicator={false}
          snapToInterval={width}
          snapToAlignment="center"
          decelerationRate="fast"
          bounces={false}
          onMomentumScrollEnd={(event) => {
            const index = Math.round(event.nativeEvent.contentOffset.x / width);
            setCurrentQuadrantIndex(index);
          }}
          getItemLayout={(data, index) => ({
            length: width,
            offset: width * index,
            index,
          })}
          keyExtractor={(item) => item}
          renderItem={({ item }) => (
            <View style={[styles.mobileQuadrantWrapper, { width }]} testID="mobile-quadrant-wrapper">
              {renderQuadrant(item, true)}
            </View>
          )}
          contentContainerStyle={styles.mobileMatrixContent}
          testID="mobile-quadrant-list"
        />
        <View style={styles.mobileIndicatorContainer} testID="mobile-indicators">
          {quadrantKeys.map((_, index) => (
            <View
              key={index}
              style={[
                styles.mobileIndicator,
                index === currentQuadrantIndex && styles.activeMobileIndicator,
              ]}
            />
          ))}
        </View>
      </View>
    );
  };

  const renderTabletMatrix = () => {
    return (
      <View style={styles.matrix}>
        <View style={styles.matrixRow}>
          {renderQuadrant("urgent-important")}
          {renderQuadrant("not-urgent-important")}
        </View>
        <View style={styles.matrixRow}>
          {renderQuadrant("urgent-not-important")}
          {renderQuadrant("not-urgent-not-important")}
        </View>
      </View>
    );
  };

  return (
    <ScrollView 
      style={styles.container} 
      showsVerticalScrollIndicator={false}
      contentContainerStyle={styles.scrollContent}
    >
      <View style={styles.topControlsContainer}>
        <View style={styles.helpButtonContainer}>
          <TouchableOpacity style={styles.helpButton} onPress={showMatrixHelp}>
            <MaterialIcons name="help-outline" size={16} color="#666" />
            <Text style={styles.helpButtonText}>What's this?</Text>
          </TouchableOpacity>
        </View>

        {/* Category Filter Section */}
        <View style={styles.categoryFilterContainer}>
          <Text style={styles.categoryFilterLabel}>Filter:</Text>
          <TouchableOpacity
            style={styles.categoryFilterDropdown}
            onPress={() => setShowCategoryDropdown(!showCategoryDropdown)}
          >
            <View style={styles.categoryFilterButton}>
              <View style={styles.categoryFilterContent}>
                {selectedCategory === "all" ? (
                  <Text style={styles.categoryFilterText}>All</Text>
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

          {/* Category Dropdown Options - use ScrollView so long lists can be scrolled */}
          {showCategoryDropdown && (
            <ScrollView
              style={styles.categoryFilterOptions}
              nestedScrollEnabled={true}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={true}
              contentContainerStyle={{ paddingVertical: 4 }}
            >
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
            </ScrollView>
          )}
        </View>
      </View>
      
      {isMobile ? renderMobileMatrix() : renderTabletMatrix()}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    paddingBottom: 100, // Add padding to allow content to be visible behind navbar
  },
  topControlsContainer: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 20,
  },
  helpButtonContainer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  helpButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  helpButtonText: {
    fontSize: 12,
    color: "#666",
    marginLeft: 4,
    fontFamily: "Inter-Regular",
  },
  // Category Filter Styles
  categoryFilterContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
  },
  categoryFilterLabel: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    marginRight: 8,
  },
  categoryFilterDropdown: {
    flex: 1,
  },
  categoryFilterButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 8,
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
    borderRadius: 8,
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
    paddingVertical: 8,
    paddingHorizontal: 12,
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
  matrix: {
    flex: 1,
    paddingHorizontal: 5, // Added padding for better spacing
  },
  matrixRow: {
    flexDirection: "row",
    flex: 1,
    marginBottom: 5, // Reduced margin for tighter layout
    justifyContent: "space-between", // Better space distribution
  },
  quadrant: {
    flex: 1,
    marginHorizontal: 3, // Reduced margin for more space allocation
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 0,
    minHeight: 300, // Increased height
    maxWidth: '48%', // Ensure consistent width allocation
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  // Mobile-specific styles
  mobileContainer: {
    flex: 1,
  },
  mobileQuadrant: {
    flex: 1,
    marginHorizontal: 8, // Minimal margin for maximum width
    backgroundColor: "#fff",
    borderRadius: 16,
    borderWidth: 0,
    minHeight: 500, // Increased height
    width: '85%', // Explicitly set width to use most of the available space
    alignSelf: 'center', // Center the quadrant
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 8,
  },
  mobileQuadrantWrapper: {
    paddingHorizontal: 0, // No horizontal padding for maximum quadrant width
    paddingVertical: 10,
    justifyContent: "center",
    alignItems: "center",
    flex: 1, // Take full height
  },
  mobileMatrixContent: {
    flexGrow: 1, // Changed from alignItems to flexGrow
  },
  mobileIndicatorContainer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  mobileIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#E2E8F0",
  },
  activeMobileIndicator: {
    backgroundColor: "#8B5CF6",
    width: 24,
  },
  quadrantHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14, // Increased padding
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  quadrantTitle: {
    flex: 1,
    fontSize: 15, // Increased font size
    fontFamily: "Inter-Medium",
    color: "#fff",
    marginLeft: 8,
    fontWeight: "bold",
  },
  seeAllButton: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  seeAllText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 11,
    fontFamily: "Inter-Medium",
  },
  taskCountContainer: {
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: "center",
    justifyContent: "center",
  },
  taskCountText: {
    color: "#fff",
    fontWeight: "bold",
    fontSize: 13,
    fontFamily: "Inter-Medium",
  },

  quadrantSubtitle: {
    fontSize: 11,
    color: "#333333",
    textAlign: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontFamily: "Inter-Regular",
  },
  taskList: {
    flex: 1,
    padding: 12, // Increased padding for better utilization of larger width
  },
  emptyQuadrant: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: "#E2E8F0",
    borderStyle: "dashed",
    backgroundColor: "#FAFAFA",
  },
  emptyQuadrantIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 12,
  },
  emptyText: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 4,
    textAlign: "center",
    fontFamily: "Inter-Medium",
  },
  emptySubText: {
    fontSize: 12,
    color: "#94A3B8",
    textAlign: "center",
    fontFamily: "Inter-Regular",
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  checkbox: {
    marginRight: 12,
    paddingVertical: 4,
    paddingHorizontal: 2,
  },
  taskTextContainer: {
    flex: 1,
  },
  taskText: {
    fontSize: 15,
    fontWeight: "500",
    color: "#374151",
    lineHeight: 20,
    fontFamily: "Inter-Medium",
    letterSpacing: -0.1,
  },
  overdueTaskText: {
    color: "#e74c3c",
    fontWeight: "500",
  },
});

export default EisenhowerMatrix;
