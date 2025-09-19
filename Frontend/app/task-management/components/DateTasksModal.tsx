import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  FlatList,
  ScrollView,
} from 'react-native';
import { MaterialIcons, Ionicons } from '@expo/vector-icons';
import { Task } from '../types/Task';

interface DateTasksModalProps {
  visible: boolean;
  onClose: () => void;
  selectedDate: Date | null;
  tasks: Task[];
  onTaskPress: (taskId: string) => void;
  onAddTask: (date: Date) => void;
}

const DateTasksModal: React.FC<DateTasksModalProps> = ({
  visible,
  onClose,
  selectedDate,
  tasks,
  onTaskPress,
  onAddTask,
}) => {
  if (!selectedDate) return null;

  const formatDate = (date: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else if (date.toDateString() === yesterday.toDateString()) {
      return 'Yesterday';
    } else {
      return date.toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });
    }
  };

  const getTaskStatusColor = (task: Task) => {
    if (task.completed) return '#34a853';
    if (task.overdue) return '#ea4335';
    return '#4285f4';
  };

  const getTaskStatusText = (task: Task) => {
    if (task.completed) return 'Completed';
    if (task.overdue) return 'Overdue';
    return 'Pending';
  };

  const getPriorityIcon = (priority: string) => {
    switch (priority) {
      case 'urgent-important':
        return { name: 'priority-high', color: '#ea4335' };
      case 'not-urgent-important':
        return { name: 'bookmark', color: '#fbbc04' };
      case 'urgent-not-important':
        return { name: 'schedule', color: '#ff9800' };
      case 'not-urgent-not-important':
        return { name: 'low-priority', color: '#34a853' };
      default:
        return { name: 'circle', color: '#9aa0a6' };
    }
  };

  const renderTaskItem = ({ item }: { item: Task }) => {
    const priorityIcon = getPriorityIcon(item.priority);
    
    return (
      <TouchableOpacity
        style={styles.taskItem}
        onPress={() => onTaskPress(item.id)}
      >
        <View style={styles.taskHeader}>
          <View style={styles.taskTitleContainer}>
            <MaterialIcons
              name={priorityIcon.name as any}
              size={16}
              color={priorityIcon.color}
              style={styles.priorityIcon}
            />
            <Text style={styles.taskTitle} numberOfLines={2}>
              {item.title}
            </Text>
          </View>
          <View
            style={[
              styles.taskStatus,
              { backgroundColor: getTaskStatusColor(item) + '15' }
            ]}
          >
            <Text
              style={[
                styles.taskStatusText,
                { color: getTaskStatusColor(item) }
              ]}
            >
              {getTaskStatusText(item)}
            </Text>
          </View>
        </View>

        {item.description && (
          <Text style={styles.taskDescription} numberOfLines={2}>
            {item.description}
          </Text>
        )}

        <View style={styles.taskFooter}>
          <View style={styles.taskMeta}>
            {item.category_name && (
              <View style={styles.categoryTag}>
                <Text style={styles.categoryText}>{item.category_name}</Text>
              </View>
            )}
            {item.due_time && (
              <View style={styles.timeContainer}>
                <MaterialIcons name="access-time" size={14} color="#5f6368" />
                <Text style={styles.timeText}>{item.due_time}</Text>
              </View>
            )}
          </View>
          <TouchableOpacity style={styles.taskActions}>
            <MaterialIcons name="more-vert" size={20} color="#5f6368" />
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent={true}
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.modalOverlay}>
        <View style={styles.modalContent}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <TouchableOpacity onPress={onClose} style={styles.closeButton}>
                <Ionicons name="arrow-back" size={24} color="#202124" />
              </TouchableOpacity>
              <View>
                <Text style={styles.headerTitle}>{formatDate(selectedDate)}</Text>
                <Text style={styles.headerSubtitle}>
                  {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
                </Text>
              </View>
            </View>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => onAddTask(selectedDate)}
            >
              <MaterialIcons name="add" size={24} color="#1a73e8" />
            </TouchableOpacity>
          </View>

          {/* Tasks List */}
          <View style={styles.content}>
            {tasks.length === 0 ? (
              <View style={styles.emptyState}>
                <MaterialIcons name="event-available" size={48} color="#dadce0" />
                <Text style={styles.emptyStateTitle}>No tasks for this date</Text>
                <Text style={styles.emptyStateSubtitle}>
                  Tap the + button to add a new task
                </Text>
                <TouchableOpacity
                  style={styles.emptyAddButton}
                  onPress={() => onAddTask(selectedDate)}
                >
                  <MaterialIcons name="add" size={20} color="#ffffff" />
                  <Text style={styles.emptyAddButtonText}>Add Task</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <FlatList
                data={tasks}
                keyExtractor={(item) => item.id}
                renderItem={renderTaskItem}
                showsVerticalScrollIndicator={false}
                contentContainerStyle={styles.tasksList}
              />
            )}
          </View>

          {/* Quick Add Button */}
          {tasks.length > 0 && (
            <TouchableOpacity
              style={styles.quickAddButton}
              onPress={() => onAddTask(selectedDate)}
            >
              <MaterialIcons name="add" size={24} color="#ffffff" />
              <Text style={styles.quickAddButtonText}>Add Task</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#ffffff',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    maxHeight: '85%',
    minHeight: '50%',
    elevation: 16,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
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
    marginRight: 12,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#202124',
    fontFamily: 'Inter-SemiBold',
  },
  headerSubtitle: {
    fontSize: 14,
    color: '#5f6368',
    marginTop: 2,
    fontFamily: 'Inter-Regular',
  },
  addButton: {
    padding: 10,
    borderRadius: 24,
    backgroundColor: '#e8f0fe',
  },
  content: {
    flex: 1,
  },
  tasksList: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  taskItem: {
    backgroundColor: '#ffffff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#e8eaed',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.05,
    shadowRadius: 2,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  taskTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  priorityIcon: {
    marginRight: 8,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#202124',
    flex: 1,
    fontFamily: 'Inter-Medium',
  },
  taskStatus: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  taskStatusText: {
    fontSize: 12,
    fontWeight: '500',
    fontFamily: 'Inter-Medium',
  },
  taskDescription: {
    fontSize: 14,
    color: '#5f6368',
    marginBottom: 12,
    lineHeight: 20,
    fontFamily: 'Inter-Regular',
  },
  taskFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  taskMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  categoryTag: {
    backgroundColor: '#f1f3f4',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  categoryText: {
    fontSize: 12,
    color: '#1a73e8',
    fontWeight: '500',
    fontFamily: 'Inter-Medium',
  },
  timeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  timeText: {
    fontSize: 12,
    color: '#5f6368',
    fontFamily: 'Inter-Regular',
  },
  taskActions: {
    padding: 4,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
    paddingVertical: 60,
  },
  emptyStateTitle: {
    fontSize: 20,
    fontWeight: '500',
    color: '#202124',
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
    fontFamily: 'Inter-Medium',
  },
  emptyStateSubtitle: {
    fontSize: 14,
    color: '#5f6368',
    textAlign: 'center',
    marginBottom: 24,
    fontFamily: 'Inter-Regular',
  },
  emptyAddButton: {
    backgroundColor: '#1a73e8',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 24,
    gap: 8,
    elevation: 4,
    shadowColor: '#1a73e8',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  emptyAddButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '500',
    fontFamily: 'Inter-Medium',
  },
  quickAddButton: {
    backgroundColor: '#1a73e8',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
    marginVertical: 16,
    paddingVertical: 14,
    borderRadius: 24,
    gap: 8,
    elevation: 4,
    shadowColor: '#1a73e8',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  quickAddButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '500',
    fontFamily: 'Inter-Medium',
  },
});

export default DateTasksModal;