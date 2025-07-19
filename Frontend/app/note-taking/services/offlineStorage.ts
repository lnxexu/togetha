import AsyncStorage from '@react-native-async-storage/async-storage';

export interface OfflineSyncQueueItem {
  id: string;
  action: 'create' | 'update' | 'delete';
  entityType: 'note' | 'folder' | 'audio';
  data: any;
  timestamp: number;
}

class OfflineStorage {
  private SYNC_QUEUE_KEY = 'sync_queue';
  private NOTES_CACHE_KEY = 'notes_cache';
  private FOLDERS_CACHE_KEY = 'folders_cache';
  private LAST_SYNC_KEY = 'last_sync_time';

  // Add an item to the sync queue
  async addToSyncQueue(item: Omit<OfflineSyncQueueItem, 'timestamp'>): Promise<void> {
    const queue = await this.getSyncQueue();
    
    // Check if we already have an operation for this entity
    const existingIndex = queue.findIndex(
      q => q.id === item.id && q.entityType === item.entityType
    );
    
    if (existingIndex >= 0) {
      // If the existing item is a create and the new one is a delete, just remove it entirely
      if (queue[existingIndex].action === 'create' && item.action === 'delete') {
        queue.splice(existingIndex, 1);
      } else {
        // Otherwise, replace the existing operation with this one
        queue[existingIndex] = {
          ...item,
          timestamp: Date.now()
        };
      }
    } else {
      // Add a new operation
      queue.push({
        ...item,
        timestamp: Date.now()
      });
    }
    
    await AsyncStorage.setItem(this.SYNC_QUEUE_KEY, JSON.stringify(queue));
  }

  // Get all pending sync operations
  async getSyncQueue(): Promise<OfflineSyncQueueItem[]> {
    const queueStr = await AsyncStorage.getItem(this.SYNC_QUEUE_KEY);
    return queueStr ? JSON.parse(queueStr) : [];
  }

  // Remove an item from the sync queue
  async removeFromSyncQueue(id: string, entityType: string): Promise<void> {
    const queue = await this.getSyncQueue();
    const newQueue = queue.filter(item => !(item.id === id && item.entityType === entityType));
    await AsyncStorage.setItem(this.SYNC_QUEUE_KEY, JSON.stringify(newQueue));
  }

  // Clear the entire sync queue
  async clearSyncQueue(): Promise<void> {
    await AsyncStorage.setItem(this.SYNC_QUEUE_KEY, JSON.stringify([]));
  }

  // Save notes to cache
  async cacheNotes(notes: any[]): Promise<void> {
    await AsyncStorage.setItem(this.NOTES_CACHE_KEY, JSON.stringify(notes));
  }

  // Get cached notes
  async getCachedNotes(): Promise<any[]> {
    const notesStr = await AsyncStorage.getItem(this.NOTES_CACHE_KEY);
    return notesStr ? JSON.parse(notesStr) : [];
  }

  // Save folders to cache
  async cacheFolders(folders: any[]): Promise<void> {
    await AsyncStorage.setItem(this.FOLDERS_CACHE_KEY, JSON.stringify(folders));
  }

  // Get cached folders
  async getCachedFolders(): Promise<any[]> {
    const foldersStr = await AsyncStorage.getItem(this.FOLDERS_CACHE_KEY);
    return foldersStr ? JSON.parse(foldersStr) : [];
  }

  // Record the last successful sync time
  async setLastSyncTime(): Promise<void> {
    await AsyncStorage.setItem(this.LAST_SYNC_KEY, Date.now().toString());
  }

  // Get the last sync time
  async getLastSyncTime(): Promise<number | null> {
    const timeStr = await AsyncStorage.getItem(this.LAST_SYNC_KEY);
    return timeStr ? parseInt(timeStr) : null;
  }
}

export default new OfflineStorage();
