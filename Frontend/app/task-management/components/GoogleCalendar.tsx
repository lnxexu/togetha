import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  Dimensions,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { Task } from '../types/Task';

interface GoogleCalendarProps {
  visible: boolean;
  onClose: () => void;
  tasks: Task[];
  onDateSelect: (date: Date, tasks: Task[]) => void;
  onAddTask: (date: Date) => void;
}

const GoogleCalendar: React.FC<GoogleCalendarProps> = ({
  visible,
  onClose,
  tasks,
  onDateSelect,
  onAddTask,
}) => {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);

  const { width } = Dimensions.get('window');
  const cellWidth = (width - 80) / 7; // Account for padding and margins

  // Get calendar days for the current month - versatile for any date
  const getCalendarDays = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    
    // Get the first and last day of the current month
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    
    // Calculate the start date (Sunday of the week containing the first day)
    const startDate = new Date(firstDay);
    const dayOfWeek = firstDay.getDay(); // 0 = Sunday, 6 = Saturday
    startDate.setDate(firstDay.getDate() - dayOfWeek);
    
    // Calculate the end date (Saturday of the week containing the last day)
    const endDate = new Date(lastDay);
    const lastDayOfWeek = lastDay.getDay();
    const daysToAdd = 6 - lastDayOfWeek;
    endDate.setDate(lastDay.getDate() + daysToAdd);
    
    // Generate all days between start and end
    const days = [];
    const currentDay = new Date(startDate);
    
    while (currentDay <= endDate) {
      days.push(new Date(currentDay));
      currentDay.setDate(currentDay.getDate() + 1);
    }
    
    return days;
  };

  // Get tasks for a specific date
  const getTasksForDate = (date: Date): Task[] => {
    return tasks.filter(task => {
      if (!task.due_datetime) return false;
      const taskDate = new Date(task.due_datetime);
      return taskDate.toDateString() === date.toDateString();
    });
  };

  // Check if date is in current month
  const isCurrentMonth = (date: Date): boolean => {
    return date.getMonth() === currentDate.getMonth() && 
           date.getFullYear() === currentDate.getFullYear();
  };

  // Check if date is today
  const isToday = (date: Date): boolean => {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  };

  // Check if date is selected
  const isSelected = (date: Date): boolean => {
    if (!selectedDate) return false;
    return date.toDateString() === selectedDate.toDateString();
  };

  // Navigate to previous month
  const navigateToPrevMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() - 1);
    setCurrentDate(newDate);
  };

  // Navigate to next month
  const navigateToNextMonth = () => {
    const newDate = new Date(currentDate);
    newDate.setMonth(newDate.getMonth() + 1);
    setCurrentDate(newDate);
  };

  // Navigate to today
  const navigateToToday = () => {
    setCurrentDate(new Date());
    setSelectedDate(new Date());
  };

  // Handle date press
  const handleDatePress = (date: Date) => {
    setSelectedDate(date);
    const dateTasks = getTasksForDate(date);
    onDateSelect(date, dateTasks);
  };

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'
  ];

  const dayNames = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const calendarDays = getCalendarDays();

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.calendarContainer}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="arrow-back" size={24} color="#202124" />
              </TouchableOpacity>
              <Text style={styles.headerTitle}>
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </Text>
            </View>
            <TouchableOpacity onPress={navigateToToday} style={styles.todayButton}>
              <Text style={styles.todayButtonText}>Today</Text>
            </TouchableOpacity>
          </View>

          {/* Month Navigation */}
          <View style={styles.monthNavigation}>
            <TouchableOpacity onPress={navigateToPrevMonth} style={styles.navButton}>
              <MaterialIcons name="chevron-left" size={24} color="#5f6368" />
            </TouchableOpacity>
            
            <View style={styles.monthDisplay}>
              <Text style={styles.monthText}>
                {monthNames[currentDate.getMonth()]} {currentDate.getFullYear()}
              </Text>
            </View>
            
            <TouchableOpacity onPress={navigateToNextMonth} style={styles.navButton}>
              <MaterialIcons name="chevron-right" size={24} color="#5f6368" />
            </TouchableOpacity>
          </View>

          {/* Day headers */}
          <View style={styles.dayHeadersContainer}>
            {dayNames.map((day, index) => (
              <View key={index} style={[styles.dayHeaderCell, { width: cellWidth }]}>
                <Text style={styles.dayHeaderText}>{day}</Text>
              </View>
            ))}
          </View>

          {/* Calendar Grid */}
          <View style={styles.calendarGrid}>
            {calendarDays.map((date, index) => {
              const dayTasks = getTasksForDate(date);
              const isCurrentMonthDate = isCurrentMonth(date);
              const isTodayDate = isToday(date);
              const isSelectedDate = isSelected(date);

              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.dateCell,
                    { width: cellWidth },
                    !isCurrentMonthDate && styles.inactiveDate,
                    isTodayDate && styles.todayDate,
                    isSelectedDate && styles.selectedDate,
                  ]}
                  onPress={() => handleDatePress(date)}
                >
                  <Text
                    style={[
                      styles.dateText,
                      !isCurrentMonthDate && styles.inactiveDateText,
                      isTodayDate && styles.todayDateText,
                      isSelectedDate && styles.selectedDateText,
                    ]}
                  >
                    {date.getDate()}
                  </Text>
                  
                  {/* Enhanced Task indicators with annotations */}
                  {dayTasks.length > 0 && isCurrentMonthDate && (
                    <View style={styles.taskIndicatorsContainer}>
                      <View style={styles.taskDotsContainer}>
                        {dayTasks.slice(0, 3).map((task, taskIndex) => {
                          const dotColor = task.completed 
                            ? '#10B981' // Green for completed
                            : task.overdue 
                            ? '#EF4444' // Red for overdue
                            : (task.priority === 'urgent-important' || task.priority === 'urgent-not-important')
                            ? '#F59E0B' // Orange for urgent tasks
                            : '#3B82F6'; // Blue for normal
                          
                          return (
                            <View
                              key={taskIndex}
                              style={[
                                styles.taskIndicator,
                                { backgroundColor: dotColor }
                              ]}
                            />
                          );
                        })}
                      </View>
                      {dayTasks.length > 3 && (
                        <View style={styles.moreTasksBadge}>
                          <Text style={styles.moreTasksText}>+{dayTasks.length - 3}</Text>
                        </View>
                      )}
                      {dayTasks.length <= 3 && dayTasks.length > 0 && (
                        <View style={styles.taskCountBadge}>
                          <Text style={styles.taskCountText}>{dayTasks.length}</Text>
                        </View>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  calendarContainer: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    width: '100%',
    maxWidth: 380,
    paddingBottom: 16,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 8,
    },
    shadowOpacity: 0.15,
    shadowRadius: 16,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#f1f3f4',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  closeButton: {
    padding: 8,
    marginRight: 8,
    borderRadius: 20,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#202124',
    fontFamily: 'Inter-SemiBold',
  },
  todayButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#dadce0',
    backgroundColor: '#f8f9fa',
  },
  todayButtonText: {
    fontSize: 14,
    color: '#1a73e8',
    fontWeight: '500',
    fontFamily: 'Inter-Medium',
  },
  monthNavigation: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  navButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
  },
  monthDisplay: {
    flex: 1,
    alignItems: 'center',
  },
  monthText: {
    fontSize: 18,
    fontWeight: '600',
    color: '#202124',
    fontFamily: 'Inter-SemiBold',
  },
  dayHeadersContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#f8f9fa',
  },
  dayHeaderCell: {
    alignItems: 'center',
    paddingVertical: 8,
  },
  dayHeaderText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#5f6368',
    textTransform: 'uppercase',
    fontFamily: 'Inter-SemiBold',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  dateCell: {
    aspectRatio: 1,
    justifyContent: 'flex-start',
    alignItems: 'center',
    position: 'relative',
    marginVertical: 2,
    paddingTop: 8,
  },
  inactiveDate: {
    opacity: 0.3,
  },
  todayDate: {
    backgroundColor: '#1a73e8',
    borderRadius: 20,
  },
  selectedDate: {
    backgroundColor: '#e8f0fe',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#1a73e8',
  },
  dateText: {
    fontSize: 14,
    color: '#202124',
    fontWeight: '400',
    fontFamily: 'Inter-Regular',
  },
  inactiveDateText: {
    color: '#9aa0a6',
  },
  todayDateText: {
    color: '#ffffff',
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
  },
  selectedDateText: {
    color: '#1a73e8',
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
  },
  taskIndicatorsContainer: {
    position: 'absolute',
    bottom: 4,
    left: 0,
    right: 0,
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  taskDotsContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  taskIndicator: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.2,
    shadowRadius: 1,
    elevation: 1,
  },
  moreTasksBadge: {
    backgroundColor: '#5f6368',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreTasksText: {
    fontSize: 7,
    color: '#ffffff',
    fontWeight: '600',
    fontFamily: 'Inter-SemiBold',
  },
  taskCountBadge: {
    backgroundColor: '#E8F0FE',
    borderRadius: 6,
    paddingHorizontal: 4,
    paddingVertical: 1,
    minWidth: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#1a73e8',
  },
  taskCountText: {
    fontSize: 7,
    color: '#1a73e8',
    fontWeight: '700',
    fontFamily: 'Inter-Bold',
  },
});

export default GoogleCalendar;