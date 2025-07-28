import React, { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
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
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Priority, TaskFormData } from './types/Task';
import { taskService } from './services/taskService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type RouteProp = { params?: { quadrant?: Priority } };

const priorities: { label: string; value: Priority; color: string; description: string }[] = [
  { 
    label: 'Urgent & Important', 
    value: 'urgent-important', 
    color: '#e74c3c',
    description: 'Do First - Critical tasks'
  },
  { 
    label: 'Important, Not Urgent', 
    value: 'not-urgent-important', 
    color: '#1abc9c',
    description: 'Schedule - Plan for these'
  },
  { 
    label: 'Urgent, Not Important', 
    value: 'urgent-not-important', 
    color: '#f39c12',
    description: 'Delegate - Can be delegated'
  },
  { 
    label: 'Neither Urgent nor Important', 
    value: 'not-urgent-not-important', 
    color: '#27ae60',
    description: 'Eliminate - Consider removing'
  },
];

const AddTask: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute() as RouteProp;
  
  const [formData, setFormData] = useState<TaskFormData>({
    title: '',
    description: '',
    subject: '',
    priority: route.params?.quadrant || 'not-urgent-not-important',
    dueDate: undefined,
    dueTime: undefined,
  });
  
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [showTimePicker, setShowTimePicker] = useState(false);
  const [showPriorityPicker, setShowPriorityPicker] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [calendarDate, setCalendarDate] = useState(new Date()); // For calendar navigation

  const handleInputChange = (field: keyof TaskFormData, value: any) => {
    setFormData(prev => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleDateChange = (event: any, selectedDate?: Date) => {
    setShowDatePicker(false);
    if (selectedDate) {
      handleInputChange('dueDate', selectedDate);
    }
  };

  const handleTimeChange = (event: any, selectedTime?: Date) => {
    setShowTimePicker(false);
    if (selectedTime) {
      const timeString = selectedTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      handleInputChange('dueTime', timeString);
    }
  };

  const validateForm = (): boolean => {
    if (!formData.title.trim()) {
      Alert.alert('Error', 'Please enter a task title');
      return false;
    }
    return true;
  };

  const handleSave = async () => {
    if (!validateForm()) return;

    setIsLoading(true);
    try {
      await taskService.createTask(formData);
      Alert.alert('Success', 'Task created successfully!', [
        { text: 'OK', onPress: () => navigation.goBack() }
      ]);
    } catch (error) {
      console.error('Error creating task:', error);
      Alert.alert('Error', 'Failed to create task');
    } finally {
      setIsLoading(false);
    }
  };

  const handleReset = () => {
    Alert.alert(
      'Reset Form',
      'Are you sure you want to reset all fields?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: () => setFormData({
            title: '',
            description: '',
            subject: '',
            priority: 'not-urgent-not-important',
            dueDate: undefined,
            dueTime: undefined,
          }),
        },
      ]
    );
  };

  const selectedPriority = priorities.find(p => p.value === formData.priority);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="chevron-back" size={24} color="#333" />
        </TouchableOpacity>
        <Text style={styles.title}>Create Task</Text>
        <View style={styles.placeholder} />
      </View>

      <TouchableOpacity
        activeOpacity={1}
        style={{ flex: 1 }}
        onPress={() => {
          if (showPriorityPicker) {
            setShowPriorityPicker(false);
          }
          if (showDatePicker) {
            setShowDatePicker(false);
          }
          if (showTimePicker) {
            setShowTimePicker(false);
          }
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
            placeholderTextColor={'#7f8c8d'}
            onChangeText={(text) => handleInputChange('title', text)}
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
                {formData.dueDate ? formData.dueDate.toLocaleDateString() : 'Select Date'}
              </Text>
              <MaterialIcons name="calendar-today" size={20} color="#6c757d" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.dateTimeButton}
              onPress={() => {
                setShowPriorityPicker(false);
                setShowDatePicker(false);
                setShowTimePicker(!showTimePicker);
              }}
              disabled={!formData.dueDate}
            >
              <Text style={[styles.dateTimeText, !formData.dueDate && styles.disabledText]}>
                {formData.dueTime
                  ? (() => {
                      // Format to HH:MM AM/PM
                      const match = formData.dueTime.match(/(\d+):(\d+) (AM|PM)/);
                      if (match) {
                        const hour = match[1].padStart(2, '0');
                        const minute = match[2].padStart(2, '0');
                        const period = match[3];
                        return `${hour}:${minute} ${period}`;
                      }
                      return formData.dueTime;
                    })()
                  : 'Select Time'}
              </Text>
              <MaterialIcons name="access-time" size={20} color={formData.dueDate ? "#6c757d" : "#bdc3c7"} />
            </TouchableOpacity>
          </View>
          
          {/* Calendar Picker */}
          {showDatePicker && (
            <View style={[styles.dropdownOptions, styles.calendarDropdown]}>
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
                    <MaterialIcons name="chevron-left" size={20} color="#495057" />
                  </TouchableOpacity>
                  <Text style={styles.monthYearText}>
                    {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                  </Text>
                  <TouchableOpacity 
                    style={styles.monthNavButton}
                    onPress={() => {
                      const newDate = new Date(calendarDate);
                      newDate.setMonth(newDate.getMonth() + 1);
                      setCalendarDate(newDate);
                    }}
                  >
                    <MaterialIcons name="chevron-right" size={20} color="#495057" />
                  </TouchableOpacity>
                </View>
                <View style={styles.calendarGrid}>
                  {/* Day headers */}
                  <View style={styles.dayHeadersRow}>
                    {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                      <Text key={day} style={styles.dayHeader}>{day}</Text>
                    ))}
                  </View>
                  {/* Calendar days - simplified version */}
                  <View style={styles.daysContainer}>
                    {Array.from({ length: 42 }, (_, index) => {
                      const firstDay = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), 1);
                      const startDate = new Date(firstDay);
                      startDate.setDate(startDate.getDate() - firstDay.getDay());
                      const currentDate = new Date(startDate);
                      currentDate.setDate(startDate.getDate() + index);
                      
                      const isCurrentMonth = currentDate.getMonth() === calendarDate.getMonth();
                      const isToday = currentDate.toDateString() === new Date().toDateString();
                      const isSelected = formData.dueDate && currentDate.toDateString() === formData.dueDate.toDateString();
                      
                      return (
                        <TouchableOpacity
                          key={index}
                          style={[
                            styles.calendarDay,
                            !isCurrentMonth && styles.inactiveDay,
                            isToday && styles.todayCalendarDay,
                            isSelected && styles.selectedCalendarDay
                          ]}
                          onPress={() => {
                            handleInputChange('dueDate', currentDate);
                            setShowDatePicker(false);
                          }}
                        >
                          <Text style={[
                            styles.calendarDayText,
                            !isCurrentMonth && styles.inactiveDayText,
                            isToday && styles.todayDayText,
                            isSelected && styles.selectedDayText
                          ]}>
                            {currentDate.getDate()}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              </View>
            </View>
          )}
          
          {/* Clock Time Picker */}
          {showTimePicker && formData.dueDate && (
            <View style={[styles.dropdownOptions, styles.clockDropdown]}>
              <View style={styles.clockContainer}>
                <Text style={styles.clockTitle}>Select Time</Text>
                <View style={styles.timeSelectorsRow}>
                  {/* Hour Selector */}
                  <View style={styles.timeSelector}>
                    <Text style={styles.timeSelectorLabel}>Hour</Text>
                    <ScrollView style={styles.timeScrollView} showsVerticalScrollIndicator={false}>
                      {Array.from({ length: 12 }, (_, i) => i + 1).map(hour => {
                        const currentTime = formData.dueTime || '12:00 AM';
                        const match = currentTime.match(/(\d+):(\d+) (AM|PM)/);
                        let currentHour = match ? parseInt(match[1]) : 12;
                        // If hour is 0, treat as 12
                        if (currentHour === 0) currentHour = 12;
                        const isSelected = currentHour === hour;
                        const minute = match ? match[2] : '00';
                        const period = match ? match[3] : 'AM';
                        return (
                          <TouchableOpacity
                            key={hour}
                            style={[styles.timeOption, isSelected && { backgroundColor: '#f0e6ff' }]}
                            onPress={() => {
                              const newTime = `${hour.toString().padStart(2, '0')}:${minute} ${period}`;
                              handleInputChange('dueTime', newTime);
                            }}
                          >
                            <Text style={[styles.timeOptionText, isSelected && { color: '#AD00FF', fontWeight: 'bold' }]}>
                              {hour.toString().padStart(2, '0')}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                  
                  {/* Minute Selector */}
                  <View style={styles.timeSelector}>
                    <Text style={styles.timeSelectorLabel}>Min</Text>
                    <ScrollView style={styles.timeScrollView} showsVerticalScrollIndicator={false}>
                      {Array.from({ length: 60 }, (_, i) => i).map(minute => {
                        const minuteStr = minute.toString().padStart(2, '0');
                        const currentTime = formData.dueTime || '12:00 AM';
                        const match = currentTime.match(/(\d+):(\d+) (AM|PM)/);
                        const currentMinute = match ? match[2] : '00';
                        const isSelected = currentMinute === minuteStr;
                        return (
                          <TouchableOpacity
                            key={minuteStr}
                            style={[styles.timeOption, isSelected && { backgroundColor: '#f0e6ff' }]}
                            onPress={() => {
                              const hour = match ? match[1] : '12';
                              const period = match ? match[3] : 'AM';
                              const newTime = `${hour}:${minuteStr} ${period}`;
                              handleInputChange('dueTime', newTime);
                            }}
                          >
                            <Text style={[styles.timeOptionText, isSelected && { color: '#AD00FF', fontWeight: 'bold' }]}> 
                              {minuteStr}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                  
                  {/* AM/PM Selector */}
                  <View style={styles.timeSelector}>
                    <Text style={styles.timeSelectorLabel}>Period</Text>
                    <ScrollView style={styles.timeScrollView} showsVerticalScrollIndicator={false}>
                      {['AM', 'PM'].map(period => {
                        const currentTime = formData.dueTime || '12:00 AM';
                        const match = currentTime.match(/(\d+):(\d+) (AM|PM)/);
                        const currentPeriod = match ? match[3] : 'AM';
                        const hour = match ? match[1] : '12';
                        const minute = match ? match[2] : '00';
                        const isSelected = currentPeriod === period;
                        return (
                          <TouchableOpacity
                            key={period}
                            style={[styles.timeOption, isSelected && { backgroundColor: '#f0e6ff' }]}
                            onPress={() => {
                              let newHour = parseInt(hour);
                              // Convert hour to 12-hour format if needed
                              if (period === 'AM' && newHour === 12) newHour = 12;
                              if (period === 'PM' && newHour !== 12) newHour = newHour;
                              const newTime = `${newHour.toString().padStart(2, '0')}:${minute} ${period}`;
                              handleInputChange('dueTime', newTime);
                            }}
                          >
                            <Text style={[styles.timeOptionText, isSelected && { color: '#AD00FF', fontWeight: 'bold' }]}>
                              {period}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                </View>
                <TouchableOpacity
                  style={styles.clockDoneButton}
                  onPress={() => setShowTimePicker(false)}
                >
                  <Text style={styles.clockDoneText}>Done</Text>
                </TouchableOpacity>
              </View>
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
                {selectedPriority?.label || 'Select Priority'}
              </Text>
              <MaterialIcons 
                name={showPriorityPicker ? "keyboard-arrow-up" : "keyboard-arrow-down"} 
                size={20} 
                color="#6c757d" 
              />
            </TouchableOpacity>
            
            {/* Simple Dropdown Options */}
            {showPriorityPicker && (
              <View style={styles.dropdownOptions}>
                {priorities.map((priority) => (
                  <TouchableOpacity
                    key={priority.value}
                    style={[
                      styles.dropdownOption,
                      formData.priority === priority.value && styles.selectedDropdownOption,
                    ]}
                    onPress={() => {
                      handleInputChange('priority', priority.value);
                      setShowPriorityPicker(false);
                    }}
                  >
                    <View style={styles.priorityOptionContent}>
                      <Text style={[
                        styles.priorityOptionLabel,
                        formData.priority === priority.value && styles.selectedOptionText
                      ]}>
                        {priority.label}
                      </Text>
                      <Text style={[
                        styles.priorityOptionDescription,
                        formData.priority === priority.value && styles.selectedOptionDescription
                      ]}>
                        {priority.description}
                      </Text>
                    </View>
                    {formData.priority === priority.value && (
                      <MaterialIcons name="check" size={16} color="#AD00FF" />
                    )}
                  </TouchableOpacity>
                ))}
              </View>
            )}
          </View>

          {/* Subject/Course */}
          <View style={styles.halfInputGroup}>
            <Text style={styles.label}>Subject</Text>
            <TextInput
              style={styles.textInput}
              placeholder="e.g., Math, Science..."
              value={formData.subject}
              onChangeText={(text) => handleInputChange('subject', text)}
              maxLength={50}
            />
          </View>
        </View>

        {/* Description */}
        <View style={styles.inputGroup}>
          <Text style={styles.label}>Description / Notes (Optional)</Text>
          <TextInput
            style={[styles.textInput, styles.textArea]}
            placeholder="Add any additional notes or details..."
            value={formData.description}
            onChangeText={(text) => handleInputChange('description', text)}
            multiline
            numberOfLines={4}
            maxLength={500}
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
              {isLoading ? 'Saving...' : 'Save Task'}
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      </TouchableOpacity>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 15,
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 2,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#2c3e50',
    fontFamily: 'Inter-Bold',
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
    position: 'relative',
  },
  rowContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  halfInputGroup: {
    flex: 1,
    position: 'relative',
  },
  label: {
    fontSize: 16,
    color: '#2c3e50',
    marginBottom: 8,
    fontFamily: 'Inter-Bold',
  },
  textInput: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    fontSize: 14,
    color: '#2c3e50',
    borderWidth: 1,
    borderColor: '#e9ecef',
    fontFamily: 'Inter-Regular',
  },
  dropdownButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  dropdownText: {
    flex: 1,
    fontSize: 14,
    color: '#2c3e50',
    marginLeft: 8,
    fontFamily: 'Inter-Regular',
  },
  textArea: {
    height: 100,
  },
  typeScroll: {
    flexDirection: 'row',
  },
  typeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#fff',
    borderRadius: 25,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#AD00FF',
  },
  selectedType: {
    backgroundColor: '#AD00FF',
  },
  typeText: {
    marginLeft: 8,
    fontSize: 12,
    color: '#AD00FF',
    fontFamily: 'Inter-Medium',
  },
  selectedTypeText: {
    color: '#fff',
  },
  priorityContainer: {
    gap: 12,
  },
  priorityButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 2,
    borderColor: '#e9ecef',
  },
  selectedPriority: {
    backgroundColor: '#f8f9fa',
  },
  priorityIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
    marginRight: 12,
  },
  priorityContent: {
    flex: 1,
  },
  priorityLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2c3e50',
    fontFamily: 'Inter-Medium',
  },
  selectedPriorityText: {
    color: '#AD00FF',
  },
  priorityDescription: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 2,
    fontFamily: 'Inter-Regular',
  },
  dateTimeRow: {
    flexDirection: 'row',
    gap: 12,
  },
  dateTimeButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  dateTimeText: {
    fontSize: 14,
    color: '#2c3e50',
    fontFamily: 'Inter-Regular',
    flex: 1,
  },
  disabledText: {
    color: '#bdc3c7',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 30,
  },
  resetButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#e74c3c',
  },
  resetButtonText: {
    marginLeft: 8,
    fontSize: 14,
    color: '#e74c3c',
    fontFamily: 'Inter-Medium',
  },
  saveButton: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#AD00FF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
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
    color: '#fff',
    fontFamily: 'Inter-Bold',
  },
  // Simple dropdown styles
  dropdownOptions: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
    marginTop: 4,
  },
  dropdownOption: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#f8f9fa',
  },
  selectedDropdownOption: {
    backgroundColor: '#f0e6ff',
  },
  priorityOptionContent: {
    flex: 1,
  },
  priorityOptionLabel: {
    fontSize: 14,
    fontWeight: '500',
    color: '#2c3e50',
    fontFamily: 'Inter-Medium',
  },
  selectedOptionText: {
    color: '#AD00FF',
  },
  priorityOptionDescription: {
    fontSize: 12,
    color: '#7f8c8d',
    marginTop: 2,
    fontFamily: 'Inter-Regular',
  },
  selectedOptionDescription: {
    color: '#8A2BE2',
  },
  // Date input styles
  dateInputContainer: {
    padding: 16,
  },
  dateInputLabel: {
    fontSize: 14,
    color: '#6c757d',
    marginBottom: 8,
    fontFamily: 'Inter-Medium',
  },
  dateInput: {
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    backgroundColor: '#fff',
  },
  dateTimeDropdown: {
    width: '100%',
    left: 0,
    right: 0,
  },
  // Calendar styles
  calendarDropdown: {
    width: '100%',
    left: 0,
    right: 0,
    maxHeight: 400,
  },
  calendarContainer: {
    padding: 16,
  },
  calendarHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  monthNavButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: '#f8f9fa',
  },
  monthYearText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#2c3e50',
  },
  calendarGrid: {
    gap: 8,
  },
  dayHeadersRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 8,
  },
  dayHeader: {
    fontSize: 12,
    color: '#6c757d',
    fontFamily: 'Inter-Medium',
    textAlign: 'center',
    flex: 1,
  },
  daysContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 4,
  },
  calendarDay: {
    width: '13.2%',
    aspectRatio: 1,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
  },
  inactiveDay: {
    opacity: 0.3,
  },
  todayCalendarDay: {
    backgroundColor: '#AD00FF',
  },
  selectedCalendarDay: {
    backgroundColor: '#6A009C',
  },
  calendarDayText: {
    fontSize: 14,
    color: '#495057',
    fontFamily: 'Inter-Medium',
  },
  inactiveDayText: {
    color: '#adb5bd',
  },
  todayDayText: {
    color: '#fff',
    fontFamily: 'Inter-Bold',
  },
  selectedDayText: {
    color: '#fff',
    fontFamily: 'Inter-Bold',
  },
  // Clock styles
  clockDropdown: {
    width: '100%',
    left: 0,
    right: 0,
    maxHeight: 300,
  },
  clockContainer: {
    padding: 16,
  },
  clockTitle: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#2c3e50',
    textAlign: 'center',
    marginBottom: 16,
  },
  timeSelectorsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    gap: 12,
    marginBottom: 16,
  },
  timeSelector: {
    flex: 1,
    alignItems: 'center',
  },
  timeSelectorLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#6c757d',
    marginBottom: 8,
  },
  timeScrollView: {
    height: 120,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    width: '100%',
  },
  timeOption: {
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
  },
  timeOptionText: {
    fontSize: 16,
    fontFamily: 'Inter-Medium',
    color: '#2c3e50',
  },
  clockDoneButton: {
    backgroundColor: '#AD00FF',
    borderRadius: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  clockDoneText: {
    color: '#fff',
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
  },
});

export default AddTask;
