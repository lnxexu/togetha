import { useEffect, useRef } from 'react';
import { AppState, AppStateStatus } from 'react-native';
import { NotificationUtils } from '../utils/NotificationUtils';
import { NotificationService } from '../services/notificationService';
import { useTaskContext } from '../../context/TaskContext';

export const TaskNotificationChecker = () => {
  const { tasks } = useTaskContext();
  const appState = useRef(AppState.currentState);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const checkTaskDeadlines = async () => {
    if (!tasks || tasks.length === 0) return;

    const now = NotificationUtils.getCurrentPhilippinesTime();
    const currentHour = now.getHours();
    
    // Only check between 8 AM and 10 PM to avoid night notifications
    if (currentHour < 8 || currentHour > 22) return;

    for (const task of tasks) {
      if (task.completed || !task.due_datetime) continue;

      const notificationId = `${task.id}_${new Date().toDateString()}`;
      
      // Check if we already notified today for this task
      const existingNotifications = await NotificationService.getNotifications(task.id);
      const alreadyNotified = existingNotifications.some(
        n => n.taskId === task.id && 
        new Date(n.createdAt).toDateString() === new Date().toDateString()
      );

      if (alreadyNotified) continue;

      let notificationType: 'due_today' | 'due_tomorrow' | 'overdue' | null = null;

      if (task.completed || !task.due_datetime) continue;
      if (NotificationUtils.isTaskOverdue(task.due_datetime.toISOString())) {
        notificationType = 'overdue';
      if (task.completed || !task.due_datetime) continue;
      } else if (NotificationUtils.isTaskDueToday(task.due_datetime.toISOString())) {
        notificationType = 'due_today';
      } else if (NotificationUtils.isTaskDueTomorrow(task.due_datetime.toISOString())) {
        notificationType = 'due_tomorrow';
      }

      if (notificationType) {
        // Show toast notification
        NotificationUtils.showTaskNotification(task, notificationType);

        // Save to database
        await NotificationService.saveNotification({
          taskId: task.id,
          title: 'Task Reminder',
          message: `Task "${task.title}" ${notificationType.replace('_', ' ')}`,
          type: notificationType,
          scheduledTime: NotificationUtils.formatPhilippinesDateTime(now),
          isRead: false
        });
      }
    }
  };

  useEffect(() => {
    // Check immediately when component mounts
    checkTaskDeadlines();

    // Set up interval to check every 30 minutes
    intervalRef.current = setInterval(checkTaskDeadlines, 30 * 60 * 1000);

    // Handle app state changes
    const handleAppStateChange = (nextAppState: AppStateStatus) => {
      if (appState.current.match(/inactive|background/) && nextAppState === 'active') {
        // App came to foreground, check notifications
        checkTaskDeadlines();
      }
      appState.current = nextAppState;
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
      subscription?.remove();
    };
  }, [tasks]);

  return null; // This is a background service component
};