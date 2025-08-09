import { Task, TaskFormData } from "../types/Task";
import { API_URL, API_ENDPOINTS } from "../../../constants/ApiConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { use } from "react";

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

  private formatTaskDates(task: any): Task {
    // Convert backend priority format (with underscores) to frontend format (with hyphens)
    const priority =
      task.priority?.replace(/_/g, "-") || "not-urgent-not-important";
    const status = task.status?.replace(/_/g, "-") || "not-started";

    return {
      ...task,
      priority,
      status,
      createdAt: task.created_at ? new Date(task.created_at) : new Date(),
      updatedAt: task.updated_at ? new Date(task.updated_at) : new Date(),
      due_datetime: task.due_datetime ? new Date(task.due_datetime) : undefined,
      due_time: task.due_time || null, // Use null instead of undefined when no time
      completedAt: task.completed_at ? new Date(task.completed_at) : undefined,
      overdue: task.due_datetime
        ? new Date(task.due_datetime) < new Date() && !task.completed
        : false,
    };
  }

  async getAllTasks(): Promise<Task[]> {
    try {
      const response = await this.apiRequest<any[]>(API_ENDPOINTS.TASKS);
      return response.map((task: any) => this.formatTaskDates(task));
    } catch (error) {
      console.error("Error fetching tasks:", error);
      return [];
    }
  }

  async getTaskById(id: string): Promise<Task | undefined> {
  try {
    const response = await this.apiRequest<any>(
      API_ENDPOINTS.TASK_DETAIL(id)
    );
    return this.formatTaskDates(response);
  } catch (error) {
    console.error(`Error fetching task with id ${id}:`, error);
    return undefined;
  }
}

 async createTask(taskData: TaskFormData): Promise<Task> {
  try {
    // Get the auth token
    const token = await this.getAuthToken(); // Use your class method instead of direct AsyncStorage access
    
    // Get the username
    const username = await AsyncStorage.getItem('username') || 'default_user';
    
    // Prepare the payload
    const payload = {
      title: taskData.title,
      description: taskData.description || '',
      priority: taskData.priority || 'not-urgent-not-important',
      category: taskData.category || '',
      completed: taskData.completed || false,
      user: username, // Include the username
      created_at: new Date().toISOString(), // Set created_at to now
      updated_at: new Date().toISOString(), // Set updated_at to now
      completed_at: taskData.completed_at ? taskData.completed_at.toISOString() : null,
      due_datetime: taskData.due_datetime ? taskData.due_datetime.toISOString() : null,
    };

    // Handle date and time properly
    if (taskData.due_datetime) {
      // Create a new date object based on the input date
      const dueDate = new Date(taskData.due_datetime);
      
      // If time is provided, add it to the date
      if (taskData.due_time) {
        const [timeStr, period] = (taskData.due_time || '').split(' ');
        if (timeStr && timeStr.includes(':')) {
          let [hours, minutes] = timeStr.split(':').map(Number);
          
          // Convert to 24-hour format if needed
          if (period === 'PM' && hours < 12) hours += 12;
          if (period === 'AM' && hours === 12) hours = 0;
          
          dueDate.setHours(hours, minutes, 0, 0);
        }
      }
      
      // Format to ISO string that Django can parse
      payload.due_datetime = dueDate.toISOString();
    }

    console.log('Sending to backend:', payload);

    // Use the class apiRequest method which properly handles authentication
    const data = await this.apiRequest<Task>(
      API_ENDPOINTS.TASKS,
      "POST",
      payload
    );
    
    return this.formatTaskDates(data);
  } catch (error) {
    console.error('Error in createTask:', error);
    throw error;
  }
}
  async updateTask(id: string, updates: Partial<TaskFormData>): Promise<Task> {
    // Transform data to match API expectations
    const apiUpdates: any = {};

    if (updates.title !== undefined) apiUpdates.text = updates.title; // Changed from 'title' to 'text'
    if (updates.description !== undefined)
      apiUpdates.description = updates.description;
    if (updates.due_datetime !== undefined)
      apiUpdates.due_datetime = updates.due_datetime.toISOString().split("T")[0];
    if (updates.priority !== undefined)
      apiUpdates.priority = updates.priority.replace(/-/g, "_");
    if (updates.category !== undefined) apiUpdates.category = updates.category;
    if (updates.completed !== undefined)
      apiUpdates.completed = updates.completed;

    const response = await this.apiRequest<any>(
      API_ENDPOINTS.TASK_DETAIL(id),
      "PATCH",
      apiUpdates
    );
    return this.formatTaskDates(response);
  }

  async deleteTask(id: string): Promise<void> {
  await this.apiRequest(API_ENDPOINTS.TASK_DETAIL(id), "DELETE");
}

  async markTaskComplete(id: string): Promise<Task> {
  const apiUpdates = {
    completed: true,
    completed_at: new Date().toISOString(),
  };

  const response = await this.apiRequest<any>(
    API_ENDPOINTS.TASK_DETAIL(id),
    "PATCH",
    apiUpdates
  );
  return this.formatTaskDates(response);
}

  async getTasksByPriority(priority: string): Promise<Task[]> {
    try {
      const allTasks = await this.getAllTasks();
      return allTasks.filter((task) => task.priority === priority);
    } catch (error) {
      console.error("Error fetching tasks by priority:", error);
      return [];
    }
  }

  async getTasksByStatus(completed: boolean): Promise<Task[]> {
    try {
      const allTasks = await this.getAllTasks();
      return allTasks.filter((task) => task.completed === completed);
    } catch (error) {
      console.error("Error fetching tasks by status:", error);
      return [];
    }
  }

  async getOverdueTasks(): Promise<Task[]> {
    try {
      const allTasks = await this.getAllTasks();
      return allTasks.filter((task) => task.overdue && !task.completed);
    } catch (error) {
      console.error("Error fetching overdue tasks:", error);
      return [];
    }
  }
}

export default new TaskService();
