import { Task, TaskFormData } from "../types/Task";
import { API_URL, API_ENDPOINTS, joinUrl } from "@/constants/ApiConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { parseISOToDate, toUTCISOString } from "@/app/utils/utcDate";
import offlineStorageService, { OfflineTask } from './offlineStorageService';
import networkService from './networkService';
import syncService from './syncService';

class OfflineTaskService {
  private unsubscribeNetwork?: () => void;
  private reconnectSyncTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    // Initialize current network status and attempt a startup sync if needed
    networkService.getCurrentNetworkStatus()
      .then(() => this.tryAutoSync('startup'))
      .catch(() => { /* noop */ });

    // Auto-sync when network becomes available again
    this.unsubscribeNetwork = networkService.addNetworkStatusListener((status) => {
      const isOnline = status.isConnected && status.isInternetReachable !== false;
      if (isOnline) {
        this.tryAutoSync('reconnect');
      }
    });
  }

  // Debounced auto-sync trigger to avoid rapid re-syncs on flappy connections
  private async tryAutoSync(source: 'startup' | 'reconnect') {
    try {
      if (!networkService.isOnline()) return;
      const hasPending = await syncService.hasPendingOperations();
      if (!hasPending) return;

      if (this.reconnectSyncTimer) {
        clearTimeout(this.reconnectSyncTimer);
      }
      this.reconnectSyncTimer = setTimeout(() => {
        syncService.syncWithServer().catch((e) => {
          console.error(`Auto-sync (${source}) failed:`, e);
        });
      }, 800);
    } catch (e) {
      // Silently ignore auto-sync attempts
    }
  }
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
      "X-Client-Timezone": Intl.DateTimeFormat().resolvedOptions().timeZone || "",
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
      const response = await fetch(joinUrl(API_URL, endpoint), options);

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
    // Normalize id as string to avoid duplicates between numeric/string ids
    const id: string = String(task.id ?? task.localId ?? '');
    // Convert backend priority format (with underscores) to frontend format (with hyphens)
    const priority =
      task.priority?.replace(/_/g, "-") || "not-urgent-not-important";
    const status = task.status?.replace(/_/g, "-") || "not-started";

    // Parse UTC timestamps and rely on device local time for display
    const createdAt = task.created_at ? parseISOToDate(task.created_at) ?? new Date() : new Date();
    const updatedAt = task.updated_at ? parseISOToDate(task.updated_at) ?? new Date() : new Date();
    const due_datetime = task.due_datetime ? parseISOToDate(task.due_datetime) ?? undefined : undefined;
    const completedAt = task.completed_at ? parseISOToDate(task.completed_at) ?? undefined : undefined;

    return {
      ...task,
      id,
      priority,
      status,
      createdAt,
      updatedAt,
      due_datetime,
      due_time: task.due_time || null,
      completedAt,
      overdue:
        due_datetime && !task.completed
          ? due_datetime < new Date()
          : false,
    };
  }

  // Convert OfflineTask to Task for UI compatibility
  private offlineTaskToTask(offlineTask: OfflineTask): Task {
    return {
      id: String(offlineTask.id),
      title: offlineTask.title,
      description: offlineTask.description,
      completed: offlineTask.completed,
      priority: offlineTask.priority,
      category: offlineTask.category,
      category_name: offlineTask.category_name,
      due_date: offlineTask.due_date,
      due_time: offlineTask.due_time,
      due_datetime: offlineTask.due_datetime,
      created_at: offlineTask.created_at,
      updated_at: offlineTask.updated_at,
      completed_at: offlineTask.completed_at,
      overdue: offlineTask.overdue,
      user: offlineTask.user,
    };
  }

  async getAllTasks(): Promise<Task[]> {
    try {
      if (networkService.isOnline()) {
        // Try to fetch from server first
        try {
          const response = await this.apiRequest<any[]>(API_ENDPOINTS.TASKS);
          const formattedTasks = await Promise.all(
            response.map((task: any) => this.formatTaskDates(task))
          );
          
          // Convert server tasks to offline tasks (synced)
          const serverOfflineTasks: OfflineTask[] = formattedTasks.map(task => 
            offlineStorageService.taskToOfflineTask(task, 'synced')
          );

          // Load local tasks and pick pending/failed ones to override server
          const localTasks = await offlineStorageService.getOfflineTasks();
          const pendingOrFailed = localTasks.filter(t => t.syncStatus === 'pending' || t.syncStatus === 'failed');

          // Merge: prefer local pending/failed over server copies; include local-only tasks (id starts with local_)
          const byId = new Map<string, OfflineTask>();
          const keyOf = (t: OfflineTask) => String(t.id || t.localId);
          // Seed with server tasks
          for (const t of serverOfflineTasks) {
            byId.set(keyOf(t), t);
          }
          // Override/insert pending local tasks
          for (const lt of pendingOrFailed) {
            byId.set(keyOf(lt), lt);
          }
          // Ensure purely local tasks (created offline, not yet on server) are included
          for (const lt of localTasks) {
            const key = keyOf(lt);
            if (key.startsWith('local_')) {
              byId.set(key, lt);
            }
          }

          const merged = Array.from(byId.values());
          await offlineStorageService.saveOfflineTasks(merged);

          // Trigger sync for any pending operations (non-blocking)
          syncService.syncWithServer().catch(() => {});

          return merged.map(t => this.offlineTaskToTask(t));
        } catch (error) {
          // Fall through to offline mode
        }
      }

      // Offline mode or server fetch failed
      const offlineTasks = await offlineStorageService.getOfflineTasks();
      return offlineTasks.map(task => this.offlineTaskToTask(task));
    } catch (error) {
      console.error("Error fetching tasks:", error);
      // Return empty array instead of crashing
      return [];
    }
  }

  async getTaskById(id: string): Promise<Task | undefined> {
    try {
      if (networkService.isOnline()) {
        try {
          const response = await this.apiRequest<any>(
            API_ENDPOINTS.TASK_DETAIL(id)
          );
          const formattedTask = await this.formatTaskDates(response);
          
          // Update local storage
          const offlineTask = offlineStorageService.taskToOfflineTask(formattedTask, 'synced');
          await offlineStorageService.saveOfflineTask(offlineTask);
          
          return formattedTask;
        } catch (error) {
          // Failed to fetch from server, check offline storage
        }
      }

      // Check offline storage
      const offlineTask = await offlineStorageService.getOfflineTaskById(id);
      return offlineTask ? this.offlineTaskToTask(offlineTask) : undefined;
    } catch (error) {
      console.error(`Error fetching task with id ${id}:`, error);
      return undefined;
    }
  }

  async createTask(taskData: TaskFormData): Promise<Task> {
    try {
      const username = (await AsyncStorage.getItem("username")) || "default_user";
      
      if (networkService.isOnline()) {
        try {
          // Try to create on server first
          const payload = {
            title: taskData.title,
            description: taskData.description || "",
            priority: taskData.priority || "not-urgent-not-important",
            category: taskData.category || "",
            completed: taskData.completed || false,
            user: username,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            completed_at: (function(v:any){ if (v===undefined||v===null) return null; if (v instanceof Date) return v.toISOString(); if (typeof v==='string'){ const p=new Date(v); return isNaN(p.getTime())? v: p.toISOString(); } return null })(taskData.completed_at),
            // Store in UTC while basing on the user's local selection
            due_datetime: taskData.due_datetime ? toUTCISOString(taskData.due_datetime) : null,
          };

          const serverTask = await this.apiRequest<any>(API_ENDPOINTS.TASKS, "POST", payload);
          const formattedTask = await this.formatTaskDates(serverTask);
          
          // Save to local storage as synced
          const offlineTask = offlineStorageService.taskToOfflineTask(formattedTask, 'synced');
          await offlineStorageService.saveOfflineTask(offlineTask);
          
          return formattedTask;
        } catch (error) {
          // Failed to create task on server, creating offline
        }
      }

      // Create task offline
      const localId = offlineStorageService.generateLocalId();
      const offlineTask = offlineStorageService.taskFormDataToOfflineTask({
        ...taskData,
        user: username
      }, localId);
      
      await offlineStorageService.saveOfflineTask(offlineTask);
      
      // Queue for sync when online
      await syncService.queueOperation('create', localId, taskData, localId);
      
      return this.offlineTaskToTask(offlineTask);
    } catch (error) {
      console.error("Error in createTask:", error);
      throw error;
    }
  }

  async updateTask(id: string, updates: Partial<TaskFormData>): Promise<Task> {
    try {
      // Get current task (from offline storage first to ensure we have it)
      let currentTask = await offlineStorageService.getOfflineTaskById(id);
      
      if (!currentTask) {
        // If not in offline storage, try to fetch from server
        if (networkService.isOnline()) {
          try {
            const serverTask = await this.apiRequest<any>(API_ENDPOINTS.TASK_DETAIL(id));
            const formattedTask = await this.formatTaskDates(serverTask);
            currentTask = offlineStorageService.taskToOfflineTask(formattedTask, 'synced');
          } catch (error) {
            throw new Error(`Task with id ${id} not found`);
          }
        } else {
          throw new Error(`Task with id ${id} not found in offline storage`);
        }
      }

      // Apply updates to the task
      const updatedTask: OfflineTask = {
        ...currentTask,
        ...updates,
        created_at: currentTask.created_at,
        completed_at: currentTask.completed_at,
        updated_at: new Date().toISOString(),
        syncStatus: 'pending',
        lastModified: new Date().toISOString(),
        action: 'update',
      };

      // Handle date field updates
      const isoOrNull = (val: any): string | null => {
        if (val === undefined || val === null) return null;
        if (val instanceof Date) return val.toISOString();
        if (typeof val === 'string') {
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

      if (updates.due_datetime !== undefined) {
        updatedTask.due_datetime = updates.due_datetime;
      }
      if (updates.completed_at !== undefined) {
        updatedTask.completed_at = isoOrNull(updates.completed_at) as any;
      }
      // Recompute overdue locally when completion status or due date/time changes
      if (updates.completed !== undefined || updates.due_datetime !== undefined) {
        const due = updatedTask.due_datetime ? new Date(updatedTask.due_datetime as any) : undefined;
        updatedTask.overdue = !!(due && !updates.completed && due < new Date());
      }

      // Save to offline storage
      await offlineStorageService.saveOfflineTask(updatedTask);

      // Check if this is a local-only task (created offline, never synced)
      const isLocalOnly = String(id).startsWith('local_');
      
      if (networkService.isOnline() && !isLocalOnly) {
        try {
          // Transform data for API
          const apiUpdates: any = {
            updated_at: new Date().toISOString(),
          };

          if (updates.title !== undefined) apiUpdates.title = updates.title;
          if (updates.description !== undefined) apiUpdates.description = updates.description;
          if (updates.priority !== undefined) apiUpdates.priority = updates.priority.toLowerCase();
          if (updates.category !== undefined) apiUpdates.category = updates.category;
          if (updates.due_time !== undefined) apiUpdates.due_time = updates.due_time || null;
          if (updates.completed !== undefined) apiUpdates.completed = updates.completed;
          
          if (updates.due_datetime !== undefined) {
            apiUpdates.due_datetime = updates.due_datetime ? toUTCISOString(updates.due_datetime) : null;
          }
          if (updates.completed_at !== undefined) {
            apiUpdates.completed_at = (function(v:any){ if (v===undefined||v===null) return null; if (v instanceof Date) return v.toISOString(); if (typeof v==='string'){ const p=new Date(v); return isNaN(p.getTime())? v: p.toISOString(); } return null })(updates.completed_at);
          }

          const serverTask = await this.apiRequest<any>(
            API_ENDPOINTS.TASK_DETAIL(id),
            "PATCH",
            apiUpdates
          );
          
          const formattedTask = await this.formatTaskDates(serverTask);
          
          // Update offline storage with server response
          const syncedTask = offlineStorageService.taskToOfflineTask(formattedTask, 'synced');
          await offlineStorageService.saveOfflineTask(syncedTask);
          
          return formattedTask;
        } catch (error) {
          // Failed to update task on server, saved offline for sync
          await syncService.queueOperation('update', id, updates);
        }
      } else {
        // Queue for sync when online (unless it's a local-only task)
        if (!isLocalOnly) {
          await syncService.queueOperation('update', id, updates);
        }
      }

      return this.offlineTaskToTask(updatedTask);
    } catch (error) {
      console.error("Error in updateTask:", error);
      throw error;
    }
  }

  async deleteTask(id: string): Promise<void> {
    try {
      // Check if this is a local-only task (created offline, never synced)
      const isLocalOnly = String(id).startsWith('local_');
      
      // Remove from offline storage first
      await offlineStorageService.deleteOfflineTask(id);
      
      // If it's a local-only task, don't try to delete from server
      if (isLocalOnly) {
        // Just remove from local storage, no need to sync with server
        // since this task was never on the server
        return;
      }
      
      if (networkService.isOnline()) {
        try {
          // Try to delete from server (only if it's a server task)
          await this.apiRequest(API_ENDPOINTS.TASK_DETAIL(id), "DELETE");
        } catch (error) {
          // Failed to delete task from server, queuing for sync
          await syncService.queueOperation('delete', id);
        }
      } else {
        // Queue for sync when online
        await syncService.queueOperation('delete', id);
      }
    } catch (error) {
      console.error("Error in deleteTask:", error);
      throw error;
    }
  }

  async markTaskComplete(id: string): Promise<Task> {
    const updates = {
      completed: true,
      completed_at: new Date(),
    };
    return this.updateTask(id, updates);
  }

  async markTaskIncomplete(id: string): Promise<Task> {
    const updates = {
      completed: false,
      completed_at: undefined,
    };
    return this.updateTask(id, updates);
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

  // New methods for offline functionality

  // Force sync with server
  async syncWithServer(): Promise<void> {
    if (!networkService.isOnline()) {
      throw new Error("Cannot sync while offline");
    }
    
    const result = await syncService.syncWithServer();
    if (!result.success) {
      throw new Error(`Sync failed: ${result.errors.map(e => e.error).join(', ')}`);
    }
  }

  // Check if device is online
  isOnline(): boolean {
    return networkService.isOnline();
  }

  // Check if there are pending sync operations
  async hasPendingChanges(): Promise<boolean> {
    return await syncService.hasPendingOperations();
  }

  // Get network status
  getNetworkStatus() {
    return networkService.getNetworkStatus();
  }

  // Add network status listener
  addNetworkStatusListener(listener: (status: any) => void): () => void {
    return networkService.addNetworkStatusListener(listener);
  }

  // Get sync status
  getSyncStatus() {
    return syncService.getSyncStatus();
  }
}

export default new OfflineTaskService();