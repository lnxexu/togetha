import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Configure notification handler
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

export interface PushNotificationService {
  requestPermissions(): Promise<boolean>;
  registerForPushNotifications(): Promise<string | null>;
  schedulePushNotification(title: string, body: string, trigger?: any): Promise<string>;
  cancelNotification(notificationId: string): Promise<void>;
  cancelAllNotifications(): Promise<void>;
  addNotificationListener(callback: (notification: any) => void): void;
  addNotificationResponseListener(callback: (response: any) => void): void;
  removeNotificationListeners(): void;
}

class PushNotificationServiceImpl implements PushNotificationService {
  private notificationListener: any = null;
  private responseListener: any = null;

  async requestPermissions(): Promise<boolean> {
    try {
      if (Device.isDevice) {
        const { status: existingStatus } = await Notifications.getPermissionsAsync();
        let finalStatus = existingStatus;
        
        if (existingStatus !== 'granted') {
          const { status } = await Notifications.requestPermissionsAsync();
          finalStatus = status;
        }
        
        if (finalStatus !== 'granted') {
          console.log('Failed to get push token for push notification!');
          return false;
        }
        
        return true;
      } else {
        console.log('Must use physical device for Push Notifications');
        return false;
      }
    } catch (error) {
      console.error('Error requesting permissions:', error);
      return false;
    }
  }

  async registerForPushNotifications(): Promise<string | null> {
    try {
      if (!Device.isDevice) {
        console.log('Must use physical device for Push Notifications');
        return null;
      }

      const hasPermission = await this.requestPermissions();
      if (!hasPermission) {
        return null;
      }

      const token = await Notifications.getExpoPushTokenAsync({
        projectId: Constants.expoConfig?.extra?.eas?.projectId,
      });

      if (Platform.OS === 'android') {
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      // Store the token
      await AsyncStorage.setItem('pushToken', token.data);
      
      return token.data;
    } catch (error) {
      console.error('Error registering for push notifications:', error);
      return null;
    }
  }

  async schedulePushNotification(
    title: string, 
    body: string, 
    trigger: any = { seconds: 1 }
  ): Promise<string> {
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title,
          body,
          sound: 'default',
          priority: Notifications.AndroidNotificationPriority.HIGH,
          color: '#6A009C',
        },
        trigger,
      });
      
      return notificationId;
    } catch (error) {
      console.error('Error scheduling notification:', error);
      throw error;
    }
  }

  async cancelNotification(notificationId: string): Promise<void> {
    try {
      await Notifications.cancelScheduledNotificationAsync(notificationId);
    } catch (error) {
      console.error('Error canceling notification:', error);
    }
  }

  async cancelAllNotifications(): Promise<void> {
    try {
      await Notifications.cancelAllScheduledNotificationsAsync();
    } catch (error) {
      console.error('Error canceling all notifications:', error);
    }
  }

  addNotificationListener(callback: (notification: any) => void): void {
    this.notificationListener = Notifications.addNotificationReceivedListener(callback);
  }

  addNotificationResponseListener(callback: (response: any) => void): void {
    this.responseListener = Notifications.addNotificationResponseReceivedListener(callback);
  }

  removeNotificationListeners(): void {
    if (this.notificationListener) {
      this.notificationListener.remove();
      this.notificationListener = null;
    }
    if (this.responseListener) {
      this.responseListener.remove();
      this.responseListener = null;
    }
  }

  // Convenience methods for specific notification types
  async scheduleTaskReminder(taskTitle: string, dueDate: Date): Promise<string> {
    const now = new Date();
    const timeDiff = dueDate.getTime() - now.getTime();
    
    if (timeDiff > 0) {
      return this.schedulePushNotification(
        'Task Reminder',
        `Don't forget: ${taskTitle}`,
        { date: dueDate }
      );
    }
    
    throw new Error('Due date must be in the future');
  }

  // Immediate notification for task creation
  async notifyTaskCreated(taskTitle: string): Promise<string> {
    return this.schedulePushNotification(
      '✅ Task Created',
      `"${taskTitle}" has been added to your tasks`,
      { seconds: 1 }
    );
  }

  // Immediate notification for task reminder
  async notifyTaskDueSoon(taskTitle: string, minutesUntilDue: number): Promise<string> {
    return this.schedulePushNotification(
      '⏰ Task Reminder',
      `"${taskTitle}" is due in ${minutesUntilDue} minutes`,
      { seconds: 1 }
    );
  }

  // Immediate notification for download completion
  async notifyDownloadComplete(fileName: string): Promise<string> {
    return this.schedulePushNotification(
      '📥 Download Complete',
      `"${fileName}" has been downloaded successfully`,
      { seconds: 1 }
    );
  }

  // Immediate notification for download start
  async notifyDownloadStarted(fileName: string): Promise<string> {
    return this.schedulePushNotification(
      '📥 Download Started',
      `Downloading "${fileName}"...`,
      { seconds: 1 }
    );
  }

  // Immediate notification for task due today
  async notifyTaskDueToday(taskTitle: string): Promise<string> {
    return this.schedulePushNotification(
      '📅 Task Due Today',
      `"${taskTitle}" is due today`,
      { seconds: 1 }
    );
  }

  // Schedule reminder notification for specific time before due date
  async scheduleTaskReminderAtTime(taskTitle: string, reminderDate: Date): Promise<string> {
    const now = new Date();
    if (reminderDate <= now) {
      // If reminder time has passed, notify immediately
      return this.notifyTaskDueSoon(taskTitle, 0);
    }
    
    return this.schedulePushNotification(
      '⏰ Task Reminder',
      `"${taskTitle}" is coming up soon`,
      { date: reminderDate }
    );
  }

  async scheduleWelcomeNotification(): Promise<string> {
    return this.schedulePushNotification(
      'Welcome to Togetha!',
      'Start organizing your tasks and notes efficiently.',
      { seconds: 5 }
    );
  }

  async scheduleDailyMotivation(): Promise<string> {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    tomorrow.setHours(9, 0, 0, 0); // 9 AM tomorrow
    
    return this.schedulePushNotification(
      'Good Morning!',
      'Ready to tackle your tasks today?',
      { 
        date: tomorrow,
        repeats: true 
      }
    );
  }

  async scheduleTaskCompletionCelebration(taskTitle: string): Promise<string> {
    return this.schedulePushNotification(
      'Task Completed! 🎉',
      `Great job completing "${taskTitle}"!`,
      { seconds: 2 }
    );
  }

  async scheduleInactivityReminder(): Promise<string> {
    const reminderTime = new Date();
    reminderTime.setHours(reminderTime.getHours() + 24); // 24 hours from now
    
    return this.schedulePushNotification(
      'We miss you!',
      'Check in and see what\'s new in your tasks.',
      { date: reminderTime }
    );
  }
}

export const pushNotificationService = new PushNotificationServiceImpl();

// Notification types for better organization
export const NotificationTypes = {
  WELCOME: 'welcome',
  TASK_CREATED: 'task_created',
  TASK_REMINDER: 'task_reminder',
  TASK_DUE_TODAY: 'task_due_today',
  TASK_DUE_SOON: 'task_due_soon',
  TASK_COMPLETED: 'task_completed',
  DOWNLOAD_STARTED: 'download_started',
  DOWNLOAD_COMPLETE: 'download_complete',
  DAILY_MOTIVATION: 'daily_motivation',
  INACTIVITY_REMINDER: 'inactivity_reminder',
  NOTE_SYNC: 'note_sync',
  SYSTEM_UPDATE: 'system_update',
} as const;

export type NotificationType = typeof NotificationTypes[keyof typeof NotificationTypes];

// Helper function to initialize push notifications after login
export const initializePushNotificationsAfterLogin = async () => {
  try {
    console.log('Initializing push notifications after login...');
    
    // Register for push notifications
    const token = await pushNotificationService.registerForPushNotifications();
    
    if (token) {
      console.log('Push notification token:', token);
      
      // Schedule welcome notification
      await pushNotificationService.scheduleWelcomeNotification();
      
      // Schedule daily motivation
      await pushNotificationService.scheduleDailyMotivation();
      
      // Store initialization flag
      await AsyncStorage.setItem('pushNotificationsInitialized', 'true');
      
      return true;
    }
    
    return false;
  } catch (error) {
    console.error('Error initializing push notifications:', error);
    return false;
  }
};

// Helper function to check if push notifications are already initialized
export const arePushNotificationsInitialized = async (): Promise<boolean> => {
  try {
    const initialized = await AsyncStorage.getItem('pushNotificationsInitialized');
    return initialized === 'true';
  } catch (error) {
    console.error('Error checking push notification initialization:', error);
    return false;
  }
};

export default pushNotificationService;