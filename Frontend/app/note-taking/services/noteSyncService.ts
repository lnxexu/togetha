import offlineStorage, { OfflineNote, OfflineFolder, PendingSync } from './offlineStorage';
import { DrawingData, PDFAnnotationData } from './drawingAPI';
import { API_URL, API_ENDPOINTS, joinUrl } from '@/constants/ApiConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import network service from task management (reuse it)
import networkService from '../../task-management/services/networkService';

export interface NoteSyncResult {
  success: boolean;
  synced: number;
  failed: number;
  errors: Array<{ operation: string; error: string }>;
}

class NoteSyncService {
  private isSyncing = false;
  private syncInProgress = new Set<string>();

  private async getAuthHeaders(): Promise<HeadersInit> {
    try {
      const token = await AsyncStorage.getItem('authToken');
      return {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        ...(token && { 'Authorization': `Token ${token}` }),
      };
    } catch (error) {
      console.error('Failed to get auth headers:', error);
      return {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      };
    }
  }

  private async makeApiRequest<T>(
    endpoint: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
    body?: any
  ): Promise<T> {
    const headers = await this.getAuthHeaders();

    const options: RequestInit = {
      method,
      headers,
    };

    if (body) {
      options.body = JSON.stringify(body);
    }

    const response = await fetch(joinUrl(API_URL, endpoint), options);

    if (!response.ok) {
      // Try to extract error detail for easier debugging
      let detail = '';
      try {
        const errData = await response.json();
        detail = errData?.detail || errData?.error || JSON.stringify(errData);
      } catch {}
      throw new Error(`API Error: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`);
    }

    if (method === 'DELETE') {
      return {} as T;
    }

    return await response.json();
  }

  // Sync all pending operations with the server
  async syncWithServer(): Promise<NoteSyncResult> {
    if (this.isSyncing) {
      console.log('Note sync already in progress, skipping...');
      return { success: true, synced: 0, failed: 0, errors: [] };
    }

    if (!networkService.isOnline()) {
      console.log('Device is offline, skipping note sync');
      return { success: false, synced: 0, failed: 0, errors: [{ operation: 'sync', error: 'Device is offline' }] };
    }

    this.isSyncing = true;
    const result: NoteSyncResult = { success: true, synced: 0, failed: 0, errors: [] };

    try {
      // First, fetch latest data from server to update local cache
      await this.fetchAndUpdateLocalData();

      // Then sync pending operations
  // De-dupe queue to avoid repeated updates causing 400 loops
  const pendingOps = await offlineStorage.getPendingSyncOperations();
      console.log(`Starting note sync with ${pendingOps.length} pending operations`);

      for (const operation of pendingOps) {
        if (this.syncInProgress.has(operation.id)) {
          continue; // Skip if already syncing this operation
        }

        this.syncInProgress.add(operation.id);

        try {
          await this.syncOperation(operation);
          await offlineStorage.removePendingSync(operation.id);
          result.synced++;
          console.log(`Successfully synced note operation: ${operation.action} ${operation.entityType} ${operation.id}`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          console.error(`Failed to sync note operation ${operation.id}:`, error);
          result.failed++;
          result.errors.push({
            operation: `${operation.action} ${operation.entityType} ${operation.id}`,
            error: message
          });
          // For unrecoverable 400 or missing local, don't loop: remove op but mark note as failed to preserve offline version
          if (message.includes('API Error: 400') || message.includes('Local note not found')) {
            try {
              // Mark local note as failed so merge prefers it over server
              if (operation.entityType === 'note' || operation.entityType === 'drawing') {
                const localNote = await offlineStorage.getOfflineNoteById(operation.id);
                if (localNote) {
                  const failedNote = { ...localNote, syncStatus: 'failed' as const, lastModified: new Date().toISOString() };
                  await offlineStorage.saveOfflineNote(failedNote);
                }
              }
            } catch {}
            try { await offlineStorage.removePendingSync(operation.id); } catch {}
          }
        } finally {
          this.syncInProgress.delete(operation.id);
        }
      }

      // Update last sync timestamp
      await offlineStorage.setLastSyncTime();

      // Update sync status of all items to 'synced'
      await this.updateItemsSyncStatus();

      console.log(`Note sync completed: ${result.synced} synced, ${result.failed} failed`);
    } catch (error) {
      console.error('Note sync process failed:', error);
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
    switch (operation.entityType) {
      case 'note':
        await this.syncNoteOperation(operation);
        break;
      case 'folder':
        await this.syncFolderOperation(operation);
        break;
      case 'drawing':
        await this.syncDrawingOperation(operation);
        break;
      case 'annotation':
        await this.syncAnnotationOperation(operation);
        break;
      default:
        throw new Error(`Unknown entity type: ${operation.entityType}`);
    }
  }

  // Sync note operations
  private async syncNoteOperation(operation: PendingSync): Promise<void> {
    switch (operation.action) {
      case 'create':
        await this.syncCreateNote(operation);
        break;
      case 'update':
        await this.syncUpdateNote(operation);
        break;
      case 'delete':
        await this.syncDeleteNote(operation);
        break;
    }
  }

  // Sync folder operations
  private async syncFolderOperation(operation: PendingSync): Promise<void> {
    switch (operation.action) {
      case 'create':
        await this.syncCreateFolder(operation);
        break;
      case 'update':
        await this.syncUpdateFolder(operation);
        break;
      case 'delete':
        await this.syncDeleteFolder(operation);
        break;
    }
  }

  // Sync drawing operations
  private async syncDrawingOperation(operation: PendingSync): Promise<void> {
    const localNote = await offlineStorage.getOfflineNoteById(operation.id);
    if (!localNote) {
      throw new Error('Local note not found for drawing sync');
    }

    // Extract drawing data from note
  let drawingData: any = [];
    if (typeof localNote.drawing_data === 'string') {
      try { const parsed = JSON.parse(localNote.drawing_data); drawingData = Array.isArray(parsed) ? parsed : parsed?.strokes || []; } catch { drawingData = []; }
    } else if (Array.isArray(localNote.drawing_data)) {
      drawingData = localNote.drawing_data;
    } else if (localNote.drawing_data && typeof localNote.drawing_data === 'object') {
      drawingData = localNote.drawing_data.strokes || [];
    }

    // Update note with drawing data
    await this.makeApiRequest(
      `${API_ENDPOINTS.NOTES}${operation.id}/`,
      'PATCH',
      { drawing_strokes: drawingData }
    );
  }

  // Sync annotation operations
  private async syncAnnotationOperation(operation: PendingSync): Promise<void> {
    const localNote = await offlineStorage.getOfflineNoteById(operation.id);
    if (!localNote) {
      throw new Error('Local note not found for annotation sync');
    }

    // Update note with annotation data
    await this.makeApiRequest(
      `${API_ENDPOINTS.NOTES}${operation.id}/`,
      'PATCH',
      { document_annotations: localNote.document_annotations }
    );
  }

  // Create note on server
  private async syncCreateNote(operation: PendingSync): Promise<void> {
    const localNote = await offlineStorage.getOfflineNoteById(operation.localId || operation.id);
    if (!localNote) {
      throw new Error('Local note not found');
    }

    // Prepare payload for server
    const rawFolder = localNote.folderId ?? (localNote as any).folder;
    const isUUID = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
    const normalizedFolder = isUUID(rawFolder) ? rawFolder : null;
    const tagNames = Array.isArray(localNote.tags)
      ? localNote.tags.map((t: any) => (typeof t === 'string' ? t : t?.name)).filter(Boolean)
      : [];
    const payload = {
      title: localNote.title,
      content: localNote.content,
      formatted_content: localNote.formatted_content || '',
      folder: normalizedFolder,
      type: localNote.type || 'text',
      is_archived: localNote.is_archived || false,
      template: localNote.template || null,
  drawing_data: this.serializeDrawingData(localNote.drawing_data),
      document_annotations: localNote.document_annotations || null,
      tag_names: tagNames
    };

    // Create note on server
    const serverNote = await this.makeApiRequest<any>(API_ENDPOINTS.NOTES, 'POST', payload);

    // Update local note with server ID and mark as synced
    const updatedNote: OfflineNote = {
      ...localNote,
      id: serverNote.id,
      syncStatus: 'synced',
      lastModified: new Date().toISOString(),
    };

    await offlineStorage.saveOfflineNote(updatedNote);
  }

  // Update note on server
  private async syncUpdateNote(operation: PendingSync): Promise<void> {
    // If this looks like a local id, updating doesn't make sense before create; drop it
    if (operation.id && operation.id.startsWith && operation.id.startsWith('local_')) {
      throw new Error('Local note not found');
    }
    let localNote = await offlineStorage.getOfflineNoteById(operation.id);
    if (!localNote) {
      // Try to patch with queued data if available
      if (operation.data) {
        const rawFolder = operation.data.folderId ?? operation.data.folder;
        const isUUID = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
        const normalizedFolder = isUUID(rawFolder) ? rawFolder : null;
        const tagNames = Array.isArray(operation.data.tags)
          ? operation.data.tags.map((t: any) => (typeof t === 'string' ? t : t?.name)).filter(Boolean)
          : [];
        const payload = {
          title: operation.data.title,
          content: operation.data.content,
          formatted_content: operation.data.formatted_content || '',
          folder: normalizedFolder,
          type: operation.data.type || 'text',
          is_archived: operation.data.is_archived || false,
          template: operation.data.template || null,
          drawing_data: this.serializeDrawingData(operation.data.drawing_data),
          document_annotations: operation.data.document_annotations || null,
          tag_names: tagNames
        };
        await this.makeApiRequest<any>(
          `${API_ENDPOINTS.NOTES}${operation.id}/`,
          'PATCH',
          payload
        );
        return;
      }
      throw new Error('Local note not found');
    }

    // Prepare update payload
    const rawFolderU = localNote.folderId ?? (localNote as any).folder;
    const isUUIDU = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
    const normalizedFolderU = isUUIDU(rawFolderU) ? rawFolderU : null;
    const tagNamesU = Array.isArray(localNote.tags)
      ? localNote.tags.map((t: any) => (typeof t === 'string' ? t : t?.name)).filter(Boolean)
      : [];
    const payload = {
      title: localNote.title,
      content: localNote.content,
      formatted_content: localNote.formatted_content || '',
      folder: normalizedFolderU,
      type: localNote.type || 'text',
      is_archived: localNote.is_archived || false,
      template: localNote.template || null,
  drawing_data: this.serializeDrawingData(localNote.drawing_data),
      document_annotations: localNote.document_annotations || null,
      tag_names: tagNamesU
    };

    // Update note on server
    const serverNote = await this.makeApiRequest<any>(
      `${API_ENDPOINTS.NOTES}${localNote.id}/`,
      'PATCH',
      payload
    );

    // Update local note and mark as synced
    const updatedNote: OfflineNote = {
      ...localNote,
      ...serverNote,
      syncStatus: 'synced',
      lastModified: new Date().toISOString(),
    };

    await offlineStorage.saveOfflineNote(updatedNote);
  }

  // Delete note on server
  private async syncDeleteNote(operation: PendingSync): Promise<void> {
    // Delete note on server
    await this.makeApiRequest(`${API_ENDPOINTS.NOTES}${operation.id}/`, 'DELETE');

    // Remove from local storage
    await offlineStorage.deleteOfflineNote(operation.id);
  }

  // Create folder on server
  private async syncCreateFolder(operation: PendingSync): Promise<void> {
    const localFolder = await offlineStorage.getOfflineFolderById(operation.localId || operation.id);
    if (!localFolder) {
      throw new Error('Local folder not found');
    }

    // Prepare payload for server
    const payload = {
      name: localFolder.name,
      description: localFolder.description || '',
      color: localFolder.color || null,
    };

    // Create folder on server
    const serverFolder = await this.makeApiRequest<any>(API_ENDPOINTS.NOTE_FOLDERS, 'POST', payload);

    // Update local folder with server ID and mark as synced
    const updatedFolder: OfflineFolder = {
      ...localFolder,
      id: serverFolder.id,
      syncStatus: 'synced',
      lastModified: new Date().toISOString(),
    };

    await offlineStorage.saveOfflineFolder(updatedFolder);
  }

  // Update folder on server
  private async syncUpdateFolder(operation: PendingSync): Promise<void> {
    const localFolder = await offlineStorage.getOfflineFolderById(operation.id);
    if (!localFolder) {
      throw new Error('Local folder not found');
    }

    // Prepare update payload
    const payload = {
      name: localFolder.name,
      description: localFolder.description || '',
      color: localFolder.color || null,
    };

    // Update folder on server
    const serverFolder = await this.makeApiRequest<any>(
      `${API_ENDPOINTS.NOTE_FOLDERS}${localFolder.id}/`,
      'PATCH',
      payload
    );

    // Update local folder and mark as synced
    const updatedFolder: OfflineFolder = {
      ...localFolder,
      ...serverFolder,
      syncStatus: 'synced',
      lastModified: new Date().toISOString(),
    };

    await offlineStorage.saveOfflineFolder(updatedFolder);
  }

  // Delete folder on server
  private async syncDeleteFolder(operation: PendingSync): Promise<void> {
    // Delete folder on server
    await this.makeApiRequest(`${API_ENDPOINTS.NOTE_FOLDERS}${operation.id}/`, 'DELETE');

    // Remove from local storage
    await offlineStorage.deleteOfflineFolder(operation.id);
  }

  // Fetch latest data from server and update local cache
  private async fetchAndUpdateLocalData(): Promise<void> {
    try {
      // Fetch notes
      const serverNotes = await this.makeApiRequest<any[]>(API_ENDPOINTS.NOTES);
      const offlineNotes: OfflineNote[] = serverNotes.map(note => 
        offlineStorage.noteToOfflineNote(note, 'synced')
      );

      // Fetch folders
      const serverFolders = await this.makeApiRequest<any[]>(API_ENDPOINTS.NOTE_FOLDERS);
      const offlineFolders: OfflineFolder[] = serverFolders.map(folder => 
        offlineStorage.folderToOfflineFolder(folder, 'synced')
      );

      // Get current local data
      const localNotes = await offlineStorage.getOfflineNotes();
      const localFolders = await offlineStorage.getOfflineFolders();
      
      // Merge server data with local pending items
      const mergedNotes = this.mergeNotes(offlineNotes, localNotes);
      const mergedFolders = this.mergeFolders(offlineFolders, localFolders);
      
      // Save merged data
      await offlineStorage.saveOfflineNotes(mergedNotes);
      await offlineStorage.saveOfflineFolders(mergedFolders);
    } catch (error) {
      console.error('Error fetching data from server:', error);
      throw error;
    }
  }

  // Merge server data with local data, preserving local changes
  private mergeNotes(serverNotes: OfflineNote[], localNotes: OfflineNote[]): OfflineNote[] {
    const merged = new Map<string, OfflineNote>();

    // Add all server notes first
    serverNotes.forEach(note => {
      merged.set(note.id, note);
    });

    // Add local notes, but preserve pending/failed sync status
    localNotes.forEach(localNote => {
      if (localNote.syncStatus === 'pending' || localNote.syncStatus === 'failed') {
        // Always prefer local pending over server to avoid losing offline edits
        merged.set(localNote.id, localNote);
      } else if (localNote.localId && !localNote.id.startsWith('local_')) {
        // This is a local note that was synced, use server version
        const serverNote = merged.get(localNote.id);
        if (serverNote) {
          merged.set(localNote.id, serverNote);
        }
      } else if (localNote.id.startsWith('local_')) {
        // This is a purely local note, keep it
        merged.set(localNote.localId || localNote.id, localNote);
      }
    });

    return Array.from(merged.values());
  }

  // Merge server folders with local folders
  private mergeFolders(serverFolders: OfflineFolder[], localFolders: OfflineFolder[]): OfflineFolder[] {
    const merged = new Map<string, OfflineFolder>();

    // Add all server folders first
    serverFolders.forEach(folder => {
      merged.set(folder.id, folder);
    });

    // Add local folders, but preserve pending/failed sync status
    localFolders.forEach(localFolder => {
      if (localFolder.syncStatus === 'pending' || localFolder.syncStatus === 'failed') {
        merged.set(localFolder.id, localFolder);
      } else if (localFolder.localId && !localFolder.id.startsWith('local_')) {
        const serverFolder = merged.get(localFolder.id);
        if (serverFolder) {
          merged.set(localFolder.id, serverFolder);
        }
      } else if (localFolder.id.startsWith('local_')) {
        merged.set(localFolder.localId || localFolder.id, localFolder);
      }
    });

    return Array.from(merged.values());
  }

  // Update sync status of all synced items
  private async updateItemsSyncStatus(): Promise<void> {
    const notes = await offlineStorage.getOfflineNotes();
    const folders = await offlineStorage.getOfflineFolders();

    const updatedNotes = notes.map(note => {
      if (note.syncStatus === 'pending' && !note.id.startsWith('local_')) {
        return { ...note, syncStatus: 'synced' as const };
      }
      return note;
    });

    const updatedFolders = folders.map(folder => {
      if (folder.syncStatus === 'pending' && !folder.id.startsWith('local_')) {
        return { ...folder, syncStatus: 'synced' as const };
      }
      return folder;
    });

    await offlineStorage.saveOfflineNotes(updatedNotes);
    await offlineStorage.saveOfflineFolders(updatedFolders);
  }

  // Helper to serialize drawing data
  private serializeDrawingData(drawingData: any): string {
    if (!drawingData) return JSON.stringify([]);
    if (typeof drawingData === 'string') return drawingData;
    if (Array.isArray(drawingData)) return JSON.stringify(drawingData);
    if (typeof drawingData === 'object' && drawingData.strokes) {
      return JSON.stringify(drawingData.strokes);
    }
    return JSON.stringify(drawingData);
  }

  // Queue operation for sync when online
  async queueOperation(
    action: 'create' | 'update' | 'delete',
    entityType: 'note' | 'folder' | 'drawing' | 'annotation',
    itemId: string,
    data?: any,
    localId?: string
  ): Promise<void> {
    const operation: PendingSync = {
      id: itemId,
      localId,
      action,
      entityType,
      data,
      timestamp: new Date().toISOString(),
    };

    await offlineStorage.addPendingSync(operation);

    // Try to sync immediately if online
    if (networkService.isOnline()) {
      setTimeout(() => this.syncWithServer(), 1000); // Small delay to avoid rapid-fire syncs
    }
  }

  // Force sync (useful for manual sync triggers)
  async forceSync(): Promise<NoteSyncResult> {
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
    const pendingOps = await offlineStorage.getPendingSyncOperations();
    return pendingOps.length > 0;
  }
}

export default new NoteSyncService();