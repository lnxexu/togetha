import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { InAppNotification } from '../notificationComponent';
import { startNotificationPolling, stopNotificationPolling } from '../services/notificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, API_ENDPOINTS } from '@/constants/ApiConfig';

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

interface NotificationContextType {
  showNotification: (notification: Notification) => void;
  unreadCount: number;
  refreshUnreadCount: () => Promise<void>;
}

const NotificationContext = createContext<NotificationContextType | undefined>(undefined);

interface NotificationProviderProps {
  children: ReactNode;
}

export const NotificationProvider: React.FC<NotificationProviderProps> = ({ children }) => {
  const [currentNotification, setCurrentNotification] = useState<Notification | null>(null);
  const [unreadCount, setUnreadCount] = useState<number>(0);

  useEffect(() => {
    // Start polling when the app loads
    startNotificationPolling();
    
    // Check for unread notifications on start
    refreshUnreadCount();

    return () => {
      // Stop polling when the component unmounts
      stopNotificationPolling();
    };
  }, []);

  const refreshUnreadCount = async () => {
    try {
      const token = await AsyncStorage.getItem('authToken');
      
      if (!token) {
        return;
      }
      
      const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTIFICATIONS}?unread_only=true`, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to fetch unread count');
      }
      
      const data = await response.json();
      setUnreadCount(data.length);
      
    } catch (error) {
      console.error('Error fetching unread count:', error);
    }
  };

  const showNotification = (notification: Notification) => {
    setCurrentNotification(notification);
  };

  const dismissNotification = () => {
    setCurrentNotification(null);
  };

  return (
    <NotificationContext.Provider 
      value={{ 
        showNotification,
        unreadCount,
        refreshUnreadCount
      }}
    >
      {children}
      
      {currentNotification && (
        <InAppNotification 
          id={currentNotification.id}
          title={currentNotification.title}
          message={currentNotification.message}
          type={currentNotification.type}
          priority={currentNotification.priority}
          actionId={currentNotification.actionId}
          onDismiss={dismissNotification}
        />
      )}
    </NotificationContext.Provider>
  );
};

export const useNotifications = () => {
  const context = useContext(NotificationContext);
  if (context === undefined) {
    throw new Error('useNotifications must be used within a NotificationProvider');
  }
  return context;
};