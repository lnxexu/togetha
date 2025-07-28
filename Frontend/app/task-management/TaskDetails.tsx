import React, { useState, useCallback } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    SafeAreaView,
    Platform,
    Alert,
    TextInput,
    Modal,
    ScrollView,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useRoute, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import { Task, Priority } from './types/Task';
import { taskService } from './services/taskService';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const TaskDetails: React.FC = () => {
    const navigation = useNavigation<NavigationProp>();
    const route = useRoute();
    const { taskId } = route.params as { taskId: string };
    
    const [task, setTask] = useState<Task | null>(null);
    const [isEditing, setIsEditing] = useState(false);
    const [editedTitle, setEditedTitle] = useState('');
    const [editedDescription, setEditedDescription] = useState('');
    const [editedPriority, setEditedPriority] = useState<Priority>('not-urgent-not-important');
    const [editedSubject, setEditedSubject] = useState('');
    const [showPriorityModal, setShowPriorityModal] = useState(false);
    const [showSubjectModal, setShowSubjectModal] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const priorityOptions = [
        { value: 'urgent-important', label: 'Urgent & Important', color: '#dc3545' },
        { value: 'not-urgent-important', label: 'Important', color: '#28a745' },
        { value: 'urgent-not-important', label: 'Urgent', color: '#ffc107' },
        { value: 'not-urgent-not-important', label: 'Neither', color: '#6c757d' },
    ];

    const subjectOptions = [
        'Computer Science',
        'Mathematics',
        'Health',
        'Programming',
        'Personal',
        'Work',
        'Study',
        'Other',
    ];

    // Load task when screen is focused
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
      setTask(fetchedTask);
      setEditedTitle(fetchedTask.title);
      setEditedDescription(fetchedTask.description || '');
      setEditedPriority(fetchedTask.priority);
      setEditedSubject(fetchedTask.subject || '');
    } else {
      Alert.alert('Error', 'Task not found');
      navigation.goBack();
    }
  } catch (error) {
    console.error('Error loading task:', error);
    Alert.alert('Error', 'Failed to load task');
  } finally {
    setIsLoading(false);
  }
};
    const handleEdit = () => {
        setIsEditing(true);
    };

    const handleSave = async () => {
        if (!task) return;
        
        try {
            // In a real app, you would update via taskService
            // await taskService.updateTask(taskId, { 
            //     title: editedTitle, 
            //     description: editedDescription,
            //     priority: editedPriority,
            //     subject: editedSubject 
            // });
            
            // Update local state for demonstration
            setTask({
                ...task,
                title: editedTitle,
                description: editedDescription,
                priority: editedPriority,
                subject: editedSubject,
                updatedAt: new Date(),
            });
            
            setIsEditing(false);
            Alert.alert('Success', 'Task updated successfully');
        } catch (error) {
            Alert.alert('Error', 'Failed to update task');
        }
    };

    const handleCancel = () => {
        if (task) {
            setEditedTitle(task.title);
            setEditedDescription(task.description || '');
            setEditedPriority(task.priority);
            setEditedSubject(task.subject || '');
        }
        setIsEditing(false);
    };

    const handleMarkAsDone = async () => {
        if (!task) return;
        
        try {
            // In a real app, you would update via taskService
            // await taskService.markTaskComplete(taskId);
            
            // Update local state for demonstration
            setTask({
                ...task,
                completed: !task.completed,
                completedAt: !task.completed ? new Date() : undefined,
                updatedAt: new Date(),
            });
            
            Alert.alert('Success', task.completed ? 'Task marked as pending' : 'Task marked as completed');
        } catch (error) {
            Alert.alert('Error', 'Failed to update task');
        }
    };

    const getPriorityLabel = (priority: string) => {
        switch (priority) {
            case 'urgent-important':
                return 'Urgent & Important';
            case 'not-urgent-important':
                return 'Important';
            case 'urgent-not-important':
                return 'Urgent';
            case 'not-urgent-not-important':
                return 'Neither';
            default:
                return priority;
        }
    };

    const getPriorityColor = (priority: string) => {
        switch (priority) {
            case 'urgent-important':
                return '#dc3545';
            case 'not-urgent-important':
                return '#28a745';
            case 'urgent-not-important':
                return '#ffc107';
            case 'not-urgent-not-important':
                return '#6c757d';
            default:
                return '#6c757d';
        }
    };

    const formatDate = (date?: Date) => {
        if (!date) return 'No date set';
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(today.getDate() + 1);
        
        if (date.toDateString() === today.toDateString()) {
            return 'Today';
        } else if (date.toDateString() === tomorrow.toDateString()) {
            return 'Tomorrow';
        } else {
            return date.toLocaleDateString('en-US', { 
                weekday: 'short', 
                month: 'short', 
                day: 'numeric' 
            });
        }
    };

    if (!task) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Loading task...</Text>
                </View>
            </SafeAreaView>
        );
    }

    return (
        <SafeAreaView style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <TouchableOpacity 
                    style={styles.backButton}
                    onPress={() => navigation.goBack()}
                >
          <Ionicons name="chevron-back" size={24} color="#333" />
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
                            <TouchableOpacity
                                style={styles.saveButton}
                                onPress={handleSave}
                            >
                                <Text style={styles.saveButtonText}>Save</Text>
                            </TouchableOpacity>
                        </>
                    ) : (
                        <TouchableOpacity
                            style={styles.editButton}
                            onPress={handleEdit}
                        >
                            <MaterialIcons name="edit" size={20} color="#6A009C" />
                            <Text style={styles.editButtonText}>Edit</Text>
                        </TouchableOpacity>
                    )}
                </View>
            </View>

            {/* Content */}
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
                        />
                    ) : (
                        <Text style={styles.taskName}>{task.title}</Text>
                    )}
                </View>

                {/* Info Cards */}
                <View style={styles.infoCardsContainer}>
                    {/* Date Card */}
                    <View style={styles.infoCard}>
                        <Text style={styles.cardValue}>{formatDate(task.dueDate)}</Text>
                    </View>

                    {/* Time Card */}
                    <View style={styles.infoCard}>
                        <Text style={styles.cardValue}>{task.dueTime || 'No time set'}</Text>
                    </View>

                    {/* Priority Card */}
                    <TouchableOpacity 
                        style={[styles.infoCard, isEditing && styles.editableCard]}
                        onPress={isEditing ? () => setShowPriorityModal(true) : undefined}
                        disabled={!isEditing}
                    >
                        <Text style={[styles.cardValue, { color: getPriorityColor(isEditing ? editedPriority : task.priority) }]}>
                            {getPriorityLabel(isEditing ? editedPriority : task.priority)}
                        </Text>
                        {isEditing && <MaterialIcons name="edit" size={14} color="#6A009C" style={styles.cardEditIcon} />}
                    </TouchableOpacity>

                    {/* Subject Card */}
                    <TouchableOpacity 
                        style={[styles.infoCard, isEditing && styles.editableCard]}
                        onPress={isEditing ? () => setShowSubjectModal(true) : undefined}
                        disabled={!isEditing}
                    >
                        <Text style={styles.cardValue}>{(isEditing ? editedSubject : task.subject) || 'No subject'}</Text>
                        {isEditing && <MaterialIcons name="edit" size={14} color="#6A009C" style={styles.cardEditIcon} />}
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
                        />
                    ) : (
                        <Text style={styles.description}>
                            {task.description || 'No description provided'}
                        </Text>
                    )}
                </View>
            </View>

            {/* Mark as Done Button - Fixed position in lower right */}
            <TouchableOpacity
                style={styles.markAsDoneButton}
                onPress={handleMarkAsDone}
            >
                <Text style={styles.markAsDoneButtonText}>
                    {task.completed ? 'Mark Pending' : 'Mark as Done'}
                </Text>
            </TouchableOpacity>

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
                                        editedPriority === option.value && styles.selectedOption
                                    ]}
                                    onPress={() => {
                                        setEditedPriority(option.value as Priority);
                                        setShowPriorityModal(false);
                                    }}
                                >
                                    <Text style={[styles.modalOptionText, { color: option.color }]}>
                                        {option.label}
                                    </Text>
                                    {editedPriority === option.value && (
                                        <MaterialIcons name="check" size={20} color={option.color} />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Subject Selection Modal */}
            <Modal
                visible={showSubjectModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowSubjectModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select Subject</Text>
                            <TouchableOpacity
                                onPress={() => setShowSubjectModal(false)}
                                style={styles.modalCloseButton}
                            >
                                <MaterialIcons name="close" size={24} color="#666" />
                            </TouchableOpacity>
                        </View>
                        <ScrollView style={styles.modalList}>
                            {subjectOptions.map((subject) => (
                                <TouchableOpacity
                                    key={subject}
                                    style={[
                                        styles.modalOption,
                                        editedSubject === subject && styles.selectedOption
                                    ]}
                                    onPress={() => {
                                        setEditedSubject(subject);
                                        setShowSubjectModal(false);
                                    }}
                                >
                                    <Text style={styles.modalOptionText}>
                                        {subject}
                                    </Text>
                                    {editedSubject === subject && (
                                        <MaterialIcons name="check" size={20} color="#6A009C" />
                                    )}
                                </TouchableOpacity>
                            ))}
                            {/* Custom Subject Input */}
                            <View style={styles.customSubjectContainer}>
                                <Text style={styles.customSubjectLabel}>Or enter custom subject:</Text>
                                <TextInput
                                    style={styles.customSubjectInput}
                                    placeholder="Enter custom subject"
                                    value={editedSubject && !subjectOptions.includes(editedSubject) ? editedSubject : ''}
                                    onChangeText={(text) => setEditedSubject(text)}
                                    onSubmitEditing={() => setShowSubjectModal(false)}
                                />
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>
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
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 20,
        paddingTop: Platform.OS === 'ios' ? 40 : 40,
        paddingBottom: 16,
        backgroundColor: '#F8FAFC',
        borderBottomWidth: 1,
        borderBottomColor: '#e9ecef',
    },
    backButton: {
        padding: 8,
        borderRadius: 8,
    },
    headerTitle: {
        fontSize: 18,
        fontFamily: 'Inter-Bold',
        color: '#2c3e50',
        flex: 1,
        textAlign: 'left',
    },
    headerActions: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
    },
    editButton: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#f0e6ff',
        borderRadius: 8,
        gap: 4,
    },
    editButtonText: {
        fontSize: 14,
        color: '#6A009C',
        fontFamily: 'Inter-Medium',
    },
    cancelButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#f8f9fa',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#dee2e6',
    },
    cancelButtonText: {
        fontSize: 14,
        color: '#6c757d',
        fontFamily: 'Inter-Medium',
    },
    saveButton: {
        paddingHorizontal: 12,
        paddingVertical: 8,
        backgroundColor: '#6A009C',
        borderRadius: 8,
    },
    saveButtonText: {
        fontSize: 14,
        color: '#fff',
        fontFamily: 'Inter-Medium',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        fontSize: 16,
        color: '#6c757d',
        fontFamily: 'Inter-Medium',
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
        color: '#6c757d',
        fontFamily: 'Inter-Medium',
        marginBottom: 8,
    },
    taskName: {
        fontSize: 24,
        color: '#2c3e50',
        fontFamily: 'Inter-Bold',
        lineHeight: 30,
    },
    taskNameInput: {
        fontSize: 24,
        color: '#2c3e50',
        fontFamily: 'Inter-Bold',
        lineHeight: 30,
        paddingVertical: 8,
        paddingHorizontal: 12,
        backgroundColor: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#6A009C',
        minHeight: 60,
    },
    infoCardsContainer: {
        flexDirection: 'row',
        justifyContent: 'flex-start',
        gap: 8,
        marginBottom: 24,
        flexWrap: 'wrap',
    },
    infoCard: {
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#fff',
        paddingVertical: 8,
        paddingHorizontal: 12,
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e9ecef',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 8,
        elevation: 2,
        alignSelf: 'flex-start',
    },
    cardContent: {
        flex: 1,
    },
    cardValue: {
        fontSize: 13,
        color: '#2c3e50',
        fontFamily: 'Inter-Medium',
        textAlign: 'center',
    },
    descriptionSection: {
        flex: 1,
    },
    descriptionLabel: {
        fontSize: 16,
        color: '#6c757d',
        fontFamily: 'Inter-Medium',
        marginBottom: 12,
    },
    description: {
        fontSize: 16,
        color: '#2c3e50',
        fontFamily: 'Inter-Regular',
        lineHeight: 24,
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#e9ecef',
        minHeight: 120,
    },
    descriptionInput: {
        fontSize: 16,
        color: '#2c3e50',
        fontFamily: 'Inter-Regular',
        lineHeight: 24,
        backgroundColor: '#fff',
        padding: 16,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: '#6A009C',
        minHeight: 120,
    },
    markAsDoneButton: {
        position: 'absolute',
        bottom: 30,
        right: 20,
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: '#6A009C',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderRadius: 5,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 8,
        gap: 8,
    },
    markAsDoneButtonText: {
        fontSize: 14,
        color: '#fff',
        fontFamily: 'Inter-Medium',
    },
    editableCard: {
        borderColor: '#6A009C',
        borderWidth: 1,
    },
    cardEditIcon: {
        marginLeft: 4,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 20,
        width: '80%',
        maxHeight: '70%',
    },
    modalHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: 16,
    },
    modalTitle: {
        fontSize: 18,
        fontFamily: 'Inter-Bold',
        color: '#2c3e50',
    },
    modalCloseButton: {
        padding: 4,
    },
    modalList: {
        maxHeight: 300,
    },
    modalOption: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: 16,
        borderRadius: 8,
        marginBottom: 8,
        backgroundColor: '#f8f9fa',
    },
    selectedOption: {
        backgroundColor: '#e8f4fd',
        borderColor: '#6A009C',
        borderWidth: 1,
    },
    modalOptionText: {
        fontSize: 16,
        color: '#2c3e50',
        fontFamily: 'Inter-Medium',
    },
    customSubjectContainer: {
        marginTop: 16,
        paddingTop: 16,
        borderTopWidth: 1,
        borderTopColor: '#e9ecef',
    },
    customSubjectLabel: {
        fontSize: 14,
        color: '#6c757d',
        fontFamily: 'Inter-Medium',
        marginBottom: 8,
    },
    customSubjectInput: {
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#6A009C',
        borderRadius: 8,
        padding: 12,
        fontSize: 16,
        color: '#2c3e50',
        fontFamily: 'Inter-Regular',
    },
});

export default TaskDetails;
