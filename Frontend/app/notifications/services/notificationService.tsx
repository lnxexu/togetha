import { API_URL, API_ENDPOINTS } from '@/constants/ApiConfig';
import { NotificationUtils, TaskNotification } from '../utils/NotificationUtils';
import AsyncStorage from "@react-native-async-storage/async-storage";

export class NotificationService {
  private static baseUrl = API_URL;

  static async saveNotification(notification: Omit<TaskNotification, 'id' | 'createdAt'>): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}${API_ENDPOINTS.NOTIFICATIONS}/save/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        },
        body: JSON.stringify({
          ...notification,
          createdAt: NotificationUtils.formatLocalDateTime(NotificationUtils.now())
        })
      });

      if (!response.ok) {
        throw new Error('Failed to save notification');
      }
    } catch (error) {
      console.error('Error saving notification:', error);
    }
  }

  static async getNotifications(): Promise<any[]> {
  try {
    const token = await AsyncStorage.getItem('authToken');
    if (!token) {
      throw new Error('No auth token found');
    }

    const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTIFICATIONS}`, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Token ${token}`,
        'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch notifications');
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return [];
  }
}

  static async markAsRead(notificationId: string): Promise<any> {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        throw new Error('No auth token found');
      }

      const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTIFICATIONS}${notificationId}/mark_read/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
          'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to mark notification as read');
      }

      return await response.json();
    } catch (error) {
      console.error('Error marking notification as read:', error);
      throw error;
    }
  }

  static async getNotificationDetail(notificationId: string): Promise<any> {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        throw new Error('No auth token found');
      }

      const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTIFICATIONS}${notificationId}/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
          'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch notification detail');
      }

      return await response.json();
    } catch (error) {
      console.error('Error fetching notification detail:', error);
      throw error;
    }
  }

  static async getUnreadCount(): Promise<number> {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        throw new Error('No auth token found');
      }

      const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTIFICATIONS}unread_count/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
          'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        },
      });

      if (!response.ok) {
        throw new Error('Failed to fetch unread count');
      }

      const data = await response.json();
      return data.unread_count || 0;
    } catch (error) {
      console.error('Error fetching unread count:', error);
      return 0;
    }
  }
}