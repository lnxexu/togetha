import React, { useState, useCallback } from 'react';
import { MaterialIcons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { RootStackParamList } from '../navigation/AppNavigator';
import Navbar from '../NavBar';
import EisenhowerMatrix from './components/EisenhowerMatrix';
import TaskListView from './components/TaskListView';
import { Task } from './types/Task';
import { taskService } from './services/taskService';
import { ActivityIndicator } from 'react-native';
import {
    View,
    Text,
    StyleSheet,
    TouchableOpacity,
    ScrollView,
    Alert,
    Platform,
    Dimensions,
    Modal,
} from 'react-native';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const ToDo: React.FC = () => {
    const [isLoading, setIsLoading] = useState<boolean>(false);
    const navigation = useNavigation<NavigationProp>();
    const [viewMode, setViewMode] = useState<'matrix' | 'list'>('matrix');
    const [tasks, setTasks] = useState<Task[]>([]);
    const [selectedFilter, setSelectedFilter] = useState<'all' | 'pending' | 'completed' | 'overdue'>('all');
    const [selectedCategory, setSelectedCategory] = useState<'all' | string>('all');

    // New states for calendar
    const [selectedStatus, setSelectedStatus] = useState<'all' | 'pending' | 'completed' | 'overdue'>('all');
    const [selectedDate, setSelectedDate] = useState(new Date());
    const [showCalendarModal, setShowCalendarModal] = useState(false);
    const [calendarDate, setCalendarDate] = useState(new Date());
    // Dropdown options
    const statusOptions = [
        { value: 'all', label: 'All Tasks' },
        { value: 'pending', label: 'Pending' },
        { value: 'completed', label: 'Completed' },
        { value: 'overdue', label: 'Overdue' },
    ];
    const viewOptions = [
        { value: 'matrix', label: 'Matrix View' },
        { value: 'list', label: 'List View' },
    ];

    // Dropdown handlers
    const handleStatusSelect = (status: 'all' | 'pending' | 'completed' | 'overdue') => {
        setSelectedStatus(status);
        setSelectedFilter(status);
    };

    // Get screen dimensions and orientation
    const { width, height } = Dimensions.get('window');
    const isLandscape = width > height;

    // Generate week dates
    const getWeekDates = () => {
        const today = new Date();
        const currentDay = today.getDay();
        const startOfWeek = new Date(today);
        startOfWeek.setDate(today.getDate() - currentDay);

        const weekDates = [];
        for (let i = 0; i < 7; i++) {
            const date = new Date(startOfWeek);
            date.setDate(startOfWeek.getDate() + i);
            weekDates.push(date);
        }
        return weekDates;
    };

    // Generate calendar days for monthly view
    const getCalendarDays = () => {
        const year = calendarDate.getFullYear();
        const month = calendarDate.getMonth();

        const firstDay = new Date(year, month, 1);
        const lastDay = new Date(year, month + 1, 0);
        const startDate = new Date(firstDay);
        startDate.setDate(startDate.getDate() - firstDay.getDay());

        const days = [];
        for (let i = 0; i < 42; i++) { // 6 weeks * 7 days
            const date = new Date(startDate);
            date.setDate(startDate.getDate() + i);
            days.push(date);
        }
        return days;
    };

    const weekDates = getWeekDates();
    const calendarDays = getCalendarDays();
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    // Load tasks when screen is focused
    useFocusEffect(
        useCallback(() => {
            loadTasks();
        }, [])
    );

    const loadTasks = async () => {
        try {
            setIsLoading(true);
            console.log('Fetching tasks from the server...');

            const loadedTasks = await taskService.getAllTasks();

            console.log(`Successfully loaded ${loadedTasks.length} tasks from the server`);
            setTasks(loadedTasks);
        } catch (error) {
            console.error('Error loading tasks:', error);
            Alert.alert('Error', 'Failed to load tasks. Please check your connection and try again.');
        } finally {
            setIsLoading(false);
        }
    };

    const handleAddTask = (quadrant?: string) => {
        navigation.navigate('AddTask', { quadrant: quadrant as any });
    };

    const handleTaskPress = (taskId: string) => {
        navigation.navigate('TaskDetails', { taskId });
    };

    const handleDeleteTask = async (taskId: string) => {
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
                            await loadTasks();
                        } catch (error) {
                            Alert.alert('Error', 'Failed to delete task');
                        }
                    },
                },
            ]
        );
    };

    const handleMarkComplete = async (taskId: string) => {
        try {
            await taskService.markTaskComplete(taskId);
            await loadTasks();
        } catch (error) {
            Alert.alert('Error', 'Failed to update task');
        }
    };

    const filteredTasks = tasks.filter(task => {
        // Filter by status/completion state
        if (selectedStatus === 'completed') return task.completed;
        if (selectedStatus === 'pending') return !task.completed && !task.overdue;
        if (selectedStatus === 'overdue') return task.overdue && !task.completed;
        if (selectedStatus === 'all') {
            // Additional filtering by the horizontal filter buttons
            if (selectedFilter === 'completed') return task.completed;
            if (selectedFilter === 'pending') return !task.completed && !task.overdue;
            if (selectedFilter === 'overdue') return task.overdue && !task.completed;
        }
        return true;
    }).filter(task => {
        // Filter by category/subject
        if (selectedCategory === 'all') return true;
        return task.subject === selectedCategory;
    });

    const categories = [...new Set(tasks.map(task => task.subject).filter((subject): subject is string => Boolean(subject)))];

    const isDateSelected = (date: Date) => {
        return date.toDateString() === selectedDate.toDateString();
    };

    const isCurrentDate = (date: Date) => {
        const today = new Date();
        return date.toDateString() === today.toDateString();
    };

    const isCurrentMonth = (date: Date) => {
        return date.getMonth() === calendarDate.getMonth();
    };

    const handleCalendarDateSelect = (date: Date) => {
        setSelectedDate(date);
        setShowCalendarModal(false);
    };

    const navigateMonth = (direction: 'prev' | 'next') => {
        const newDate = new Date(calendarDate);
        if (direction === 'prev') {
            newDate.setMonth(newDate.getMonth() - 1);
        } else {
            newDate.setMonth(newDate.getMonth() + 1);
        }
        setCalendarDate(newDate);
    };

    const getCurrentDateDisplay = () => {
        const today = new Date();
        return today.getDate().toString();
    };

    return (
        <View style={styles.container}>
            {/* Header */}
            <View style={styles.header}>
                <View style={styles.headerTopRow}>
                    <View style={styles.headerTitleSection}>
                        <Text style={styles.title}>Tasks</Text>
                    </View>
                    <View style={styles.headerActions}>
                        <TouchableOpacity
                            style={styles.calendarButton}
                            onPress={() => setShowCalendarModal(true)}
                        >
                            <Text style={styles.calendarButtonText}>{getCurrentDateDisplay()}</Text>
                            <View style={styles.currentDateIndicator} />
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={styles.viewToggleButton}
                            onPress={() => setViewMode(viewMode === 'matrix' ? 'list' : 'matrix')}
                        >
                            <MaterialIcons 
                                name={viewMode === 'matrix' ? 'list' : 'grid-view'} 
                                size={24} 
                                color="#6A009C" 
                            />
                        </TouchableOpacity>
                    </View>
                </View>

                {/* Calendar Modal */}
                <Modal
                    visible={showCalendarModal}
                    transparent={true}
                    animationType="fade"
                    onRequestClose={() => setShowCalendarModal(false)}
                >
                    <TouchableOpacity
                        style={styles.modalOverlay}
                        activeOpacity={1}
                        onPress={() => setShowCalendarModal(false)}
                    >
                        <View style={styles.calendarModal}>
                            <View style={styles.calendarHeader}>
                                <TouchableOpacity
                                    style={styles.monthNavButton}
                                    onPress={() => navigateMonth('prev')}
                                >
                                    <MaterialIcons name="chevron-left" size={20} color="#495057" />
                                </TouchableOpacity>
                                <Text style={styles.monthYearText}>
                                    {monthNames[calendarDate.getMonth()]} {calendarDate.getFullYear()}
                                </Text>
                                <TouchableOpacity
                                    style={styles.monthNavButton}
                                    onPress={() => navigateMonth('next')}
                                >
                                    <MaterialIcons name="chevron-right" size={20} color="#495057" />
                                </TouchableOpacity>
                            </View>
                            <View style={styles.calendarGrid}>
                                {/* Day headers */}
                                <View style={styles.dayHeadersRow}>
                                    {dayNames.map(day => (
                                        <Text key={day} style={styles.dayHeader}>{day}</Text>
                                    ))}
                                </View>
                                {/* Calendar days */}
                                <View style={styles.daysContainer}>
                                    {calendarDays.map((date, index) => (
                                        <TouchableOpacity
                                            key={index}
                                            style={[
                                                styles.calendarDay,
                                                !isCurrentMonth(date) && styles.inactiveDay,
                                                isCurrentDate(date) && styles.todayCalendarDay,
                                                isDateSelected(date) && styles.selectedCalendarDay
                                            ]}
                                            onPress={() => handleCalendarDateSelect(date)}
                                        >
                                            <Text style={[
                                                styles.calendarDayText,
                                                !isCurrentMonth(date) && styles.inactiveDayText,
                                                isCurrentDate(date) && styles.todayDayText,
                                                isDateSelected(date) && styles.selectedDayText
                                            ]}>
                                                {date.getDate()}
                                            </Text>
                                        </TouchableOpacity>
                                    ))}
                                </View>
                            </View>
                        </View>
                    </TouchableOpacity>
                </Modal>

                {/* Dashboard (only show in matrix view) */}
                {viewMode === 'matrix' && (
                    <View style={styles.dashboard}>
                        <View style={styles.dashboardRow}>
                            <View style={styles.dashboardCard}>
                                <Text style={styles.dashboardNumber}>
                                    {tasks.filter(task => !task.completed && !task.overdue).length}
                                </Text>
                                <Text style={styles.dashboardLabel}>Pending</Text>
                            </View>
                            <View style={styles.dashboardCard}>
                                <Text style={styles.dashboardNumber}>
                                    {tasks.filter(task => task.completed).length}
                                </Text>
                                <Text style={styles.dashboardLabel}>Completed</Text>
                            </View>
                            <View style={styles.dashboardCard}>
                                <Text style={styles.dashboardNumber}>
                                    {tasks.filter(task => task.overdue && !task.completed).length}
                                </Text>
                                <Text style={styles.dashboardLabel}>Overdue</Text>
                            </View>
                            <View style={styles.dashboardCard}>
                                <Text style={styles.dashboardNumber}>{tasks.length}</Text>
                                <Text style={styles.dashboardLabel}>Total</Text>
                            </View>
                        </View>
                    </View>
                )}

                {/* Status Buttons (only show in list view) */}
                {viewMode === 'list' && (
                    <View style={styles.statusButtons}>
                        <TouchableOpacity
                            style={[
                                styles.statusButton,
                                selectedStatus === 'all' && styles.activeStatusButton
                            ]}
                            onPress={() => handleStatusSelect('all')}
                        >
                            <Text style={[
                                styles.statusButtonText,
                                selectedStatus === 'all' && styles.activeStatusButtonText
                            ]}>
                                All
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.statusButton,
                                selectedStatus === 'pending' && styles.activeStatusButton
                            ]}
                            onPress={() => handleStatusSelect('pending')}
                        >
                            <Text style={[
                                styles.statusButtonText,
                                selectedStatus === 'pending' && styles.activeStatusButtonText
                            ]}>
                                Pending
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.statusButton,
                                selectedStatus === 'completed' && styles.activeStatusButton
                            ]}
                            onPress={() => handleStatusSelect('completed')}
                        >
                            <Text style={[
                                styles.statusButtonText,
                                selectedStatus === 'completed' && styles.activeStatusButtonText
                            ]}>
                                Completed
                            </Text>
                        </TouchableOpacity>
                        <TouchableOpacity
                            style={[
                                styles.statusButton,
                                selectedStatus === 'overdue' && styles.activeStatusButton
                            ]}
                            onPress={() => handleStatusSelect('overdue')}
                        >
                            <Text style={[
                                styles.statusButtonText,
                                selectedStatus === 'overdue' && styles.activeStatusButtonText
                            ]}>
                                Overdue
                            </Text>
                        </TouchableOpacity>
                    </View>
                )}

                {/* Dropdown Backdrop - Only show in list view */}
                {viewMode === 'list' && false && (
                    <TouchableOpacity
                        style={styles.dropdownBackdrop}
                        activeOpacity={1}
                        onPress={() => {}}
                    />
                )}

            </View>

            {/* Content */}
            <View style={[
                styles.content,
                viewMode === 'matrix' ? styles.contentMatrix : styles.contentList
            ]}>
                {isLoading ? (
                    <View style={styles.loadingContainer}>
                        <ActivityIndicator size="large" color="#6A009C" />
                        <Text style={styles.loadingText}>Loading tasks...</Text>
                    </View>
                ) : viewMode === 'matrix' ? (
                    <EisenhowerMatrix
                        tasks={tasks}
                        onTaskPress={handleTaskPress}
                        onAddTask={handleAddTask}
                        onDeleteTask={handleDeleteTask}
                        onMarkComplete={handleMarkComplete}
                    />
                ) : (
                    <TaskListView
                        tasks={filteredTasks} // Use filtered tasks here
                        onTaskPress={handleTaskPress}
                        onDeleteTask={handleDeleteTask}
                        onMarkComplete={handleMarkComplete}
                        categories={categories}
                        selectedCategory={selectedCategory}
                        onCategoryChange={setSelectedCategory}
                    />
                )}
            </View>

            {/* Floating Add Task Button */}
            <TouchableOpacity
                style={styles.addTaskButton}
                onPress={() => handleAddTask()}
            >
                <MaterialIcons name="add" size={28} color="#9C27B0" />
            </TouchableOpacity>

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
        paddingTop: Platform.OS === 'ios' ? 50 : 35,
        paddingBottom: 16,
        backgroundColor: "#F5E1FD",
        borderBottomLeftRadius: 25,
        borderBottomRightRadius: 25,
        shadowColor: "#1E293B",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 8,
        elevation: 5,
        zIndex: 1000,
        overflow: 'visible',
    },
    headerTopRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
    },
    headerTitleSection: {
        flex: 1,
    },
    title: {
        fontSize: 32,
        color: '#6A009C',
        fontFamily: 'Inter-Bold',
        marginBottom: 4,
    },
    headerActions: {
        flexDirection: 'row',
        gap: 8,
    },
    calendarButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: "#1E293B",
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        position: 'relative',
    },
    calendarButtonText: {
        fontSize: 16,
        color: '#6A009C',
        fontFamily: 'Inter-Bold',
    },
    currentDateIndicator: {
        position: 'absolute',
        bottom: 6,
        right: 6,
        width: 6,
        height: 6,
        borderRadius: 3,
        backgroundColor: '#6A009C',
    },
    viewToggleButton: {
        width: 44,
        height: 44,
        borderRadius: 12,
        backgroundColor: '#fff',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#6366F1',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
    },
    modalOverlay: {
        flex: 1,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        justifyContent: 'center',
        alignItems: 'center',
        paddingHorizontal: 20,
    },
    calendarModal: {
        backgroundColor: '#fff',
        borderRadius: 16,
        padding: 20,
        maxWidth: 350,
        width: '100%',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 10 },
        shadowOpacity: 0.25,
        shadowRadius: 20,
        elevation: 10,
    },
    calendarHeader: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: 20,
    },
    monthNavButton: {
        padding: 8,
        borderRadius: 8,
    },
    monthYearText: {
        fontSize: 18,
        fontFamily: 'Inter-Bold',
        color: '#495057',
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
        justifyContent: 'space-between',
        gap: 0, // Remove gap to prevent wrapping issues
    },
    calendarDay: {
        width: '14.28%', // Exactly 1/7 of the container width
        aspectRatio: 1,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        margin: 0,
        padding: 0,
        backgroundColor: 'transparent', // No background color for normal days
        shadowColor: '#000',

    },
    inactiveDay: {
        opacity: 0.3,
    },
    todayCalendarDay: {
        backgroundColor: '#AD00FF',
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 2,
    },
    selectedCalendarDay: {
        backgroundColor: '#6A009C',
        borderRadius: 8,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 2,
    },
    calendarDayText: {
        fontSize: 14,
        color: '#495057',
        fontFamily: 'Inter-Medium',
        textAlign: 'center',
        fontWeight: '600',
        paddingVertical: 4,
        paddingHorizontal: 8,
        backgroundColor: 'transparent', // No background color for normal days
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
    dropdownContainer: {
        marginTop: 20,
        marginBottom: 10,
        zIndex: 100,
        overflow: 'visible',
    },
    dropdownRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
        zIndex: 100,
        overflow: 'visible',
    },
    dropdown: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e9ecef',
        elevation: 2,
    },
    dropdownText: {
        fontSize: 14,
        color: '#495057',
        fontFamily: 'Inter-Medium',
    },
    calendarContainer: {
        marginBottom: 8,
    },
    calendarScrollContent: {
        paddingHorizontal: 4,
    },
    dateItem: {
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginHorizontal: 4,
        borderRadius: 12,
        minWidth: 30,
    },
    selectedDateItem: {
        // Remove background color - no background highlighting
    },
    dayText: {
        fontSize: 12,
        color: '#6c757d',
        fontFamily: 'Inter-Medium',
        marginBottom: 4,
    },
    dateText: {
        fontSize: 16,
        color: '#495057',
        fontFamily: 'Inter-SemiBold',
    },
    selectedDateText: {
        color: '#AD00FF',
        fontFamily: 'Inter-SemiBold',
        fontWeight: 'bold',
    },
    viewToggle: {
        flexDirection: 'row',
        marginHorizontal: 20,
        marginBottom: 15,
        backgroundColor: '#e9ecef',
        borderRadius: 25,
        padding: 4,
    },
    toggleButton: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 10,
        borderRadius: 20,
    },
    activeToggle: {
        backgroundColor: '#AD00FF',
    },
    toggleText: {
        marginLeft: 5,
        fontSize: 14,
        color: '#AD00FF',
        fontFamily: 'Inter-Medium',
    },
    activeToggleText: {
        color: '#fff',
    },

    content: {
        flex: 1,
        paddingBottom: 100, // Space for navbar
    },
    contentMatrix: {
        paddingTop: 200, // Adjust based on header height in matrix view
        paddingHorizontal: 20,
    },
    contentList: {
        paddingTop: 160, // Adjust based on header height in list view
        paddingHorizontal: 20,
    },
    viewToggleContainer: {
        flexDirection: 'row',
        alignItems: 'center',
    },
    viewToggleText: {
        fontSize: 12,
        fontFamily: 'Inter-Medium',
        color: '#6A009C',
        marginLeft: 4,
    },
    // List view filter styles
    listViewFilters: {
        marginBottom: 15,
    },
    dropdownBackdrop: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        zIndex: 999,
    },
    dropdownFiltersContainer: {
        paddingHorizontal: 20,
        marginBottom: 10,
        zIndex: 1000,
    },
    dropdownFiltersRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 12,
    },
    filterDropdown: {
        flex: 1,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e9ecef',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3.84,
        elevation: 2,
    },
    // Landscape-specific styles
    landscapeLayout: {
        flexDirection: 'column', // Changed to column for stacked layout
        marginTop: 20,
        gap: 12, // Reduced gap for better spacing
    },
    dropdownContainerLandscape: {
        width: '100%', // Full width instead of flex
        marginTop: 0,
        marginBottom: 0,
    },
    dropdownRowLandscape: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8, // Smaller gap for landscape
    },
    dropdownColumnLandscape: {
        flexDirection: 'column',
        gap: 8,
    },
    dropdownLandscape: {
        flex: 1, // Equal width for all dropdowns
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        paddingHorizontal: 10, // Reduced padding for better fit
        paddingVertical: 12,
        backgroundColor: '#fff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e9ecef',
        elevation: 2,
    },
    calendarContainerLandscape: {
        width: '100%', // Full width instead of flex
        marginBottom: 0,
    },
    calendarScrollContentLandscape: {
        paddingHorizontal: 2,
        alignItems: 'center',
    },
    dateItemLandscape: {
        paddingVertical: 8,
        paddingHorizontal: 12,
        marginHorizontal: 2,
        minWidth: 50,
    },
    dayTextLandscape: {
        fontSize: 10,
        marginBottom: 2,
    },
    dateTextLandscape: {
        fontSize: 14,
    },
    // Dropdown functionality styles
    dropdownWrapper: {
        flex: 1,
        position: 'relative',
        zIndex: 1000,
        marginHorizontal: 2,
    },
    dropdownMenu: {
        position: 'absolute',
        top: '100%',
        left: 0,
        right: 0,
        backgroundColor: '#ffffff',
        borderRadius: 8,
        borderWidth: 1,
        borderColor: '#e9ecef',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 15,
        zIndex: 2000,
        maxHeight: 200,
        marginTop: 4,
    },
    dropdownMenuItem: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        borderBottomWidth: 1,
        borderBottomColor: '#f8f9fa',
    },
    selectedDropdownItem: {
        backgroundColor: '#f0e6ff',
    },
    dropdownMenuText: {
        fontSize: 14,
        color: '#495057',
        fontFamily: 'Inter-Medium',
        flex: 1,
    },
    selectedDropdownText: {
        color: '#AD00FF',
        fontFamily: 'Inter-SemiBold',
        fontWeight: '600',
    },
    addTaskButton: {
        position: 'absolute',
        bottom: 100, // Above the navbar
        right: 24,
        width: 56,
        height: 56,
        borderRadius: 28,
        backgroundColor: '#ffffffff',
        justifyContent: 'center',
        alignItems: 'center',
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.24,
        shadowRadius: 16,
        elevation: 8,
    },
    // Dashboard styles
    dashboard: {
        paddingTop: 8,
        paddingBottom: 8,
    },
    dashboardRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        gap: 8,
    },
    dashboardCard: {
        flex: 1,
        backgroundColor: '#fff',
        borderRadius: 12,
        padding: 10,
        alignItems: 'center',
        shadowColor: '#1E293B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 8,
        elevation: 2,
    },
    dashboardNumber: {
        fontSize: 24,
        fontFamily: 'Inter-Bold',
        color: '#6A009C',
        marginBottom: 4,
    },
    dashboardLabel: {
        fontSize: 12,
        fontFamily: 'Inter-Medium',
        color: '#6c757d',
        textAlign: 'center',
    },
    // Status buttons styles
    statusButtons: {
        flexDirection: 'row',
        paddingHorizontal: 0,
        paddingVertical: 16,
        gap: 8,
    },
    statusButton: {
        flex: 1,
        paddingVertical: 12,
        paddingHorizontal: 0,
        borderRadius: 8,
        backgroundColor: '#fff',
        borderWidth: 1,
        borderColor: '#e9ecef',
        alignItems: 'center',
        shadowColor: '#1E293B',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
        elevation: 1,
    },
    activeStatusButton: {
        backgroundColor: '#6A009C',
        borderColor: '#6A009C',
    },
    statusButtonText: {
        fontSize: 14,
        fontFamily: 'Inter-Medium',
        color: '#495057',
    },
    activeStatusButtonText: {
        color: '#fff',
        fontFamily: 'Inter-SemiBold',
    },

    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
    },
    loadingText: {
        marginTop: 16,
        fontSize: 16,
        color: '#6A009C',
        fontFamily: 'Inter-Medium',
    },
});

export default ToDo;