import { useEffect, useRef, useCallback } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import * as Notifications from 'expo-notifications';
import { 
  pushNotificationService, 
  initializePushNotificationsAfterLogin,
  arePushNotificationsInitialized 
} from '../services/PushNotificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';

interface UsePushNotificationsProps {
  onNotificationReceived?: (notification: any) => void;
  onNotificationPressed?: (response: any) => void;
  userId?: string;
}

export const usePushNotifications = ({
  onNotificationReceived,
  onNotificationPressed,
  userId
}: UsePushNotificationsProps = {}) => {
  const appState = useRef(AppState.currentState);
  const notificationListener = useRef<any>(null);
  const responseListener = useRef<any>(null);

  // Initialize push notifications after user login
  const initializeAfterLogin = useCallback(async () => {
    try {
      if (!userId) return false;
      
      const alreadyInitialized = await arePushNotificationsInitialized();
      if (alreadyInitialized) {
        console.log('Push notifications already initialized');
        return true;
      }
      
      const success = await initializePushNotificationsAfterLogin();
      if (success) {
        console.log('Push notifications initialized successfully after login');
      }
      
      return success;
    } catch (error) {
      console.error('Error initializing push notifications after login:', error);
      return false;
    }
  }, [userId]);

  // Schedule task-related notifications
  const scheduleTaskNotification = useCallback(async (
    taskTitle: string, 
    dueDate: Date,
    reminderMinutes: number = 30
  ) => {
    try {
      const reminderTime = new Date(dueDate.getTime() - (reminderMinutes * 60 * 1000));
      const now = new Date();
      
      if (reminderTime > now) {
        const notificationId = await pushNotificationService.schedulePushNotification(
          'Task Due Soon',
          `"${taskTitle}" is due in ${reminderMinutes} minutes`,
          { date: reminderTime }
        );
        
        // Store notification ID for potential cancellation
        const taskNotifications = await AsyncStorage.getItem('taskNotifications') || '{}';
        const notifications = JSON.parse(taskNotifications);
        notifications[taskTitle] = notificationId;
        await AsyncStorage.setItem('taskNotifications', JSON.stringify(notifications));
        
        return notificationId;
      }
      
      return null;
    } catch (error) {
      console.error('Error scheduling task notification:', error);
      return null;
    }
  }, []);

  // Cancel task notification
  const cancelTaskNotification = useCallback(async (taskTitle: string) => {
    try {
      const taskNotifications = await AsyncStorage.getItem('taskNotifications') || '{}';
      const notifications = JSON.parse(taskNotifications);
      
      if (notifications[taskTitle]) {
        await pushNotificationService.cancelNotification(notifications[taskTitle]);
        delete notifications[taskTitle];
        await AsyncStorage.setItem('taskNotifications', JSON.stringify(notifications));
      }
    } catch (error) {
      console.error('Error canceling task notification:', error);
    }
  }, []);

  // Celebrate task completion
  const celebrateTaskCompletion = useCallback(async (taskTitle: string) => {
    try {
      await pushNotificationService.scheduleTaskCompletionCelebration(taskTitle);
      // Also cancel any pending reminders for this task
      await cancelTaskNotification(taskTitle);
    } catch (error) {
      console.error('Error celebrating task completion:', error);
    }
  }, [cancelTaskNotification]);

  // Handle app state changes for inactivity reminders
  const handleAppStateChange = useCallback(async (nextAppState: AppStateStatus) => {
    if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
      // App has come to the foreground
      console.log('App has come to the foreground');
      
      // Cancel any pending inactivity reminders
      // You could implement logic here to cancel specific notifications
    } else if (appState.current === 'active' && nextAppState.match(/inactive|background/)) {
      // App has gone to the background
      console.log('App has gone to the background');
      
      // Schedule inactivity reminder (e.g., after 24 hours)
      try {
        await pushNotificationService.scheduleInactivityReminder();
      } catch (error) {
        console.error('Error scheduling inactivity reminder:', error);
      }
    }
    
    appState.current = nextAppState;
  }, []);

  // Request permissions
  const requestPermissions = useCallback(async () => {
    return await pushNotificationService.requestPermissions();
  }, []);

  // Get push token
  const getPushToken = useCallback(async () => {
    return await pushNotificationService.registerForPushNotifications();
  }, []);

  // Schedule custom notification
  const scheduleNotification = useCallback(async (
    title: string,
    body: string,
    trigger: any = { seconds: 1 }
  ) => {
    return await pushNotificationService.schedulePushNotification(title, body, trigger);
  }, []);

  useEffect(() => {
    // Initialize push notifications if user is logged in
    if (userId) {
      initializeAfterLogin();
    }
  }, [userId, initializeAfterLogin]);

  useEffect(() => {
    // Set up notification listeners
    notificationListener.current = Notifications.addNotificationReceivedListener(notification => {
      console.log('Notification received:', notification);
      onNotificationReceived?.(notification);
    });

    responseListener.current = Notifications.addNotificationResponseReceivedListener(response => {
      console.log('Notification response:', response);
      onNotificationPressed?.(response);
    });

    // Set up app state change listener
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      // Clean up listeners
      if (notificationListener.current) {
        notificationListener.current.remove();
      }
      if (responseListener.current) {
        responseListener.current.remove();
      }
      subscription?.remove();
    };
  }, [onNotificationReceived, onNotificationPressed, handleAppStateChange]);

  return {
    initializeAfterLogin,
    scheduleTaskNotification,
    cancelTaskNotification,
    celebrateTaskCompletion,
    requestPermissions,
    getPushToken,
    scheduleNotification,
  };
};

export default usePushNotifications;