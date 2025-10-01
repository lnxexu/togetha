/**
 * Test utility for push notifications
 * This file helps test the push notification functionality during development
 */

import pushNotificationService from '../notifications/services/PushNotificationService';
import AsyncStorage from '@react-native-async-storage/async-storage';

export class PushNotificationTester {
  private static instance: PushNotificationTester;

  private constructor() {
    // Service is already instantiated as default export
  }

  public static getInstance(): PushNotificationTester {
    if (!PushNotificationTester.instance) {
      PushNotificationTester.instance = new PushNotificationTester();
    }
    return PushNotificationTester.instance;
  }

  /**
   * Test basic notification functionality
   */
  async testBasicNotification(): Promise<void> {
    try {
      console.log('🧪 Testing basic notification...');
      
      await pushNotificationService.schedulePushNotification(
        'Test Notification',
        'This is a test notification from Togetha!',
        { seconds: 2 }
      );
      
      console.log('✅ Basic notification test completed');
    } catch (error) {
      console.error('❌ Basic notification test failed:', error);
    }
  }

  /**
   * Test task reminder notification
   */
  async testTaskReminder(taskTitle: string = 'Sample Task', delaySeconds: number = 5): Promise<void> {
    try {
      console.log('🧪 Testing task reminder notification...');
      
      const dueDate = new Date(Date.now() + delaySeconds * 1000);
      
      await pushNotificationService.scheduleTaskReminder(taskTitle, dueDate);
      
      console.log(`✅ Task reminder scheduled for ${delaySeconds} seconds from now`);
      console.log(`Task: ${taskTitle}`);
    } catch (error) {
      console.error('❌ Task reminder test failed:', error);
    }
  }

  /**
   * Test permission status
   */
  async testPermissions(): Promise<void> {
    try {
      console.log('🧪 Testing notification permissions...');
      
      const hasPermission = await pushNotificationService.requestPermissions();
      console.log(`📋 Permission status: ${hasPermission ? 'GRANTED' : 'DENIED'}`);
      
      console.log('✅ Permission test completed');
    } catch (error) {
      console.error('❌ Permission test failed:', error);
    }
  }

  /**
   * Test push token functionality
   */
  async testPushToken(): Promise<void> {
    try {
      console.log('🧪 Testing push token functionality...');
      
      const token = await pushNotificationService.registerForPushNotifications();
      console.log(`🎫 Push token: ${token ? token.substring(0, 50) + '...' : 'No token'}`);
      
      // Test token storage
      const storedToken = await AsyncStorage.getItem('pushToken');
      console.log(`💾 Stored token: ${storedToken ? storedToken.substring(0, 50) + '...' : 'No stored token'}`);
      
      console.log('✅ Push token test completed');
    } catch (error) {
      console.error('❌ Push token test failed:', error);
    }
  }

  /**
   * Test notification cancellation
   */
  async testNotificationCancellation(): Promise<void> {
    try {
      console.log('🧪 Testing notification cancellation...');
      
      // Schedule a notification
      const notificationId = await pushNotificationService.schedulePushNotification(
        'Test Cancellation',
        'This notification will be cancelled in 2 seconds',
        { seconds: 60 }
      );
      console.log(`📅 Notification scheduled with ID: ${notificationId}`);
      
      // Wait a moment, then cancel
      setTimeout(async () => {
        await pushNotificationService.cancelNotification(notificationId);
        console.log('❌ Notification cancelled');
        console.log('✅ Cancellation test completed');
      }, 2000);
      
    } catch (error) {
      console.error('❌ Cancellation test failed:', error);
    }
  }

  /**
   * Test welcome notification
   */
  async testWelcomeNotification(): Promise<void> {
    try {
      console.log('🧪 Testing welcome notification...');
      
      await pushNotificationService.scheduleWelcomeNotification();
      
      console.log('✅ Welcome notification scheduled');
    } catch (error) {
      console.error('❌ Welcome notification test failed:', error);
    }
  }

  /**
   * Test daily motivation notification
   */
  async testDailyMotivation(): Promise<void> {
    try {
      console.log('🧪 Testing daily motivation notification...');
      
      await pushNotificationService.scheduleDailyMotivation();
      
      console.log('✅ Daily motivation notification scheduled');
    } catch (error) {
      console.error('❌ Daily motivation test failed:', error);
    }
  }

  /**
   * Run all tests
   */
  async runAllTests(): Promise<void> {
    console.log('🚀 Starting push notification tests...');
    console.log('================================');
    
    await this.testPermissions();
    console.log('--------------------------------');
    
    await this.testPushToken();
    console.log('--------------------------------');
    
    await this.testBasicNotification();
    console.log('--------------------------------');
    
    await this.testTaskReminder('Test Task Reminder');
    console.log('--------------------------------');
    
    await this.testWelcomeNotification();
    console.log('--------------------------------');
    
    await this.testDailyMotivation();
    console.log('--------------------------------');
    
    await this.testNotificationCancellation();
    console.log('--------------------------------');
    
    console.log('🎯 All tests completed!');
  }

  /**
   * Clear all stored notification data (useful for testing)
   */
  async clearNotificationData(): Promise<void> {
    try {
      console.log('🧹 Clearing notification data...');
      
      await AsyncStorage.multiRemove([
        'pushToken',
        'pushNotificationsInitialized',
        'notificationPermissionAsked'
      ]);
      
      // Cancel all scheduled notifications
      await pushNotificationService.cancelAllNotifications();
      
      console.log('✅ Notification data cleared');
    } catch (error) {
      console.error('❌ Failed to clear notification data:', error);
    }
  }
}

// Export convenience functions
export const testPushNotifications = () => PushNotificationTester.getInstance().runAllTests();
export const testBasicNotification = () => PushNotificationTester.getInstance().testBasicNotification();
export const testTaskReminder = (taskTitle?: string, delaySeconds?: number) => 
  PushNotificationTester.getInstance().testTaskReminder(taskTitle, delaySeconds);
export const testPermissions = () => PushNotificationTester.getInstance().testPermissions();
export const clearNotificationData = () => PushNotificationTester.getInstance().clearNotificationData();