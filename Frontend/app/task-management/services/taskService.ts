import { Task, TaskFormData } from "../types/Task";
import { API_URL, API_ENDPOINTS } from "@/constants/ApiConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  toPhilippineISOString,
  convertToPhilippineTime,
  getCurrentPhilippineDate,
} from "@/app/utils/dateHelpers";

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
    try {
      const response = await this.apiRequest<any[]>(API_ENDPOINTS.TASKS);
      return await Promise.all(
        response.map((task: any) => this.formatTaskDates(task))
      );
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
      const username =
        (await AsyncStorage.getItem("username")) || "default_user";

      // Prepare the payload
      const payload = {
        title: taskData.title,
        description: taskData.description || "",
        priority: taskData.priority || "not-urgent-not-important",
        category: taskData.category || "",
        completed: taskData.completed || false,
        user: username, // Include the username
        created_at: toPhilippineISOString(getCurrentPhilippineDate()), // Set created_at to now in Philippine time
        updated_at: toPhilippineISOString(getCurrentPhilippineDate()), // Set updated_at to now in Philippine time
        completed_at: toPhilippineISOString(taskData.completed_at),
        due_datetime: toPhilippineISOString(taskData.due_datetime),
      };

      // Handle date and time properly
      if (taskData.due_datetime) {
        // Create a new date object based on the input date
        const dueDate = new Date(taskData.due_datetime);

        // If time is provided, add it to the date
        if (taskData.due_time) {
          const [timeStr, period] = (taskData.due_time || "").split(" ");
          if (timeStr && timeStr.includes(":")) {
            let [hours, minutes] = timeStr.split(":").map(Number);

            // Convert to 24-hour format if needed
            if (period === "PM" && hours < 12) hours += 12;
            if (period === "AM" && hours === 12) hours = 0;

            dueDate.setHours(hours, minutes, 0, 0);
          }
        }

        // Format to ISO string in Philippine time that Django can parse
        payload.due_datetime = toPhilippineISOString(dueDate);
      }

      console.log("Sending to backend:", payload);

      // Use the class apiRequest method which properly handles authentication
      const data = await this.apiRequest<Task>(
        API_ENDPOINTS.TASKS,
        "POST",
        payload
      );

      return this.formatTaskDates(data);
    } catch (error) {
      console.error("Error in createTask:", error);
      throw error;
    }
  }
  async updateTask(id: string, updates: Partial<TaskFormData>): Promise<Task> {
    // Transform data to match API expectations
    const apiUpdates: any = {};

    apiUpdates.updated_at = toPhilippineISOString(getCurrentPhilippineDate());

    // Handle title correctly
    if (updates.title !== undefined) apiUpdates.title = updates.title;

    if (updates.description !== undefined)
      apiUpdates.description = updates.description;

    // Handle date properly for backend in Philippine time
    if (updates.due_datetime !== undefined) {
      if (updates.due_datetime instanceof Date) {
        // Send full Philippine time ISO string to backend
        apiUpdates.due_datetime = toPhilippineISOString(updates.due_datetime);
      } else if (typeof updates.due_datetime === "string") {
        // Convert string date to Date and then to Philippine time
        const dateObj = new Date(updates.due_datetime);
        apiUpdates.due_datetime = toPhilippineISOString(dateObj);
      } else {
        apiUpdates.due_datetime = null; // Handle null case
      }
    }

    // Handle priority format correctly for the backend
    if (updates.priority !== undefined) {
      apiUpdates.priority = updates.priority.toLowerCase();
    }

    // Pass other fields directly
    if (updates.category !== undefined) apiUpdates.category = updates.category;
    if (updates.due_time !== undefined)
      apiUpdates.due_time = updates.due_time || null;
    if (updates.completed !== undefined)
      apiUpdates.completed = updates.completed;

    // Handle date timestamps in Philippine time
    if (updates.completed_at !== undefined) {
      if (updates.completed_at instanceof Date) {
        apiUpdates.completed_at = toPhilippineISOString(updates.completed_at);
      } else if (typeof updates.completed_at === "string") {
        // Convert string date to Date and then to Philippine time
        const dateObj = new Date(updates.completed_at);
        apiUpdates.completed_at = toPhilippineISOString(dateObj);
      } else {
        apiUpdates.completed_at = null;
      }
    }

    console.log("Sending to API:", apiUpdates);
    console.log("API endpoint:", API_ENDPOINTS.TASK_DETAIL(id));
    console.log("Now:", apiUpdates.updated_at);

    try {
      // Use the class apiRequest method which handles authentication
      const data = await this.apiRequest<any>(
        API_ENDPOINTS.TASK_DETAIL(id),
        "PATCH",
        apiUpdates
      );
      return this.formatTaskDates(data);
    } catch (error) {
      console.error("Error in updateTask:", error);
      throw error;
    }
  }
  async deleteTask(id: string): Promise<void> {
    await this.apiRequest(API_ENDPOINTS.TASK_DETAIL(id), "DELETE");
  }

  async markTaskComplete(id: string): Promise<Task> {
    const apiUpdates = {
      completed: true,
      completed_at: toPhilippineISOString(getCurrentPhilippineDate()),
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
