import AsyncStorage from '@react-native-async-storage/async-storage';
import { Task, TaskFormData } from '../types/Task';

const TASKS_STORAGE_KEY = '@tasks';

class TaskService {
  private async getTasks(): Promise<Task[]> {
    try {
      const tasksJson = await AsyncStorage.getItem(TASKS_STORAGE_KEY);
      if (!tasksJson) return [];
      
      const tasks = JSON.parse(tasksJson);
      return tasks.map((task: any) => ({
        ...task,
        createdAt: new Date(task.createdAt),
        updatedAt: new Date(task.updatedAt),
        dueDate: task.dueDate ? new Date(task.dueDate) : undefined,
        completedAt: task.completedAt ? new Date(task.completedAt) : undefined,
        overdue: task.dueDate ? new Date(task.dueDate) < new Date() && !task.completed : false,
      }));
    } catch (error) {
      console.error('Error loading tasks:', error);
      return [];
    }
  }

  private async saveTasks(tasks: Task[]): Promise<void> {
    try {
      await AsyncStorage.setItem(TASKS_STORAGE_KEY, JSON.stringify(tasks));
    } catch (error) {
      console.error('Error saving tasks:', error);
      throw error;
    }
  }

  async getAllTasks(): Promise<Task[]> {
    return this.getTasks();
  }

  async getTaskById(id: string): Promise<Task | undefined> {
    const tasks = await this.getTasks();
    return tasks.find(task => task.id === id);
  }

  async createTask(taskData: TaskFormData): Promise<Task> {
    const tasks = await this.getTasks();
    
    const newTask: Task = {
      id: Date.now().toString() + Math.random().toString(36).substr(2, 9),
      ...taskData,
      priority: taskData.priority || 'not-urgent-not-important',
      status: taskData.status || 'todo',
      completed: false,
      overdue: taskData.dueDate ? taskData.dueDate < new Date() : false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    tasks.push(newTask);
    await this.saveTasks(tasks);
    return newTask;
  }

  async updateTask(id: string, updates: Partial<TaskFormData>): Promise<Task> {
    const tasks = await this.getTasks();
    const taskIndex = tasks.findIndex(task => task.id === id);
    
    if (taskIndex === -1) {
      throw new Error('Task not found');
    }

    const updatedTask = {
      ...tasks[taskIndex],
      ...updates,
      updatedAt: new Date(),
      overdue: updates.dueDate ? updates.dueDate < new Date() && !tasks[taskIndex].completed : tasks[taskIndex].overdue,
    };

    tasks[taskIndex] = updatedTask;
    await this.saveTasks(tasks);
    return updatedTask;
  }

  async deleteTask(id: string): Promise<void> {
    const tasks = await this.getTasks();
    const filteredTasks = tasks.filter(task => task.id !== id);
    await this.saveTasks(filteredTasks);
  }

  async markTaskComplete(id: string): Promise<Task> {
    const tasks = await this.getTasks();
    const taskIndex = tasks.findIndex(task => task.id === id);
    
    if (taskIndex === -1) {
      throw new Error('Task not found');
    }

    tasks[taskIndex].completed = true;
    tasks[taskIndex].overdue = false;
    tasks[taskIndex].completedAt = new Date();
    tasks[taskIndex].updatedAt = new Date();

    await this.saveTasks(tasks);
    return tasks[taskIndex];
  }

  async getTasksByPriority(priority: string): Promise<Task[]> {
    const tasks = await this.getTasks();
    return tasks.filter(task => task.priority === priority);
  }

  async getTasksByStatus(completed: boolean): Promise<Task[]> {
    const tasks = await this.getTasks();
    return tasks.filter(task => task.completed === completed);
  }

  async getOverdueTasks(): Promise<Task[]> {
    const tasks = await this.getTasks();
    return tasks.filter(task => task.overdue && !task.completed);
  }
}

export const taskService = new TaskService();
