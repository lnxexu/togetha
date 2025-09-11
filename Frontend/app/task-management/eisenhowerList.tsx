import { Ionicons, MaterialIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import React from 'react';
import {
    Alert,
    Dimensions,
    FlatList,
    Platform,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from 'react-native';
import Navbar from '../NavBar';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Task } from './types/Task';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;
type EisenhowerListRouteProp = RouteProp<RootStackParamList, 'EisenhowerList'>;

interface QuadrantData {
  title: string;
  subtitle: string;
  color: string;
  borderColor: string;
  priority: string;
}

const quadrants: Record<string, QuadrantData> = {
  'urgent-important': {
    title: 'Urgent & Important',
    subtitle: 'DO FIRST',
    color: '#FF6B6B',
    borderColor: '#FF5252',
    priority: 'urgent-important',
  },
  'not-urgent-important': {
    title: 'Not Urgent & Important',
    subtitle: 'SCHEDULE',
    color: '#4ECDC4',
    borderColor: '#26A69A',
    priority: 'not-urgent-important',
  },
  'urgent-not-important': {
    title: 'Urgent & Not Important',
    subtitle: 'DELEGATE',
    color: '#FFE066',
    borderColor: '#FFC107',
    priority: 'urgent-not-important',
  },
  'not-urgent-not-important': {
    title: 'Not Urgent & Not Important',
    subtitle: 'ELIMINATE',
    color: '#A8A8A8',
    borderColor: '#757575',
    priority: 'not-urgent-not-important',
  },
};

const EisenhowerListPage: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<EisenhowerListRouteProp>();
  
  const { tasks, quadrant, onMarkComplete, onDeleteTask } = route.params;
  const quadrantData = quadrants[quadrant];
  
  const quadrantTasks = tasks.filter(task => task.priority === quadrant);

  const handleTaskPress = (taskId: string) => {
    navigation.navigate('TaskDetails', { taskId });
  };

  const handleBackPress = () => {
    navigation.goBack();
  };

  const handleTaskLongPress = (task: Task) => {
    Alert.alert(
      task.title,
      'What would you like to do?',
      [
        { text: 'View Details', onPress: () => handleTaskPress(task.id) },
        {
          text: task.completed ? 'Mark Incomplete' : 'Mark Complete',
          onPress: () => { if (onMarkComplete) onMarkComplete(task.id); },
          style: 'default',
        },
        {
          text: 'Delete',
          onPress: () => { if (onDeleteTask) onDeleteTask(task.id); },
          style: 'destructive',
        },
        { text: 'Cancel', style: 'cancel' },
      ]
    );
  };

  const renderTaskItem = ({ item: task }: { item: Task }) => {
    return (
      <TouchableOpacity
        style={[
          styles.taskCard,
          { borderLeftColor: quadrantData.borderColor },
          task.overdue && !task.completed && styles.overdueTask,
          task.completed && styles.completedTask,
        ]}
        onPress={() => handleTaskPress(task.id)}
        onLongPress={() => handleTaskLongPress(task)}
      >
        <LinearGradient
          colors={task.completed ? ['#F8F9FA', '#F8F9FA'] : ['#FFFFFF', '#FAFBFC']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={styles.taskGradient}
        >
          <View style={styles.taskContent}>
            <View style={styles.taskHeader}>
              <View style={styles.taskTextSection}>
                <View style={styles.titleRow}>
                  <View style={[styles.priorityDot, { backgroundColor: quadrantData.color }]} />
                  <Text style={[
                    styles.taskTitle,
                    task.completed && styles.completedTaskTitle
                  ]} numberOfLines={2}>
                    {task.title}
                  </Text>
                </View>
                {task.description && (
                  <Text style={styles.taskDescription} numberOfLines={2}>
                    {task.description}
                  </Text>
                )}
                {task.due_datetime && (
                  <View style={styles.dateContainer}>
                    <MaterialIcons name="schedule" size={14} color={task.overdue ? '#FF5252' : '#64748B'} />
                    <Text style={[styles.taskDate, task.overdue && styles.overdueText]}>
                      {new Date(task.due_datetime).toLocaleDateString()}
                    </Text>
                  </View>
                )}
                {task.category && (
                  <View style={styles.categoryContainer}>
                    <Text style={[styles.categoryText, { color: quadrantData.borderColor }]}>
                      {task.category}
                    </Text>
                  </View>
                )}
              </View>
              <TouchableOpacity
                style={[styles.statusButton, { backgroundColor: task.completed ? '#E8F5E8' : '#F5F5F5' }]}
                onPress={() => { if (onMarkComplete) onMarkComplete(task.id); }}
              >
                <MaterialIcons
                  name={task.completed ? 'check-circle' : 'radio-button-unchecked'}
                  size={28}
                  color={task.completed ? '#4CAF50' : '#BDBDBD'}
                />
              </TouchableOpacity>
            </View>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const renderEmptyState = () => (
    <View style={styles.emptyContainer}>
      <View style={[styles.emptyIconContainer, { backgroundColor: `${quadrantData.color}15` }]}>
        <MaterialIcons name="task-alt" size={64} color={quadrantData.color} />
      </View>
      <Text style={styles.emptyTitle}>No tasks in this quadrant</Text>
      <Text style={styles.emptyDescription}>
        Tasks added to "{quadrantData.subtitle}" priority will appear here
      </Text>
      <TouchableOpacity 
        style={[styles.addTaskButton, { backgroundColor: quadrantData.borderColor }]}
        onPress={() => navigation.navigate('AddTask', { quadrant: quadrant as "urgent-important" | "not-urgent-important" | "urgent-not-important" | "not-urgent-not-important" })}
      >
        <MaterialIcons name="add" size={20} color="#FFFFFF" />
        <Text style={styles.addTaskButtonText}>Add Task</Text>
      </TouchableOpacity>
    </View>
  );

  return (
    <View style={styles.container}>
      {/* Header with Gradient */}
      <LinearGradient
        colors={['#A855F7', '#8B5CF6', '#7C3AED']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.header}
      >
        <View style={styles.headerTopRow}>
          <TouchableOpacity 
            style={styles.backButton}
            onPress={handleBackPress}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <View style={styles.headerTitleSection}>
            <Text style={styles.title}>{quadrantData.title}</Text>
            <Text style={styles.subtitle}>{quadrantData.subtitle}</Text>
          </View>
          <View style={[styles.taskCountContainer, { backgroundColor: quadrantData.borderColor }]}>
            <Text style={styles.taskCountText}>{quadrantTasks.length}</Text>
          </View>
        </View>
        
        <View style={[styles.priorityBadge, { backgroundColor: quadrantData.color }]}>
          <MaterialIcons name="flag" size={16} color="#FFFFFF" style={styles.flagIcon} />
          <Text style={styles.priorityText}>{quadrantData.subtitle}</Text>
        </View>
      </LinearGradient>

      {/* Content */}
      <View style={styles.content}>
        <FlatList
          data={quadrantTasks}
          renderItem={renderTaskItem}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContainer}
          ListEmptyComponent={renderEmptyState}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      </View>

      <Navbar activeRoute="ToDo" />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 24,
    paddingTop: Platform.OS === 'ios' ? 60 : 45,
    paddingBottom: 30,
    backgroundColor: "#F5E1FD",
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#fff',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },
  headerTitleSection: {
    flex: 1,
  },
  title: {
    fontSize: 24,
    color: '#6A009C',
    fontFamily: 'Inter-Bold',
    lineHeight: 28,
  },
  subtitle: {
    fontSize: 14,
    color: '#64748B',
    fontFamily: 'Inter-Medium',
    marginTop: 2,
  },
  taskCountContainer: {
    backgroundColor: '#6A009C',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
    minWidth: 32,
    alignItems: 'center',
  },
  taskCountText: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 16,
    fontFamily: 'Inter-Bold',
  },
  priorityBadge: {
    alignSelf: 'flex-start',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
  },
  priorityText: {
    fontSize: 12,
    color: '#fff',
    fontFamily: 'Inter-Bold',
    fontWeight: '600',
  },
  content: {
    flex: 1,
    paddingTop: 190,
    paddingBottom: 100,
  },
  listContainer: {
    paddingHorizontal: 24,
    paddingTop: 20,
    flexGrow: 1,
  },
  taskCard: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    borderLeftWidth: 4,
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
  taskContent: {
    flex: 1,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  taskTextSection: {
    flex: 1,
    marginRight: 12,
  },
  taskTitle: {
    fontSize: 16,
    color: '#2c3e50',
    fontFamily: 'Inter-SemiBold',
    lineHeight: 20,
    marginBottom: 4,
  },
  completedTaskTitle: {
    color: '#95a5a6',
    textDecorationLine: 'line-through',
  },
  taskDescription: {
    fontSize: 14,
    color: '#64748B',
    fontFamily: 'Inter-Regular',
    lineHeight: 18,
    marginBottom: 8,
  },
  taskDate: {
    fontSize: 12,
    color: '#64748B',
    fontFamily: 'Inter-Medium',
  },
  overdueText: {
    color: '#e74c3c',
    fontWeight: '600',
  },
  statusButton: {
    padding: 4,
  },
  categoryContainer: {
    marginTop: 12,
    alignSelf: 'flex-start',
  },
  categoryText: {
    fontSize: 12,
    color: '#6A009C',
    fontFamily: 'Inter-Medium',
    backgroundColor: '#f3e8ff',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  separator: {
    height: 12,
  },
  taskGradient: {
    padding: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  priorityDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 8,
  },
  dateContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  dateText: {
    fontSize: 12,
    color: '#95a5a6',
    marginLeft: 4,
  },
  flagIcon: {
    marginLeft: 4,
  },
  emptyIconContainer: {
    width: 120,
    height: 120,
    borderRadius: 60,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  addTaskButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 4,
  },
  addTaskButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    marginLeft: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingVertical: 64,
  },
  emptyTitle: {
    fontSize: 20,
    color: '#64748B',
    fontFamily: 'Inter-SemiBold',
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyDescription: {
    fontSize: 14,
    color: '#94a3b8',
    fontFamily: 'Inter-Regular',
    textAlign: 'center',
    lineHeight: 20,
  },
});

export default EisenhowerListPage;
