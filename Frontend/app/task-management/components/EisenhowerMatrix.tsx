import React from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Animated,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { Task } from "../types/Task";
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
}) => {
  const navigation = useNavigation<NavigationProp>();

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
    return tasks.filter(
      (task) => task.priority === priority && !task.completed
    );
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

  const renderQuadrant = (quadrantKey: string) => {
    const quadrant = quadrants[quadrantKey];
    const quadrantTasks = getTasksByQuadrant(quadrant.priority);

    return (
      <View
        key={quadrantKey}
        style={[
          styles.quadrant,
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
          <MaterialIcons name={quadrant.icon} size={18} color="#ffffff" />
          <Text style={styles.quadrantTitle}>{quadrant.title}</Text>
          <TouchableOpacity
            style={styles.seeAllButton}
            onPress={() =>
              navigation.navigate("EisenhowerList", {
                tasks: tasks.map((task) => ({
                  ...task,
                  created_at:
                    task.created_at 
                      ? task.created_at.toString()
                      : task.created_at,
                  due_datetime:
                    task.due_datetime instanceof Date
                      ? task.due_datetime.toISOString()
                      : task.due_datetime,
                  updatedAt:
                    task.updated_at 
                      ? task.updated_at.toString()
                      : task.updated_at,
                  completedAt:
                    task.completed_at 
                      ? task.completed_at.toString()
                      : task.completed_at,
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
              <MaterialIcons
                name="add-circle-outline"
                size={32}
                color="#bdc3c7"
              />
              <Text style={styles.emptyText}>Add your first task</Text>
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

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      <View style={styles.helpButtonContainer}>
        <TouchableOpacity style={styles.helpButton} onPress={showMatrixHelp}>
          <MaterialIcons name="help-outline" size={16} color="#666" />
          <Text style={styles.helpButtonText}>What's this?</Text>
        </TouchableOpacity>
      </View>
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
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  matrix: {
    flex: 1,
  },
  matrixRow: {
    flexDirection: "row",
    flex: 1,
    marginBottom: 10,
  },
  quadrant: {
    flex: 1,
    marginHorizontal: 5,
    backgroundColor: "#fff",
    borderRadius: 12,
    borderWidth: 0,
    minHeight: 250,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  quadrantHeader: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  quadrantTitle: {
    flex: 1,
    fontSize: 14,
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
    padding: 8,
  },
  emptyQuadrant: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 12,
    color: "#bdc3c7",
    marginTop: 8,
    textAlign: "center",
    fontFamily: "Inter-Regular",
  },
  taskRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    paddingHorizontal: 4,
  },
  checkbox: {
    marginRight: 8,
    paddingVertical: 2,
  },
  taskTextContainer: {
    flex: 1,
  },
  taskText: {
    fontSize: 12,
    fontWeight: "400",
    color: "#333333",
    lineHeight: 16,
    fontFamily: "Inter-Regular",
  },
  overdueTaskText: {
    color: "#e74c3c",
    fontWeight: "500",
  },
});

export default EisenhowerMatrix;
