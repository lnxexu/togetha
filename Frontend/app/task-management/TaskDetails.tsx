import React, { useState, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Platform,
  Alert,
  TextInput,
  Modal,
  ScrollView,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { MaterialIcons } from "@expo/vector-icons";
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { Task, Priority } from "./types/Task";
import  taskService from "./services/taskService";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const TaskDetails: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const { taskId } = route.params as { taskId: string };

  const [task, setTask] = useState<Task | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [editedTitle, setEditedTitle] = useState("");
  const [editedDescription, setEditedDescription] = useState("");
  const [editedPriority, setEditedPriority] = useState<Priority>(
    "not-urgent-not-important"
  );
  const [editedCategory, setEditedCategory] = useState("");
  const [showPriorityModal, setShowPriorityModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [editedDate, setEditedDate] = useState<Date | undefined>(undefined);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [editedTime, setEditedTime] = useState<string>("");

  const priorityOptions = [
    {
      value: "urgent-important",
      label: "Urgent & Important",
      color: "#dc3545",
    },
    { value: "not-urgent-important", label: "Important", color: "#28a745" },
    { value: "urgent-not-important", label: "Urgent", color: "#ffc107" },
    { value: "not-urgent-not-important", label: "Neither", color: "#6c757d" },
  ];

  // No category options needed for free input

  // Load task when screen is focused
  useFocusEffect(
    useCallback(() => {
      loadTask();
    }, [])
  );

  const loadTask = async () => {
    try {
      setIsLoading(true);
      // Use taskService to fetch the task by ID from the backend
      const fetchedTask = await taskService.getTaskById(taskId);

      if (fetchedTask) {
        setTask(fetchedTask);
        setEditedTitle(fetchedTask.title);
        setEditedDescription(fetchedTask.description || "");
        setEditedPriority(fetchedTask.priority);
        setEditedCategory(fetchedTask.category || "");
        setEditedTime(fetchedTask.due_time || "");
        setEditedDate(
          fetchedTask.due_datetime ? new Date(fetchedTask.due_datetime) : undefined
        );
        setCalendarDate(
          fetchedTask.due_datetime ? new Date(fetchedTask.due_datetime) : new Date()
        );
      } else {
        Alert.alert("Error", "Task not found");
        navigation.goBack();
      }
    } catch (error) {
      console.error("Error loading task:", error);
      Alert.alert("Error", "Failed to load task");
    } finally {
      setIsLoading(false);
    }
  };
  const handleEdit = () => {
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!task) return;

    try {
      // In a real app, you would update via taskService
      // await taskService.updateTask(taskId, {
      //     title: editedTitle,
      //     description: editedDescription,
      //     priority: editedPriority,
      //     subject: editedSubject
      // });

      // Update local state for demonstration
      setTask({
        ...task,
        title: editedTitle,
        description: editedDescription,
        priority: editedPriority,
        category: editedCategory,
        due_time: editedTime,
        due_date: editedDate ? editedDate.toISOString() : undefined,
        updatedAt: new Date(),
      });

      setIsEditing(false);
      Alert.alert("Success", "Task updated successfully");
    } catch (error) {
      Alert.alert("Error", "Failed to update task");
    }
  };

  const handleCancel = () => {
    if (task) {
      setEditedTitle(task.title);
      setEditedDescription(task.description || "");
      setEditedPriority(task.priority);
      setEditedCategory(task.category || "");
      setEditedTime(task.due_time || "");
      setEditedDate(task.due_datetime ? new Date(task.due_datetime) : undefined);
      setCalendarDate(task.due_datetime ? new Date(task.due_datetime) : new Date());
    }
    setIsEditing(false);
  };

  const handleMarkAsDone = async () => {
    if (!task) return;

    try {
      // In a real app, you would update via taskService
      // await taskService.markTaskComplete(taskId);

      // Update local state for demonstration
      setTask({
        ...task,
        completed: !task.completed,
        completedAt: !task.completed ? new Date() : undefined,
        updatedAt: new Date(),
      });

      Alert.alert(
        "Success",
        task.completed ? "Task marked as pending" : "Task marked as completed"
      );
    } catch (error) {
      Alert.alert("Error", "Failed to update task");
    }
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case "urgent-important":
        return "Urgent & Important";
      case "not-urgent-important":
        return "Important";
      case "urgent-not-important":
        return "Urgent";
      case "not-urgent-not-important":
        return "Neither";
      default:
        return priority;
    }
  };

  const getPriorityColor = (priority: string) => {
    switch (priority) {
      case "urgent-important":
        return "#dc3545";
      case "not-urgent-important":
        return "#28a745";
      case "urgent-not-important":
        return "#ffc107";
      case "not-urgent-not-important":
        return "#6c757d";
      default:
        return "#6c757d";
    }
  };

  const formatDate = (date?: Date) => {
    if (!date) return "No date set";
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return "Today";
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return "Tomorrow";
    } else {
      return date.toLocaleDateString("en-US", {
        weekday: "short",
        month: "short",
        day: "numeric",
      });
    }
  };
  const TimePicker = ({
    value,
    onChange,
  }: {
    value: string;
    onChange: (val: string) => void;
  }) => {
    // Parse value to hour, minute, period
    const match = value.match(/(\d+):(\d+) (AM|PM)/);
    let hour = match ? parseInt(match[1]) : 12;
    let minute = match ? match[2] : "00";
    let period = match ? match[3] : "AM";

    return (
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-around",
          marginVertical: 16,
        }}
      >
        {/* Hour Picker */}
        <ScrollView style={{ height: 100 }}>
          {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
            <TouchableOpacity
              key={h}
              onPress={() =>
                onChange(`${h.toString().padStart(2, "0")}:${minute} ${period}`)
              }
              style={{
                padding: 8,
                backgroundColor: hour === h ? "#f0e6ff" : undefined,
              }}
            >
              <Text style={{ fontSize: 18 }}>
                {h.toString().padStart(2, "0")}
              </Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
        {/* Minute Picker */}
        <ScrollView style={{ height: 100 }}>
          {Array.from({ length: 60 }, (_, i) => i).map((m) => {
            const mStr = m.toString().padStart(2, "0");
            return (
              <TouchableOpacity
                key={mStr}
                onPress={() =>
                  onChange(
                    `${hour.toString().padStart(2, "0")}:${mStr} ${period}`
                  )
                }
                style={{
                  padding: 8,
                  backgroundColor: minute === mStr ? "#f0e6ff" : undefined,
                }}
              >
                <Text style={{ fontSize: 18 }}>{mStr}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
        {/* AM/PM Picker */}
        <View>
          {["AM", "PM"].map((p) => (
            <TouchableOpacity
              key={p}
              onPress={() =>
                onChange(`${hour.toString().padStart(2, "0")}:${minute} ${p}`)
              }
              style={{
                padding: 8,
                backgroundColor: period === p ? "#f0e6ff" : undefined,
              }}
            >
              <Text style={{ fontSize: 18 }}>{p}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </View>
    );
  };

  if (!task) {
    return (
      <View style={styles.container}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading task...</Text>
        </View>
      </View>
    );
  }
  return (
    <View style={styles.container}>
      {/* Header */}
      <LinearGradient
        colors={["#A855F7", "#8B5CF6", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={24} color="#fff" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Task Details</Text>
        <View style={styles.headerActions}>
          {isEditing ? (
            <>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={handleCancel}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveButton} onPress={handleSave}>
                <Text style={styles.saveButtonText}>Save</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.editButton} onPress={handleEdit}>
              <MaterialIcons name="edit" size={20} color="#fff" />
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {/* Content */}
      <View style={styles.content}>
        {/* Task Name */}
        <View style={styles.taskNameSection}>
          <Text style={styles.taskNameLabel}>Task Name:</Text>
          {isEditing ? (
            <TextInput
              style={styles.taskNameInput}
              value={editedTitle}
              onChangeText={setEditedTitle}
              placeholder="Enter task name"
              multiline
            />
          ) : (
            <Text style={styles.taskName}>{task.title}</Text>
          )}
        </View>

        {/* Info Cards */}
        <View style={styles.infoCardsContainer}>
          {/* Date Card */}
          {isEditing ? (
            <>
              <TouchableOpacity
                style={[styles.infoCard, styles.editableCard]}
                onPress={() => setShowDatePicker(true)}
              >
                <Text style={styles.cardValue}>
                  {editedDate ? formatDate(editedDate) : "Select Date"}
                </Text>
                <MaterialIcons
                  name="edit"
                  size={14}
                  color="#6A009C"
                  style={styles.cardEditIcon}
                />
              </TouchableOpacity>
              {showDatePicker && (
                <Modal
                  visible={showDatePicker}
                  transparent={true}
                  animationType="slide"
                  onRequestClose={() => setShowDatePicker(false)}
                >
                  <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                      <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Select Date</Text>
                        <TouchableOpacity
                          onPress={() => setShowDatePicker(false)}
                          style={styles.modalCloseButton}
                        >
                          <MaterialIcons name="close" size={24} color="#666" />
                        </TouchableOpacity>
                      </View>
                      {/* Calendar Picker, similar to AddTask */}
                      <View style={styles.calendarContainer}>
                        <View style={styles.calendarHeader}>
                          <TouchableOpacity
                            style={styles.monthNavButton}
                            onPress={() => {
                              const newDate = new Date(calendarDate);
                              newDate.setMonth(newDate.getMonth() - 1);
                              setCalendarDate(newDate);
                            }}
                          >
                            <MaterialIcons
                              name="chevron-left"
                              size={20}
                              color="#495057"
                            />
                          </TouchableOpacity>
                          <Text style={styles.monthYearText}>
                            {calendarDate.toLocaleDateString("en-US", {
                              month: "long",
                              year: "numeric",
                            })}
                          </Text>
                          <TouchableOpacity
                            style={styles.monthNavButton}
                            onPress={() => {
                              const newDate = new Date(calendarDate);
                              newDate.setMonth(newDate.getMonth() + 1);
                              setCalendarDate(newDate);
                            }}
                          >
                            <MaterialIcons
                              name="chevron-right"
                              size={20}
                              color="#495057"
                            />
                          </TouchableOpacity>
                        </View>
                        <View style={styles.calendarGrid}>
                          {/* Day headers */}
                          <View style={styles.dayHeadersRow}>
                            {[
                              "Sun",
                              "Mon",
                              "Tue",
                              "Wed",
                              "Thu",
                              "Fri",
                              "Sat",
                            ].map((day) => (
                              <Text key={day} style={styles.dayHeader}>
                                {day}
                              </Text>
                            ))}
                          </View>
                          {/* Calendar days */}
                          <View style={styles.daysContainer}>
                            {Array.from({ length: 42 }, (_, index) => {
                              const firstDay = new Date(
                                calendarDate.getFullYear(),
                                calendarDate.getMonth(),
                                1
                              );
                              const startDate = new Date(firstDay);
                              startDate.setDate(
                                startDate.getDate() - firstDay.getDay()
                              );
                              const currentDate = new Date(startDate);
                              currentDate.setDate(startDate.getDate() + index);

                              const isCurrentMonth =
                                currentDate.getMonth() ===
                                calendarDate.getMonth();
                              const isToday =
                                currentDate.toDateString() ===
                                new Date().toDateString();
                              const isSelected =
                                editedDate &&
                                currentDate.toDateString() ===
                                  editedDate.toDateString();

                              return (
                                <TouchableOpacity
                                  key={index}
                                  style={[
                                    styles.calendarDay,
                                    !isCurrentMonth && styles.inactiveDay,
                                    isToday && styles.todayCalendarDay,
                                    isSelected && styles.selectedCalendarDay,
                                  ]}
                                  onPress={() => {
                                    setEditedDate(new Date(currentDate));
                                    setShowDatePicker(false);
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.calendarDayText,
                                      !isCurrentMonth && styles.inactiveDayText,
                                      isToday && styles.todayDayText,
                                      isSelected && styles.selectedDayText,
                                    ]}
                                  >
                                    {currentDate.getDate()}
                                  </Text>
                                </TouchableOpacity>
                              );
                            })}
                          </View>
                        </View>
                      </View>
                      <TouchableOpacity
                        style={[styles.saveButton, { marginTop: 16 }]}
                        onPress={() => setShowDatePicker(false)}
                      >
                        <Text style={styles.saveButtonText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>
              )}
            </>
          ) : (
            <View style={styles.infoCard}>
              <Text style={styles.cardValue}>
                {task.due_datetime
                  ? formatDate(new Date(task.due_datetime))
                  : "No date set"}
              </Text>
            </View>
          )}

          {/* Time Card */}
          {isEditing ? (
            <>
              <TouchableOpacity
                style={[styles.infoCard, styles.editableCard]}
                onPress={() => setShowTimePicker(true)}
              >
                <Text style={styles.cardValue}>
                  {editedTime || "Select Time"}
                </Text>
                <MaterialIcons
                  name="edit"
                  size={14}
                  color="#6A009C"
                  style={styles.cardEditIcon}
                />
              </TouchableOpacity>
              {showTimePicker && (
                <Modal
                  visible={showTimePicker}
                  transparent={true}
                  animationType="slide"
                  onRequestClose={() => setShowTimePicker(false)}
                >
                  <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                      <View style={styles.modalHeader}>
                        <Text style={styles.modalTitle}>Select Time</Text>
                        <TouchableOpacity
                          onPress={() => setShowTimePicker(false)}
                          style={styles.modalCloseButton}
                        >
                          <MaterialIcons name="close" size={24} color="#666" />
                        </TouchableOpacity>
                      </View>
                      {/* Simple hour/minute/AM-PM picker, similar to AddTask */}
                      <TimePicker value={editedTime} onChange={setEditedTime} />
                      <TouchableOpacity
                        style={[styles.saveButton, { marginTop: 16 }]}
                        onPress={() => setShowTimePicker(false)}
                      >
                        <Text style={styles.saveButtonText}>Done</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </Modal>
              )}
            </>
          ) : (
            <View style={styles.infoCard}>
              <Text style={styles.cardValue}>
                {task.due_time || "No time set"}
              </Text>
            </View>
          )}

          {/* Priority Card */}
          <TouchableOpacity
            style={[styles.infoCard, isEditing && styles.editableCard]}
            onPress={isEditing ? () => setShowPriorityModal(true) : undefined}
            disabled={!isEditing}
          >
            <Text
              style={[
                styles.cardValue,
                {
                  color: getPriorityColor(
                    isEditing ? editedPriority : task.priority
                  ),
                },
              ]}
            >
              \{getPriorityLabel(isEditing ? editedPriority : task.priority)}
            </Text>
            {isEditing && (
              <MaterialIcons
                name="edit"
                size={14}
                color="#6A009C"
                style={styles.cardEditIcon}
              />
            )}
          </TouchableOpacity>

          {/* Category Card */}
          <TouchableOpacity
            style={[styles.infoCard, isEditing && styles.editableCard]}
            onPress={isEditing ? () => setShowCategoryModal(true) : undefined}
            disabled={!isEditing}
          >
            <Text style={styles.cardValue}>
              {(isEditing ? editedCategory : task.category) || "No category"}
            </Text>
            {isEditing && (
              <MaterialIcons
                name="edit"
                size={14}
                color="#6A009C"
                style={styles.cardEditIcon}
              />
            )}
          </TouchableOpacity>
        </View>

        {/* Task Description */}
        <View style={styles.descriptionSection}>
          <Text style={styles.descriptionLabel}>Task Description</Text>
          {isEditing ? (
            <TextInput
              style={styles.descriptionInput}
              value={editedDescription}
              onChangeText={setEditedDescription}
              placeholder="Enter task description"
              multiline
              textAlignVertical="top"
            />
          ) : (
            <Text style={styles.description}>
              {task.description || "No description provided"}
            </Text>
          )}
        </View>
      </View>

      {/* Mark as Done Button - Fixed position in lower right */}
      <TouchableOpacity
        style={styles.markAsDoneButton}
        onPress={handleMarkAsDone}
      >
        <Text style={styles.markAsDoneButtonText}>
          {task.completed ? "Mark Pending" : "Mark as Done"}
        </Text>
      </TouchableOpacity>

      {/* Priority Selection Modal */}
      <Modal
        visible={showPriorityModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowPriorityModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Select Priority</Text>
              <TouchableOpacity
                onPress={() => setShowPriorityModal(false)}
                style={styles.modalCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <ScrollView style={styles.modalList}>
              {priorityOptions.map((option) => (
                <TouchableOpacity
                  key={option.value}
                  style={[
                    styles.modalOption,
                    editedPriority === option.value && styles.selectedOption,
                  ]}
                  onPress={() => {
                    setEditedPriority(option.value as Priority);
                    setShowPriorityModal(false);
                  }}
                >
                  <Text
                    style={[styles.modalOptionText, { color: option.color }]}
                  >
                    \{option.label}
                  </Text>
                  {editedPriority === option.value && (
                    <MaterialIcons
                      name="check"
                      size={20}
                      color={option.color}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Category Edit Modal (user input) */}
      <Modal
        visible={showCategoryModal}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCategoryModal(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Edit Category</Text>
              <TouchableOpacity
                onPress={() => setShowCategoryModal(false)}
                style={styles.modalCloseButton}
              >
                <MaterialIcons name="close" size={24} color="#666" />
              </TouchableOpacity>
            </View>
            <View style={styles.customSubjectContainer}>
              <Text style={styles.customSubjectLabel}>Category</Text>
              <TextInput
                style={styles.customSubjectInput}
                placeholder="Enter category (e.g., Work, Personal...)"
                value={editedCategory}
                onChangeText={setEditedCategory}
                onSubmitEditing={() => setShowCategoryModal(false)}
                maxLength={50}
                autoFocus
              />
            </View>
            <TouchableOpacity
              style={[styles.saveButton, { marginTop: 16 }]}
              onPress={() => setShowCategoryModal(false)}
            >
              <Text style={styles.saveButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingTop: Platform.OS === "ios" ? 50 : 40,
    paddingBottom: 16,
    borderBottomWidth: 0,
  },
  backButton: {
    padding: 8,
    borderRadius: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontFamily: "Lexend",
    color: "#fff",
    flex: 1,
    textAlign: "left",
  },
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  editButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "rgba(255,255,255,0.18)",
    borderRadius: 8,
    gap: 4,
  },
  editButtonText: {
    fontSize: 14,
    color: "#fff",
    fontFamily: "Inter-Medium",
  },
  cancelButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#dee2e6",
  },
  cancelButtonText: {
    fontSize: 14,
    color: "#6c757d",
    fontFamily: "Inter-Medium",
  },
  calendarContainer: {
    padding: 16,
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  monthNavButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#f8f9fa",
  },
  monthYearText: {
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: "#2c3e50",
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
    gap: 4,
  },
  calendarDay: {
    width: "13.2%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 8,
  },
  inactiveDay: {
    opacity: 0.3,
  },
  todayCalendarDay: {
    backgroundColor: "#AD00FF",
  },
  selectedCalendarDay: {
    backgroundColor: "#6A009C",
  },
  calendarDayText: {
    fontSize: 14,
    color: "#495057",
    fontFamily: "Inter-Medium",
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
  saveButton: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: "#6A009C",
    borderRadius: 8,
  },
  saveButtonText: {
    fontSize: 14,
    color: "#fff",
    fontFamily: "Inter-Medium",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    fontSize: 16,
    color: "#6c757d",
    fontFamily: "Inter-Medium",
  },
  content: {
    flex: 1,
    padding: 20,
  },
  taskNameSection: {
    marginBottom: 24,
  },
  taskNameLabel: {
    fontSize: 16,
    color: "#6c757d",
    fontFamily: "Inter-Medium",
    marginBottom: 8,
  },
  taskName: {
    fontSize: 24,
    color: "#2c3e50",
    fontFamily: "Inter-Bold",
    lineHeight: 30,
  },
  taskNameInput: {
    fontSize: 24,
    color: "#2c3e50",
    fontFamily: "Inter-Bold",
    lineHeight: 30,
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#6A009C",
    minHeight: 60,
  },
  infoCardsContainer: {
    flexDirection: "row",
    justifyContent: "flex-start",
    gap: 8,
    marginBottom: 24,
    flexWrap: "wrap",
  },
  infoCard: {
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#fff",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    alignSelf: "flex-start",
  },
  cardContent: {
    flex: 1,
  },
  cardValue: {
    fontSize: 13,
    color: "#2c3e50",
    fontFamily: "Inter-Medium",
    textAlign: "center",
  },
  descriptionSection: {
    flex: 1,
  },
  descriptionLabel: {
    fontSize: 16,
    color: "#6c757d",
    fontFamily: "Inter-Medium",
    marginBottom: 12,
  },
  description: {
    fontSize: 16,
    color: "#2c3e50",
    fontFamily: "Inter-Regular",
    lineHeight: 24,
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e9ecef",
    minHeight: 120,
  },
  descriptionInput: {
    fontSize: 16,
    color: "#2c3e50",
    fontFamily: "Inter-Regular",
    lineHeight: 24,
    backgroundColor: "#fff",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#6A009C",
    minHeight: 120,
  },
  markAsDoneButton: {
    position: "absolute",
    bottom: 30,
    right: 20,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#6A009C",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 5,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
    gap: 8,
  },
  markAsDoneButtonText: {
    fontSize: 14,
    color: "#fff",
    fontFamily: "Inter-Medium",
  },
  editableCard: {
    borderColor: "#6A009C",
    borderWidth: 1,
  },
  cardEditIcon: {
    marginLeft: 4,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 20,
    width: "80%",
    maxHeight: "70%",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter-Bold",
    color: "#2c3e50",
  },
  modalCloseButton: {
    padding: 4,
  },
  modalList: {
    maxHeight: 300,
  },
  modalOption: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: "#f8f9fa",
  },
  selectedOption: {
    backgroundColor: "#e8f4fd",
    borderColor: "#6A009C",
    borderWidth: 1,
  },
  modalOptionText: {
    fontSize: 16,
    color: "#2c3e50",
    fontFamily: "Inter-Medium",
  },
  customSubjectContainer: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: "#e9ecef",
  },
  customSubjectLabel: {
    fontSize: 14,
    color: "#6c757d",
    fontFamily: "Inter-Medium",
    marginBottom: 8,
  },
  customSubjectInput: {
    backgroundColor: "#fff",
    borderWidth: 1,
    borderColor: "#6A009C",
    borderRadius: 8,
    padding: 12,
    fontSize: 16,
    color: "#2c3e50",
    fontFamily: "Inter-Regular",
  },
});

export default TaskDetails;
