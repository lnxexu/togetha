import { MaterialIcons } from "@expo/vector-icons";
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from "@react-navigation/native";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import React, { useState, useEffect } from "react";
import {
  Dimensions,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
  ActivityIndicator,
  RefreshControl,
  Modal,
  Alert,
  TextInput,
} from "react-native";
import DatePicker from 'react-native-date-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from "../navigation/AppNavigator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, API_ENDPOINTS, joinUrl } from "@/constants/ApiConfig";
import { NotificationService } from './services/notificationService';
import { NotificationManager, useNotificationManager } from './components/NotificationManager';

const { width } = Dimensions.get("window");

// Notification types
interface TaskDetails {
  id: string;
  title: string;
  description?: string;
  due_datetime?: string;
  priority: string;
  category?: string;
  completed: boolean;
}

interface Notification {
  id: string;
  type: 'task' | 'note' | 'reminder' | 'system';
  title: string;
  message: string;
  timestamp: string;
  scheduled_time?: string;
  read: boolean;
  action_id?: string;
  priority: 'high' | 'medium' | 'low';
  notification_type: string;
  related_task?: string;
  task_details?: TaskDetails;
  task_status?: any;
}

export default function Notifications() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [allNotifications, setAllNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  
  // Filter states
  const [showFilters, setShowFilters] = useState(false);
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [priorityFilter, setPriorityFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [startDate, setStartDate] = useState<Date | null>(null);
  const [endDate, setEndDate] = useState<Date | null>(null);
  const [showStartDatePicker, setShowStartDatePicker] = useState(false);
  const [showEndDatePicker, setShowEndDatePicker] = useState(false);
  
  // Notification manager hook
  const notificationManager = useNotificationManager();

  // Sample notifications data (replace with API call)
  const sampleNotifications: Notification[] = [];

 useEffect(() => {
    fetchNotifications();
  }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const data = await NotificationService.getNotifications();
      
      // Convert API data to our Notification format
      const formattedNotifications: Notification[] = data.map((item: any) => ({
        id: item.id.toString(),
        type: item.type as 'task' | 'note' | 'reminder' | 'system',
        title: item.title,
        message: item.message,
        timestamp: item.timestamp,
        scheduled_time: item.scheduled_time,
        read: item.read,
        action_id: item.action_id,
        priority: item.priority as 'high' | 'medium' | 'low',
        notification_type: item.notification_type,
        related_task: item.related_task,
        task_details: item.task_details,
      }));
      
      // Sort notifications to show newest first
      // Priority: Use timestamp as the primary sort field (when notification was created)
      // This ensures newly added notifications always appear at the top
      const sortedNotifications = formattedNotifications.sort((a, b) => {
        // Use timestamp as primary, fallback to scheduled_time if timestamp is missing, then use current time
        const aTime = new Date(a.timestamp || a.scheduled_time || new Date()).getTime();
        const bTime = new Date(b.timestamp || b.scheduled_time || new Date()).getTime();
        return bTime - aTime; // Descending order (newest first)
      });
      
      setAllNotifications(sortedNotifications);
      setNotifications(sortedNotifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
      setAllNotifications([]);
      setNotifications([]); // Set empty array on error
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };
    
  const onRefresh = async () => {
    setRefreshing(true);
    await fetchNotifications();
  };
  

  const markAsRead = async (notificationId: string) => {
    try {
      await NotificationService.markAsRead(notificationId);
      // Update state
      setNotifications(prev => 
        prev.map(notif => 
          notif.id === notificationId 
            ? { ...notif, read: true }
            : notif
        )
      );
    } catch (error) {
      console.error("Error marking notification as read:", error);
    }
  };

    const markAllAsRead = async () => {
    try {
      const unreadNotifications = notifications.filter(notif => !notif.read);
      await Promise.all(
        unreadNotifications.map(notif => NotificationService.markAsRead(notif.id))
      );
      // Update state
      setNotifications(prev => 
        prev.map(notif => ({ ...notif, read: true }))
      );
    } catch (error) {
      console.error("Error marking all notifications as read:", error);
    }
  };


  // Check task status for smart redirection
  const checkTaskStatus = async (taskId: string) => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) return null;
      
      const response = await fetch(joinUrl(API_URL, API_ENDPOINTS.TASK_DETAIL(taskId)), {
        headers: {
          'Authorization': `Token ${token}`,
          'Content-Type': 'application/json',
        },
      });
      
      if (response.ok) {
        return await response.json();
      } else if (response.status === 404) {
        return { deleted: true };
      }
      return null;
    } catch (error) {
      console.error('Error checking task status:', error);
      return null;
    }
  };

  const handleNotificationPress = async (notification: Notification) => {
    // Mark as read when notification is viewed
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    // Show notification detail with enhanced preview
    await showNotificationDetail(notification);
  };

  const getNotificationIcon = (notification: Notification): keyof typeof MaterialIcons.glyphMap => {
    // Check specific notification type first
    switch (notification.notification_type) {
      case 'task_created':
        return 'add-task';
      case 'task_completed':
        return 'check-circle';
      case 'task_updated':
        return 'edit';
      case 'task_deleted':
        return 'delete';
      case 'task_due_today':
        return 'today';
      case 'task_due_tomorrow':
        return 'event';
      case 'task_reminder':
        return 'alarm';
      default:
        break;
    }
    
    // Fallback to general type
    switch (notification.type) {
      case 'task':
        return 'assignment';
      case 'note':
        return 'note';
      case 'reminder':
        return 'alarm';
      case 'system':
        return 'info';
      default:
        return 'notifications';
    }
  };

  const getNotificationColor = (notification: Notification) => {
    // Check specific notification type first for custom colors
    switch (notification.notification_type) {
      case 'task_created':
        return '#10B981'; // Green for new tasks
      case 'task_completed':
        return '#059669'; // Darker green for completion
      case 'task_updated':
        return '#3B82F6'; // Blue for updates
      case 'task_deleted':
        return '#EF4444'; // Red for deletion
      case 'task_due_today':
        return '#F59E0B'; // Orange for urgent
      case 'task_due_tomorrow':
        return '#8B5CF6'; // Purple for upcoming
      case 'task_reminder':
        return '#F59E0B'; // Orange for reminders
      default:
        break;
    }
    
    // Fallback to priority-based colors
    if (notification.priority === 'high') return '#EF4444';
    
    switch (notification.type) {
      case 'task':
        return '#3B82F6';
      case 'note':
        return '#10B981';
      case 'reminder':
        return '#F59E0B';
      case 'system':
        return '#8B5CF6';
      default:
        return '#6B7280';
    }
  };

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString);
    const now = new Date();
    const diffInMs = now.getTime() - date.getTime();
    
    const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
    const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
    const diffInDays = Math.floor(diffInHours / 24);

    if (diffInMinutes < 1) {
      return "Just now";
    } else if (diffInMinutes < 60) {
      return `${diffInMinutes}m ago`;
    } else if (diffInHours < 24) {
      return `${diffInHours}h ago`;
    } else {
      return `${diffInDays}d ago`;
    }
  };
  
  // Filter functions
  const applyFilters = () => {
    let filtered = [...allNotifications];
    
    // Type filter
    if (typeFilter !== 'all') {
      filtered = filtered.filter(notif => notif.type === typeFilter);
    }
    
    // Priority filter
    if (priorityFilter !== 'all') {
      filtered = filtered.filter(notif => notif.priority === priorityFilter);
    }
    
    // Search query filter
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(notif => 
        notif.title.toLowerCase().includes(query) ||
        notif.message.toLowerCase().includes(query)
      );
    }
    
    // Date range filter
    if (startDate || endDate) {
      filtered = filtered.filter(notif => {
        const notifDate = new Date(notif.timestamp);
        const start = startDate ? new Date(startDate.getFullYear(), startDate.getMonth(), startDate.getDate()) : null;
        const end = endDate ? new Date(endDate.getFullYear(), endDate.getMonth(), endDate.getDate(), 23, 59, 59) : null;
        
        if (start && end) {
          return notifDate >= start && notifDate <= end;
        } else if (start) {
          return notifDate >= start;
        } else if (end) {
          return notifDate <= end;
        }
        return true;
      });
    }
    
    // Re-sort filtered results to maintain newest-first order
    filtered.sort((a, b) => {
      const aTime = new Date(a.timestamp || a.scheduled_time || new Date()).getTime();
      const bTime = new Date(b.timestamp || b.scheduled_time || new Date()).getTime();
      return bTime - aTime;
    });
    
    setNotifications(filtered);
  };
  
  const clearFilters = () => {
    setTypeFilter('all');
    setPriorityFilter('all');
    setSearchQuery('');
    setStartDate(null);
    setEndDate(null);
    setNotifications(allNotifications);
  };
  
  const formatDate = (date: Date | null) => {
    if (!date) return 'Select date';
    return date.toLocaleDateString();
  };
  
  const getTypeOptions = () => {
    const types = [...new Set(allNotifications.map(notif => notif.type).filter(Boolean))];
    return ['all', ...types];
  };
  
  const getPriorityOptions = () => {
    const priorities = [...new Set(allNotifications.map(notif => notif.priority).filter(Boolean))];
    return ['all', ...priorities];
  };
  
  // Apply filters when filter values change
  useEffect(() => {
    if (allNotifications.length > 0) {
      applyFilters();
    }
  }, [typeFilter, priorityFilter, searchQuery, startDate, endDate, allNotifications]);

  const showNotificationDetail = async (notification: Notification) => {
    try {
      // Fetch full notification details from the API
      const detailData = await NotificationService.getNotificationDetail(notification.id);
      
      let enhancedNotification = {
        ...notification,
        task_details: detailData.task_details
      };
      
      // If this is a task-related notification, check task status
      if (notification.type === 'task' && notification.related_task) {
        const taskStatus = await checkTaskStatus(notification.related_task);
        enhancedNotification = {
          ...enhancedNotification,
          task_status: taskStatus
        };
      }
      
      setSelectedNotification(enhancedNotification);
      setShowDetailModal(true);
    } catch (error) {
      console.error('Error showing notification detail:', error);
      // Fallback to showing the notification without extra details
      setSelectedNotification(notification);
      setShowDetailModal(true);
    }
  };

  const filteredNotifications = notifications.filter(notif => 
    filter === 'all' || (filter === 'unread' && !notif.read)
  );

  // Handle task navigation based on task status
  const handleTaskNavigation = async (notification: any) => {
    if (!notification.related_task && !notification.action_id) return;
    
    const taskStatus = notification.task_status;
    const taskId = notification.related_task || notification.action_id;
    
    if (taskStatus?.deleted) {
      Alert.alert('Task Not Found', 'This task has been deleted and is no longer available.');
      return;
    }
    
    if (taskStatus?.completed) {
      Alert.alert(
        'Task Completed',
        'This task has been completed. Would you like to view your completed tasks?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'View Completed',
            onPress: () => {
              setShowDetailModal(false);
              navigation.navigate('CompletedTasks');
            }
          }
        ]
      );
      return;
    }
    
    // Task is active, navigate to task details
    setShowDetailModal(false);
    try {
      navigation.navigate('TaskDetails', { taskId: taskId });
    } catch (error) {
      console.error('Navigation error:', error);
      // Fallback to home if TaskDetails route doesn't exist or fails
      navigation.navigate('Home');
    }
  };

  const unreadCount = notifications.filter(notif => !notif.read).length;

  return (
    <View style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor="#7C3AED" />

      {/* Header */}
      <LinearGradient
        colors={['#A855F7', '#8B5CF6', '#7C3AED']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <View style={styles.headerContent}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Notifications</Text>
            {unreadCount > 0 && (
              <View style={styles.unreadBadge}>
                <Text style={styles.unreadBadgeText}>{unreadCount}</Text>
              </View>
            )}
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity
              style={styles.filterButton}
              onPress={() => setShowFilters(true)}
            >
              <Ionicons name="filter" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            
            {unreadCount > 0 && (
              <TouchableOpacity
                style={styles.markAllButton}
                onPress={markAllAsRead}
              >
                <Ionicons name="checkmark-done" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </LinearGradient>

      {/* Filter Tabs */}
      <View style={styles.filterContainer}>
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'all' && styles.activeFilterTab
          ]}
          onPress={() => setFilter('all')}
        >
          <Text style={[
            styles.filterTabText,
            filter === 'all' && styles.activeFilterTabText
          ]}>
            All ({notifications.length})
          </Text>
        </TouchableOpacity>
        
        <TouchableOpacity
          style={[
            styles.filterTab,
            filter === 'unread' && styles.activeFilterTab
          ]}
          onPress={() => setFilter('unread')}
        >
          <Text style={[
            styles.filterTabText,
            filter === 'unread' && styles.activeFilterTabText
          ]}>
            Unread ({unreadCount})
          </Text>
        </TouchableOpacity>
      </View>

      {/* Notifications List */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#6A009C" />
          <Text style={styles.loadingText}>Loading notifications...</Text>
        </View>
      ) : filteredNotifications.length === 0 ? (
        <View style={styles.emptyContainer}>
          <MaterialIcons name="notifications-none" size={64} color="#CBD5E0" />
          <Text style={styles.emptyTitle}>
            {filter === 'unread' ? 'No unread notifications' : 'No notifications yet'}
          </Text>
          <Text style={styles.emptySubtitle}>
            {filter === 'unread' 
              ? 'All caught up! Check back later for new updates.'
              : 'You\'ll see notifications about tasks, notes, and reminders here.'
            }
          </Text>
        </View>
      ) : (
        <ScrollView
          style={styles.notificationsList}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={["#6A009C"]}
              tintColor="#6A009C"
            />
          }
        >
          {filteredNotifications.map((notification) => (
            <TouchableOpacity
              key={notification.id}
              style={[
                styles.notificationCard,
                !notification.read && styles.unreadNotificationCard
              ]}
              activeOpacity={0.7}
              onPress={() => handleNotificationPress(notification)}
            >
              <View style={styles.notificationContent}>
                <View style={[
                  styles.notificationIcon,
                  { backgroundColor: `${getNotificationColor(notification)}15` },
                  !notification.read && styles.unreadNotificationIcon
                ]}>
                  <MaterialIcons
                    name={getNotificationIcon(notification)}
                    size={24}
                    color={getNotificationColor(notification)}
                  />
                </View>

                <View style={styles.notificationText}>
                  <View style={styles.notificationHeader}>
                    <Text 
                      style={[
                        styles.notificationTitle,
                        !notification.read && styles.unreadNotificationTitle
                      ]}
                      numberOfLines={1}
                    >
                      {notification.title}
                    </Text>
                    {!notification.read && <View style={styles.unreadDot} />}
                  </View>
                  
                  <Text 
                    style={[
                      styles.notificationMessage,
                      !notification.read && styles.unreadNotificationMessage
                    ]}
                    numberOfLines={2}
                  >
                    {notification.message}
                  </Text>

                  <View style={styles.notificationFooter}>
                    <View style={styles.notificationMetadata}>
                      <Ionicons name="time-outline" size={14} color="#9CA3AF" />
                      <Text style={styles.notificationTime}>
                        {formatTimeAgo(notification.timestamp)}
                      </Text>
                    </View>
                    
                    {notification.priority === 'high' && (
                      <View style={styles.priorityBadge}>
                        <MaterialIcons name="priority-high" size={10} color="#EF4444" />
                        <Text style={styles.priorityBadgeText}>High</Text>
                      </View>
                    )}
                  </View>
                </View>
              </View>
            </TouchableOpacity>
          ))}
          
          {/* Bottom spacing */}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}
      
      {/* Notification Manager for push notifications */}
      <NotificationManager
        notifications={notificationManager.notifications}
        onNotificationPress={(notification) => {
          console.log('Notification pressed:', notification);
        }}
        onNotificationDismiss={(id) => {
          notificationManager.removeNotification(id);
        }}
      />
      
      {/* Filter Modal */}
      <Modal
        visible={showFilters}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowFilters(false)}
      >
        <View style={styles.filterModal}>
          <View style={styles.filterHeader}>
            <Text style={styles.filterTitle}>Filter Notifications</Text>
            <TouchableOpacity
              onPress={() => setShowFilters(false)}
              style={styles.closeFilterButton}
            >
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>
          
          <ScrollView style={styles.filterContent}>
            {/* Type Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Notification Type</Text>
              <View style={styles.filterButtonContainer}>
                {getTypeOptions().map((type) => (
                  <TouchableOpacity
                    key={type}
                    style={[
                      styles.filterOptionButton,
                      typeFilter === type && styles.activeFilterOption
                    ]}
                    onPress={() => setTypeFilter(type)}
                  >
                    <Text style={[
                      styles.filterOptionText,
                      typeFilter === type && styles.activeFilterOptionText
                    ]}>
                      {type.charAt(0).toUpperCase() + type.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            
            {/* Priority Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Priority</Text>
              <View style={styles.filterButtonContainer}>
                {getPriorityOptions().map((priority) => (
                  <TouchableOpacity
                    key={priority}
                    style={[
                      styles.filterOptionButton,
                      priorityFilter === priority && styles.activeFilterOption
                    ]}
                    onPress={() => setPriorityFilter(priority)}
                  >
                    <Text style={[
                      styles.filterOptionText,
                      priorityFilter === priority && styles.activeFilterOptionText
                    ]}>
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
            
            {/* Search Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Search</Text>
              <TextInput
                style={styles.filterInput}
                placeholder="Search notifications..."
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholderTextColor="#9CA3AF"
              />
            </View>
            
            {/* Date Range Filter */}
            <View style={styles.filterSection}>
              <Text style={styles.filterLabel}>Date Range</Text>
              
              <View style={styles.dateFilterRow}>
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowStartDatePicker(true)}
                >
                  <Ionicons name="calendar" size={20} color="#6A009C" />
                  <Text style={styles.dateButtonText}>
                    From: {formatDate(startDate)}
                  </Text>
                </TouchableOpacity>
                
                <TouchableOpacity
                  style={styles.dateButton}
                  onPress={() => setShowEndDatePicker(true)}
                >
                  <Ionicons name="calendar" size={20} color="#6A009C" />
                  <Text style={styles.dateButtonText}>
                    To: {formatDate(endDate)}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
            
            {/* Filter Actions */}
            <View style={styles.filterActions}>
              <TouchableOpacity
                style={styles.clearFiltersButton}
                onPress={clearFilters}
              >
                <Text style={styles.clearFiltersText}>Clear All</Text>
              </TouchableOpacity>
              
              <TouchableOpacity
                style={styles.applyFiltersButton}
                onPress={() => setShowFilters(false)}
              >
                <Text style={styles.applyFiltersText}>Apply Filters</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </View>
      </Modal>
      
      {/* Date Pickers */}
      <DatePicker
        modal
        open={showStartDatePicker}
        date={startDate || new Date()}
        mode="date"
        onConfirm={(date) => {
          setStartDate(date);
          setShowStartDatePicker(false);
        }}
        onCancel={() => setShowStartDatePicker(false)}
        title="Select Start Date"
      />
      
      <DatePicker
        modal
        open={showEndDatePicker}
        date={endDate || new Date()}
        mode="date"
        onConfirm={(date) => {
          setEndDate(date);
          setShowEndDatePicker(false);
        }}
        onCancel={() => setShowEndDatePicker(false)}
        title="Select End Date"
      />

      {/* Notification Detail Modal */}
      <Modal
        visible={showDetailModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowDetailModal(false)}
      >
        <View style={styles.modalContainer}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Notification Details</Text>
            <TouchableOpacity
              onPress={() => setShowDetailModal(false)}
              style={styles.closeButton}
            >
              <Ionicons name="close" size={24} color="#6B7280" />
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalContent}>
            {selectedNotification && (
              <View>
                <View style={styles.modalNotificationItem}>
                  <View style={styles.modalNotificationHeader}>
                    <MaterialIcons
                      name={getNotificationIcon(selectedNotification)}
                      size={24}
                      color={getNotificationColor(selectedNotification)}
                    />
                    <View style={styles.modalNotificationInfo}>
                      <Text style={styles.modalNotificationTitle}>
                        {selectedNotification.title}
                      </Text>
                      <Text style={styles.modalNotificationTime}>
                        {formatTimeAgo(selectedNotification.timestamp)}
                      </Text>
                    </View>
                    {selectedNotification.priority === 'high' && (
                      <View style={styles.priorityBadge}>
                        <Text style={styles.priorityBadgeText}>High Priority</Text>
                      </View>
                    )}
                  </View>

                  <Text style={styles.modalNotificationMessage}>
                    {selectedNotification.message}
                  </Text>

                  {selectedNotification.task_details && (
                    <View style={styles.taskDetailsContainer}>
                      <Text style={styles.taskDetailsTitle}>Task Details</Text>
                      
                      <View style={styles.taskDetailRow}>
                        <Text style={styles.taskDetailLabel}>Title:</Text>
                        <Text style={styles.taskDetailValue}>
                          {selectedNotification.task_details.title}
                        </Text>
                      </View>

                      {selectedNotification.task_details.description && (
                        <View style={styles.taskDetailRow}>
                          <Text style={styles.taskDetailLabel}>Description:</Text>
                          <Text style={styles.taskDetailValue}>
                            {selectedNotification.task_details.description}
                          </Text>
                        </View>
                      )}

                      {selectedNotification.task_details.due_datetime && (
                        <View style={styles.taskDetailRow}>
                          <Text style={styles.taskDetailLabel}>Due Date:</Text>
                          <Text style={styles.taskDetailValue}>
                            {new Date(selectedNotification.task_details.due_datetime).toLocaleDateString()} at {new Date(selectedNotification.task_details.due_datetime).toLocaleTimeString()}
                          </Text>
                        </View>
                      )}

                      <View style={styles.taskDetailRow}>
                        <Text style={styles.taskDetailLabel}>Priority:</Text>
                        <Text style={styles.taskDetailValue}>
                          {selectedNotification.task_details.priority}
                        </Text>
                      </View>

                      {selectedNotification.task_details.category && (
                        <View style={styles.taskDetailRow}>
                          <Text style={styles.taskDetailLabel}>Category:</Text>
                          <Text style={styles.taskDetailValue}>
                            {selectedNotification.task_details.category}
                          </Text>
                        </View>
                      )}

                      <View style={styles.taskDetailRow}>
                        <Text style={styles.taskDetailLabel}>Status:</Text>
                        <Text style={[
                          styles.taskDetailValue,
                          selectedNotification.task_details.completed 
                            ? styles.taskStatusCompleted 
                            : styles.taskStatusPending
                        ]}>
                          {selectedNotification.task_details.completed ? 'Completed' : 'Pending'}
                        </Text>
                      </View>
                    </View>
                  )}
                  
                  {/* Task Actions */}
                  {selectedNotification.type === 'task' && selectedNotification.related_task && (
                    <View style={styles.taskActionsContainer}>
                      <Text style={styles.taskActionsTitle}>Actions</Text>
                      
                      {selectedNotification.task_status?.deleted ? (
                        <View style={styles.taskStatusInfo}>
                          <MaterialIcons name="delete" size={20} color="#EF4444" />
                          <Text style={styles.taskStatusText}>This task has been deleted</Text>
                        </View>
                      ) : selectedNotification.task_status?.completed ? (
                        <View style={styles.taskStatusInfo}>
                          <MaterialIcons name="check-circle" size={20} color="#10B981" />
                          <Text style={styles.taskStatusText}>This task is completed</Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          style={styles.taskActionButton}
                          onPress={() => handleTaskNavigation(selectedNotification)}
                        >
                          <MaterialIcons name="arrow-forward" size={20} color="#FFFFFF" />
                          <Text style={styles.taskActionButtonText}>View Task Details</Text>
                        </TouchableOpacity>
                      )}
                      
                      {!selectedNotification.task_status?.deleted && (
                        <TouchableOpacity
                          style={styles.taskActionButtonSecondary}
                          onPress={() => {
                            setShowDetailModal(false);
                            navigation.navigate('Home');
                          }}
                        >
                          <MaterialIcons name="home" size={20} color="#6A009C" />
                          <Text style={styles.taskActionButtonSecondaryText}>Go to Home</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </View>
              </View>
            )}
          </ScrollView>
          
          {/* Modal Footer with Quick Actions */}
          <View style={styles.modalFooter}>
            <TouchableOpacity
              style={styles.modalFooterButton}
              onPress={() => setShowDetailModal(false)}
            >
              <Text style={styles.modalFooterButtonText}>Close</Text>
            </TouchableOpacity>
            
            {selectedNotification && !selectedNotification.read && (
              <TouchableOpacity
                style={[styles.modalFooterButton, styles.modalFooterButtonPrimary]}
                onPress={async () => {
                  await markAsRead(selectedNotification.id);
                  setShowDetailModal(false);
                }}
              >
                <Text style={[styles.modalFooterButtonText, styles.modalFooterButtonPrimaryText]}>
                  Mark as Read
                </Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 50 : 35,
    paddingBottom: 20,
    paddingHorizontal: 24,
  },
  headerContent: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  backButton: {
    padding: 8,
  },
  headerTitleContainer: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
    justifyContent: "center",
  },
  headerTitle: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#FFFFFF",
  },
  unreadBadge: {
    backgroundColor: "#EF4444",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginLeft: 8,
    minWidth: 24,
    alignItems: "center",
  },
  unreadBadgeText: {
    fontSize: 12,
    fontFamily: "Inter-Bold",
    color: "#FFFFFF",
  },
  markAllButton: {
    padding: 8,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 8,
  },
  filterContainer: {
    flexDirection: "row",
    backgroundColor: "#FFFFFF",
    marginHorizontal: 24,
    marginTop: 16,
    borderRadius: 12,
    padding: 4,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    alignItems: "center",
  },
  activeFilterTab: {
    backgroundColor: "#6A009C",
  },
  filterTabText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#64748B",
  },
  activeFilterTabText: {
    color: "#FFFFFF",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  loadingText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    marginTop: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginTop: 16,
    textAlign: "center",
  },
  emptySubtitle: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    marginTop: 8,
    textAlign: "center",
    lineHeight: 20,
  },
  notificationsList: {
    flex: 1,
    paddingHorizontal: 24,
    paddingTop: 16,
  },
  notificationCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 16,
    marginBottom: 12,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 2,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  unreadNotificationCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#6A009C",
    backgroundColor: "#FEFEFE",
    shadowOpacity: 0.08,
  },
  notificationContent: {
    flexDirection: "row",
    flex: 1,
    alignItems: "flex-start",
  },
  notificationIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },
  unreadNotificationIcon: {
    shadowColor: "#6A009C",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  notificationText: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  notificationTitle: {
    fontSize: 15,
    fontFamily: "Inter-SemiBold",
    color: "#334155",
    flex: 1,
    marginRight: 8,
  },
  unreadNotificationTitle: {
    fontFamily: "Inter-Bold",
    color: "#1E293B",
  },
  notificationMessage: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    lineHeight: 20,
    marginBottom: 8,
  },
  unreadNotificationMessage: {
    color: "#475569",
  },
  notificationFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  notificationMetadata: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  notificationTime: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#9CA3AF",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6A009C",
  },
  priorityBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FEF2F2",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 3,
    gap: 2,
  },
  priorityBadgeText: {
    fontSize: 10,
    fontFamily: "Inter-Bold",
    color: "#EF4444",
    textTransform: "uppercase",
  },
  
  // Modal styles
  modalContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  modalTitle: {
    fontSize: 18,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
  },
  closeButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  modalContent: {
    flex: 1,
    padding: 20,
  },
  modalNotificationItem: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modalNotificationHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  modalNotificationInfo: {
    flex: 1,
    marginLeft: 12,
  },
  modalNotificationTitle: {
    fontSize: 16,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginBottom: 4,
  },
  modalNotificationTime: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#64748B",
  },
  modalNotificationMessage: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#475569",
    lineHeight: 20,
    marginBottom: 16,
  },
  taskDetailsContainer: {
    backgroundColor: "#F8FAFC",
    borderRadius: 8,
    padding: 16,
    marginTop: 8,
  },
  taskDetailsTitle: {
    fontSize: 16,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginBottom: 12,
  },
  taskDetailRow: {
    flexDirection: "column",
    marginBottom: 8,
  },
  taskDetailLabel: {
    fontSize: 12,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    textTransform: "uppercase",
    marginBottom: 2,
  },
  taskDetailValue: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#1E293B",
  },
  taskStatusCompleted: {
    color: "#059669",
    fontFamily: "Inter-Bold",
  },
  taskStatusPending: {
    color: "#DC2626",
    fontFamily: "Inter-Bold",
  },
  
  // Filter styles
  headerActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  filterButton: {
    padding: 8,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    borderRadius: 8,
  },
  filterModal: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  filterHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#E2E8F0",
  },
  filterTitle: {
    fontSize: 18,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
  },
  closeFilterButton: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
  },
  filterContent: {
    flex: 1,
    padding: 20,
  },
  filterSection: {
    marginBottom: 24,
  },
  filterLabel: {
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: "#1E293B",
    marginBottom: 12,
  },
  filterButtonContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  filterOptionButton: {
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  activeFilterOption: {
    backgroundColor: "#6A009C",
    borderColor: "#6A009C",
  },
  filterOptionText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#64748B",
  },
  activeFilterOptionText: {
    color: "#FFFFFF",
  },
  filterInput: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    fontSize: 16,
    fontFamily: "Inter-Regular",
    backgroundColor: "#FFFFFF",
    color: "#1E293B",
  },
  dateFilterRow: {
    flexDirection: "row",
    gap: 12,
  },
  dateButton: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 12,
    backgroundColor: "#FFFFFF",
    gap: 8,
  },
  dateButtonText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#1E293B",
    flex: 1,
  },
  filterActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 32,
  },
  clearFiltersButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
  },
  clearFiltersText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#64748B",
  },
  applyFiltersButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: "#6A009C",
    alignItems: "center",
  },
  applyFiltersText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#FFFFFF",
  },
  
  // Task actions styles
  taskActionsContainer: {
    backgroundColor: "#F8FAFC",
    borderRadius: 12,
    padding: 16,
    marginTop: 16,
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  taskActionsTitle: {
    fontSize: 16,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginBottom: 12,
  },
  taskStatusInfo: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#F3F4F6",
    padding: 12,
    borderRadius: 8,
    gap: 8,
  },
  taskStatusText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#64748B",
    flex: 1,
  },
  taskActionButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#6A009C",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
    marginTop: 8,
  },
  taskActionButtonText: {
    fontSize: 14,
    fontFamily: "Inter-SemiBold",
    color: "#FFFFFF",
  },
  taskActionButtonSecondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#6A009C",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    gap: 8,
    marginTop: 8,
  },
  taskActionButtonSecondaryText: {
    fontSize: 14,
    fontFamily: "Inter-SemiBold",
    color: "#6A009C",
  },
  
  // Modal footer styles
  modalFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    gap: 12,
  },
  modalFooterButton: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: "#F1F5F9",
    alignItems: "center",
  },
  modalFooterButtonPrimary: {
    backgroundColor: "#6A009C",
  },
  modalFooterButtonText: {
    fontSize: 16,
    fontFamily: "Inter-Medium",
    color: "#64748B",
  },
  modalFooterButtonPrimaryText: {
    color: "#FFFFFF",
  },

});
