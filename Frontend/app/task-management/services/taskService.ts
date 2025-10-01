import { Task, TaskFormData } from "../types/Task";
import { API_URL, API_ENDPOINTS } from "@/constants/ApiConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  toPhilippineISOString,
  convertToPhilippineTime,
  getCurrentPhilippineDate,
} from "@/app/utils/dateHelpers";
import offlineTaskService from './offlineTaskService';
import { pushNotificationService } from '@/app/notifications/services/PushNotificationService';

class TaskService {
  private async getAuthToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem("authToken");
    } catch (error) {
      console.error("Error getting auth token:", error);
      return null;
    }
  }

  private async apiRequest<T>(
    endpoint: string,
    method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE" = "GET",
    body?: any
  ): Promise<T> {
    const token = await this.getAuthToken();
    const headers: HeadersInit = {
      "Content-Type": "application/json",
    };

    if (token) {
      headers["Authorization"] = `Token ${token}`;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      console.log(`Making ${method} request to ${API_URL}${endpoint}`);
      const response = await fetch(`${API_URL}${endpoint}`, options);

      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      if (method === "DELETE") {
        return {} as T; // DELETE typically returns no content
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      console.error("API request failed:", error);
      throw error;
    }
  }

  private async formatTaskDates(task: any): Promise<Task> {
    // Convert backend priority format (with underscores) to frontend format (with hyphens)
    const priority =
      task.priority?.replace(/_/g, "-") || "not-urgent-not-important";
    const status = task.status?.replace(/_/g, "-") || "not-started";

    // Always convert all date fields to PH time
    const createdAt = task.created_at
      ? convertToPhilippineTime(new Date(task.created_at))
      : convertToPhilippineTime(new Date());
    const updatedAt = task.updated_at
      ? convertToPhilippineTime(new Date(task.updated_at))
      : convertToPhilippineTime(new Date());
    const due_datetime = task.due_datetime
      ? convertToPhilippineTime(new Date(task.due_datetime))
      : undefined;
    const completedAt = task.completed_at
      ? convertToPhilippineTime(new Date(task.completed_at))
      : undefined;

    return {
      ...task,
      priority,
      status,
      createdAt,
      updatedAt,
      due_datetime,
      due_time: task.due_time || null,
      completedAt,
      overdue:
        due_datetime && !task.completed
          ? due_datetime < convertToPhilippineTime(new Date())
          : false,
    };
  }

  async getAllTasks(): Promise<Task[]> {
    return offlineTaskService.getAllTasks();
  }

  async getTaskById(id: string): Promise<Task | undefined> {
    return offlineTaskService.getTaskById(id);
  }

  async createTask(taskData: TaskFormData): Promise<Task> {
    const task = await offlineTaskService.createTask(taskData);
    
    // Send push notification for task creation
    try {
      await pushNotificationService.notifyTaskCreated(task.title);
      
      // Schedule reminder notifications if task has a due date
      if (task.due_datetime) {
        await this.scheduleTaskReminders(task);
      }
    } catch (error) {
      console.error('Error sending task creation notification:', error);
    }
    
    return task;
  }

  // Helper method to schedule task reminders
  private async scheduleTaskReminders(task: Task): Promise<void> {
    try {
      if (!task.due_datetime) return;
      
      const dueDate = new Date(task.due_datetime);
      const now = new Date();
      
      // Schedule notification 1 hour before due date
      const oneHourBefore = new Date(dueDate.getTime() - 60 * 60 * 1000);
      if (oneHourBefore > now) {
        await pushNotificationService.scheduleTaskReminderAtTime(task.title, oneHourBefore);
      }
      
      // Schedule notification 30 minutes before due date
      const thirtyMinsBefore = new Date(dueDate.getTime() - 30 * 60 * 1000);
      if (thirtyMinsBefore > now) {
        await pushNotificationService.scheduleTaskReminderAtTime(task.title, thirtyMinsBefore);
      }
      
      // Check if task is due today
      const today = new Date();
      if (
        dueDate.getDate() === today.getDate() &&
        dueDate.getMonth() === today.getMonth() &&
        dueDate.getFullYear() === today.getFullYear()
      ) {
        await pushNotificationService.notifyTaskDueToday(task.title);
      }
    } catch (error) {
      console.error('Error scheduling task reminders:', error);
    }
  }

  async updateTask(id: string, updates: Partial<TaskFormData>): Promise<Task> {
    return offlineTaskService.updateTask(id, updates);
  }

  async deleteTask(id: string): Promise<void> {
    return offlineTaskService.deleteTask(id);
  }

  async markTaskComplete(id: string): Promise<Task> {
    const task = await offlineTaskService.markTaskComplete(id);
    
    // Send celebration notification
    try {
      await pushNotificationService.scheduleTaskCompletionCelebration(task.title);
    } catch (error) {
      console.error('Error sending task completion notification:', error);
    }
    
    return task;
  }

  async markTaskIncomplete(id: string): Promise<Task> {
    return offlineTaskService.markTaskIncomplete(id);
  }

  async getTasksByPriority(priority: string): Promise<Task[]> {
    return offlineTaskService.getTasksByPriority(priority);
  }

  async getTasksByStatus(completed: boolean): Promise<Task[]> {
    return offlineTaskService.getTasksByStatus(completed);
  }

  async getOverdueTasks(): Promise<Task[]> {
    return offlineTaskService.getOverdueTasks();
  }

  // Offline-specific methods
  async syncWithServer(): Promise<void> {
    return offlineTaskService.syncWithServer();
  }

  isOnline(): boolean {
    return offlineTaskService.isOnline();
  }

  async hasPendingChanges(): Promise<boolean> {
    return offlineTaskService.hasPendingChanges();
  }

  getNetworkStatus() {
    return offlineTaskService.getNetworkStatus();
  }

  addNetworkStatusListener(listener: (status: any) => void): () => void {
    return offlineTaskService.addNetworkStatusListener(listener);
  }

  getSyncStatus() {
    return offlineTaskService.getSyncStatus();
  }
}

export default new TaskService();
