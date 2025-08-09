import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { API_URL, API_ENDPOINTS } from '@/constants/ApiConfig';
import { Platform } from 'react-native';

interface Notification {
  id: string;
  type: 'task' | 'note' | 'reminder' | 'system';
  title: string;
  message: string;
  timestamp: Date;
  read: boolean;
  actionId?: string;
  priority: 'high' | 'medium' | 'low';
}

let lastNotificationId: string | null = null;
let pollingInterval: NodeJS.Timeout | null = null;
const POLLING_INTERVAL = 60000; // Poll every minute

let appStateSubscription: { remove: () => void } | null = null;

export const startNotificationPolling = async () => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
  }

  // Get the last notification ID to avoid showing duplicates
  lastNotificationId = await AsyncStorage.getItem('lastNotificationId');
  
  // Poll for new notifications
  pollingInterval = setInterval(async () => {
    await checkForNewNotifications();
  }, POLLING_INTERVAL);

  // Handle app state changes
  if (!appStateSubscription) {
    appStateSubscription = AppState.addEventListener('change', handleAppStateChange);
  }
};

export const stopNotificationPolling = () => {
  if (pollingInterval) {
    clearInterval(pollingInterval);
    pollingInterval = null;
  }
  if (appStateSubscription) {
    appStateSubscription.remove();
    appStateSubscription = null;
  }
};

const handleAppStateChange = (nextAppState: AppStateStatus) => {
  if (nextAppState === 'active') {
    // App came to foreground, check for notifications immediately
    checkForNewNotifications();
  }
};

const checkForNewNotifications = async () => {
  try {
    const token = await AsyncStorage.getItem('authToken');
    
    if (!token) {
      console.log('No auth token found, skipping notification check');
      return;
    }
    
    const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTIFICATIONS}?unread_only=true`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      }
    });
    
    if (!response.ok) {
      throw new Error(`Error checking notifications: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.length > 0) {
      // If we have a new notification that we haven't seen before
      if (!lastNotificationId || data[0].id !== lastNotificationId) {
        // Update the last seen notification ID
        lastNotificationId = data[0].id;
        await AsyncStorage.setItem('lastNotificationId', data[0].id);
        
        // Show local notification
        showLocalNotification(data[0]);
      }
    }
  } catch (error) {
    console.error('Error checking for new notifications:', error);
  }
};

const showLocalNotification = (notification: any) => {
  // Create a simple local notification using browser API if on web
  if (Platform.OS === 'web' && 'Notification' in window) {
    if (Notification.permission === 'granted') {
      new Notification(notification.title, {
        body: notification.message
      });
    } else if (Notification.permission !== 'denied') {
      Notification.requestPermission().then(permission => {
        if (permission === 'granted') {
          new Notification(notification.title, {
            body: notification.message
          });
        }
      });
    }
  } 
  // On native platforms, we'll use a simple alert for now
  // (Later you could enhance this with a custom UI overlay)
  else {
    // Create a custom notification UI
    // This will be improved in the next step
    console.log('New notification:', notification.title);
  }
};