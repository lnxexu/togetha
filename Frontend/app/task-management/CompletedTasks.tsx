import React, { useState, useCallback } from "react";
import { MaterialIcons, Ionicons } from "@expo/vector-icons";
import { useNavigation, useFocusEffect } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { Task } from "./types/Task";
import { LinearGradient } from "expo-linear-gradient";
import taskService from "./services/taskService";
import SkeletonLoader from '../components/SkeletonLoader';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  Platform,
  StatusBar,
  useWindowDimensions,
  FlatList,
  RefreshControl,
} from "react-native";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const CompletedTasks: React.FC = () => {
  const { width, height } = useWindowDimensions();
  const isLandscape = width > height;
  
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const navigation = useNavigation<NavigationProp>();
  const [completedTasks, setCompletedTasks] = useState<Task[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<"all" | string>("all");

  // Load completed tasks when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadCompletedTasks();
    }, [])
  );

  const loadCompletedTasks = async () => {
    try {
      setIsLoading(true);

      const allTasks = await taskService.getAllTasks();
      const completed = allTasks.filter(task => task.completed);

      setCompletedTasks(completed);
    } catch (error) {
      console.error("Error loading completed tasks:", error);
      Alert.alert(
        "Error",
        "Failed to load completed tasks. Please check your connection and try again."
      );
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefresh = async () => {
    setIsRefreshing(true);
    await loadCompletedTasks();
    setIsRefreshing(false);
  };

  const handleTaskPress = (taskId: string) => {
    navigation.navigate("TaskDetails", { taskId });
  };

  const handleDeleteTask = async (taskId: string) => {
    Alert.alert("Delete Task", "Are you sure you want to delete this completed task?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          try {
            await taskService.deleteTask(taskId);
            await loadCompletedTasks();
          } catch (error) {
            Alert.alert("Error", "Failed to delete task");
          }
        },
      },
    ]);
  };

  const handleMarkIncomplete = async (taskId: string) => {
    try {
      // Assuming there's a method to mark task as incomplete
      await taskService.markTaskIncomplete(taskId);
      await loadCompletedTasks();
    } catch (error) {
      Alert.alert("Error", "Failed to update task");
    }
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
              for (const task of completedTasks) {
                await taskService.deleteTask(task.id);
              }
              await loadCompletedTasks();
              Alert.alert("Success", "All completed tasks deleted!");
            } catch (error) {
              Alert.alert("Error", "Failed to delete tasks");
            }
          },
        },
      ]
    );
  };

  const filteredTasks = completedTasks.filter((task) => {
    if (selectedCategory === "all") return true;
    return task.category === selectedCategory;
  });

  const categories = [
    ...new Set(
      completedTasks
        .map((task) => task.category)
        .filter((category): category is string => Boolean(category))
    ),
  ];

  const formatCompletedDate = (dateString: string) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const renderTaskItem = ({ item }: { item: Task }) => (
    <TouchableOpacity
      style={styles.taskItem}
      onPress={() => handleTaskPress(item.id)}
    >
      <View style={styles.taskContent}>
        <View style={styles.taskHeader}>
          <View style={styles.taskTitleContainer}>
            <MaterialIcons name="check-circle" size={20} color="#059669" />
            <Text style={styles.taskTitle} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
          <TouchableOpacity
            style={styles.taskActionButton}
            onPress={() => handleDeleteTask(item.id)}
          >
            <MaterialIcons name="delete" size={20} color="#EF4444" />
          </TouchableOpacity>
        </View>

        {item.description && (
          <Text style={styles.taskDescription} numberOfLines={3}>
            {item.description}
          </Text>
        )}

        <View style={styles.taskFooter}>
          <View style={styles.taskMetadata}>
            <Text style={styles.taskCategory}>
              {item.category_name || 'No Category'}
            </Text>
            <Text style={styles.taskPriority}>
              {item.priority.replace('-', ' ').toUpperCase()}
            </Text>
          </View>
          
          <View style={styles.taskDates}>
            {item.completed_at && (
              <Text style={styles.completedDate}>
                Completed: {formatCompletedDate(item.completed_at)}
              </Text>
            )}
            {item.due_datetime && (
              <Text style={styles.dueDate}>
                Due: {new Date(item.due_datetime).toLocaleDateString()}
              </Text>
            )}
          </View>
        </View>

        <TouchableOpacity
          style={styles.markIncompleteButton}
          onPress={() => handleMarkIncomplete(item.id)}
        >
          <MaterialIcons name="undo" size={16} color="#6366F1" />
          <Text style={styles.markIncompleteText}>Mark as Incomplete</Text>
        </TouchableOpacity>
      </View>
    </TouchableOpacity>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <MaterialIcons name="task-alt" size={80} color="#E2E8F0" />
      <Text style={styles.emptyTitle}>No Completed Tasks</Text>
      <Text style={styles.emptySubtitle}>
        Complete some tasks to see them here!
      </Text>
    </View>
  );

  const renderCategoryFilter = () => (
    <FlatList
      data={[{ value: "all", label: "All Categories" }, ...categories.map(cat => ({ value: cat, label: cat }))]}
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.categoryFilterContainer}
      keyExtractor={(item) => item.value}
      renderItem={({ item }) => (
        <TouchableOpacity
          style={[
            styles.categoryFilterItem,
            selectedCategory === item.value && styles.activeCategoryFilter
          ]}
          onPress={() => setSelectedCategory(item.value)}
        >
          <Text
            style={[
              styles.categoryFilterText,
              selectedCategory === item.value && styles.activeCategoryFilterText
            ]}
          >
            {item.label}
          </Text>
        </TouchableOpacity>
      )}
    />
  );

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />
      <View style={styles.container}>
        {/* Header */}
        <LinearGradient
          colors={["#A855F7", "#8B5CF6", "#7C3AED"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={styles.header}
        >
          <View style={styles.headerContent}>
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <MaterialIcons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            
            <View style={styles.headerTitleSection}>
              <Text style={styles.title}>Completed Tasks</Text>
              <Text style={styles.subtitle}>
                {filteredTasks.length} completed task{filteredTasks.length !== 1 ? 's' : ''}
              </Text>
            </View>

            {completedTasks.length > 0 && (
              <TouchableOpacity
                style={styles.deleteAllButton}
                onPress={handleDeleteAllCompleted}
              >
                <MaterialIcons name="delete-sweep" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        </LinearGradient>

        {/* Content */}
        <View style={styles.content}>
          {/* Category Filter */}
          {categories.length > 0 && (
            <View style={styles.filtersSection}>
              {renderCategoryFilter()}
            </View>
          )}

          {/* Tasks List */}
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <SkeletonLoader type="tasks" count={5} />
            </View>
          ) : (
            <FlatList
              data={filteredTasks}
              renderItem={renderTaskItem}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.listContainer}
              ListEmptyComponent={renderEmptyState}
              refreshControl={
                <RefreshControl
                  refreshing={isRefreshing}
                  onRefresh={handleRefresh}
                  colors={["#8B5CF6"]}
                  tintColor="#8B5CF6"
                />
              }
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 50 : 35,
    paddingBottom: 30,
    borderBottomLeftRadius: 30,
    borderBottomRightRadius: 30,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 15,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  headerTitleSection: {
    flex: 1,
    alignItems: "center",
    marginHorizontal: 16,
  },
  title: {
    fontSize: 28,
    color: "#FFFFFF",
    fontFamily: "Lexend",
    letterSpacing: -0.5,
    fontWeight: "600",
  },
  subtitle: {
    fontSize: 16,
    color: "rgba(255, 255, 255, 0.8)",
    fontFamily: "Inter-Regular",
    marginTop: 4,
  },
  deleteAllButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
  },
  content: {
    flex: 1,
    paddingTop: 20,
  },
  filtersSection: {
    marginBottom: 20,
  },
  categoryFilterContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  categoryFilterItem: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginRight: 12,
    borderRadius: 20,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  activeCategoryFilter: {
    backgroundColor: "#8B5CF6",
    borderColor: "#8B5CF6",
  },
  categoryFilterText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    fontWeight: "500",
  },
  activeCategoryFilterText: {
    color: "#FFFFFF",
    fontWeight: "600",
  },
  loadingContainer: {
    flex: 1,
    padding: 20,
  },
  listContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100,
  },
  taskItem: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
  },
  taskContent: {
    gap: 12,
  },
  taskHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  taskTitleContainer: {
    flex: 1,
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
  },
  taskTitle: {
    flex: 1,
    fontSize: 18,
    fontFamily: "Inter-SemiBold",
    color: "#1E293B",
    fontWeight: "600",
    lineHeight: 24,
  },
  taskActionButton: {
    padding: 8,
    borderRadius: 12,
    backgroundColor: "#FEE2E2",
  },
  taskDescription: {
    fontSize: 15,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    lineHeight: 22,
    marginLeft: 28,
  },
  taskFooter: {
    gap: 8,
  },
  taskMetadata: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  taskCategory: {
    fontSize: 13,
    fontFamily: "Inter-Medium",
    color: "#8B5CF6",
    fontWeight: "500",
    backgroundColor: "#F3E8FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  taskPriority: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#6366F1",
    fontWeight: "500",
    backgroundColor: "#EEF2FF",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  taskDates: {
    gap: 4,
  },
  completedDate: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#059669",
  },
  dueDate: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#94A3B8",
  },
  markIncompleteButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#F0F4FF",
    borderWidth: 1,
    borderColor: "#6366F1",
    gap: 8,
  },
  markIncompleteText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#6366F1",
    fontWeight: "500",
  },
  emptyState: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 40,
    paddingVertical: 80,
  },
  emptyTitle: {
    fontSize: 24,
    fontFamily: "Inter-SemiBold",
    color: "#334155",
    marginTop: 24,
    marginBottom: 12,
    fontWeight: "600",
  },
  emptySubtitle: {
    fontSize: 16,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    textAlign: "center",
    lineHeight: 24,
  },
});

export default CompletedTasks;
