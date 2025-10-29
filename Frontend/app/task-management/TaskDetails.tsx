import React, { useState, useCallback } from "react";
import { Ionicons } from "@expo/vector-icons";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { Priority, TaskFormData } from "./types/Task";
import taskService from "./services/taskService";
import { showSuccessToast, showErrorToast } from "../utils/ToastUtils";
import {
  SafeAreaView,
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
import DateTimePicker from '@react-native-community/datetimepicker';
import {
  useNavigation,
  useRoute,
  useFocusEffect,
} from "@react-navigation/native";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const TaskDetails: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute();
  const { taskId } = route.params as { taskId: string };

  const [task, setTask] = useState<TaskFormData | null>(null);
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
        // If the task is already completed, ensure editing is turned off
        if (fetchedTask.completed) setIsEditing(false);
        setTask({
          ...fetchedTask,
          due_datetime: fetchedTask.due_datetime
            ? new Date(fetchedTask.due_datetime)
            : undefined,
          completed_at: fetchedTask.completed_at
            ? new Date(fetchedTask.completed_at)
            : undefined,
          created_at: fetchedTask.created_at
            ? new Date(fetchedTask.created_at)
            : undefined,
          updated_at: fetchedTask.updated_at
            ? new Date(fetchedTask.updated_at)
            : undefined,
        });
        setEditedTitle(fetchedTask.title);
        setEditedDescription(fetchedTask.description || "");
        setEditedPriority(fetchedTask.priority ?? "not-urgent-not-important");
        setEditedCategory(fetchedTask.category || "");
        // Prefer explicit due_time (string) if backend provides it, otherwise derive from due_datetime
        setEditedTime(
          fetchedTask.due_time ||
            (fetchedTask.due_datetime
              ? formatTime(new Date(fetchedTask.due_datetime))
              : "")
        );
        setEditedDate(
          fetchedTask.due_datetime
            ? new Date(fetchedTask.due_datetime)
            : undefined
        );
      } else {
        showErrorToast("Task not found");
        navigation.goBack();
      }
    } catch (error) {
      showErrorToast("Failed to load task");
    } finally {
      setIsLoading(false);
    }
  };
  const handleEdit = () => {
    setIsEditing(true);
  };

  const formatTime = (datetime?: Date) => {
    if (!datetime) return "No time set";

    // Use LOCAL time for display (store in UTC on the backend only)
    const hours = datetime.getHours();
    const minutes = datetime.getMinutes();

    const formattedMinutes = minutes.toString().padStart(2, "0");

    const ampm = hours >= 12 ? "PM" : "AM";
    const hours12 = hours % 12 || 12;
    return `${hours12}:${formattedMinutes} ${ampm}`;
  };

  // Helper function to check if selected date is today
  const isSelectedDateToday = () => {
    if (!editedDate) return false;
    const today = new Date();
    const selected = new Date(editedDate);
    return selected.toDateString() === today.toDateString();
  };

  const handleSave = async () => {
    if (!task) return;
    // Do not allow saving if task is completed
    if (task.completed) return;

    try {
      let mergedDueDatetime = editedDate;
      if (editedDate && editedTime) {
        mergedDueDatetime = mergeDateAndTime(editedDate, editedTime);
      }

      const updatedTask: Partial<TaskFormData> = {
        title: editedTitle,
        description: editedDescription,
        priority: editedPriority || null,
        category: editedCategory || null,
        due_time: editedTime || null,
        due_datetime: mergedDueDatetime,
        updated_at: new Date(),
      };

      // Call the API to update the task
      await taskService.updateTask(taskId, updatedTask);

      // Update local state with all required Task properties
      setTask({
        ...task,
        title: editedTitle,
        description: editedDescription,
        priority: editedPriority,
        category: editedCategory,
        due_time: editedTime,
        due_datetime: mergedDueDatetime,
        updated_at: new Date(),
      });

      setIsEditing(false);
      showSuccessToast("Task updated successfully!");
    } catch (error) {
      showErrorToast("Failed to update task");
    }
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      setEditedDate(selectedDate);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime && editedDate) {
      // Merge selected time into the selected date using local time to prevent date shifts
      const base = new Date(editedDate);
      const merged = new Date(
        base.getFullYear(),
        base.getMonth(),
        base.getDate(),
        selectedTime.getHours(),
        selectedTime.getMinutes(),
        0,
        0
      );

      // Check if the selected date is today and the merged time is in the past
      if (isSelectedDateToday() && merged < new Date()) {
        showErrorToast("Cannot select a time in the past for today");
        return;
      }

      setEditedDate(merged);
      
      // Update due_time for display purposes
      const timeString = selectedTime.toLocaleTimeString('en-US', {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      setEditedTime(timeString);
    }
  };

  const handleCancel = () => {
    if (task) {
      setEditedTitle(task.title);
      setEditedDescription(task.description || "");
      setEditedPriority(task.priority ?? "not-urgent-not-important");
      setEditedCategory(task.category || "");
      setEditedTime(task.due_time || "");
      setEditedDate(
        task.due_datetime ? new Date(task.due_datetime) : undefined
      );
    }
    setShowDatePicker(false);
    setShowTimePicker(false);
    setShowPriorityModal(false);
    setShowCategoryModal(false);
    setIsEditing(false);
  };

  const handleMarkAsDone = async () => {
    if (!task) return;

    try {
      const updatedTask = {
        completed: !task.completed,
        updated_at: new Date(),
        completed_at: !task.completed ? new Date() : undefined,
      };

      // Call the API to update the task
      await taskService.updateTask(taskId, updatedTask);

      // Update local state
      setTask({
        ...task,
        ...updatedTask,
        updated_at: updatedTask.updated_at
          ? new Date(updatedTask.updated_at)
          : undefined,
        completed_at: updatedTask.completed_at
          ? new Date(updatedTask.completed_at)
          : undefined,
      });

      // If the task is now completed, disable editing and show lock overlay
      if (updatedTask.completed) {
        setIsEditing(false);
      }

      showSuccessToast(
        task.completed ? "Task marked as pending" : "Task marked as completed"
      );

      // Optionally force a refresh when navigating back so matrix/list syncs immediately
      // navigation.goBack();
    } catch (error) {
      showErrorToast("Failed to update task");
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

  const mergeDateAndTime = (date: Date, time: string): Date => {
    if (!date || !time) return date;
    // time format: "hh:mm AM/PM"
    const match = time.match(/(\d+):(\d+)\s?(AM|PM)/i);
    if (!match) return date;
    let hour = parseInt(match[1], 10);
    const minute = parseInt(match[2], 10);
    const period = match[3].toUpperCase();

    if (period === "PM" && hour < 12) hour += 12;
    if (period === "AM" && hour === 12) hour = 0;

    // Merge using LOCAL date components to preserve the user's wall-clock time
    const merged = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate(),
      hour,
      minute,
      0,
      0
    );
    return merged;
  };

  const formatDate = (date?: Date) => {
    if (!date) return "No date set";

    // Use LOCAL date parts for display
    const year = date.getFullYear();
    const monthIndex = date.getMonth();
    const dayNum = date.getDate().toString().padStart(2, "0");

    const monthNames = [
      "January",
      "February",
      "March",
      "April",
      "May",
      "June",
      "July",
      "August",
      "September",
      "October",
      "November",
      "December",
    ];
    const dayNames = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    return `${dayNames[date.getDay()]}, ${monthNames[monthIndex]} ${dayNum}, ${year}`;
  };

  if (!task) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <Text style={styles.loadingText}>Loading task...</Text>
        </View>
      </SafeAreaView>
    );
  }
  return (
    <SafeAreaView style={styles.safeArea}>
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
            <TouchableOpacity
              style={[styles.editButton, task.completed && styles.disabledButton]}
              onPress={() => { if (!task.completed) handleEdit(); }}
              disabled={task.completed}
            >
              <MaterialIcons name="edit" size={20} color="#fff" />
              <Text style={styles.editButtonText}>Edit</Text>
            </TouchableOpacity>
          )}
        </View>
      </LinearGradient>

      {/* Content */}
      <View style={styles.contentWrapper}>
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
              editable={!task.completed}
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
                onPress={() => !task.completed && setShowDatePicker(true)}
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
                <DateTimePicker
                  value={editedDate || new Date()}
                  mode="date"
                  display={Platform.OS === 'ios' ? 'spinner' : 'default'}
                  onChange={handleDateChange}
                  minimumDate={new Date()}
                />
              )}
            </>
          ) : (
            <View style={styles.infoCard}>
              <Text style={styles.cardValue}>
                {task.due_datetime
                  ? formatDate(task.due_datetime)
                  : "No date set"}
              </Text>
            </View>
          )}

          {/* Time Card */}
          {isEditing ? (
            <>
              <TouchableOpacity
                style={[styles.infoCard, styles.editableCard]}
                onPress={() => !task.completed && setShowTimePicker(true)}
              >
                <Text style={styles.cardValue}>
                  {editedTime
                    ? editedTime
                    : editedDate
                    ? formatTime(editedDate)
                    : task.due_datetime
                    ? formatTime(task.due_datetime)
                    : "Select Time"}
                </Text>
                <MaterialIcons
                  name="edit"
                  size={14}
                  color="#6A009C"
                  style={styles.cardEditIcon}
                />
              </TouchableOpacity>
              {showTimePicker && editedDate && (
                <DateTimePicker
                  value={editedDate}
                  mode="time"
                  display="spinner"
                  onChange={handleTimeChange}
                  minimumDate={isSelectedDateToday() ? new Date() : undefined}
                />
              )}
            </>
          ) : (
            <View style={styles.infoCard}>
              <Text style={styles.cardValue}>
                {task.due_datetime
                  ? formatTime(task.due_datetime)
                  : "No time set"}
              </Text>
            </View>
          )}

          {/* Priority Card */}
          <TouchableOpacity
            style={[styles.infoCard, isEditing && styles.editableCard]}
            onPress={isEditing && !task.completed ? () => setShowPriorityModal(true) : undefined}
            disabled={!isEditing || task.completed}
          >
            <Text
              style={[
                styles.cardValue,
                {
                  color: getPriorityColor(
                    isEditing
                      ? editedPriority
                      : task.priority ?? "not-urgent-not-important"
                  ),
                },
              ]}
            >
              {getPriorityLabel(
                isEditing
                  ? editedPriority
                  : task.priority ?? "not-urgent-not-important"
              )}
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
            onPress={isEditing && !task.completed ? () => setShowCategoryModal(true) : undefined}
            disabled={!isEditing || task.completed}
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
              editable={!task.completed}
            />
          ) : (
            <Text style={styles.description}>
              {task.description || "No description provided"}
            </Text>
          )}
        </View>
        {/* Overlay to block interaction when task is completed */}
        {task.completed && (
          <View style={styles.lockOverlay} pointerEvents="auto">
            <Text style={styles.lockMessage}>This task is completed — editing disabled.</Text>
          </View>
        )}
      </View>
        </View>

      {/* Mark as Done Button - Fixed position in lower right */}
      {!isEditing && (
        <TouchableOpacity
          style={styles.markAsDoneButton}
          onPress={handleMarkAsDone}
        >
          <Text style={styles.markAsDoneButtonText}>
            {task.completed ? "Mark Pending" : "Mark as Done"}
          </Text>
        </TouchableOpacity>
      )}

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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  safeArea: {
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
    bottom: 70,
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
    zIndex: 3,
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
  /* Overlay and wrapper when task is completed */
  contentWrapper: {
    position: "relative",
    flex: 1,
  },
  lockOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: "rgba(255,255,255,0.75)",
    justifyContent: "center",
    alignItems: "center",
    zIndex: 2,
    padding: 20,
  },
  lockMessage: {
    fontSize: 16,
    color: "#6c757d",
    textAlign: "center",
  },
  disabledButton: {
    opacity: 0.5,
  },
});

export default TaskDetails;
