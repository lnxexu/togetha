import AsyncStorage from '@react-native-async-storage/async-storage';
import { Task, TaskFormData } from '../types/Task';

export interface OfflineTask extends Task {
  localId?: string;
  syncStatus: 'synced' | 'pending' | 'failed';
  lastModified: string;
  action?: 'create' | 'update' | 'delete';
}

export interface PendingSync {
  id: string;
  localId?: string;
  action: 'create' | 'update' | 'delete';
  data?: Partial<TaskFormData>;
  timestamp: string;
}

class OfflineStorageService {
  private readonly TASKS_KEY = 'offline_tasks';
  private readonly PENDING_SYNC_KEY = 'pending_sync_operations';
  private readonly LAST_SYNC_KEY = 'last_sync_timestamp';

  // Get all offline tasks
  async getOfflineTasks(): Promise<OfflineTask[]> {
    try {
      const tasksJson = await AsyncStorage.getItem(this.TASKS_KEY);
      if (!tasksJson) return [];
      
      const tasks = JSON.parse(tasksJson) as OfflineTask[];
      // Convert date strings back to Date objects
      return tasks.map(task => ({
        ...task,
        id: String(task.id),
        localId: task.localId ? String(task.localId) : task.localId,
        due_datetime: task.due_datetime ? new Date(task.due_datetime) : null,
        createdAt: task.created_at,
        updatedAt: task.updated_at,
      }));
    } catch (error) {
      console.error('Error getting offline tasks:', error);
      return [];
    }
  }

  // Save tasks to offline storage
  async saveOfflineTasks(tasks: OfflineTask[]): Promise<void> {
    try {
      const isoOrNull = (val: any): string | null => {
        if (val === undefined || val === null) return null;
        if (val instanceof Date) return val.toISOString();
        if (typeof val === 'string') {
          // if already ISO-ish, keep; otherwise try to parse
          const parsed = new Date(val);
          if (!isNaN(parsed.getTime())) return parsed.toISOString();
          return val;
        }
        if (typeof val === 'number') {
          const d = new Date(val);
          if (!isNaN(d.getTime())) return d.toISOString();
        }
        return null;
      };

      // Dedupe by id/localId to avoid duplicates
      const seen = new Set<string>();
      const unique = [] as OfflineTask[];
      for (const t of tasks) {
        const key = String((t as any).id ?? (t as any).localId);
        if (!seen.has(key)) {
          seen.add(key);
          unique.push({
            ...t,
            id: String((t as any).id ?? (t as any).localId),
            localId: t.localId ? String(t.localId) : t.localId,
          } as OfflineTask);
        }
      }

      const tasksToSave = unique.map(task => ({
        ...task,
        due_datetime: isoOrNull(task.due_datetime),
      }));
      await AsyncStorage.setItem(this.TASKS_KEY, JSON.stringify(tasksToSave));
    } catch (error) {
      console.error('Error saving offline tasks:', error);
      throw error;
    }
  }

  // Get a single offline task by ID
  async getOfflineTaskById(id: string): Promise<OfflineTask | undefined> {
    const tasks = await this.getOfflineTasks();
    return tasks.find(task => task.id === id || task.localId === id);
  }

  // Add or update a task in offline storage
  async saveOfflineTask(task: OfflineTask): Promise<void> {
    try {
      const tasks = await this.getOfflineTasks();
      const existingIndex = tasks.findIndex(t => String(t.id) === String(task.id) || (t.localId && task.localId && String(t.localId) === String(task.localId)));
      
      if (existingIndex >= 0) {
        tasks[existingIndex] = task;
      } else {
        tasks.push(task);
      }
      
      await this.saveOfflineTasks(tasks);
    } catch (error) {
      console.error('Error saving offline task:', error);
      throw error;
    }
  }

  // Delete a task from offline storage
  async deleteOfflineTask(id: string): Promise<void> {
    try {
      const tasks = await this.getOfflineTasks();
      const filteredTasks = tasks.filter(task => String(task.id) !== String(id) && String(task.localId || '') !== String(id));
      await this.saveOfflineTasks(filteredTasks);
    } catch (error) {
      console.error('Error deleting offline task:', error);
      throw error;
    }
  }

  // Generate a local ID for new tasks created offline
  generateLocalId(): string {
    return `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Add pending sync operation
  async addPendingSync(operation: PendingSync): Promise<void> {
    try {
      const pendingOps = await this.getPendingSyncOperations();
      pendingOps.push(operation);
      await AsyncStorage.setItem(this.PENDING_SYNC_KEY, JSON.stringify(pendingOps));
    } catch (error) {
      console.error('Error adding pending sync operation:', error);
    }
  }

  // Get all pending sync operations
  async getPendingSyncOperations(): Promise<PendingSync[]> {
    try {
      const opsJson = await AsyncStorage.getItem(this.PENDING_SYNC_KEY);
      return opsJson ? JSON.parse(opsJson) : [];
    } catch (error) {
      console.error('Error getting pending sync operations:', error);
      return [];
    }
  }

  // Remove a pending sync operation
  async removePendingSync(operationId: string): Promise<void> {
    try {
      const pendingOps = await this.getPendingSyncOperations();
      const filteredOps = pendingOps.filter(op => op.id !== operationId);
      await AsyncStorage.setItem(this.PENDING_SYNC_KEY, JSON.stringify(filteredOps));
    } catch (error) {
      console.error('Error removing pending sync operation:', error);
    }
  }

  // Clear all pending sync operations
  async clearPendingSyncOperations(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.PENDING_SYNC_KEY);
    } catch (error) {
      console.error('Error clearing pending sync operations:', error);
    }
  }

  // Update last sync timestamp
  async updateLastSyncTimestamp(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.LAST_SYNC_KEY, new Date().toISOString());
    } catch (error) {
      console.error('Error updating last sync timestamp:', error);
    }
  }

  // Get last sync timestamp
  async getLastSyncTimestamp(): Promise<Date | null> {
    try {
      const timestamp = await AsyncStorage.getItem(this.LAST_SYNC_KEY);
      return timestamp ? new Date(timestamp) : null;
    } catch (error) {
      console.error('Error getting last sync timestamp:', error);
      return null;
    }
  }

  // Clear all offline data (for testing or reset)
  async clearAllOfflineData(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        this.TASKS_KEY,
        this.PENDING_SYNC_KEY,
        this.LAST_SYNC_KEY
      ]);
    } catch (error) {
      console.error('Error clearing offline data:', error);
    }
  }

  // Convert a regular Task to OfflineTask
  taskToOfflineTask(task: Task, syncStatus: 'synced' | 'pending' | 'failed' = 'synced'): OfflineTask {
    return {
      ...task,
      syncStatus,
      lastModified: new Date().toISOString(),
    };
  }

  // Convert TaskFormData to OfflineTask for new tasks
  taskFormDataToOfflineTask(taskData: TaskFormData, localId?: string): OfflineTask {
    const now = new Date();
    const lid = localId || this.generateLocalId();
    return {
      id: lid,
      localId: lid,
      title: taskData.title,
      description: taskData.description || '',
      completed: taskData.completed || false,
      priority: taskData.priority || 'not-urgent-not-important',
      category: taskData.category || '',
  due_datetime: taskData.due_datetime || null,
      due_time: taskData.due_time || '',
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
  completed_at: taskData.completed_at ? (taskData.completed_at instanceof Date ? taskData.completed_at.toISOString() : (typeof taskData.completed_at === 'string' ? (isNaN(new Date(taskData.completed_at).getTime()) ? taskData.completed_at : new Date(taskData.completed_at).toISOString()) : null)) : null,
      overdue: false,
      user: taskData.user || '',
      syncStatus: 'pending',
      lastModified: now.toISOString(),
      action: 'create',
    };
  }
}

export default new OfflineStorageService();