import Toast from 'react-native-toast-message';

export interface TaskNotification {
  id: string;
  taskId: string;
  title: string;
  message: string;
  type: 'due_today' | 'due_tomorrow' | 'overdue';
  scheduledTime: string;
  isRead: boolean;
  createdAt: string;
}

export class NotificationUtils {
  // Return device-local current time
  static now(): Date {
    return new Date();
  }

  // Format a date in device-local settings
  static formatLocalDateTime(date: Date, locale?: string | string[]): string {
    return date.toLocaleString(locale);
  }

  static isTaskDueToday(dueDate: string): boolean {
  const now = this.now();
    const due = new Date(dueDate);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    
    return today.getTime() === dueDay.getTime();
  }

  static isTaskDueTomorrow(dueDate: string): boolean {
  const now = this.now();
    const due = new Date(dueDate);
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate());
    
    return tomorrow.getTime() === dueDay.getTime();
  }

  static isTaskOverdue(dueDate: string): boolean {
  const now = this.now();
    const due = new Date(dueDate);
    return due < now;
  }

  static showTaskNotification(task: any, type: 'due_today' | 'due_tomorrow' | 'overdue') {
    const messages = {
      due_today: `"${task.title}" is due today!`,
      due_tomorrow: `"${task.title}" is due tomorrow`,
      overdue: `"${task.title}" is overdue!`
    };

    const types = {
      due_today: 'error' as const,
      due_tomorrow: 'info' as const,
      overdue: 'error' as const
    };

    Toast.show({
      type: types[type],
      text1: 'Task Reminder',
      text2: messages[type],
      visibilityTime: 5000,
      position: 'top'
    });
  }
}