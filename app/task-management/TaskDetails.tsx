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
import { Task, Priority, TaskStatus, TaskCategory } from './types/Task';
import { taskService } from './services/taskService';
import { categoryService } from './services/categoryService';

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
    const [editedStatus, setEditedStatus] = useState<TaskStatus>('todo');
    const [editedCategory, setEditedCategory] = useState<TaskCategory | undefined>(undefined);
    const [editedDueDate, setEditedDueDate] = useState<Date | null>(null);
    const [showPriorityModal, setShowPriorityModal] = useState(false);
    const [showStatusModal, setShowStatusModal] = useState(false);
    const [showCategoryModal, setShowCategoryModal] = useState(false);
    const [showDateModal, setShowDateModal] = useState(false);
    const [calendarDate, setCalendarDate] = useState(new Date());
    const [categories, setCategories] = useState<TaskCategory[]>([]);

    const priorityOptions = [
        { value: 'urgent-important', label: 'Urgent & Important', color: '#e74c3c', description: 'Do First - Critical tasks' },
        { value: 'not-urgent-important', label: 'Important, Not Urgent', color: '#1abc9c', description: 'Schedule - Plan for these' },
        { value: 'urgent-not-important', label: 'Urgent, Not Important', color: '#f39c12', description: 'Delegate - Can be delegated' },
        { value: 'not-urgent-not-important', label: 'Neither Urgent nor Important', color: '#27ae60', description: 'Eliminate - Consider removing' },
    ];

    const statusOptions = [
        { value: 'todo', label: 'To Do', color: '#6c757d' },
        { value: 'in-progress', label: 'In Progress', color: '#fd7e14' },
        { value: 'completed', label: 'Completed', color: '#198754' },
        { value: 'on-hold', label: 'On Hold', color: '#dc3545' },
    ];

    // Load task when screen is focused
    useFocusEffect(
        useCallback(() => {
            loadTask();
            loadCategories();
        }, [])
    );

    const loadCategories = async () => {
        try {
            const loadedCategories = await categoryService.getCategories();
            setCategories(loadedCategories);
        } catch (error) {
            console.error('Error loading categories:', error);
        }
    };

    const loadTask = async () => {
        try {
            const foundTask = await taskService.getTaskById(taskId);
            if (foundTask) {
                setTask(foundTask);
                setEditedTitle(foundTask.title);
                setEditedDescription(foundTask.description || '');
                setEditedPriority(foundTask.priority);
                setEditedStatus(foundTask.status);
                setEditedCategory(foundTask.category);
                setEditedDueDate(foundTask.dueDate || null);
            } else {
                Alert.alert('Error', 'Task not found');
                navigation.goBack();
            }
        } catch (error) {
            console.error('Error loading task:', error);
            Alert.alert('Error', 'Failed to load task details');
        }
    };

    const handleSave = async () => {
        if (!task) return;
        
        try {
            const updates = {
                title: editedTitle,
                description: editedDescription,
                priority: editedPriority,
                status: editedStatus,
                category: editedCategory,
                dueDate: editedDueDate || undefined,
            };
            
            const updatedTask = await taskService.updateTask(task.id, updates);
            setTask(updatedTask);
            setIsEditing(false);
            Alert.alert('Success', 'Task updated successfully!');
        } catch (error) {
            console.error('Error updating task:', error);
            Alert.alert('Error', 'Failed to update task');
        }
    };

    const handleCancel = () => {
        if (task) {
            setEditedTitle(task.title);
            setEditedDescription(task.description || '');
            setEditedPriority(task.priority);
            setEditedStatus(task.status);
            setEditedCategory(task.category);
            setEditedDueDate(task.dueDate || null);
        }
        setIsEditing(false);
    };

    // Calendar helper functions
    const getDaysInMonth = (date: Date) => {
        return new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    };

    const getFirstDayOfMonth = (date: Date) => {
        return new Date(date.getFullYear(), date.getMonth(), 1).getDay();
    };

    const getPreviousMonth = () => {
        setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() - 1, 1));
    };

    const getNextMonth = () => {
        setCalendarDate(new Date(calendarDate.getFullYear(), calendarDate.getMonth() + 1, 1));
    };

    const isToday = (day: number) => {
        const today = new Date();
        return (
            day === today.getDate() &&
            calendarDate.getMonth() === today.getMonth() &&
            calendarDate.getFullYear() === today.getFullYear()
        );
    };

    const isSelectedDate = (day: number) => {
        if (!editedDueDate) return false;
        return (
            day === editedDueDate.getDate() &&
            calendarDate.getMonth() === editedDueDate.getMonth() &&
            calendarDate.getFullYear() === editedDueDate.getFullYear()
        );
    };

    const selectDate = (day: number) => {
        const selectedDate = new Date(calendarDate.getFullYear(), calendarDate.getMonth(), day);
        setEditedDueDate(selectedDate);
        setShowDateModal(false);
    };

    const renderCalendarDays = () => {
        const daysInMonth = getDaysInMonth(calendarDate);
        const firstDay = getFirstDayOfMonth(calendarDate);
        const days = [];

        // Add empty cells for days before the first day of the month
        for (let i = 0; i < firstDay; i++) {
            days.push(
                <View key={`empty-${i}`} style={[styles.calendarDay, styles.inactiveDay]} />
            );
        }

        // Add days of the month
        for (let day = 1; day <= daysInMonth; day++) {
            const isTodayDate = isToday(day);
            const isSelected = isSelectedDate(day);

            days.push(
                <TouchableOpacity
                    key={day}
                    style={[
                        styles.calendarDay,
                        isTodayDate && styles.todayCalendarDay,
                        isSelected && styles.selectedCalendarDay,
                    ]}
                    onPress={() => selectDate(day)}
                >
                    <Text style={[
                        styles.calendarDayText,
                        isTodayDate && styles.todayDayText,
                        isSelected && styles.selectedDayText,
                    ]}>
                        {day}
                    </Text>
                </TouchableOpacity>
            );
        }

        return days;
    };

    const handleDelete = () => {
        Alert.alert(
            'Delete Task',
            'Are you sure you want to delete this task?',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Delete',
                    style: 'destructive',
                    onPress: async () => {
                        try {
                            await taskService.deleteTask(taskId);
                            navigation.goBack();
                            Alert.alert('Success', 'Task deleted successfully!');
                        } catch (error) {
                            console.error('Error deleting task:', error);
                            Alert.alert('Error', 'Failed to delete task');
                        }
                    },
                },
            ]
        );
    };

    const toggleCompletion = async () => {
        if (!task) return;
        
        try {
            const updatedTask = await taskService.markTaskComplete(task.id);
            setTask(updatedTask);
            setEditedStatus(updatedTask.status);
            Alert.alert('Success', `Task marked as ${updatedTask.completed ? 'completed' : 'incomplete'}!`);
        } catch (error) {
            console.error('Error updating task:', error);
            Alert.alert('Error', 'Failed to update task');
        }
    };

    if (!task) {
        return (
            <SafeAreaView style={styles.container}>
                <View style={styles.loadingContainer}>
                    <Text style={styles.loadingText}>Loading task details...</Text>
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
                    <Ionicons name="chevron-back" size={24} color="#2c3e50" />
                </TouchableOpacity>
                
                <Text style={styles.headerTitle}>Task Details</Text>
                
                <TouchableOpacity 
                    style={styles.editButton} 
                    onPress={() => setIsEditing(!isEditing)}
                >
                    <MaterialIcons 
                        name={isEditing ? "close" : "edit"} 
                        size={24} 
                        color="#AD00FF" 
                    />
                </TouchableOpacity>
            </View>

            <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
                {/* Task Title */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Task Title</Text>
                    {isEditing ? (
                        <TextInput
                            style={styles.editInput}
                            value={editedTitle}
                            onChangeText={setEditedTitle}
                            placeholder="Enter task title..."
                            multiline
                        />
                    ) : (
                        <Text style={styles.taskTitle}>{task.title}</Text>
                    )}
                </View>

                {/* Task Details Cards */}
                <View style={styles.detailsContainer}>
                    <View style={styles.detailsRow}>
                        {/* Status Card */}
                        <View style={styles.compactCard}>
                            <Text style={styles.compactCardLabel}>Status</Text>
                            {isEditing ? (
                                <TouchableOpacity
                                    style={styles.compactCardContent}
                                    onPress={() => setShowStatusModal(true)}
                                >
                                    <Text style={styles.compactCardValue}>
                                        {statusOptions.find(s => s.value === editedStatus)?.label || 'To Do'}
                                    </Text>
                                    <MaterialIcons name="keyboard-arrow-down" size={16} color="#6c757d" />
                                </TouchableOpacity>
                            ) : (
                                <Text style={styles.compactCardValue}>
                                    {statusOptions.find(s => s.value === task.status)?.label || 'To Do'}
                                </Text>
                            )}
                        </View>

                        {/* Category Card */}
                        <View style={styles.compactCard}>
                            <Text style={styles.compactCardLabel}>Category</Text>
                            {isEditing ? (
                                <TouchableOpacity
                                    style={styles.compactCardContent}
                                    onPress={() => setShowCategoryModal(true)}
                                >
                                    <Text style={styles.compactCardValue}>
                                        {editedCategory ? editedCategory.name : 'No Category'}
                                    </Text>
                                    <MaterialIcons name="keyboard-arrow-down" size={16} color="#6c757d" />
                                </TouchableOpacity>
                            ) : (
                                <Text style={styles.compactCardValue}>
                                    {task.category ? task.category.name : 'No Category'}
                                </Text>
                            )}
                        </View>

                        {/* Due Date Card */}
                        <View style={styles.compactCard}>
                            <Text style={styles.compactCardLabel}>Due Date</Text>
                            {isEditing ? (
                                <TouchableOpacity
                                    style={styles.compactCardContent}
                                    onPress={() => setShowDateModal(true)}
                                >
                                    <Text style={styles.compactCardValue}>
                                        {editedDueDate ? editedDueDate.toLocaleDateString() : 'No due date'}
                                    </Text>
                                    <MaterialIcons name="keyboard-arrow-down" size={16} color="#6c757d" />
                                </TouchableOpacity>
                            ) : (
                                <Text style={styles.compactCardValue}>
                                    {task.dueDate ? task.dueDate.toLocaleDateString() : 'No due date'}
                                </Text>
                            )}
                        </View>

                        {/* Priority Card */}
                        <View style={styles.compactCard}>
                            <Text style={styles.compactCardLabel}>Priority</Text>
                            {isEditing ? (
                                <TouchableOpacity
                                    style={styles.compactCardContent}
                                    onPress={() => setShowPriorityModal(true)}
                                >
                                    <Text style={styles.compactCardValue}>
                                        {priorityOptions.find(p => p.value === editedPriority)?.label?.replace(' & ', ' ') || 'Neither'}
                                    </Text>
                                    <MaterialIcons name="keyboard-arrow-down" size={16} color="#6c757d" />
                                </TouchableOpacity>
                            ) : (
                                <Text style={styles.compactCardValue}>
                                    {priorityOptions.find(p => p.value === task.priority)?.label?.replace(' & ', ' ') || 'Neither'}
                                </Text>
                            )}
                        </View>
                    </View>
                </View>

                {/* Task Description */}
                <View style={styles.section}>
                    <Text style={styles.sectionTitle}>Description</Text>
                    {isEditing ? (
                        <TextInput
                            style={[styles.editInput, styles.descriptionInput]}
                            value={editedDescription}
                            onChangeText={setEditedDescription}
                            placeholder="Enter task description..."
                            multiline
                            textAlignVertical="top"
                        />
                    ) : (
                        <Text style={styles.taskDescription}>
                            {task.description || 'No description provided'}
                        </Text>
                    )}
                </View>

            </ScrollView>

            {/* Priority Modal */}
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
                            <TouchableOpacity onPress={() => setShowPriorityModal(false)}>
                                <MaterialIcons name="close" size={24} color="#6c757d" />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView>
                            {priorityOptions.map((priority) => (
                                <TouchableOpacity
                                    key={priority.value}
                                    style={[
                                        styles.modalOption,
                                        editedPriority === priority.value && styles.selectedModalOption
                                    ]}
                                    onPress={() => {
                                        setEditedPriority(priority.value as Priority);
                                        setShowPriorityModal(false);
                                    }}
                                >
                                    <View style={styles.priorityOptionContent}>
                                        <View style={styles.priorityDisplay}>
                                            <View style={[styles.priorityColor, { backgroundColor: priority.color }]} />
                                            <Text style={[
                                                styles.modalOptionText,
                                                editedPriority === priority.value && styles.selectedOptionText
                                            ]}>
                                                {priority.label}
                                            </Text>
                                        </View>
                                        <Text style={[
                                            styles.priorityDescription,
                                            editedPriority === priority.value && styles.selectedOptionDescription
                                        ]}>
                                            {priority.description}
                                        </Text>
                                    </View>
                                    {editedPriority === priority.value && (
                                        <MaterialIcons name="check" size={20} color="#AD00FF" />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Status Modal */}
            <Modal
                visible={showStatusModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowStatusModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select Status</Text>
                            <TouchableOpacity onPress={() => setShowStatusModal(false)}>
                                <MaterialIcons name="close" size={24} color="#6c757d" />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView>
                            {statusOptions.map((status) => (
                                <TouchableOpacity
                                    key={status.value}
                                    style={[
                                        styles.modalOption,
                                        editedStatus === status.value && styles.selectedModalOption
                                    ]}
                                    onPress={() => {
                                        setEditedStatus(status.value as TaskStatus);
                                        setShowStatusModal(false);
                                    }}
                                >
                                    <View style={styles.statusDisplay}>
                                        <View style={[styles.statusIndicator, { backgroundColor: status.color }]} />
                                        <Text style={[
                                            styles.modalOptionText,
                                            editedStatus === status.value && styles.selectedOptionText
                                        ]}>
                                            {status.label}
                                        </Text>
                                    </View>
                                    {editedStatus === status.value && (
                                        <MaterialIcons name="check" size={20} color="#AD00FF" />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Category Modal */}
            <Modal
                visible={showCategoryModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowCategoryModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select Category</Text>
                            <TouchableOpacity onPress={() => setShowCategoryModal(false)}>
                                <MaterialIcons name="close" size={24} color="#6c757d" />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView style={{ maxHeight: 300 }}>
                            <TouchableOpacity
                                style={[
                                    styles.modalOption,
                                    !editedCategory && styles.selectedModalOption
                                ]}
                                onPress={() => {
                                    setEditedCategory(undefined);
                                    setShowCategoryModal(false);
                                }}
                            >
                                <Text style={[
                                    styles.modalOptionText,
                                    !editedCategory && styles.selectedOptionText
                                ]}>
                                    No Category
                                </Text>
                                {!editedCategory && (
                                    <MaterialIcons name="check" size={20} color="#AD00FF" />
                                )}
                            </TouchableOpacity>
                            
                            {categories.map((category) => (
                                <TouchableOpacity
                                    key={category.id}
                                    style={[
                                        styles.modalOption,
                                        editedCategory?.id === category.id && styles.selectedModalOption
                                    ]}
                                    onPress={() => {
                                        setEditedCategory(category);
                                        setShowCategoryModal(false);
                                    }}
                                >
                                    <View style={styles.categoryDisplay}>
                                        <View style={[styles.categoryColor, { backgroundColor: category.color }]} />
                                        <Text style={[
                                            styles.modalOptionText,
                                            editedCategory?.id === category.id && styles.selectedOptionText
                                        ]}>
                                            {category.name}
                                        </Text>
                                    </View>
                                    {editedCategory?.id === category.id && (
                                        <MaterialIcons name="check" size={20} color="#AD00FF" />
                                    )}
                                </TouchableOpacity>
                            ))}
                        </ScrollView>
                    </View>
                </View>
            </Modal>

            {/* Date Modal */}
            <Modal
                visible={showDateModal}
                transparent={true}
                animationType="slide"
                onRequestClose={() => setShowDateModal(false)}
            >
                <View style={styles.modalOverlay}>
                    <View style={styles.modalContent}>
                        <View style={styles.modalHeader}>
                            <Text style={styles.modalTitle}>Select Due Date</Text>
                            <TouchableOpacity onPress={() => setShowDateModal(false)}>
                                <MaterialIcons name="close" size={24} color="#6c757d" />
                            </TouchableOpacity>
                        </View>
                        
                        <ScrollView style={{ maxHeight: 500 }}>
                            {/* Quick Date Options */}
                            <View style={styles.quickDateOptions}>
                                {/* Remove Due Date Option */}
                                <TouchableOpacity
                                    style={[
                                        styles.modalOption,
                                        !editedDueDate && styles.selectedModalOption
                                    ]}
                                    onPress={() => {
                                        setEditedDueDate(null);
                                        setShowDateModal(false);
                                    }}
                                >
                                    <MaterialIcons name="close" size={20} color="#e74c3c" />
                                    <Text style={[
                                        styles.modalOptionText,
                                        { marginLeft: 12 },
                                        !editedDueDate && styles.selectedOptionText
                                    ]}>
                                        Remove Due Date
                                    </Text>
                                    {!editedDueDate && (
                                        <MaterialIcons name="check" size={20} color="#AD00FF" />
                                    )}
                                </TouchableOpacity>

                                {/* Today */}
                                <TouchableOpacity
                                    style={[
                                        styles.modalOption,
                                        editedDueDate && 
                                        editedDueDate.toDateString() === new Date().toDateString() && 
                                        styles.selectedModalOption
                                    ]}
                                    onPress={() => {
                                        setEditedDueDate(new Date());
                                        setShowDateModal(false);
                                    }}
                                >
                                    <MaterialIcons name="today" size={20} color="#1abc9c" />
                                    <Text style={[
                                        styles.modalOptionText,
                                        { marginLeft: 12 },
                                        editedDueDate && 
                                        editedDueDate.toDateString() === new Date().toDateString() && 
                                        styles.selectedOptionText
                                    ]}>
                                        Today ({new Date().toLocaleDateString()})
                                    </Text>
                                    {editedDueDate && 
                                     editedDueDate.toDateString() === new Date().toDateString() && (
                                        <MaterialIcons name="check" size={20} color="#AD00FF" />
                                    )}
                                </TouchableOpacity>

                                {/* Tomorrow */}
                                <TouchableOpacity
                                    style={[
                                        styles.modalOption,
                                        editedDueDate && 
                                        editedDueDate.toDateString() === new Date(Date.now() + 86400000).toDateString() && 
                                        styles.selectedModalOption
                                    ]}
                                    onPress={() => {
                                        setEditedDueDate(new Date(Date.now() + 86400000));
                                        setShowDateModal(false);
                                    }}
                                >
                                    <MaterialIcons name="event" size={20} color="#f39c12" />
                                    <Text style={[
                                        styles.modalOptionText,
                                        { marginLeft: 12 },
                                        editedDueDate && 
                                        editedDueDate.toDateString() === new Date(Date.now() + 86400000).toDateString() && 
                                        styles.selectedOptionText
                                    ]}>
                                        Tomorrow ({new Date(Date.now() + 86400000).toLocaleDateString()})
                                    </Text>
                                    {editedDueDate && 
                                     editedDueDate.toDateString() === new Date(Date.now() + 86400000).toDateString() && (
                                        <MaterialIcons name="check" size={20} color="#AD00FF" />
                                    )}
                                </TouchableOpacity>

                                {/* Next Week */}
                                <TouchableOpacity
                                    style={[
                                        styles.modalOption,
                                        editedDueDate && 
                                        editedDueDate.toDateString() === new Date(Date.now() + 7 * 86400000).toDateString() && 
                                        styles.selectedModalOption
                                    ]}
                                    onPress={() => {
                                        setEditedDueDate(new Date(Date.now() + 7 * 86400000));
                                        setShowDateModal(false);
                                    }}
                                >
                                    <MaterialIcons name="date-range" size={20} color="#e74c3c" />
                                    <Text style={[
                                        styles.modalOptionText,
                                        { marginLeft: 12 },
                                        editedDueDate && 
                                        editedDueDate.toDateString() === new Date(Date.now() + 7 * 86400000).toDateString() && 
                                        styles.selectedOptionText
                                    ]}>
                                        Next Week ({new Date(Date.now() + 7 * 86400000).toLocaleDateString()})
                                    </Text>
                                    {editedDueDate && 
                                     editedDueDate.toDateString() === new Date(Date.now() + 7 * 86400000).toDateString() && (
                                        <MaterialIcons name="check" size={20} color="#AD00FF" />
                                    )}
                                </TouchableOpacity>
                            </View>

                            {/* Calendar */}
                            <View style={styles.calendarContainer}>
                                <Text style={styles.calendarSectionTitle}>Or choose a specific date:</Text>
                                
                                {/* Calendar Header */}
                                <View style={styles.calendarHeader}>
                                    <TouchableOpacity 
                                        style={styles.monthNavButton}
                                        onPress={getPreviousMonth}
                                    >
                                        <MaterialIcons name="chevron-left" size={20} color="#495057" />
                                    </TouchableOpacity>
                                    <Text style={styles.monthYearText}>
                                        {calendarDate.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
                                    </Text>
                                    <TouchableOpacity 
                                        style={styles.monthNavButton}
                                        onPress={getNextMonth}
                                    >
                                        <MaterialIcons name="chevron-right" size={20} color="#495057" />
                                    </TouchableOpacity>
                                </View>

                                {/* Calendar Grid */}
                                <View style={styles.calendarGrid}>
                                    {/* Day Headers */}
                                    <View style={styles.dayHeadersRow}>
                                        {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                                            <Text key={day} style={styles.dayHeader}>{day}</Text>
                                        ))}
                                    </View>
                                    
                                    {/* Calendar Days */}
                                    <View style={styles.daysContainer}>
                                        {renderCalendarDays()}
                                    </View>
                                </View>
                            </View>
                        </ScrollView>
                    </View>
                </View>
            </Modal>

  {/* Fixed Action Buttons at Bottom */}
<View style={styles.actionButtonsContainer}>
    {isEditing ? (
        <View style={styles.editButtonsRow}>
            <TouchableOpacity 
                style={styles.cancelButton} 
                onPress={handleCancel}
            >
                <MaterialIcons name="close" size={20} color="#e74c3c" />
                <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
                style={styles.saveButton} 
                onPress={handleSave}
            >
                <MaterialIcons name="save" size={20} color="#fff" />
                <Text style={styles.saveButtonText}>Save Changes</Text>
            </TouchableOpacity>
        </View>
    ) : (
        <View style={styles.viewButtonsRow}>
            <TouchableOpacity 
                style={styles.completeButton} 
                onPress={toggleCompletion}
            >
                <MaterialIcons 
                    name={task.completed ? "undo" : "check-circle"} 
                    size={20} 
                    color="#fff" 
                />
                <Text style={styles.completeButtonText}>
                    {task.completed ? 'Incomplete' : 'Complete'}
                </Text>
            </TouchableOpacity>
            
            <TouchableOpacity 
                style={styles.deleteButton} 
                onPress={handleDelete}
            >
                <MaterialIcons name="delete" size={20} color="#fff" />
                <Text style={styles.deleteButtonText}>Delete</Text>
            </TouchableOpacity>
        </View>
    )}
</View>
        </SafeAreaView>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#f8f9fa',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
    },
    loadingText: {
        fontSize: 16,
        color: '#6c757d',
        fontFamily: 'Inter-Regular',
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 15,
        backgroundColor: '#fff',
        borderBottomWidth: 1,
        borderBottomColor: '#e9ecef',
    },
    backButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f8f9fa',
    },
    headerTitle: {
        fontSize: 20,
        fontWeight: 'bold',
        color: '#2c3e50',
        fontFamily: 'Inter-Bold',
    },
    editButton: {
        width: 40,
        height: 40,
        borderRadius: 20,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: '#f0e6ff',
    },
    content: {
        paddingHorizontal: 20,
        paddingTop: 20,
        paddingBottom: 20,  // Add some bottom padding
    },
    section: {
        marginBottom: 24,
    },
    sectionTitle: {
        fontSize: 16,
        fontWeight: '600',
        color: '#2c3e50',
        marginBottom: 8,
        fontFamily: 'Inter-SemiBold',
    },
    taskTitle: {
        fontSize: 24,
        fontWeight: 'bold',
        color: '#2c3e50',
        lineHeight: 30,
        fontFamily: 'Inter-Bold',
    },
    taskDescription: {
        fontSize: 16,
        color: '#495057',
        lineHeight: 24,
        fontFamily: 'Inter-Regular',
    },
    editInput: {
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        fontSize: 16,
        color: '#2c3e50',
        borderWidth: 1,
        borderColor: '#AD00FF',
        fontFamily: 'Inter-Regular',
    },
    descriptionInput: {
        height: 100,
        textAlignVertical: 'top',
    },
    detailsContainer: {
        marginBottom: 24,
    },
detailsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    gap: 8,
},
compactCard: {
    backgroundColor: '#fff',
    borderRadius: 8,
    padding: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
    minWidth: 120, // Minimum width for each card
    flexGrow: 1,
    flexBasis: 0, // This makes cards grow equally
    maxWidth: '48%', // Maximum 2 cards per row (with gap)
},
    compactCardLabel: {
        fontSize: 12,
        color: '#6c757d',
        marginBottom: 4,
        fontFamily: 'Inter-Medium',
    },
    compactCardValue: {
        fontSize: 14,
        color: '#2c3e50',
        fontFamily: 'Inter-Regular',
    },
    compactCardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    cardsContainer: {
        flexDirection: 'row',
        gap: 12,
        marginBottom: 24,
    },
    card: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 16,
        borderWidth: 1,
        borderColor: '#e9ecef',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 2,
    },
    cardHeader: {
        flexDirection: 'row',
        alignItems: 'center',
        marginBottom: 8,
    },
    cardLabel: {
        fontSize: 14,
        color: '#6c757d',
        marginLeft: 8,
        fontFamily: 'Inter-Medium',
    },
    cardValue: {
        fontSize: 14,
        color: '#2c3e50',
        fontFamily: 'Inter-Regular',
    },
    editableCardContent: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
    },
    statusDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    statusIndicator: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 8,
    },
    categoryDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    categoryColor: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 8,
    },
    priorityDisplay: {
        flexDirection: 'row',
        alignItems: 'center',
        flex: 1,
    },
    priorityColor: {
        width: 12,
        height: 12,
        borderRadius: 6,
        marginRight: 8,
    },
    scrollContainer: {
        flex: 1,  // This will take up all available space except the action buttons
    },
actionButtonsContainer: {
    paddingHorizontal: 20,
    paddingBottom: Platform.OS === 'ios' ? 30 : 20,
    paddingTop: 12,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
},
    editButtonsRow: {
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'space-between',
    },
    viewButtonsRow: {
        flexDirection: 'row',
        gap: 12,
        justifyContent: 'space-between',
    },
cancelButton: {
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
    saveButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#AD00FF',
        borderRadius: 12,
        padding: 16,
    },
    cancelButtonText: {
        marginLeft: 8,
        fontSize: 14,
        color: '#e74c3c',
        fontFamily: 'Inter-Medium',
    },

    saveButtonText: {
        marginLeft: 8,
        fontSize: 14,
        color: '#fff',
        fontFamily: 'Inter-Bold',
    },
completeButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#28a745',
        borderRadius: 12,
        padding: 16,
    },
    deleteButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#dc3545',
        borderRadius: 12,
        padding: 16,
    },
    completeButtonText: {
        marginLeft: 8,
        fontSize: 14,
        color: '#fff',
        fontFamily: 'Inter-Medium',
    },
    deleteButtonText: {
        marginLeft: 8,
        fontSize: 14,
        color: '#fff',
        fontFamily: 'Inter-Medium',
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
    },
    modalContent: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 24,
        width: '85%',
        maxHeight: '70%',
    },
    modalHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    modalTitle: {
        fontSize: 18,
        fontFamily: 'Inter-Bold',
        color: '#2c3e50',
    },
    modalOption: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 8,
        marginBottom: 4,
    },
    selectedModalOption: {
        backgroundColor: '#f0e6ff',
    },
    modalOptionText: {
        fontSize: 14,
        color: '#2c3e50',
        fontFamily: 'Inter-Regular',
    },
    selectedOptionText: {
        color: '#AD00FF',
        fontFamily: 'Inter-Medium',
    },
    priorityOptionContent: {
        flex: 1,
    },
    priorityDescription: {
        fontSize: 12,
        color: '#7f8c8d',
        marginTop: 2,
        fontFamily: 'Inter-Regular',
    },
    selectedOptionDescription: {
        color: '#8A2BE2',
    },
    quickDateOptions: {
        marginBottom: 20,
        borderBottomWidth: 1,
        borderBottomColor: '#e9ecef',
        paddingBottom: 16,
    },
    calendarContainer: {
        padding: 16,
    },
    calendarSectionTitle: {
        fontSize: 16,
        fontFamily: 'Inter-SemiBold',
        color: '#2c3e50',
        marginBottom: 16,
        textAlign: 'center',
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
});

export default TaskDetails;
