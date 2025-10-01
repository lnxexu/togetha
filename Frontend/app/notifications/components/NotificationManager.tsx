import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet } from 'react-native';
import { 
  StatusNotification, 
  HeadsUpNotification, 
  DrawerNotification 
} from './NotificationDisplay';

import { MaterialIcons } from '@expo/vector-icons';

export interface NotificationData {
  id: string;
  type: 'status' | 'heads-up' | 'drawer';
  title: string;
  message: string;
  priority: 'high' | 'medium' | 'low';
  icon?: keyof typeof MaterialIcons.glyphMap;
  duration?: number;
  category?: 'task' | 'reminder' | 'download' | 'system';
}

interface NotificationManagerProps {
  notifications: NotificationData[];
  onNotificationPress?: (notification: NotificationData) => void;
  onNotificationDismiss?: (id: string) => void;
}

export const NotificationManager: React.FC<NotificationManagerProps> = ({
  notifications,
  onNotificationPress,
  onNotificationDismiss,
}) => {
  const [visibleNotifications, setVisibleNotifications] = useState<Set<string>>(new Set());

  useEffect(() => {
    // Show new notifications
    const newNotificationIds = notifications
      .filter(n => !visibleNotifications.has(n.id))
      .map(n => n.id);
    
    if (newNotificationIds.length > 0) {
      setVisibleNotifications(prev => new Set([...prev, ...newNotificationIds]));
    }
  }, [notifications]);

  const handleDismiss = useCallback((id: string) => {
    setVisibleNotifications(prev => {
      const newSet = new Set(prev);
      newSet.delete(id);
      return newSet;
    });
    onNotificationDismiss?.(id);
  }, [onNotificationDismiss]);

  const handlePress = useCallback((notification: NotificationData) => {
    onNotificationPress?.(notification);
    handleDismiss(notification.id);
  }, [onNotificationPress, handleDismiss]);

  // Separate notifications by type
  const statusNotifications = notifications.filter(n => n.type === 'status');
  const headsUpNotifications = notifications.filter(n => n.type === 'heads-up');
  const drawerNotifications = notifications.filter(n => n.type === 'drawer');

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Status Notifications (only show the latest one) */}
      {statusNotifications.length > 0 && (
        <StatusNotification
          {...statusNotifications[statusNotifications.length - 1]}
          visible={visibleNotifications.has(statusNotifications[statusNotifications.length - 1].id)}
          onPress={() => handlePress(statusNotifications[statusNotifications.length - 1])}
          onDismiss={() => handleDismiss(statusNotifications[statusNotifications.length - 1].id)}
        />
      )}

      {/* Heads-up Notifications (show one at a time, queue others) */}
      {headsUpNotifications
        .filter(n => visibleNotifications.has(n.id))
        .slice(0, 1) // Only show one at a time
        .map((notification) => (
          <HeadsUpNotification
            key={notification.id}
            {...notification}
            visible={true}
            onPress={() => handlePress(notification)}
            onDismiss={() => handleDismiss(notification.id)}
          />
        ))}

      {/* Drawer Notifications (can show multiple, stacked) */}
      {drawerNotifications
        .filter(n => visibleNotifications.has(n.id))
        .slice(0, 3) // Limit to 3 drawer notifications
        .map((notification, index) => (
          <View
            key={notification.id}
            style={[styles.drawerStack, { top: 120 + (index * 80) }]}
          >
            <DrawerNotification
              {...notification}
              visible={true}
              onPress={() => handlePress(notification)}
              onDismiss={() => handleDismiss(notification.id)}
            />
          </View>
        ))}
    </View>
  );
};

// Hook to manage notifications
export const useNotificationManager = () => {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);

  const showNotification = useCallback((notification: Omit<NotificationData, 'id'>) => {
    const id = Date.now().toString() + Math.random().toString(36).substr(2, 9);
    const newNotification: NotificationData = {
      ...notification,
      id,
    };

    setNotifications(prev => [...prev, newNotification]);

    // Auto-remove non-persistent notifications
    if (notification.type !== 'drawer') {
      const duration = notification.duration || (notification.type === 'status' ? 3000 : 5000);
      setTimeout(() => {
        removeNotification(id);
      }, duration);
    }

    return id;
  }, []);

  const removeNotification = useCallback((id: string) => {
    setNotifications(prev => prev.filter(n => n.id !== id));
  }, []);

  const clearAllNotifications = useCallback(() => {
    setNotifications([]);
  }, []);

  // Predefined notification creators
  const showTaskReminder = useCallback((title: string, message: string, priority: 'high' | 'medium' | 'low' = 'medium') => {
    return showNotification({
      type: 'heads-up',
      title,
      message,
      priority,
      icon: 'alarm',
      category: 'reminder',
      duration: 8000,
    });
  }, [showNotification]);

  const showDownloadNotification = useCallback((message: string, type: 'status' | 'drawer' = 'status') => {
    return showNotification({
      type,
      title: 'Download',
      message,
      priority: 'low',
      icon: 'download',
      category: 'download',
      duration: type === 'status' ? 2000 : undefined,
    });
  }, [showNotification]);

  const showTaskCreated = useCallback((taskTitle: string) => {
    return showNotification({
      type: 'status',
      title: 'Task Created',
      message: `"${taskTitle}" has been created`,
      priority: 'low',
      icon: 'add-task',
      category: 'task',
      duration: 2000,
    });
  }, [showNotification]);

  const showTaskCompleted = useCallback((taskTitle: string) => {
    return showNotification({
      type: 'heads-up',
      title: 'Task Completed!',
      message: `"${taskTitle}" has been completed`,
      priority: 'medium',
      icon: 'check-circle',
      category: 'task',
      duration: 4000,
    });
  }, [showNotification]);

  const showSystemNotification = useCallback((title: string, message: string, priority: 'high' | 'medium' | 'low' = 'medium') => {
    return showNotification({
      type: 'drawer',
      title,
      message,
      priority,
      icon: 'info',
      category: 'system',
    });
  }, [showNotification]);

  return {
    notifications,
    showNotification,
    removeNotification,
    clearAllNotifications,
    showTaskReminder,
    showDownloadNotification,
    showTaskCreated,
    showTaskCompleted,
    showSystemNotification,
  };
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  drawerStack: {
    position: 'absolute',
    right: 16,
    zIndex: 1000,
  },
});