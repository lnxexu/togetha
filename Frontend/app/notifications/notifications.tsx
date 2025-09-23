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
} from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import { RootStackParamList } from "../navigation/AppNavigator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, API_ENDPOINTS } from "@/constants/ApiConfig";
import { NotificationService } from './services/notificationService';

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
}

export default function Notifications() {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const [selectedNotification, setSelectedNotification] = useState<Notification | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

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
      
      setNotifications(formattedNotifications);
    } catch (error) {
      console.error('Error fetching notifications:', error);
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


  const handleNotificationPress = async (notification: Notification) => {
    // Mark as read when notification is viewed
    if (!notification.read) {
      await markAsRead(notification.id);
    }

    // Show notification detail first
    await showNotificationDetail(notification);

    // Navigate based on notification type
    switch (notification.type) {
      case 'task':
        if (notification.action_id) {
          navigation.navigate("Home"); // Navigate to home where tasks are shown
        }
        break;
      case 'note':
        if (notification.action_id) {
          navigation.navigate("Notes");
        }
        break;
      default:
        break;
    }
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

  const showNotificationDetail = async (notification: Notification) => {
    try {
      // Fetch full notification details from the API
      const detailData = await NotificationService.getNotificationDetail(notification.id);
      
      // Update the notification with full details
      setSelectedNotification({
        ...notification,
        task_details: detailData.task_details
      });
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

          <TouchableOpacity
            style={styles.markAllButton}
            onPress={markAllAsRead}
            disabled={unreadCount === 0}
          >
            <Text style={[
              styles.markAllButtonText,
              { opacity: unreadCount === 0 ? 0.5 : 1 }
            ]}>
              Mark All
            </Text>
          </TouchableOpacity>
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
              activeOpacity={0.8}
              onPress={() => handleNotificationPress(notification)}
            >
              <View style={styles.notificationContent}>
                <View style={[
                  styles.notificationIcon,
                  { backgroundColor: `${getNotificationColor(notification)}20` }
                ]}>
                  <MaterialIcons
                    name={getNotificationIcon(notification)}
                    size={24}
                    color={getNotificationColor(notification)}
                  />
                </View>

                <View style={styles.notificationText}>
                  <View style={styles.notificationHeader}>
                    <Text style={[
                      styles.notificationTitle,
                      !notification.read && styles.unreadNotificationTitle
                    ]}>
                      {notification.title}
                    </Text>
                    <Text style={styles.notificationTime}>
                      {formatTimeAgo(notification.timestamp)}
                    </Text>
                  </View>
                  
                  <Text style={styles.notificationMessage}>
                    {notification.message}
                  </Text>

                  {notification.priority === 'high' && (
                    <View style={styles.priorityBadge}>
                      <Text style={styles.priorityBadgeText}>High Priority</Text>
                    </View>
                  )}
                </View>

                {!notification.read && <View style={styles.unreadDot} />}
              </View>

            </TouchableOpacity>
          ))}
          
          {/* Bottom spacing */}
          <View style={{ height: 100 }} />
        </ScrollView>
      )}

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
                </View>
              </View>
            )}
          </ScrollView>
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
  },
  markAllButtonText: {
    fontSize: 14,
    fontFamily: "Inter-Medium",
    color: "#FFFFFF",
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
    borderColor: "rgba(226, 232, 240, 0.6)",
    flexDirection: "row",
    alignItems: "flex-start",
  },
  unreadNotificationCard: {
    borderLeftWidth: 4,
    borderLeftColor: "#6A009C",
    backgroundColor: "#FEFEFE",
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
  notificationText: {
    flex: 1,
  },
  notificationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 4,
  },
  notificationTitle: {
    fontSize: 16,
    fontFamily: "Inter-SemiBold",
    color: "#1E293B",
    flex: 1,
    lineHeight: 20,
  },
  unreadNotificationTitle: {
    fontFamily: "Inter-Bold",
  },
  notificationTime: {
    fontSize: 12,
    fontFamily: "Inter-Regular",
    color: "#9CA3AF",
    marginLeft: 8,
  },
  notificationMessage: {
    fontSize: 14,
    fontFamily: "Inter-Regular",
    color: "#64748B",
    lineHeight: 18,
    marginBottom: 8,
  },
  priorityBadge: {
    backgroundColor: "#FEF2F2",
    borderColor: "#EF4444",
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    alignSelf: "flex-start",
  },
  priorityBadgeText: {
    fontSize: 10,
    fontFamily: "Inter-Bold",
    color: "#EF4444",
    textTransform: "uppercase",
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6A009C",
    marginLeft: 8,
    marginTop: 4,
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

});
