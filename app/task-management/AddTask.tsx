import React, { useState, useEffect } from "react";
import { Ionicons } from "@expo/vector-icons";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  SafeAreaView,
  Alert,
  Platform,
  Modal,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { Priority, TaskFormData, TaskStatus, TaskCategory } from "./types/Task";
import { taskService } from "./services/taskService";
import { categoryService } from "./services/categoryService";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProp = { params?: { quadrant?: Priority } };

const priorities: {
  label: string;
  value: Priority;
  color: string;
  description: string;
}[] = [
  {
    label: "Urgent & Important",
    value: "urgent-important",
    color: "#e74c3c",
    description: "Do First - Critical tasks",
  },
  {
    label: "Important, Not Urgent",
    value: "not-urgent-important",
    color: "#1abc9c",
    description: "Schedule - Plan for these",
  },
  {
    label: "Urgent, Not Important",
    value: "urgent-not-important",
    color: "#f39c12",
    description: "Delegate - Can be delegated",
  },
  {
    label: "Neither Urgent nor Important",
    value: "not-urgent-not-important",
    color: "#27ae60",
    description: "Eliminate - Consider removing",
  },
];

const statusOptions: { label: string; value: TaskStatus; color: string }[] = [
  { label: "To Do", value: "todo", color: "#6c757d" },
  { label: "In Progress", value: "in-progress", color: "#fd7e14" },
  { label: "Completed", value: "completed", color: "#198754" },
  { label: "On Hold", value: "on-hold", color: "#dc3545" },
];

const categoryColors = [
  "#3498db",
  "#e74c3c",
  "#2ecc71",
  "#f39c12",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#34495e",
  "#f1c40f",
  "#e91e63",
];

const AddTask: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute() as RouteProp;

  const [formData, setFormData] = useState<TaskFormData>({
    title: "",
    description: "",
    category: undefined,
    priority: route.params?.quadrant || "not-urgent-not-important",
    status: "todo",
    dueDate: undefined,
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [showStatusPicker, setShowStatusPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [showCreateCategory, setShowCreateCategory] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [newCategoryName, setNewCategoryName] = useState("");
  const [selectedCategoryColor, setSelectedCategoryColor] = useState(
    categoryColors[0]
  );

  // Load categories on component mount
  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    try {
      const loadedCategories = await categoryService.getCategories();
      setCategories(loadedCategories);
    } catch (error) {
      console.error("Error loading categories:", error);
    }
  };

  const handleInputChange = (field: keyof TaskFormData, value: any) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const validateForm = (): boolean => {
    if (!formData.title.trim()) {
      Alert.alert("Error", "Please enter a task title");
      return false;
    }
    return true;
  };

  const handleCreateCategory = async () => {
    if (!newCategoryName.trim()) {
      Alert.alert("Error", "Please enter a category name");
      return;
    }

    try {
      const newCategory = await categoryService.createCategory(
        newCategoryName.trim(),
        selectedCategoryColor
      );
      setCategories((prev) => [...prev, newCategory]);
      setFormData((prev) => ({ ...prev, category: newCategory }));
      setNewCategoryName("");
      setSelectedCategoryColor(categoryColors[0]);
      setShowCreateCategory(false);
      setShowCategoryPicker(false);
      Alert.alert("Success", "Category created successfully!");
    } catch (error) {
      console.error("Error creating category:", error);
      Alert.alert("Error", "Failed to create category");
    }
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      await taskService.createTask(formData);
      Alert.alert("Success", "Task created successfully!", [
        { text: "OK", onPress: () => navigation.goBack() },
      ]);
    } catch (error) {
      console.error("Error creating task:", error);
      Alert.alert("Error", "Failed to create task");
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    Alert.alert("Reset Form", "Are you sure you want to reset all fields?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Reset",
        style: "destructive",
        onPress: () =>
          setFormData({
            title: "",
            description: "",
            category: undefined,
            priority: "not-urgent-not-important",
            status: "todo",
            dueDate: undefined,
          }),
      },
    ]);
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
        >
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Create Task</Text>
        <View style={styles.placeholder} />
      </View>

      <TouchableOpacity
        activeOpacity={1}
        style={{ flex: 1 }}
        onPress={() => {
          setShowPriorityPicker(false);
          setShowDatePicker(false);
          setShowStatusPicker(false);
          setShowCategoryPicker(false);
        }}
      >
        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          {/* Task Title */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Task Name</Text>
            <TextInput
              style={styles.textInput}
              placeholder="Enter task name..."
              value={formData.title}
              placeholderTextColor={"#7f8c8d"}
              onChangeText={(text) => handleInputChange("title", text)}
              maxLength={100}
            />
          </View>

          {/* Grid Layout for Category, Status, Due Date, and Priority */}
          <View style={styles.gridContainer}>
            {/* First Row */}
            <View style={styles.gridRow}>
              {/* Due Date */}
              <View style={styles.gridItem}>
                <Text style={styles.gridLabel}>Due Date (Optional)</Text>
                <TouchableOpacity
                  style={styles.gridDropdownButton}
                  onPress={() => {
                    setShowPriorityPicker(false);
                    setShowStatusPicker(false);
                    setShowCategoryPicker(false);
                    setShowDatePicker(!showDatePicker);
                  }}
                >
                  <Text style={styles.gridDropdownText} numberOfLines={1}>
                    {formData.dueDate
                      ? formData.dueDate.toLocaleDateString()
                      : "Select Date"}
                  </Text>
                  <MaterialIcons
                    name="calendar-today"
                    size={18}
                    color="#6c757d"
                  />
                </TouchableOpacity>

                {/* Date Picker */}
                {showDatePicker && (
                  <View
                    style={[styles.dropdownOptions, styles.calendarDropdown]}
                  >
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
                          {(() => {
                            const year = calendarDate.getFullYear();
                            const month = calendarDate.getMonth();
                            const firstDay = new Date(year, month, 1);
                            const startDate = new Date(firstDay);
                            startDate.setDate(
                              startDate.getDate() - firstDay.getDay()
                            );

                            const days = [];
                            for (let i = 0; i < 42; i++) {
                              const currentDate = new Date(startDate);
                              currentDate.setDate(startDate.getDate() + i);

                              const isCurrentMonth =
                                currentDate.getMonth() === month;
                              const isToday =
                                currentDate.toDateString() ===
                                new Date().toDateString();
                              const isSelected =
                                formData.dueDate &&
                                currentDate.toDateString() ===
                                  formData.dueDate.toDateString();

                              days.push(
                                <TouchableOpacity
                                  key={i}
                                  style={[
                                    styles.calendarDay,
                                    !isCurrentMonth && styles.inactiveDay,
                                    isToday && styles.todayCalendarDay,
                                    isSelected && styles.selectedCalendarDay,
                                  ]}
                                  onPress={() => {
                                    handleInputChange("dueDate", currentDate);
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
                            }
                            return days;
                          })()}
                        </View>
                      </View>
                    </View>
                  </View>
                )}
              </View>

              {/* Status */}
              <View style={styles.gridItem}>
                <Text style={styles.gridLabel}>Status</Text>
                <TouchableOpacity
                  style={styles.gridDropdownButton}
                  onPress={() => {
                    setShowPriorityPicker(false);
                    setShowDatePicker(false);
                    setShowCategoryPicker(false);
                    setShowStatusPicker(!showStatusPicker);
                  }}
                >
                  <View style={styles.statusDisplay}>
                    <View
                      style={[
                        styles.statusIndicator,
                        {
                          backgroundColor:
                            statusOptions.find(
                              (s) => s.value === formData.status
                            )?.color || "#6c757d",
                        },
                      ]}
                    />
                    <Text style={styles.gridDropdownText} numberOfLines={1}>
                      {statusOptions.find((s) => s.value === formData.status)
                        ?.label || "To Do"}
                    </Text>
                  </View>
                  <MaterialIcons
                    name="keyboard-arrow-down"
                    size={20}
                    color="#6c757d"
                  />
                </TouchableOpacity>

                {showStatusPicker && (
                  <View style={styles.dropdownOptions}>
                    {statusOptions.map((status) => (
                      <TouchableOpacity
                        key={status.value}
                        style={[
                          styles.dropdownOption,
                          formData.status === status.value &&
                            styles.selectedDropdownOption,
                        ]}
                        onPress={() => {
                          setFormData((prev) => ({
                            ...prev,
                            status: status.value,
                          }));
                          setShowStatusPicker(false);
                        }}
                      >
                        <View style={styles.statusDisplay}>
                          <View
                            style={[
                              styles.statusIndicator,
                              { backgroundColor: status.color },
                            ]}
                          />
                          <Text
                            style={[
                              styles.dropdownText,
                              formData.status === status.value &&
                                styles.selectedOptionText,
                            ]}
                          >
                            {status.label}
                          </Text>
                        </View>
                        {formData.status === status.value && (
                          <MaterialIcons
                            name="check"
                            size={20}
                            color="#AD00FF"
                          />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>

            {/* Second Row */}
            <View style={styles.gridRow}>
              {/* Category */}
              <View style={styles.gridItem}>
                <Text style={styles.gridLabel}>Category (Optional)</Text>
                <TouchableOpacity
                  style={styles.gridDropdownButton}
                  onPress={() => {
                    setShowPriorityPicker(false);
                    setShowDatePicker(false);
                    setShowStatusPicker(false);
                    setShowCategoryPicker(!showCategoryPicker);
                  }}
                >
                  {formData.category ? (
                    <View style={styles.categoryDisplay}>
                      <View
                        style={[
                          styles.categoryColor,
                          { backgroundColor: formData.category.color },
                        ]}
                      />
                      <Text style={styles.gridDropdownText} numberOfLines={1}>
                        {formData.category.name}
                      </Text>
                    </View>
                  ) : (
                    <Text style={styles.gridDropdownText}>Select</Text>
                  )}
                  <MaterialIcons
                    name="keyboard-arrow-down"
                    size={20}
                    color="#6c757d"
                  />
                </TouchableOpacity>

                {showCategoryPicker && (
                  <View style={styles.dropdownOptions}>
                    <ScrollView style={{ maxHeight: 200 }}>
                      <TouchableOpacity
                        style={styles.dropdownOption}
                        onPress={() => {
                          setFormData((prev) => ({
                            ...prev,
                            category: undefined,
                          }));
                          setShowCategoryPicker(false);
                        }}
                      >
                        <Text style={styles.dropdownText}>No Category</Text>
                      </TouchableOpacity>

                      {categories.map((category) => (
                        <TouchableOpacity
                          key={category.id}
                          style={[
                            styles.dropdownOption,
                            formData.category?.id === category.id &&
                              styles.selectedDropdownOption,
                          ]}
                          onPress={() => {
                            setFormData((prev) => ({ ...prev, category }));
                            setShowCategoryPicker(false);
                          }}
                        >
                          <View style={styles.categoryDisplay}>
                            <View
                              style={[
                                styles.categoryColor,
                                { backgroundColor: category.color },
                              ]}
                            />
                            <Text
                              style={[
                                styles.dropdownText,
                                formData.category?.id === category.id &&
                                  styles.selectedOptionText,
                              ]}
                            >
                              {category.name}
                            </Text>
                          </View>
                          {formData.category?.id === category.id && (
                            <MaterialIcons
                              name="check"
                              size={20}
                              color="#AD00FF"
                            />
                          )}
                        </TouchableOpacity>
                      ))}

                      <TouchableOpacity
                        style={[
                          styles.dropdownOption,
                          styles.createCategoryOption,
                        ]}
                        onPress={() => {
                          setShowCategoryPicker(false);
                          setShowCreateCategory(true);
                        }}
                      >
                        <MaterialIcons name="add" size={20} color="#AD00FF" />
                        <Text
                          style={[
                            styles.dropdownText,
                            { color: "#AD00FF", marginLeft: 8 },
                          ]}
                        >
                          Create New Category
                        </Text>
                      </TouchableOpacity>
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Priority */}
              <View style={styles.gridItem}>
                <Text style={styles.gridLabel}>Priority</Text>
                <TouchableOpacity
                  style={styles.gridDropdownButton}
                  onPress={() => {
                    setShowDatePicker(false);
                    setShowStatusPicker(false);
                    setShowCategoryPicker(false);
                    setShowPriorityPicker(!showPriorityPicker);
                  }}
                >
                  <View style={styles.priorityIndicator}>
                    <View
                      style={[
                        styles.priorityColor,
                        {
                          backgroundColor:
                            priorities.find(
                              (p) => p.value === formData.priority
                            )?.color || "#27ae60",
                        },
                      ]}
                    />
                    <Text style={styles.gridDropdownText} numberOfLines={1}>
                      {priorities
                        .find((p) => p.value === formData.priority)
                        ?.label?.replace(" & ", " ") || "Neither"}
                    </Text>
                  </View>
                  <MaterialIcons
                    name="keyboard-arrow-down"
                    size={20}
                    color="#6c757d"
                  />
                </TouchableOpacity>

                {showPriorityPicker && (
                  <View style={styles.dropdownOptions}>
                    {priorities.map((priority) => (
                      <TouchableOpacity
                        key={priority.value}
                        style={[
                          styles.dropdownOption,
                          formData.priority === priority.value &&
                            styles.selectedDropdownOption,
                        ]}
                        onPress={() => {
                          setFormData((prev) => ({
                            ...prev,
                            priority: priority.value,
                          }));
                          setShowPriorityPicker(false);
                        }}
                      >
                        <View style={styles.priorityOptionContent}>
                          <View style={styles.priorityIndicator}>
                            <View
                              style={[
                                styles.priorityColor,
                                { backgroundColor: priority.color },
                              ]}
                            />
                            <Text
                              style={[
                                styles.priorityOptionLabel,
                                formData.priority === priority.value &&
                                  styles.selectedOptionText,
                              ]}
                            >
                              {priority.label}
                            </Text>
                          </View>
                          <Text
                            style={[
                              styles.priorityOptionDescription,
                              formData.priority === priority.value &&
                                styles.selectedOptionDescription,
                            ]}
                          >
                            {priority.description}
                          </Text>
                        </View>
                        {formData.priority === priority.value && (
                          <MaterialIcons
                            name="check"
                            size={20}
                            color="#AD00FF"
                          />
                        )}
                      </TouchableOpacity>
                    ))}
                  </View>
                )}
              </View>
            </View>
          </View>

          {/* Description */}
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Description (Optional)</Text>
            <TextInput
              style={[styles.textInput, styles.textArea]}
              placeholder="Enter task description..."
              value={formData.description}
              placeholderTextColor={"#7f8c8d"}
              onChangeText={(text) => handleInputChange("description", text)}
              multiline
              textAlignVertical="top"
            />
          </View>

          {/* Action Buttons */}
          <View style={styles.buttonContainer}>
            <TouchableOpacity style={styles.resetButton} onPress={handleReset}>
              <MaterialIcons name="refresh" size={20} color="#e74c3c" />
              <Text style={styles.resetButtonText}>Reset</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.saveButton, isLoading && styles.disabledButton]}
              onPress={handleSave}
              disabled={isLoading}
            >
              <MaterialIcons name="save" size={20} color="#fff" />
              <Text style={styles.saveButtonText}>
                {isLoading ? "Saving..." : "Save Task"}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </TouchableOpacity>

      {/* Create Category Modal */}
      <Modal
        visible={showCreateCategory}
        transparent={true}
        animationType="slide"
        onRequestClose={() => setShowCreateCategory(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Create New Category</Text>
              <TouchableOpacity
                style={styles.modalCloseButton}
                onPress={() => setShowCreateCategory(false)}
              >
                <MaterialIcons name="close" size={24} color="#6c757d" />
              </TouchableOpacity>
            </View>

            <View>
              <Text style={styles.label}>Category Name</Text>
              <TextInput
                style={styles.textInput}
                placeholder="Enter category name..."
                value={newCategoryName}
                onChangeText={setNewCategoryName}
                maxLength={50}
              />

              <Text style={[styles.label, { marginTop: 16 }]}>
                Choose Color
              </Text>
              <View style={styles.colorGrid}>
                {categoryColors.map((color, index) => (
                  <TouchableOpacity
                    key={index}
                    style={[
                      styles.colorOption,
                      { backgroundColor: color },
                      selectedCategoryColor === color &&
                        styles.selectedColorOption,
                    ]}
                    onPress={() => setSelectedCategoryColor(color)}
                  />
                ))}
              </View>

              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={styles.modalCancelButton}
                  onPress={() => setShowCreateCategory(false)}
                >
                  <Text style={styles.modalCancelText}>Cancel</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.modalCreateButton}
                  onPress={handleCreateCategory}
                >
                  <Text style={styles.modalCreateText}>Create</Text>
                </TouchableOpacity>
              </View>
            </View>
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
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: "#e9ecef",
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: "center",
    alignItems: "center",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#2c3e50",
    fontFamily: "Inter-Bold",
  },
  placeholder: {
    width: 40,
  },
  content: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  inputGroup: {
    marginBottom: 24,
    position: "relative",
  },
  label: {
    fontSize: 16,
    color: "#2c3e50",
    marginBottom: 8,
    fontFamily: "Inter-Bold",
  },
  textInput: {
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    color: "#2c3e50",
    borderWidth: 1,
    borderColor: "#e9ecef",
    fontFamily: "Inter-Regular",
  },
  textArea: {
    height: 100,
  },
  gridContainer: {
    marginBottom: 24,
  },
  gridRow: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 16,
  },
  gridItem: {
    flex: 1,
    position: "relative",
  },
  gridLabel: {
    fontSize: 14,
    color: "#2c3e50",
    marginBottom: 6,
    fontFamily: "Inter-SemiBold",
  },
  gridDropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: "#e9ecef",
    minHeight: 44,
  },
  gridDropdownText: {
    flex: 1,
    fontSize: 12,
    color: "#2c3e50",
    fontFamily: "Inter-Regular",
  },
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  dropdownText: {
    flex: 1,
    fontSize: 14,
    color: "#2c3e50",
    fontFamily: "Inter-Regular",
  },
  dropdownOptions: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#fff",
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#e9ecef",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
    marginTop: 4,
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: "#f8f9fa",
  },
  selectedDropdownOption: {
    backgroundColor: "#f0e6ff",
  },
  selectedOptionText: {
    color: "#AD00FF",
  },
  categoryDisplay: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  categoryColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  createCategoryOption: {
    borderBottomWidth: 0,
  },
  statusDisplay: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  priorityIndicator: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  priorityColor: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 8,
  },
  priorityOptionContent: {
    flex: 1,
  },
  priorityOptionLabel: {
    fontSize: 14,
    fontWeight: "500",
    color: "#2c3e50",
    fontFamily: "Inter-Medium",
  },
  priorityOptionDescription: {
    fontSize: 12,
    color: "#7f8c8d",
    marginTop: 2,
    fontFamily: "Inter-Regular",
  },
  selectedOptionDescription: {
    color: "#8A2BE2",
  },
  calendarDropdown: {
    maxHeight: 400,
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
  buttonContainer: {
    flexDirection: "row",
    gap: 12,
    marginBottom: 30,
  },
  resetButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#fff",
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: "#e74c3c",
  },
  resetButtonText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#e74c3c",
    fontFamily: "Inter-Medium",
  },
  saveButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#AD00FF",
    borderRadius: 12,
    padding: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  disabledButton: {
    opacity: 0.6,
  },
  saveButtonText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#fff",
    fontFamily: "Inter-Bold",
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0, 0, 0, 0.5)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalContent: {
    backgroundColor: "#fff",
    borderRadius: 16,
    padding: 24,
    width: "85%",
    maxHeight: "80%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter-Bold",
    color: "#2c3e50",
  },
  modalCloseButton: {
    padding: 4,
  },
  colorGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 8,
  },
  colorOption: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: "transparent",
  },
  selectedColorOption: {
    borderColor: "#AD00FF",
    transform: [{ scale: 1.1 }],
  },
  modalButtons: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  modalCancelButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: "#f8f9fa",
    borderRadius: 8,
    alignItems: "center",
  },
  modalCancelText: {
    color: "#6c757d",
    fontFamily: "Inter-Medium",
  },
  modalCreateButton: {
    flex: 1,
    paddingVertical: 12,
    backgroundColor: "#AD00FF",
    borderRadius: 8,
    alignItems: "center",
  },
  modalCreateText: {
    color: "#fff",
    fontFamily: "Inter-Medium",
  },
});

export default AddTask;
