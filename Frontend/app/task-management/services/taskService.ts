import { Task, TaskFormData } from "../types/Task";
import { API_URL, API_ENDPOINTS } from "@/constants/ApiConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  toPhilippineISOString,
  convertToPhilippineTime,
  getCurrentPhilippineDate,
} from "@/app/utils/dateHelpers";
import offlineTaskService from './offlineTaskService';

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
    return offlineTaskService.createTask(taskData);
  }

  async updateTask(id: string, updates: Partial<TaskFormData>): Promise<Task> {
    return offlineTaskService.updateTask(id, updates);
  }

  async deleteTask(id: string): Promise<void> {
    return offlineTaskService.deleteTask(id);
  }

  async markTaskComplete(id: string): Promise<Task> {
    return offlineTaskService.markTaskComplete(id);
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
