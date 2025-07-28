import { Task, TaskFormData } from '../types/Task';
import { API_BASE_URL, API_ENDPOINTS } from '../../../constants/ApiConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';

class TaskService {
  private async getAuthToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('authToken');
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  private async apiRequest<T>(
    endpoint: string, 
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET', 
    body?: any
  ): Promise<T> {
    const token = await this.getAuthToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
    };

    if (token) {
      headers['Authorization'] = `Token ${token}`;
    }

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    try {
      console.log(`Making ${method} request to ${API_BASE_URL}${endpoint}`);
      const response = await fetch(`${API_BASE_URL}${endpoint}`, options);
      
      if (!response.ok) {
        throw new Error(`API Error: ${response.status} ${response.statusText}`);
      }

      if (method === 'DELETE') {
        return {} as T; // DELETE typically returns no content
      }

      const data = await response.json();
      return data as T;
    } catch (error) {
      console.error('API request failed:', error);
      throw error;
    }
  }

  // Helper method to format dates from API response
 private formatTaskDates(task: any): Task {
  // Convert backend priority format (with underscores) to frontend format (with hyphens)
  const priority = task.priority?.replace(/_/g, '-') || 'not-urgent-not-important';
  
  return {
    ...task,
    createdAt: task.created_at ? new Date(task.created_at) : new Date(),
    updatedAt: task.updated_at ? new Date(task.updated_at) : new Date(),
    dueDate: task.due_date ? new Date(task.due_date) : undefined,
    completedAt: task.completed_at ? new Date(task.completed_at) : undefined,
    overdue: task.due_date ? new Date(task.due_date) < new Date() && !task.completed : false,
    priority: priority,
  };
}

  async getAllTasks(): Promise<Task[]> {
    try {
      const response = await this.apiRequest<any[]>(API_ENDPOINTS.TASKS);
      return response.map((task: any) => this.formatTaskDates(task));
    } catch (error) {
      console.error('Error fetching tasks:', error);
      return [];
    }
  }

  async getTaskById(id: string): Promise<Task | undefined> {
    try {
      const response = await this.apiRequest<any>(API_ENDPOINTS.TASK_DETAIL(id));
      return this.formatTaskDates(response);
    } catch (error) {
      console.error(`Error fetching task with id ${id}:`, error);
      return undefined;
    }
  }

  async createTask(taskData: TaskFormData): Promise<Task> {
    // Transform data to match API expectations
    const apiData: any = {
      title: taskData.title,
      description: taskData.description,
      due_date: taskData.dueDate ? taskData.dueDate.toISOString().split('T')[0] : null,
      priority: taskData.priority || 'not-urgent-not-important',
      subject: taskData.subject,
      completed: false,
    };
    const response = await this.apiRequest<any>(API_ENDPOINTS.TASKS, 'POST', apiData);
    return this.formatTaskDates(response);
  }

  async updateTask(id: string, updates: Partial<TaskFormData>): Promise<Task> {
    // Transform data to match API expectations
    const apiUpdates: any = {};
    
    if (updates.title !== undefined) apiUpdates.title = updates.title;
    if (updates.description !== undefined) apiUpdates.description = updates.description;
    if (updates.dueDate !== undefined) apiUpdates.due_date = updates.dueDate.toISOString().split('T')[0];
    if (updates.priority !== undefined) apiUpdates.priority = updates.priority;
    if (updates.subject !== undefined) apiUpdates.subject = updates.subject;
    if (updates.completed !== undefined) apiUpdates.completed = updates.completed;

    const response = await this.apiRequest<any>(API_ENDPOINTS.TASK_DETAIL(id), 'PATCH', apiUpdates);
    return this.formatTaskDates(response);
  }

  async deleteTask(id: string): Promise<void> {
    await this.apiRequest(API_ENDPOINTS.TASK_DETAIL(id), 'DELETE');
  }

  async markTaskComplete(id: string): Promise<Task> {
    const apiUpdates = {
      completed: true,
      completed_at: new Date().toISOString()
    };

    const response = await this.apiRequest<any>(API_ENDPOINTS.TASK_DETAIL(id), 'PATCH', apiUpdates);
    return this.formatTaskDates(response);
  }

  async getTasksByPriority(priority: string): Promise<Task[]> {
    try {
      const allTasks = await this.getAllTasks();
      return allTasks.filter(task => task.priority === priority);
    } catch (error) {
      console.error('Error fetching tasks by priority:', error);
      return [];
    }
  }

  async getTasksByStatus(completed: boolean): Promise<Task[]> {
    try {
      const allTasks = await this.getAllTasks();
      return allTasks.filter(task => task.completed === completed);
    } catch (error) {
      console.error('Error fetching tasks by status:', error);
      return [];
    }
  }

  async getOverdueTasks(): Promise<Task[]> {
    try {
      const allTasks = await this.getAllTasks();
      return allTasks.filter(task => task.overdue && !task.completed);
    } catch (error) {
      console.error('Error fetching overdue tasks:', error);
      return [];
    }
  }

}
export const taskService = new TaskService();