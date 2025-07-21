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
    return tasks.filter(task => task.priority === priority && !task.completed);
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
              <TouchableOpacity
                key={task.id}
                style={[styles.taskItem, task.overdue && styles.overdueTask]}
                onPress={() => onTaskPress(task.id)}
                onLongPress={() => handleTaskLongPress(task)}
              >
                <View style={styles.taskContent}>
                  <Text style={styles.taskTitle} numberOfLines={2}>
                    {task.title}
                  </Text>
                  {task.subject && (
                    <Text style={styles.taskSubject}>{task.subject}</Text>
                  )}
                  <View style={styles.taskMeta}>
                    {task.dueDate && (
                      <Text style={[styles.taskDate, task.overdue && styles.overdueText]}>
                        {task.dueDate.toLocaleDateString()}
                      </Text>
                    )}
                  </View>
                </View>
              </TouchableOpacity>
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
  taskItem: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 10,
    marginBottom: 6,
    borderLeftWidth: 3,
    borderLeftColor: '#ecf0f1',
  },
  overdueTask: {
    borderLeftColor: '#e74c3c',
    backgroundColor: '#fdf2f2',
  },
  taskContent: {
    flex: 1,
  },
  taskTitle: {
    fontSize: 12,
    fontWeight: '500',
    color: '#2c3e50',
    lineHeight: 16,
    fontFamily: 'Inter-Medium',
  },
  taskSubject: {
    fontSize: 10,
    color: '#313131ff',
    marginTop: 2,
    fontFamily: 'Inter-Regular',
  },
  taskMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  taskDate: {
    fontSize: 10,
    color: '#7f8c8d',
    fontFamily: 'Inter-Regular',
  },
  overdueText: {
    color: '#e74c3c',
    fontWeight: '500',
  },
  taskIndicators: {
    flexDirection: 'row',
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 8,
  },
  indicatorText: {
    fontSize: 10,
    color: '#7f8c8d',
    marginLeft: 2,
    fontFamily: 'Inter-Regular',
  },
});

export default EisenhowerMatrix;
