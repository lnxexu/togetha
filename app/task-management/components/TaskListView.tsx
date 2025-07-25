import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  Alert,
  ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Task } from '../types/Task';

interface TaskListViewProps {
  tasks: Task[];
  onTaskPress: (taskId: string) => void;
  onDeleteTask: (taskId: string) => void;
  onMarkComplete: (taskId: string) => void;
  categories: string[];
  selectedCategory: string;
  onCategoryChange: (category: string) => void;
}

interface QuadrantData {
  title: string;
  subtitle: string;
  color: string;
  borderColor: string;
  priority: string;
  icon: string;
}

const quadrants: Record<string, QuadrantData> = {
  'urgent-important': {
    title: 'Urgent & Important',
    subtitle: 'Urgent & Important',
    color: '#F87171',
    borderColor: '#D6D6D6',
    priority: 'urgent-important',
    icon: 'emergency',
  },
  'not-urgent-important': {
    title: 'Not Urgent & Important',
    subtitle: 'Important, Not Urgent',
    color: '#34D399',
    borderColor: '#D6D6D6',
    priority: 'not-urgent-important',
    icon: 'schedule',
  },
  'urgent-not-important': {
    title: 'Urgent & Not Important',
    subtitle: 'Urgent, Not Important',
    color: '#FBBF24',
    borderColor: '#D6D6D6',
    priority: 'urgent-not-important',
    icon: 'fast-forward',
  },
  'not-urgent-not-important': {
    title: 'Not Urgent & Not Important',
    subtitle: 'Neither Urgent nor Important',
    color: '#9CA3AF',
    borderColor: '#D6D6D6',
    priority: 'not-urgent-not-important',
    icon: 'delete-outline',
  },
};

const TaskListView: React.FC<TaskListViewProps> = ({
  tasks,
  onTaskPress,
  onDeleteTask,
  onMarkComplete,
  categories,
  selectedCategory,
  onCategoryChange,
}) => {
  const getTasksByQuadrant = (priority: string) => {
    return tasks.filter(task => task.priority === priority);
  };

  const handleTaskLongPress = (task: Task) => {
    Alert.alert(
      task.title,
      'What would you like to do?',
      [
        { text: 'View Details', onPress: () => onTaskPress(task.id) },
        {
          text: task.completed ? 'Mark Incomplete' : 'Mark Complete',
          onPress: () => onMarkComplete(task.id),
          style: 'default',
        },
        {
          text: 'Delete',
          onPress: () => onDeleteTask(task.id),
          style: 'destructive',
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const renderTaskCard = ({ item: task }: { item: Task }) => {
    const quadrant = quadrants[task.priority];
    
    return (
      <TouchableOpacity
        style={[
          styles.taskCard,
          { 
            borderLeftColor: quadrant?.color || '#ecf0f1',
            borderColor: quadrant?.color || '#e9ecef'
          },
          task.overdue && !task.completed && styles.overdueTask,
          task.completed && styles.completedTask,
        ]}
        onPress={() => onTaskPress(task.id)}
        onLongPress={() => handleTaskLongPress(task)}
      >
        <View style={styles.cardContent}>
          <View style={styles.cardTopSection}>
            <View style={styles.cardTextSection}>
              <Text style={[
                styles.cardTitle, 
                task.completed && styles.completedTaskTitle
              ]} numberOfLines={2}>
                {task.title}
              </Text>
              {task.dueDate && (
                <Text style={[styles.cardDate, task.overdue && styles.overdueText]}>
                  {task.dueDate.toLocaleDateString()}
                </Text>
              )}
            </View>
            <TouchableOpacity
              style={styles.statusButton}
              onPress={() => onMarkComplete(task.id)}
            >
              <MaterialIcons
                name={task.completed ? 'check-circle' : 'radio-button-unchecked'}
                size={20}
                color={task.completed ? '#27ae60' : '#bdc3c7'}
              />
            </TouchableOpacity>
          </View>
        </View>
      </TouchableOpacity>
    );
  };

  const renderQuadrantSection = (quadrantKey: string) => {
    const quadrant = quadrants[quadrantKey];
    const quadrantTasks = getTasksByQuadrant(quadrant.priority);

    return (
      <View key={quadrantKey} style={styles.quadrantSection}>
        <View style={styles.sectionHeader}>
          <View style={[styles.titleCard, { backgroundColor: quadrant.color }]}> 
            <Text style={styles.quadrantTitle}>{quadrant.title}</Text>
          </View>
          <View style={styles.taskCount}>
            <Text style={styles.taskCountText}>{quadrantTasks.length}</Text>
          </View>
        </View>
        {quadrantTasks.length === 0 ? (
          <View style={styles.emptyQuadrant}>
            <Text style={styles.emptyText}>No tasks in this category</Text>
          </View>
        ) : (
          <FlatList
            data={quadrantTasks}
            renderItem={renderTaskCard}
            keyExtractor={item => item.id}
            horizontal={true}
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.horizontalList}
            ItemSeparatorComponent={() => <View style={styles.cardSeparator} />}
          />
        )}
      </View>
    );
  };

  return (
    <ScrollView style={styles.container} showsVerticalScrollIndicator={false}>
      {/* Vertical Eisenhower Matrix with Horizontal Task Cards */}
      <View style={styles.matrixContainer}>
        {renderQuadrantSection('urgent-important')}
        {renderQuadrantSection('not-urgent-important')}
        {renderQuadrantSection('urgent-not-important')}
        {renderQuadrantSection('not-urgent-not-important')}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    marginTop: 40,
  },
  matrixContainer: {
    paddingBottom: 20,
    paddingHorizontal: 4,
  },
  quadrantSection: {
    marginBottom: 16,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 15,
  },
  titleCard: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
  },
  quadrantTitle: {
    fontSize: 13,
    color: '#fff',
    fontFamily: 'Inter-Medium',
  },
  taskCount: {
    backgroundColor: '#f8f9fa',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  taskCountText: {
    fontSize: 12,
    color: '#2c3e50',
    fontFamily: 'Inter-Bold',
  },
  emptyQuadrant: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
    paddingHorizontal: 16,
  },
  emptyText: {
    fontSize: 12,
    color: '#bdc3c7',
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
  },
  horizontalList: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  cardSeparator: {
    width: 12,
  },
  taskCard: {
    width: 200,
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    borderLeftWidth: 3,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  overdueTask: {
    borderLeftColor: '#e74c3c',
    backgroundColor: '#fdf2f2',
  },
  completedTask: {
    backgroundColor: '#f8f9fa',
    opacity: 0.7,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    marginBottom: 8,
  },
  cardContent: {
    flex: 1,
  },
  cardTopSection: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTextSection: {
    flex: 1,
    marginRight: 8,
  },
  statusButton: {
    padding: 2,
  },
  cardTitle: {
    fontSize: 14,
    color: '#2c3e50',
    lineHeight: 18,
    fontFamily: 'Inter-Regular',
    marginBottom: 4,
  },
  completedTaskTitle: {
    color: '#95a5a6',
    textDecorationLine: 'line-through',
  },
  cardSubject: {
    fontSize: 11,
    color: '#AD00FF',
    marginBottom: 6,
    fontFamily: 'Inter-Medium',
  },
  cardDescription: {
    fontSize: 12,
    color: '#7f8c8d',
    lineHeight: 16,
    marginBottom: 8,
    fontFamily: 'Inter-Regular',
  },
  cardFooter: {
    marginTop: 'auto',
  },
  cardDate: {
    fontSize: 10,
    color: '#7f8c8d',
    fontFamily: 'Inter-Regular',
    marginTop: 2,
  },
  overdueText: {
    color: '#e74c3c',
    fontWeight: '500',
  },
});

export default TaskListView;
