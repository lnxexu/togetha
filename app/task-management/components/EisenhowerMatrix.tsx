import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Task } from '../types/Task';

interface EisenhowerMatrixProps {
  tasks: Task[];
  onTaskPress: (taskId: string) => void;
  onAddTask: (quadrant: string) => void;
  onDeleteTask: (taskId: string) => void;
  onMarkComplete: (taskId: string) => void;
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
    subtitle: 'DO FIRST',
    color: '#rgba(248, 113, 113, 0.5)',
    borderColor: '#FF4444',
    priority: 'urgent-important',
    icon: '',
  },
  'not-urgent-important': {
    title: 'Urgent & Not Important',
    subtitle: 'SCHEDULE',
    color: '#rgba(52, 211, 153, 0.5)',
    borderColor: '#34D399',
    priority: 'not-urgent-important',
    icon: '',
  },
  'urgent-not-important': {
    title: 'Not Urgent & Important',
    subtitle: 'DELEGATE',
    color: '#rgba(251, 191, 36, 0.5)',
    borderColor: '#FBBF24',
    priority: 'urgent-not-important',
    icon: '',
  },
  'not-urgent-not-important': {
    title: 'Not Urgent & Not Important',
    subtitle: 'ELIMINATE',
    color: '#rgba(156, 163, 175, 0.5)',
    borderColor: '#888888',
    priority: 'not-urgent-not-important',
    icon: '',
  },
};

const EisenhowerMatrix: React.FC<EisenhowerMatrixProps> = ({
  tasks,
  onTaskPress,
  onAddTask,
  onDeleteTask,
  onMarkComplete,
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
          text: 'Mark Complete',
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

  const renderQuadrant = (quadrantKey: string) => {
    const quadrant = quadrants[quadrantKey];
    const quadrantTasks = getTasksByQuadrant(quadrant.priority);

    return (
      <View key={quadrantKey} style={[
        styles.quadrant,
        {
          backgroundColor: quadrant.color,
          borderLeftColor: quadrant.borderColor,
          borderLeftWidth: 4,
          borderColor: 'transparent',
        },
      ]}>
        <View style={[styles.quadrantHeader, { backgroundColor: quadrant.color }]}> 
          {/* Removed icon */}
          <Text style={styles.quadrantTitle}>{quadrant.title}</Text>
          <View style={styles.taskCountContainer}>
            <Text style={styles.taskCountText}>{quadrantTasks.length}</Text>
          </View>
        </View>
        <Text style={styles.quadrantSubtitle}>{quadrant.subtitle}</Text>
        <ScrollView style={styles.taskList} showsVerticalScrollIndicator={false}>
          {quadrantTasks.length === 0 ? (
            <TouchableOpacity
              style={styles.emptyQuadrant}
              onPress={() => onAddTask(quadrant.priority)}
            >
              <MaterialIcons name="add-circle-outline" size={32} color="#bdc3c7" />
              <Text style={styles.emptyText}>Add your first task</Text>
            </TouchableOpacity>
          ) : (
            quadrantTasks.map(task => (
              <View key={task.id} style={styles.taskRow}>
                <TouchableOpacity 
                  style={styles.checkbox}
                  onPress={() => onMarkComplete(task.id)}
                >
                  <MaterialIcons 
                    name={task.completed ? "check-box" : "check-box-outline-blank"}
                    size={16} 
                    color={task.completed ? '#27ae60' : (task.overdue ? '#e74c3c' : '#7f8c8d')} 
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.taskTextContainer}
                  onPress={() => onTaskPress(task.id)}
                  onLongPress={() => handleTaskLongPress(task)}
                >
                  <Text style={[
                    styles.taskText, 
                    task.overdue && !task.completed && styles.overdueTaskText,
                    task.completed && styles.completedTaskText
                  ]} numberOfLines={2}>
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
      <View style={styles.matrix}>
        <View style={styles.matrixRow}>
          {renderQuadrant('urgent-important')}
          {renderQuadrant('not-urgent-important')}
        </View>
        <View style={styles.matrixRow}>
          {renderQuadrant('urgent-not-important')}
          {renderQuadrant('not-urgent-not-important')}
        </View>
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  matrix: {
    flex: 1,
  },
  matrixRow: {
    flexDirection: 'row',
    flex: 1,
    marginBottom: 10,
  },
  quadrant: {
    flex: 1,
    marginHorizontal: 5,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 0,
    minHeight: 250,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3.84,
    elevation: 5,
  },
  quadrantHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
  },
  quadrantTitle: {
    flex: 1,
    fontSize: 13,
    fontFamily: 'Inter-Medium',
    color: '#fff',
    // marginLeft removed since no icon
  },
  taskCountContainer: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 2,
    minWidth: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  taskCountText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 13,
    fontFamily: 'Inter-Medium',
  },

  quadrantSubtitle: {
    fontSize: 10,
    color: '#ffffffff',
    textAlign: 'center',
    paddingHorizontal: 12,
    paddingTop: 4,
    fontFamily: 'Inter-Regular',
  },
  taskList: {
    flex: 1,
    padding: 8,
  },
  emptyQuadrant: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  emptyText: {
    fontSize: 12,
    color: '#bdc3c7',
    marginTop: 8,
    textAlign: 'center',
    fontFamily: 'Inter-Regular',
  },
  taskRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    fontWeight: '400',
    color: '#ffffffff',
    lineHeight: 16,
    fontFamily: 'Inter-Regular',
  },
  overdueTaskText: {
    color: '#e74c3c',
    fontWeight: '500',
  },
  completedTaskText: {
    color: '#95a5a6',
    textDecorationLine: 'line-through',
    opacity: 0.7,
  },
});

export default EisenhowerMatrix;
