import React, { useState } from "react";
import { Ionicons } from "@expo/vector-icons";
import { LinearGradient } from "expo-linear-gradient";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
  Dimensions,
} from "react-native";
import { MaterialIcons } from "@expo/vector-icons";
import { useNavigation, useRoute } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { RootStackParamList } from "../navigation/AppNavigator";
import { Priority, TaskFormData, TaskCategory } from "./types/Task";
import taskService from "./services/taskService";
import { categoryService } from "./services/categoryService";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { showSuccessToast, showErrorToast } from "../utils/ToastUtils";

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProp = { params?: { quadrant?: Priority; user?: string } };

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

const AddTask: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute() as RouteProp;

  const [formData, setFormData] = useState<TaskFormData>({
    title: "",
    description: "",
    category: "",
    priority: route.params?.quadrant || "not-urgent-not-important",
    due_datetime: undefined,
    due_time: undefined,
    completed: false,
    completed_at: new Date(),
    created_at: new Date(),
    updated_at: new Date(),
    user: route.params?.user || "default_user",
  });

  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [showCategoryPicker, setShowCategoryPicker] = useState(false);
  const [categories, setCategories] = useState<TaskCategory[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [screenData, setScreenData] = useState(Dimensions.get('window'));

  // Check if device is in landscape mode
  const isLandscape = screenData.width > screenData.height;
  
  // Calculate adaptive dropdown height based on screen size
  const getDropdownMaxHeight = () => {
    if (isLandscape) {
      return Math.min(180, screenData.height * 0.25); // 25% of screen height in landscape
    }
    return Math.min(250, screenData.height * 0.35); // 35% of screen height in portrait
  };

  // Check if dropdown should appear above the button (when near bottom of screen)
  const shouldDropdownAppearAbove = () => {
    // This is a simple heuristic - in a real app you might measure the actual position
    return isLandscape && screenData.height < 500;
  };

  // Calculate adaptive calendar height based on screen size
  const getCalendarMaxHeight = () => {
    if (isLandscape) {
      return Math.min(300, screenData.height * 0.4); // 40% of screen height in landscape
    }
    return Math.min(400, screenData.height * 0.5); // 50% of screen height in portrait
  };

  // Calculate adaptive clock height based on screen size
  const getClockMaxHeight = () => {
    if (isLandscape) {
      return Math.min(280, screenData.height * 0.35); // 35% of screen height in landscape
    }
    return Math.min(320, screenData.height * 0.4); // 40% of screen height in portrait
  };

  React.useEffect(() => {
    const onChange = (result: any) => {
      setScreenData(result.window);
    };

    const subscription = Dimensions.addEventListener('change', onChange);
    return () => subscription?.remove();
  }, []);

  // Load categories on component mount
  React.useEffect(() => {
    const loadCategories = async () => {
      try {
        const availableCategories = await categoryService.getCategories();
        setCategories(availableCategories);
      } catch (error) {
        console.error('Error loading categories:', error);
      }
    };
    
    loadCategories();
  }, []);

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

  // In the handleSave method:
  const handleSave = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      // Create a single Date object from date and time inputs
      let dueDate: Date | undefined = undefined;

      if (formData.due_datetime) {
        dueDate = new Date(formData.due_datetime);

        // If time is also provided, add it to the date using UTC
        if (formData.due_time) {
          const [timeStr, period] = formData.due_time.split(" ");
          let [hours, minutes] = timeStr.split(":").map(Number);

          // Convert to 24-hour format
          if (period === "PM" && hours < 12) hours += 12;
          if (period === "AM" && hours === 12) hours = 0;

          // Use UTC methods to avoid timezone conversion
          dueDate.setUTCHours(hours, minutes, 0, 0);
        }
      }

      // Get username from storage if possible
      let username = formData.user;
      try {
        const storedUsername = await AsyncStorage.getItem("username");
        if (storedUsername) {
          username = storedUsername;
        }
      } catch (e) {
        console.warn("Could not retrieve username from storage");
      }

      const payload: TaskFormData = {
        title: formData.title,
        description: formData.description || "",
        priority: formData.priority,
        category: formData.category,
        due_datetime: dueDate,
        completed: formData.completed || false,
        user: username,
      };

      await taskService.createTask(payload);

      showSuccessToast("Task created successfully!");
      navigation.goBack();
    } catch (error) {
      showErrorToast("Failed to create task. Please try again.");
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
        onPress: () => {
          setFormData({
            title: "",
            description: "",
            category: "",
            priority: "not-urgent-not-important",
            due_datetime: undefined,
            due_time: undefined,
          });
          showSuccessToast("Form reset successfully");
        },
      },
    ]);
  };

  const selectedPriority = priorities.find(
    (p) => p.value === formData.priority
  );

  return (
    <View style={styles.rootContainer}>
      {/* Container for both header and content */}
      <View style={styles.container}>
        {/* Header positioned behind content */}
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
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <Text style={styles.title}>Create Task</Text>
          <View style={styles.placeholder} />
        </LinearGradient>

        {/* Main Content Container positioned above header */}
        <View style={styles.mainContentContainer}>
          <TouchableOpacity
            activeOpacity={1}
            style={{ flex: 1 }}
            onPress={() => {
              if (showPriorityPicker) {
                setShowPriorityPicker(false);
              }
              if (showCategoryPicker) {
                setShowCategoryPicker(false);
              }
              if (showDatePicker) {
                setShowDatePicker(false);
              }
              if (showTimePicker) {
                setShowTimePicker(false);
              }
            }}
          >
            <ScrollView
              style={styles.content}
              showsVerticalScrollIndicator={false}
            >
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

              {/* Date and Time */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Due Date & Time (Optional)</Text>
                <View style={styles.dateTimeRow}>
                  <TouchableOpacity
                    style={styles.dateTimeButton}
                    onPress={() => {
                      setShowPriorityPicker(false);
                      setShowTimePicker(false);
                      setShowDatePicker(!showDatePicker);
                    }}
                  >
                    <Text style={styles.dateTimeText}>
                      {formData.due_datetime
                        ? formData.due_datetime.toLocaleDateString()
                        : "Select Date"}
                    </Text>
                    <MaterialIcons
                      name="calendar-today"
                      size={20}
                      color="#6c757d"
                    />
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.dateTimeButton}
                    onPress={() => {
                      setShowPriorityPicker(false);
                      setShowDatePicker(false);
                      setShowTimePicker(!showTimePicker);
                    }}
                    disabled={!formData.due_datetime}
                  >
                    <Text
                      style={[
                        styles.dateTimeText,
                        !formData.due_datetime && styles.disabledText,
                      ]}
                    >
                      {formData.due_time
                        ? (() => {
                            // Format to HH:MM AM/PM
                            const match =
                              formData.due_time.match(/(\d+):(\d+) (AM|PM)/);
                            if (match) {
                              const hour = match[1].padStart(2, "0");
                              const minute = match[2].padStart(2, "0");
                              const period = match[3];
                              return `${hour}:${minute} ${period}`;
                            }
                            return formData.due_time;
                          })()
                        : "Select Time"}
                    </Text>
                    <MaterialIcons
                      name="access-time"
                      size={20}
                      color={formData.due_datetime ? "#6c757d" : "#bdc3c7"}
                    />
                  </TouchableOpacity>
                </View>

                {/* Calendar Picker */}
                {showDatePicker && (
                  <View
                    style={[
                      styles.dropdownOptions, 
                      styles.calendarDropdown,
                      { 
                        maxHeight: getCalendarMaxHeight(),
                        ...(shouldDropdownAppearAbove() && {
                          bottom: "100%",
                          top: undefined,
                          marginBottom: 8,
                          marginTop: 0,
                        })
                      }
                    ]}
                  >
                    <ScrollView 
                      style={{ flex: 1 }}
                      showsVerticalScrollIndicator={false}
                      nestedScrollEnabled={true}
                    >
                      <View style={[
                        styles.calendarContainer,
                        isLandscape && styles.calendarContainerLandscape
                      ]}>
                        <View style={styles.calendarHeader}>
                          <TouchableOpacity
                            style={[
                              styles.monthNavButton,
                              isLandscape && styles.monthNavButtonLandscape
                            ]}
                            onPress={() => {
                              const newDate = new Date(calendarDate);
                              newDate.setMonth(newDate.getMonth() - 1);
                              setCalendarDate(newDate);
                            }}
                          >
                            <MaterialIcons
                              name="chevron-left"
                              size={isLandscape ? 18 : 20}
                              color="#495057"
                            />
                          </TouchableOpacity>
                          <Text style={[
                            styles.monthYearText,
                            isLandscape && styles.monthYearTextLandscape
                          ]}>
                            {calendarDate.toLocaleDateString("en-US", {
                              month: "long",
                              year: "numeric",
                            })}
                          </Text>
                          <TouchableOpacity
                            style={[
                              styles.monthNavButton,
                              isLandscape && styles.monthNavButtonLandscape
                            ]}
                            onPress={() => {
                              const newDate = new Date(calendarDate);
                              newDate.setMonth(newDate.getMonth() + 1);
                              setCalendarDate(newDate);
                            }}
                          >
                            <MaterialIcons
                              name="chevron-right"
                              size={isLandscape ? 18 : 20}
                              color="#495057"
                            />
                          </TouchableOpacity>
                        </View>
                        <View style={[
                          styles.calendarGrid,
                          isLandscape && styles.calendarGridLandscape
                        ]}>
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
                              <Text key={day} style={[
                                styles.dayHeader,
                                isLandscape && styles.dayHeaderLandscape
                              ]}>
                                {day}
                              </Text>
                            ))}
                          </View>
                          {/* Calendar days - simplified version */}
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
                                formData.due_datetime &&
                                currentDate.toDateString() ===
                                  formData.due_datetime.toDateString();

                              return (
                                <TouchableOpacity
                                  key={index}
                                  style={[
                                    styles.calendarDay,
                                    isLandscape && styles.calendarDayLandscape,
                                    !isCurrentMonth && styles.inactiveDay,
                                    isToday && styles.todayCalendarDay,
                                    isSelected && styles.selectedCalendarDay,
                                  ]}
                                  onPress={() => {
                                    // Use UTC to avoid timezone shifts
                                    const selectedDate = new Date(
                                      Date.UTC(
                                        currentDate.getFullYear(),
                                        currentDate.getMonth(),
                                        currentDate.getDate(),
                                        0,
                                        0,
                                        0,
                                        0
                                      )
                                    );
                                    handleInputChange(
                                      "due_datetime",
                                      selectedDate
                                    );
                                    setShowDatePicker(false);
                                  }}
                                >
                                  <Text
                                    style={[
                                      styles.calendarDayText,
                                      isLandscape && styles.calendarDayTextLandscape,
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
                    </ScrollView>
                  </View>
                )}

                {/* Clock Time Picker */}
                {showTimePicker && formData.due_datetime && (
                  <View style={[
                    styles.dropdownOptions, 
                    styles.clockDropdown,
                    { 
                      maxHeight: getClockMaxHeight(),
                      ...(shouldDropdownAppearAbove() && {
                        bottom: "100%",
                        top: undefined,
                        marginBottom: 8,
                        marginTop: 0,
                      })
                    }
                  ]}>
                    <ScrollView 
                      style={{ flex: 1 }}
                      showsVerticalScrollIndicator={false}
                      nestedScrollEnabled={true}
                    >
                      <View style={[
                        styles.clockContainer,
                        isLandscape && styles.clockContainerLandscape
                      ]}>
                        <Text style={[
                          styles.clockTitle,
                          isLandscape && styles.clockTitleLandscape
                        ]}>Select Time</Text>
                        <View style={styles.timeSelectorsRow}>
                          {/* Hour Selector */}
                          <View style={styles.timeSelector}>
                            <Text style={[
                              styles.timeSelectorLabel,
                              isLandscape && styles.timeSelectorLabelLandscape
                            ]}>Hour</Text>
                            <ScrollView
                              style={[
                                styles.timeScrollView,
                                isLandscape && styles.timeScrollViewLandscape
                              ]}
                              showsVerticalScrollIndicator={false}
                            >
                              {Array.from({ length: 12 }, (_, i) => i + 1).map(
                                (hour) => {
                                  const currentTime =
                                    formData.due_time || "12:00 AM";
                                  const match =
                                    currentTime.match(/(\d+):(\d+) (AM|PM)/);
                                  let currentHour = match
                                    ? parseInt(match[1])
                                    : 12;
                                  // If hour is 0, treat as 12
                                  if (currentHour === 0) currentHour = 12;
                                  const isSelected = currentHour === hour;
                                  const minute = match ? match[2] : "00";
                                  const period = match ? match[3] : "AM";
                                  return (
                                    <TouchableOpacity
                                      key={hour}
                                      style={[
                                        styles.timeOption,
                                        isLandscape && styles.timeOptionLandscape,
                                        isSelected && {
                                          backgroundColor: "#f0e6ff",
                                        },
                                      ]}
                                      onPress={() => {
                                        const newTime = `${hour
                                          .toString()
                                          .padStart(2, "0")}:${minute} ${period}`;
                                        handleInputChange("due_time", newTime);
                                      }}
                                    >
                                      <Text
                                        style={[
                                          styles.timeOptionText,
                                          isLandscape && styles.timeOptionTextLandscape,
                                          isSelected && {
                                            color: "#AD00FF",
                                            fontWeight: "bold",
                                          },
                                        ]}
                                      >
                                        {hour.toString().padStart(2, "0")}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                }
                              )}
                            </ScrollView>
                          </View>

                          {/* Minute Selector */}
                          <View style={styles.timeSelector}>
                            <Text style={[
                              styles.timeSelectorLabel,
                              isLandscape && styles.timeSelectorLabelLandscape
                            ]}>Min</Text>
                            <ScrollView
                              style={[
                                styles.timeScrollView,
                                isLandscape && styles.timeScrollViewLandscape
                              ]}
                              showsVerticalScrollIndicator={false}
                            >
                              {Array.from({ length: 60 }, (_, i) => i).map(
                                (minute) => {
                                  const minuteStr = minute
                                    .toString()
                                    .padStart(2, "0");
                                  const currentTime =
                                    formData.due_time || "12:00 AM";
                                  const match =
                                    currentTime.match(/(\d+):(\d+) (AM|PM)/);
                                  const currentMinute = match ? match[2] : "00";
                                  const isSelected = currentMinute === minuteStr;
                                  return (
                                    <TouchableOpacity
                                      key={minuteStr}
                                      style={[
                                        styles.timeOption,
                                        isLandscape && styles.timeOptionLandscape,
                                        isSelected && {
                                          backgroundColor: "#f0e6ff",
                                        },
                                      ]}
                                      onPress={() => {
                                        const hour = match ? match[1] : "12";
                                        const period = match ? match[3] : "AM";
                                        const newTime = `${hour}:${minuteStr} ${period}`;
                                        handleInputChange("due_time", newTime);
                                      }}
                                    >
                                      <Text
                                        style={[
                                          styles.timeOptionText,
                                          isLandscape && styles.timeOptionTextLandscape,
                                          isSelected && {
                                            color: "#AD00FF",
                                            fontWeight: "bold",
                                          },
                                        ]}
                                      >
                                        {minuteStr}
                                      </Text>
                                    </TouchableOpacity>
                                  );
                                }
                              )}
                            </ScrollView>
                          </View>

                          {/* AM/PM Selector */}
                          <View style={styles.timeSelector}>
                            <Text style={[
                              styles.timeSelectorLabel,
                              isLandscape && styles.timeSelectorLabelLandscape
                            ]}>Period</Text>
                            <ScrollView
                              style={[
                                styles.timeScrollView,
                                isLandscape && styles.timeScrollViewLandscape
                              ]}
                              showsVerticalScrollIndicator={false}
                            >
                              {["AM", "PM"].map((period) => {
                                const currentTime =
                                  formData.due_time || "12:00 AM";
                                const match =
                                  currentTime.match(/(\d+):(\d+) (AM|PM)/);
                                const currentPeriod = match ? match[3] : "AM";
                                const hour = match ? match[1] : "12";
                                const minute = match ? match[2] : "00";
                                const isSelected = currentPeriod === period;
                                return (
                                  <TouchableOpacity
                                    key={period}
                                    style={[
                                      styles.timeOption,
                                      isLandscape && styles.timeOptionLandscape,
                                      isSelected && {
                                        backgroundColor: "#f0e6ff",
                                      },
                                    ]}
                                    onPress={() => {
                                      let newHour = parseInt(hour);
                                      // Convert hour to 12-hour format if needed
                                      if (period === "AM" && newHour === 12)
                                        newHour = 12;
                                      if (period === "PM" && newHour !== 12)
                                        newHour = newHour;
                                      const newTime = `${newHour
                                        .toString()
                                        .padStart(2, "0")}:${minute} ${period}`;
                                      handleInputChange("due_time", newTime);
                                    }}
                                  >
                                    <Text
                                      style={[
                                        styles.timeOptionText,
                                        isLandscape && styles.timeOptionTextLandscape,
                                        isSelected && {
                                          color: "#AD00FF",
                                          fontWeight: "bold",
                                        },
                                      ]}
                                    >
                                      {period}
                                    </Text>
                                  </TouchableOpacity>
                                );
                              })}
                            </ScrollView>
                          </View>
                        </View>
                        <TouchableOpacity
                          style={[
                            styles.clockDoneButton,
                            isLandscape && styles.clockDoneButtonLandscape
                          ]}
                          onPress={() => setShowTimePicker(false)}
                        >
                          <Text style={[
                            styles.clockDoneText,
                            isLandscape && styles.clockDoneTextLandscape
                          ]}>Done</Text>
                        </TouchableOpacity>
                      </View>
                    </ScrollView>
                  </View>
                )}
              </View>

              {/* Priority and Subject Row */}
              <View style={styles.rowContainer}>
                {/* Priority (Eisenhower Matrix Quadrant) */}
                <View style={styles.halfInputGroup}>
                  <Text style={styles.label}>Priority</Text>
                  <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={() => {
                      setShowDatePicker(false);
                      setShowTimePicker(false);
                      setShowPriorityPicker(!showPriorityPicker);
                    }}
                  >
                    <Text style={styles.dropdownText}>
                      {selectedPriority?.label || "Select Priority"}
                    </Text>
                    <MaterialIcons
                      name={
                        showPriorityPicker
                          ? "keyboard-arrow-up"
                          : "keyboard-arrow-down"
                      }
                      size={20}
                      color="#6c757d"
                    />
                  </TouchableOpacity>

                  {/* Simple Dropdown Options */}
                  {showPriorityPicker && (
                    <View style={[
                      styles.dropdownOptions,
                      isLandscape && styles.dropdownOptionsLandscape,
                      { 
                        maxHeight: getDropdownMaxHeight(),
                        ...(shouldDropdownAppearAbove() && {
                          bottom: "100%",
                          top: undefined,
                          marginBottom: 8,
                          marginTop: 0,
                        })
                      }
                    ]}>
                      <ScrollView 
                        style={{ flex: 1 }}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled={true}
                      >
                        {priorities.map((priority) => (
                          <TouchableOpacity
                            key={priority.value}
                            style={[
                              styles.dropdownOption,
                              isLandscape && styles.dropdownOptionLandscape,
                              formData.priority === priority.value &&
                                styles.selectedDropdownOption,
                            ]}
                            onPress={() => {
                              handleInputChange("priority", priority.value);
                              setShowPriorityPicker(false);
                            }}
                          >
                            <View style={styles.priorityOptionContent}>
                              <Text
                                style={[
                                  styles.priorityOptionLabel,
                                  isLandscape && styles.priorityOptionLabelLandscape,
                                  formData.priority === priority.value &&
                                    styles.selectedOptionText,
                                ]}
                              >
                                {priority.label}
                              </Text>
                              {!isLandscape && (
                                <Text
                                  style={[
                                    styles.priorityOptionDescription,
                                    formData.priority === priority.value &&
                                      styles.selectedOptionDescription,
                                  ]}
                                >
                                  {priority.description}
                                </Text>
                              )}
                            </View>
                            {formData.priority === priority.value && (
                              <MaterialIcons
                                name="check"
                                size={16}
                                color="#AD00FF"
                              />
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>

                {/* Category Dropdown */}
                <View style={styles.halfInputGroup}>
                  <Text style={styles.label}>Category</Text>
                  <TouchableOpacity
                    style={styles.dropdownButton}
                    onPress={() => {
                      setShowDatePicker(false);
                      setShowTimePicker(false);
                      setShowPriorityPicker(false);
                      setShowCategoryPicker(!showCategoryPicker);
                    }}
                  >
                    <Text style={styles.dropdownText}>
                      {formData.category 
                        ? categories.find(cat => cat.name === formData.category)?.name || formData.category
                        : "Select Category"
                      }
                    </Text>
                    <MaterialIcons
                      name={
                        showCategoryPicker
                          ? "keyboard-arrow-up"
                          : "keyboard-arrow-down"
                      }
                      size={20}
                      color="#6c757d"
                    />
                  </TouchableOpacity>

                  {/* Category Dropdown Options */}
                  {showCategoryPicker && (
                    <View style={[
                      styles.dropdownOptions,
                      isLandscape && styles.dropdownOptionsLandscape,
                      { 
                        maxHeight: getDropdownMaxHeight(),
                        ...(shouldDropdownAppearAbove() && {
                          bottom: "100%",
                          top: undefined,
                          marginBottom: 8,
                          marginTop: 0,
                        })
                      }
                    ]}>
                      <ScrollView 
                        style={{ flex: 1 }}
                        showsVerticalScrollIndicator={false}
                        nestedScrollEnabled={true}
                      >
                        {/* None/Clear option */}
                        <TouchableOpacity
                          style={[
                            styles.dropdownOption,
                            isLandscape && styles.dropdownOptionLandscape,
                            !formData.category && styles.selectedDropdownOption,
                          ]}
                          onPress={() => {
                            handleInputChange("category", "");
                            setShowCategoryPicker(false);
                          }}
                        >
                          <View style={styles.categoryOptionContent}>
                            <Text
                              style={[
                                styles.categoryOptionLabel,
                                isLandscape && styles.categoryOptionLabelLandscape,
                                !formData.category && styles.selectedOptionText,
                              ]}
                            >
                              No Category
                            </Text>
                          </View>
                          {!formData.category && (
                            <MaterialIcons
                              name="check"
                              size={16}
                              color="#AD00FF"
                            />
                          )}
                        </TouchableOpacity>
                        
                        {/* Category options */}
                        {categories.map((category) => (
                          <TouchableOpacity
                            key={category.id}
                            style={[
                              styles.dropdownOption,
                              isLandscape && styles.dropdownOptionLandscape,
                              formData.category === category.name && styles.selectedDropdownOption,
                            ]}
                            onPress={() => {
                              handleInputChange("category", category.name);
                              setShowCategoryPicker(false);
                            }}
                          >
                            <View style={styles.categoryOptionContent}>
                              <View style={styles.categoryOptionHeader}>
                                <View 
                                  style={[
                                    styles.categoryColorIndicator, 
                                    { backgroundColor: category.color || '#6c757d' }
                                  ]} 
                                />
                                <Text
                                  style={[
                                    styles.categoryOptionLabel,
                                    isLandscape && styles.categoryOptionLabelLandscape,
                                    formData.category === category.name && styles.selectedOptionText,
                                  ]}
                                >
                                  {category.name}
                                </Text>
                              </View>
                            </View>
                            {formData.category === category.name && (
                              <MaterialIcons
                                name="check"
                                size={16}
                                color="#AD00FF"
                              />
                            )}
                          </TouchableOpacity>
                        ))}
                      </ScrollView>
                    </View>
                  )}
                </View>
              </View>

              {/* Description */}
              <View style={styles.inputGroup}>
                <Text style={styles.label}>Description / Notes (Optional)</Text>
                <TextInput
                  style={[styles.textInput, styles.textArea]}
                  placeholder="Add any additional notes or details..."
                  value={formData.description || ""}
                  onChangeText={(text) =>
                    handleInputChange("description", text)
                  }
                  multiline
                  numberOfLines={4}
                  maxLength={500}
                  textAlignVertical="top"
                />
              </View>

              {/* Action Buttons */}
              <View style={styles.buttonContainer}>
                <TouchableOpacity
                  style={styles.resetButton}
                  onPress={handleReset}
                >
                  <MaterialIcons name="refresh" size={20} color="#e74c3c" />
                  <Text style={styles.resetButtonText}>Reset</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    isLoading && styles.disabledButton,
                  ]}
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
        </View>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  container: {
    flex: 1,
    backgroundColor: "#F9FAFB",
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingTop: Platform.OS === "ios" ? 56 : 40,
    paddingBottom: 500,
    zIndex: 10,
  },
  mainContentContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    marginTop: Platform.OS === "ios" ? 120 : 104,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 16,
    elevation: 10,
    zIndex: 1000,
    overflow: "hidden",
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 21,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "rgba(255, 255, 255, 0.15)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  title: {
    fontSize: 26,
    fontFamily: "Lexend",
    color: "#FFFFFF",
    
    letterSpacing: -0.5,
  },
  placeholder: {
    width: 42,
  },
  content: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 28,
  },
  inputGroup: {
    marginBottom: 28,
    position: "relative",
  },
  rowContainer: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 28,
  },
  halfInputGroup: {
    flex: 1,
    position: "relative",
  },
  label: {
    fontSize: 16,
    color: "#334155",
    marginBottom: 10,
    fontFamily: "Inter-SemiBold",
    fontWeight: "600",
    letterSpacing: 0.2,
  },
  textInput: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    fontSize: 16,
    color: "#1E293B",
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    fontFamily: "Inter-Regular",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  dropdownButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  dropdownText: {
    flex: 1,
    fontSize: 16,
    color: "#334155",
    marginLeft: 8,
    fontFamily: "Inter-Regular",
    fontWeight: "400",
  },
  textArea: {
    height: 120,
    textAlignVertical: "top",
    lineHeight: 24,
  },
  typeScroll: {
    flexDirection: "row",
  },
  typeButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 24,
    marginRight: 12,
    borderWidth: 2,
    borderColor: "#8B5CF6",
  },
  selectedType: {
    backgroundColor: "#8B5CF6",
  },
  typeText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#8B5CF6",
    fontFamily: "Inter-Medium",
    fontWeight: "600",
  },
  selectedTypeText: {
    color: "#FFFFFF",
  },
  priorityContainer: {
    gap: 14,
  },
  priorityButton: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 14,
    padding: 16,
    borderWidth: 2,
    borderColor: "#EDF2F7",
  },
  selectedPriority: {
    backgroundColor: "#F9F5FF",
  },
  priorityIndicator: {
    width: 14,
    height: 14,
    borderRadius: 7,
    marginRight: 14,
  },
  priorityContent: {
    flex: 1,
  },
  priorityLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    fontFamily: "Inter-Medium",
  },
  selectedPriorityText: {
    color: "#8B5CF6",
  },
  priorityDescription: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    fontFamily: "Inter-Regular",
  },
  dateTimeRow: {
    flexDirection: "row",
    gap: 16,
  },
  dateTimeButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 8,
    elevation: 1,
  },
  dateTimeText: {
    fontSize: 16,
    color: "#334155",
    fontFamily: "Inter-Regular",
    flex: 1,
    fontWeight: "400",
  },
  disabledText: {
    color: "#CBD5E1",
  },
  buttonContainer: {
    flexDirection: "row",
    gap: 16,
    marginBottom: 30,
    marginTop: 10,
  },
  resetButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: "#EF4444",
    shadowColor: "#FECACA",
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 1,
  },
  resetButtonText: {
    marginLeft: 8,
    fontSize: 16,
    color: "#EF4444",
    fontFamily: "Inter-Medium",
    fontWeight: "600",
  },
  saveButton: {
    flex: 2,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#8B5CF6",
    borderRadius: 16,
    padding: 18,
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  disabledButton: {
    opacity: 0.6,
  },
  saveButtonText: {
    marginLeft: 8,
    fontSize: 16,
    color: "#FFFFFF",
    fontFamily: "Inter-Bold",
    fontWeight: "700",
  },
  // Dropdown styles
  dropdownOptions: {
    position: "absolute",
    top: "100%",
    left: 0,
    right: 0,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: "#E2E8F0",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1000,
    marginTop: 8,
    overflow: "hidden",
    maxHeight: 250, // Default fallback
  },
  dropdownOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 18,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  selectedDropdownOption: {
    backgroundColor: "#F5F3FF",
  },
  priorityOptionContent: {
    flex: 1,
  },
  priorityOptionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    fontFamily: "Inter-Medium",
  },
  selectedOptionText: {
    color: "#8B5CF6",
  },
  priorityOptionDescription: {
    fontSize: 13,
    color: "#64748B",
    marginTop: 4,
    fontFamily: "Inter-Regular",
  },
  selectedOptionDescription: {
    color: "#7C3AED",
  },
  // Landscape-specific styles for priority dropdown
  dropdownOptionsLandscape: {
    maxHeight: 180,
    marginTop: 4,
  },
  dropdownOptionLandscape: {
    paddingVertical: 8,
    paddingHorizontal: 14,
  },
  priorityOptionLabelLandscape: {
    fontSize: 14,
  },
  // Calendar styles
  calendarDropdown: {
    width: "100%",
    left: 0,
    right: 0,
    maxHeight: 400, // Default fallback
  },
  calendarContainer: {
    padding: 20,
  },
  calendarContainerLandscape: {
    padding: 12,
  },
  calendarHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  monthNavButton: {
    padding: 12,
    borderRadius: 14,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  monthNavButtonLandscape: {
    padding: 8,
    borderRadius: 10,
  },
  monthYearText: {
    fontSize: 18,
    fontFamily: "Inter-SemiBold",
    color: "#1E293B",
    fontWeight: "700",
  },
  monthYearTextLandscape: {
    fontSize: 16,
  },
  calendarGrid: {
    gap: 10,
  },
  calendarGridLandscape: {
    gap: 6,
  },
  dayHeadersRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    marginBottom: 12,
  },
  dayHeader: {
    fontSize: 13,
    color: "#64748B",
    fontFamily: "Inter-Medium",
    textAlign: "center",
    flex: 1,
    fontWeight: "600",
  },
  dayHeaderLandscape: {
    fontSize: 11,
  },
  daysContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 5,
  },
  calendarDay: {
    width: "13.2%",
    aspectRatio: 1,
    justifyContent: "center",
    alignItems: "center",
    borderRadius: 10,
    margin: 1,
  },
  calendarDayLandscape: {
    borderRadius: 8,
    margin: 0.5,
  },
  inactiveDay: {
    opacity: 0.3,
  },
  todayCalendarDay: {
    backgroundColor: "#EDE9FE",
    borderWidth: 1.5,
    borderColor: "#8B5CF6",
  },
  selectedCalendarDay: {
    backgroundColor: "#8B5CF6",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 5,
  },
  calendarDayText: {
    fontSize: 15,
    color: "#1E293B",
    fontFamily: "Inter-Medium",
    fontWeight: "600",
  },
  calendarDayTextLandscape: {
    fontSize: 13,
  },
  inactiveDayText: {
    color: "#CBD5E1",
  },
  todayDayText: {
    color: "#8B5CF6",
    fontFamily: "Inter-Bold",
    fontWeight: "700",
  },
  selectedDayText: {
    color: "#FFFFFF",
    fontFamily: "Inter-Bold",
    fontWeight: "700",
  },
  // Clock styles
  clockDropdown: {
    width: "100%",
    left: 0,
    right: 0,
    maxHeight: 320, // Default fallback
  },
  clockContainer: {
    padding: 20,
  },
  clockContainerLandscape: {
    padding: 12,
  },
  clockTitle: {
    fontSize: 18,
    fontFamily: "Inter-SemiBold",
    color: "#1E293B",
    textAlign: "center",
    marginBottom: 20,
    fontWeight: "700",
  },
  clockTitleLandscape: {
    fontSize: 16,
    marginBottom: 12,
  },
  timeSelectorsRow: {
    flexDirection: "row",
    justifyContent: "space-around",
    gap: 16,
    marginBottom: 20,
  },
  timeSelector: {
    flex: 1,
    alignItems: "center",
  },
  timeSelectorLabel: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    marginBottom: 10,
    fontWeight: "600",
  },
  timeSelectorLabelLandscape: {
    fontSize: 12,
    marginBottom: 6,
  },
  timeScrollView: {
    height: 140,
    backgroundColor: "#F8FAFC",
    borderRadius: 14,
    width: "100%",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  timeScrollViewLandscape: {
    height: 100,
    borderRadius: 10,
  },
  timeOption: {
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: "#EDF2F7",
  },
  timeOptionLandscape: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  timeOptionText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#334155",
    fontWeight: "500",
  },
  timeOptionTextLandscape: {
    fontSize: 14,
  },
  clockDoneButton: {
    backgroundColor: "#8B5CF6",
    borderRadius: 14,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: "center",
    shadowColor: "#8B5CF6",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 8,
    elevation: 4,
  },
  clockDoneButtonLandscape: {
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 12,
  },
  clockDoneText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    fontWeight: "600",
  },
  clockDoneTextLandscape: {
    fontSize: 14,
  },
  // Category dropdown styles
  categoryOptionContent: {
    flex: 1,
  },
  categoryOptionHeader: {
    flexDirection: "row",
    alignItems: "center",
  },
  categoryColorIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  categoryOptionLabel: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    fontFamily: "Inter-Medium",
  },
  categoryOptionLabelLandscape: {
    fontSize: 14,
  },
});

export default AddTask;
