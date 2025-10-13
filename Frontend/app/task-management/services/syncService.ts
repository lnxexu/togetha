import { Task, TaskFormData } from '../types/Task';
import offlineStorageService, { OfflineTask, PendingSync } from './offlineStorageService';
import networkService from './networkService';
import { API_URL, API_ENDPOINTS, joinUrl } from '@/constants/ApiConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface SyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: Array<{ operation: string; error: string }>;
}

class SyncService {
  private isSyncing = false;
  private syncInProgress = new Set<string>();

  private async getAuthToken(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem('authToken');
    } catch (error) {
      console.error('Error getting auth token:', error);
      return null;
    }
  }

  private async makeApiRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
    body?: any
  ): Promise<T> {
    const token = await this.getAuthToken();
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || '',
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

  const response = await fetch(joinUrl(API_URL, endpoint), options);

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    if (method === 'DELETE') {
      return {} as T;
    }

    return await response.json();
  }

  // Sync all pending operations with the server
  async syncWithServer(): Promise<SyncResult> {
    if (this.isSyncing) {
      return { success: true, synced: 0, failed: 0, errors: [] };
    }

    if (!networkService.isOnline()) {
      return { success: false, synced: 0, failed: 0, errors: [{ operation: 'sync', error: 'Device is offline' }] };
    }

    this.isSyncing = true;
    const result: SyncResult = { success: true, synced: 0, failed: 0, errors: [] };

    try {
      // First, fetch latest tasks from server to update local cache
      await this.fetchAndUpdateLocalTasks();

      // Then sync pending operations
      const pendingOps = await offlineStorageService.getPendingSyncOperations();

      for (const operation of pendingOps) {
        if (this.syncInProgress.has(operation.id)) {
          continue; // Skip if already syncing this operation
        }

        this.syncInProgress.add(operation.id);

        try {
          await this.syncOperation(operation);
          await offlineStorageService.removePendingSync(operation.id);
          result.synced++;
        } catch (error) {
          console.error(`Failed to sync operation ${operation.id}:`, error);
          result.failed++;
          result.errors.push({
            operation: `${operation.action} ${operation.id}`,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        } finally {
          this.syncInProgress.delete(operation.id);
        }
      }

      // Update last sync timestamp
      await offlineStorageService.updateLastSyncTimestamp();

      // Update sync status of all tasks to 'synced'
      await this.updateTasksSyncStatus();
    } catch (error) {
      console.error('Sync process failed:', error);
      result.success = false;
      result.errors.push({
        operation: 'sync',
        error: error instanceof Error ? error.message : 'Unknown error'
      });
    } finally {
      this.isSyncing = false;
    }

    return result;
  }

  // Sync a single operation
  private async syncOperation(operation: PendingSync): Promise<void> {
    switch (operation.action) {
      case 'create':
        await this.syncCreateOperation(operation);
        break;
      case 'update':
        await this.syncUpdateOperation(operation);
        break;
      case 'delete':
        await this.syncDeleteOperation(operation);
        break;
      default:
        throw new Error(`Unknown operation type: ${operation.action}`);
    }
  }

  // Sync create operation
  private async syncCreateOperation(operation: PendingSync): Promise<void> {
    if (!operation.data) {
      throw new Error('No data provided for create operation');
    }

    const localTask = await offlineStorageService.getOfflineTaskById(operation.localId || operation.id);
    if (!localTask) {
      throw new Error('Local task not found');
    }

    // Prepare payload for server
    const payload = {
      title: localTask.title,
      description: localTask.description || '',
      priority: localTask.priority || 'not-urgent-not-important',
      category: localTask.category || '',
      completed: localTask.completed || false,
      user: localTask.user || await AsyncStorage.getItem('username') || 'default_user',
      created_at: localTask.created_at,
      updated_at: localTask.updated_at,
      completed_at: localTask.completed_at || null,
      due_datetime: localTask.due_datetime ? localTask.due_datetime.toISOString() : null,
    };

    // Create task on server
    const serverTask = await this.makeApiRequest<any>(API_ENDPOINTS.TASKS, 'POST', payload);

    // Update local task with server ID and mark as synced
    const updatedTask: OfflineTask = {
      ...localTask,
      id: serverTask.id,
      syncStatus: 'synced',
      lastModified: new Date().toISOString(),
    };

    await offlineStorageService.saveOfflineTask(updatedTask);
  }

  // Sync update operation
  private async syncUpdateOperation(operation: PendingSync): Promise<void> {
    if (!operation.data) {
      throw new Error('No data provided for update operation');
    }

    const localTask = await offlineStorageService.getOfflineTaskById(operation.id);
    if (!localTask) {
      throw new Error('Local task not found');
    }

    // Prepare update payload
    const apiUpdates: any = {
      updated_at: new Date().toISOString(),
    };

    // Map the update data
    if (operation.data.title !== undefined) apiUpdates.title = operation.data.title;
    if (operation.data.description !== undefined) apiUpdates.description = operation.data.description;
    if (operation.data.priority !== undefined) apiUpdates.priority = operation.data.priority;
    if (operation.data.category !== undefined) apiUpdates.category = operation.data.category;
    if (operation.data.completed !== undefined) apiUpdates.completed = operation.data.completed;
    if (operation.data.due_datetime !== undefined) {
      apiUpdates.due_datetime = operation.data.due_datetime ? operation.data.due_datetime.toISOString() : null;
    }
    if (operation.data.due_time !== undefined) apiUpdates.due_time = operation.data.due_time || null;
    if (operation.data.completed_at !== undefined) {
      apiUpdates.completed_at = operation.data.completed_at ? operation.data.completed_at.toISOString() : null;
    }

    // Update task on server
    const serverTask = await this.makeApiRequest<any>(
      API_ENDPOINTS.TASK_DETAIL(localTask.id),
      'PATCH',
      apiUpdates
    );

    // Update local task and mark as synced
    const updatedTask: OfflineTask = {
      ...localTask,
      ...serverTask,
      syncStatus: 'synced',
      lastModified: new Date().toISOString(),
    };

    await offlineStorageService.saveOfflineTask(updatedTask);
  }

  // Sync delete operation
  private async syncDeleteOperation(operation: PendingSync): Promise<void> {
    // Delete task on server
    await this.makeApiRequest(API_ENDPOINTS.TASK_DETAIL(operation.id), 'DELETE');

    // Remove from local storage
    await offlineStorageService.deleteOfflineTask(operation.id);
  }

  // Fetch latest tasks from server and update local cache
  private async fetchAndUpdateLocalTasks(): Promise<void> {
    try {
      const serverTasks = await this.makeApiRequest<any[]>(API_ENDPOINTS.TASKS);
      
      // Convert server tasks to offline tasks
      const offlineTasks: OfflineTask[] = serverTasks.map(task => 
        offlineStorageService.taskToOfflineTask(this.formatTaskDates(task), 'synced')
      );

      // Get current local tasks
      const localTasks = await offlineStorageService.getOfflineTasks();
      
      // Merge server tasks with local pending tasks
      const mergedTasks = this.mergeTasks(offlineTasks, localTasks);
      
      // Save merged tasks
      await offlineStorageService.saveOfflineTasks(mergedTasks);
    } catch (error) {
      console.error('Error fetching tasks from server:', error);
      throw error;
    }
  }

  // Merge server tasks with local tasks, preserving local changes
  private mergeTasks(serverTasks: OfflineTask[], localTasks: OfflineTask[]): OfflineTask[] {
    const merged = new Map<string, OfflineTask>();

    // Add all server tasks first
    serverTasks.forEach(task => {
      merged.set(task.id, task);
    });

    // Add local tasks, but preserve pending/failed sync status
    localTasks.forEach(localTask => {
      if (localTask.syncStatus === 'pending' || localTask.syncStatus === 'failed') {
        // Keep local version if it has pending changes
        merged.set(localTask.id, localTask);
      } else if (localTask.localId && !localTask.id.startsWith('local_')) {
        // This is a local task that was synced, use server version
        const serverTask = merged.get(localTask.id);
        if (serverTask) {
          merged.set(localTask.id, serverTask);
        }
      } else if (localTask.id.startsWith('local_')) {
        // This is a purely local task, keep it
        merged.set(localTask.localId || localTask.id, localTask);
      }
    });

    return Array.from(merged.values());
  }

  // Update sync status of all synced tasks
  private async updateTasksSyncStatus(): Promise<void> {
    const tasks = await offlineStorageService.getOfflineTasks();
    const updatedTasks = tasks.map(task => {
      if (task.syncStatus === 'pending' && !task.id.startsWith('local_')) {
        return { ...task, syncStatus: 'synced' as const };
      }
      return task;
    });
    await offlineStorageService.saveOfflineTasks(updatedTasks);
  }

  // Format task dates (copied from original taskService)
  private formatTaskDates(task: any): Task {
    const priority = task.priority?.replace(/_/g, '-') || 'not-urgent-not-important';
    const status = task.status?.replace(/_/g, '-') || 'not-started';

    const createdAt = task.created_at ? task.created_at : new Date().toISOString();
    const updatedAt = task.updated_at ? task.updated_at : new Date().toISOString();
    const due_datetime = task.due_datetime ? new Date(task.due_datetime) : undefined;
    const completedAt = task.completed_at ? task.completed_at : undefined;

    return {
      ...task,
      priority,
      status,
      createdAt,
      updatedAt,
      due_datetime,
      due_time: task.due_time || null,
      completedAt,
      overdue: due_datetime && !task.completed
        ? due_datetime < new Date()
        : false,
    };
  }

  // Queue operation for sync when online
  async queueOperation(
    action: 'create' | 'update' | 'delete',
    taskId: string,
    data?: Partial<TaskFormData>,
    localId?: string
  ): Promise<void> {
    const operation: PendingSync = {
      id: taskId,
      localId,
      action,
      data,
      timestamp: new Date().toISOString(),
    };

    await offlineStorageService.addPendingSync(operation);

    // Try to sync immediately if online
    if (networkService.isOnline()) {
      setTimeout(() => this.syncWithServer(), 1000); // Small delay to avoid rapid-fire syncs
    }
  }

  // Force sync (useful for manual sync triggers)
  async forcSync(): Promise<SyncResult> {
    return await this.syncWithServer();
  }

  // Get sync status
  getSyncStatus(): { isSyncing: boolean; pendingOperations: number } {
    return {
      isSyncing: this.isSyncing,
      pendingOperations: this.syncInProgress.size,
    };
  }

  // Check if there are pending operations
  async hasPendingOperations(): Promise<boolean> {
    const pendingOps = await offlineStorageService.getPendingSyncOperations();
    return pendingOps.length > 0;
  }
}

export default new SyncService();