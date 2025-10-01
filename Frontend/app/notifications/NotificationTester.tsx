import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
  Platform,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { pushNotificationService } from './services/PushNotificationService';
import { usePushNotifications } from './hooks/usePushNotifications';
import * as Notifications from 'expo-notifications';

interface NotificationTestResult {
  test: string;
  status: 'pending' | 'success' | 'error';
  message: string;
  timestamp: Date;
}

const NotificationTester: React.FC = () => {
  const [testResults, setTestResults] = useState<NotificationTestResult[]>([]);
  const [permissionStatus, setPermissionStatus] = useState<string>('unknown');
  const [pushToken, setPushToken] = useState<string>('');
  const [isTestingAll, setIsTestingAll] = useState(false);

  const { requestPermissions, getPushToken } = usePushNotifications({
    onNotificationReceived: (notification) => {
      console.log('Test - Notification received:', notification);
      Alert.alert(
        'Notification Received!',
        `Title: ${notification.request.content.title}\nBody: ${notification.request.content.body}`
      );
    },
    onNotificationPressed: (response) => {
      console.log('Test - Notification pressed:', response);
    },
  });

  useEffect(() => {
    checkPermissions();
  }, []);

  const checkPermissions = async () => {
    try {
      const { status } = await Notifications.getPermissionsAsync();
      setPermissionStatus(status);
    } catch (error) {
      console.error('Error checking permissions:', error);
      setPermissionStatus('error');
    }
  };

  const addTestResult = (test: string, status: 'pending' | 'success' | 'error', message: string) => {
    setTestResults(prev => [
      {
        test,
        status,
        message,
        timestamp: new Date(),
      },
      ...prev,
    ]);
  };

  const handleRequestPermissions = async () => {
    try {
      addTestResult('Request Permissions', 'pending', 'Requesting permissions...');
      const granted = await requestPermissions();
      
      if (granted) {
        setPermissionStatus('granted');
        addTestResult('Request Permissions', 'success', 'Permissions granted successfully');
        
        // Get push token after permissions granted
        const token = await getPushToken();
        if (token) {
          setPushToken(token);
          addTestResult('Get Push Token', 'success', `Token: ${token.substring(0, 50)}...`);
        }
      } else {
        addTestResult('Request Permissions', 'error', 'Permissions denied by user');
      }
    } catch (error: any) {
      addTestResult('Request Permissions', 'error', error.message);
    }
  };

  const testTaskCreatedNotification = async () => {
    try {
      addTestResult('Task Created', 'pending', 'Sending notification...');
      await pushNotificationService.notifyTaskCreated('Sample Task for Testing');
      addTestResult('Task Created', 'success', 'Task created notification sent');
    } catch (error: any) {
      addTestResult('Task Created', 'error', error.message);
    }
  };

  const testTaskReminderNotification = async () => {
    try {
      addTestResult('Task Reminder', 'pending', 'Sending notification...');
      await pushNotificationService.notifyTaskDueSoon('Important Meeting', 15);
      addTestResult('Task Reminder', 'success', 'Task reminder notification sent');
    } catch (error: any) {
      addTestResult('Task Reminder', 'error', error.message);
    }
  };

  const testTaskDueTodayNotification = async () => {
    try {
      addTestResult('Task Due Today', 'pending', 'Sending notification...');
      await pushNotificationService.notifyTaskDueToday('Complete project report');
      addTestResult('Task Due Today', 'success', 'Task due today notification sent');
    } catch (error: any) {
      addTestResult('Task Due Today', 'error', error.message);
    }
  };

  const testDownloadStartedNotification = async () => {
    try {
      addTestResult('Download Started', 'pending', 'Sending notification...');
      await pushNotificationService.notifyDownloadStarted('project-report.pdf');
      addTestResult('Download Started', 'success', 'Download started notification sent');
    } catch (error: any) {
      addTestResult('Download Started', 'error', error.message);
    }
  };

  const testDownloadCompleteNotification = async () => {
    try {
      addTestResult('Download Complete', 'pending', 'Sending notification...');
      await pushNotificationService.notifyDownloadComplete('project-report.pdf');
      addTestResult('Download Complete', 'success', 'Download complete notification sent');
    } catch (error: any) {
      addTestResult('Download Complete', 'error', error.message);
    }
  };

  const testTaskCompletionNotification = async () => {
    try {
      addTestResult('Task Completion', 'pending', 'Sending notification...');
      await pushNotificationService.scheduleTaskCompletionCelebration('Finish homework');
      addTestResult('Task Completion', 'success', 'Task completion notification sent');
    } catch (error: any) {
      addTestResult('Task Completion', 'error', error.message);
    }
  };

  const testScheduledReminder = async () => {
    try {
      addTestResult('Scheduled Reminder', 'pending', 'Scheduling notification for 10 seconds...');
      const reminderDate = new Date(Date.now() + 10000); // 10 seconds from now
      await pushNotificationService.scheduleTaskReminderAtTime('Scheduled Test Task', reminderDate);
      addTestResult('Scheduled Reminder', 'success', 'Reminder scheduled for 10 seconds from now');
    } catch (error: any) {
      addTestResult('Scheduled Reminder', 'error', error.message);
    }
  };

  const testAllNotifications = async () => {
    if (permissionStatus !== 'granted') {
      Alert.alert('Permissions Required', 'Please grant notification permissions first.');
      return;
    }

    setIsTestingAll(true);
    addTestResult('Running All Tests', 'pending', 'Starting comprehensive test suite...');

    const tests = [
      { name: 'Task Created', fn: testTaskCreatedNotification, delay: 2000 },
      { name: 'Task Reminder', fn: testTaskReminderNotification, delay: 2000 },
      { name: 'Task Due Today', fn: testTaskDueTodayNotification, delay: 2000 },
      { name: 'Download Started', fn: testDownloadStartedNotification, delay: 2000 },
      { name: 'Download Complete', fn: testDownloadCompleteNotification, delay: 2000 },
      { name: 'Task Completion', fn: testTaskCompletionNotification, delay: 2000 },
      { name: 'Scheduled Reminder', fn: testScheduledReminder, delay: 2000 },
    ];

    for (const test of tests) {
      await test.fn();
      await new Promise(resolve => setTimeout(resolve, test.delay));
    }

    addTestResult('All Tests Complete', 'success', 'All notifications have been sent!');
    setIsTestingAll(false);
  };

  const clearResults = () => {
    setTestResults([]);
  };

  const getStatusIcon = (status: 'pending' | 'success' | 'error') => {
    switch (status) {
      case 'success':
        return <Ionicons name="checkmark-circle" size={20} color="#10B981" />;
      case 'error':
        return <Ionicons name="close-circle" size={20} color="#EF4444" />;
      case 'pending':
        return <Ionicons name="time" size={20} color="#F59E0B" />;
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Push Notification Tester</Text>
        <Text style={styles.headerSubtitle}>
          Test push notifications for tasks, reminders, and downloads
        </Text>
      </View>

      {/* Permission Status */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Permission Status</Text>
        <View style={styles.statusCard}>
          <View style={styles.statusRow}>
            <Text style={styles.statusLabel}>Status:</Text>
            <View style={[
              styles.statusBadge,
              { backgroundColor: permissionStatus === 'granted' ? '#DCFCE7' : '#FEE2E2' }
            ]}>
              <Text style={[
                styles.statusBadgeText,
                { color: permissionStatus === 'granted' ? '#059669' : '#DC2626' }
              ]}>
                {permissionStatus.toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.statusLabel}>Platform: {Platform.OS}</Text>
          {pushToken && (
            <Text style={styles.tokenText} numberOfLines={2}>
              Token: {pushToken}
            </Text>
          )}
          {permissionStatus !== 'granted' && (
            <TouchableOpacity
              style={styles.primaryButton}
              onPress={handleRequestPermissions}
            >
              <Ionicons name="notifications" size={20} color="#FFFFFF" />
              <Text style={styles.primaryButtonText}>Request Permissions</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* Individual Test Buttons */}
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Individual Tests</Text>
        <View style={styles.buttonsGrid}>
          <TouchableOpacity
            style={styles.testButton}
            onPress={testTaskCreatedNotification}
            disabled={permissionStatus !== 'granted'}
          >
            <Ionicons name="add-circle-outline" size={24} color="#6A009C" />
            <Text style={styles.testButtonText}>Task Created</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.testButton}
            onPress={testTaskReminderNotification}
            disabled={permissionStatus !== 'granted'}
          >
            <Ionicons name="alarm-outline" size={24} color="#6A009C" />
            <Text style={styles.testButtonText}>Task Reminder</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.testButton}
            onPress={testTaskDueTodayNotification}
            disabled={permissionStatus !== 'granted'}
          >
            <Ionicons name="calendar-outline" size={24} color="#6A009C" />
            <Text style={styles.testButtonText}>Due Today</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.testButton}
            onPress={testDownloadStartedNotification}
            disabled={permissionStatus !== 'granted'}
          >
            <Ionicons name="download-outline" size={24} color="#6A009C" />
            <Text style={styles.testButtonText}>Download Start</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.testButton}
            onPress={testDownloadCompleteNotification}
            disabled={permissionStatus !== 'granted'}
          >
            <Ionicons name="checkmark-done-outline" size={24} color="#6A009C" />
            <Text style={styles.testButtonText}>Download Done</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.testButton}
            onPress={testTaskCompletionNotification}
            disabled={permissionStatus !== 'granted'}
          >
            <Ionicons name="trophy-outline" size={24} color="#6A009C" />
            <Text style={styles.testButtonText}>Task Complete</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.testButton}
            onPress={testScheduledReminder}
            disabled={permissionStatus !== 'granted'}
          >
            <Ionicons name="timer-outline" size={24} color="#6A009C" />
            <Text style={styles.testButtonText}>Scheduled (10s)</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Test All Button */}
      <View style={styles.section}>
        <TouchableOpacity
          style={[styles.testAllButton, isTestingAll && styles.testAllButtonDisabled]}
          onPress={testAllNotifications}
          disabled={permissionStatus !== 'granted' || isTestingAll}
        >
          <Ionicons name="flash" size={24} color="#FFFFFF" />
          <Text style={styles.testAllButtonText}>
            {isTestingAll ? 'Testing All...' : 'Test All Notifications'}
          </Text>
        </TouchableOpacity>
      </View>

      {/* Test Results */}
      <View style={styles.section}>
        <View style={styles.resultsHeader}>
          <Text style={styles.sectionTitle}>Test Results</Text>
          {testResults.length > 0 && (
            <TouchableOpacity onPress={clearResults}>
              <Text style={styles.clearButton}>Clear</Text>
            </TouchableOpacity>
          )}
        </View>

        {testResults.length === 0 ? (
          <View style={styles.emptyResults}>
            <Ionicons name="document-text-outline" size={48} color="#CBD5E0" />
            <Text style={styles.emptyResultsText}>No test results yet</Text>
            <Text style={styles.emptyResultsSubtext}>
              Run a test to see the results here
            </Text>
          </View>
        ) : (
          testResults.map((result, index) => (
            <View key={index} style={styles.resultCard}>
              <View style={styles.resultHeader}>
                {getStatusIcon(result.status)}
                <Text style={styles.resultTest}>{result.test}</Text>
              </View>
              <Text style={styles.resultMessage}>{result.message}</Text>
              <Text style={styles.resultTime}>
                {result.timestamp.toLocaleTimeString()}
              </Text>
            </View>
          ))
        )}
      </View>

      <View style={{ height: 40 }} />
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  header: {
    backgroundColor: '#6A009C',
    padding: 24,
    paddingTop: 60,
  },
  headerTitle: {
    fontSize: 24,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
    marginBottom: 8,
  },
  headerSubtitle: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: 'rgba(255, 255, 255, 0.8)',
  },
  section: {
    padding: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontFamily: 'Inter-Bold',
    color: '#1E293B',
    marginBottom: 16,
  },
  statusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 12,
  },
  statusLabel: {
    fontSize: 14,
    fontFamily: 'Inter-Medium',
    color: '#64748B',
    marginBottom: 8,
  },
  statusBadge: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 12,
    fontFamily: 'Inter-Bold',
  },
  tokenText: {
    fontSize: 11,
    fontFamily: 'Inter-Regular',
    color: '#94A3B8',
    marginTop: 8,
  },
  primaryButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6A009C',
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginTop: 16,
    gap: 8,
  },
  primaryButtonText: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#FFFFFF',
  },
  buttonsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 12,
  },
  testButton: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  testButtonText: {
    fontSize: 13,
    fontFamily: 'Inter-SemiBold',
    color: '#334155',
    textAlign: 'center',
  },
  testAllButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6A009C',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 12,
  },
  testAllButtonDisabled: {
    backgroundColor: '#94A3B8',
  },
  testAllButtonText: {
    fontSize: 16,
    fontFamily: 'Inter-Bold',
    color: '#FFFFFF',
  },
  resultsHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  clearButton: {
    fontSize: 14,
    fontFamily: 'Inter-SemiBold',
    color: '#EF4444',
  },
  emptyResults: {
    alignItems: 'center',
    padding: 40,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyResultsText: {
    fontSize: 16,
    fontFamily: 'Inter-SemiBold',
    color: '#64748B',
    marginTop: 16,
  },
  emptyResultsSubtext: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#94A3B8',
    marginTop: 8,
  },
  resultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  resultTest: {
    fontSize: 15,
    fontFamily: 'Inter-SemiBold',
    color: '#1E293B',
    flex: 1,
  },
  resultMessage: {
    fontSize: 14,
    fontFamily: 'Inter-Regular',
    color: '#64748B',
    marginBottom: 8,
  },
  resultTime: {
    fontSize: 12,
    fontFamily: 'Inter-Regular',
    color: '#94A3B8',
  },
});

export default NotificationTester;
