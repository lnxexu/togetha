import AsyncStorage from '@react-native-async-storage/async-storage';
import { DrawingStroke, DrawingData, PDFAnnotationData } from './drawingAPI';

export interface OfflineSyncQueueItem {
  id: string;
  action: 'create' | 'update' | 'delete';
  entityType: 'note' | 'folder' | 'audio' | 'drawing' | 'annotation';
  data: any;
  timestamp: number;
  localId?: string; // For items created offline
}

export interface OfflineNote {
  id: string;
  localId?: string;
  title: string;
  content: string;
  formatted_content?: string;
  folder?: string;
  folderId?: string;
  createdAt: string;
  updatedAt: string;
  // When the note was last accessed/opened by the user (ISO string)
  last_accessed?: string;
  type: "text" | "image" | "drawing" | "document";
  tags?: (string | { id: number; name: string })[];
  linkedTaskId?: string;
  attachments?: any[];
  is_archived?: boolean;
  template?: string;
  document_file?: string;
  document_url?: string;
  document_annotations?: any;
  drawing_data?: string | DrawingStroke[] | { strokes?: DrawingStroke[] };
  has_drawing?: boolean;
  syncStatus: 'synced' | 'pending' | 'failed';
  lastModified: string;
  user?: string;
}

export interface OfflineFolder {
  id: string;
  localId?: string;
  name: string;
  description?: string;
  color?: string;
  user: string;
  created_at: string;
  updated_at: string;
  syncStatus: 'synced' | 'pending' | 'failed';
  lastModified: string;
}

export interface PendingSync {
  id: string;
  localId?: string;
  action: 'create' | 'update' | 'delete';
  entityType: 'note' | 'folder' | 'audio' | 'drawing' | 'annotation';
  data?: any;
  timestamp: string;
}

class OfflineStorage {
  private SYNC_QUEUE_KEY = 'notes_sync_queue';
  private NOTES_CACHE_KEY = 'offline_notes';
  private FOLDERS_CACHE_KEY = 'offline_folders';
  private DRAWINGS_CACHE_KEY = 'offline_drawings';
  private ANNOTATIONS_CACHE_KEY = 'offline_annotations';
  private PENDING_SYNC_KEY = 'notes_pending_sync';
  private LAST_SYNC_KEY = 'notes_last_sync_time';

  // ====== NOTES MANAGEMENT ======

  // Get all offline notes
  async getOfflineNotes(): Promise<OfflineNote[]> {
    try {
      const notesJson = await AsyncStorage.getItem(this.NOTES_CACHE_KEY);
      if (!notesJson) return [];
      
      const notes = JSON.parse(notesJson) as OfflineNote[];
      return notes.map(note => ({
        ...note,
        createdAt: note.createdAt,
        updatedAt: note.updatedAt,
      }));
    } catch (error) {
      console.error('Error getting offline notes:', error);
      return [];
    }
  }

  // Save notes to offline storage
  async saveOfflineNotes(notes: OfflineNote[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.NOTES_CACHE_KEY, JSON.stringify(notes));
    } catch (error) {
      console.error('Error saving offline notes:', error);
      throw error;
    }
  }

  // Get a single offline note by ID
  async getOfflineNoteById(id: string): Promise<OfflineNote | undefined> {
    const notes = await this.getOfflineNotes();
    return notes.find(note => note.id === id || note.localId === id);
  }

  // Add or update a note in offline storage
  async saveOfflineNote(note: OfflineNote): Promise<void> {
    try {
      const notes = await this.getOfflineNotes();
      
      // Use consistent key matching: prefer real server ID over local/temp IDs
      const getNoteKey = (n: OfflineNote) => {
        const id = (n.id || '').toString();
        const localId = (n.localId || '').toString();
        if (id && !id.startsWith('local_') && !id.startsWith('note_')) return id;
        return localId || id;
      };
      
      const noteKey = getNoteKey(note);
      const existingIndex = notes.findIndex(n => getNoteKey(n) === noteKey);
      
      if (existingIndex >= 0) {
        notes[existingIndex] = note;
      } else {
        notes.push(note);
      }
      
      await this.saveOfflineNotes(notes);
    } catch (error) {
      console.error('Error saving offline note:', error);
      throw error;
    }
  }

  // Delete a note from offline storage
  async deleteOfflineNote(id: string): Promise<void> {
    try {
      const notes = await this.getOfflineNotes();
      const filteredNotes = notes.filter(note => note.id !== id && note.localId !== id);
      await this.saveOfflineNotes(filteredNotes);
    } catch (error) {
      console.error('Error deleting offline note:', error);
      throw error;
    }
  }

  // ====== FOLDERS MANAGEMENT ======

  // Get all offline folders
  async getOfflineFolders(): Promise<OfflineFolder[]> {
    try {
      const foldersJson = await AsyncStorage.getItem(this.FOLDERS_CACHE_KEY);
      return foldersJson ? JSON.parse(foldersJson) : [];
    } catch (error) {
      console.error('Error getting offline folders:', error);
      return [];
    }
  }

  // Save folders to offline storage
  async saveOfflineFolders(folders: OfflineFolder[]): Promise<void> {
    try {
      await AsyncStorage.setItem(this.FOLDERS_CACHE_KEY, JSON.stringify(folders));
    } catch (error) {
      console.error('Error saving offline folders:', error);
      throw error;
    }
  }

  // Get a single offline folder by ID
  async getOfflineFolderById(id: string): Promise<OfflineFolder | undefined> {
    const folders = await this.getOfflineFolders();
    return folders.find(folder => folder.id === id || folder.localId === id);
  }

  // Add or update a folder in offline storage
  async saveOfflineFolder(folder: OfflineFolder): Promise<void> {
    try {
      const folders = await this.getOfflineFolders();
      const existingIndex = folders.findIndex(f => f.id === folder.id || f.localId === folder.localId);
      
      if (existingIndex >= 0) {
        folders[existingIndex] = folder;
      } else {
        folders.push(folder);
      }
      
      await this.saveOfflineFolders(folders);
    } catch (error) {
      console.error('Error saving offline folder:', error);
      throw error;
    }
  }

  // Delete a folder from offline storage
  async deleteOfflineFolder(id: string): Promise<void> {
    try {
      const folders = await this.getOfflineFolders();
      const filteredFolders = folders.filter(folder => folder.id !== id && folder.localId !== id);
      await this.saveOfflineFolders(filteredFolders);
    } catch (error) {
      console.error('Error deleting offline folder:', error);
      throw error;
    }
  }

  // ====== DRAWINGS MANAGEMENT ======

  // Save drawing data for a note
  async saveOfflineDrawing(noteId: string, drawingData: DrawingData): Promise<void> {
    try {
      const drawings = await this.getOfflineDrawings();
      const existing = drawings[noteId];
      const incomingHas = Array.isArray(drawingData?.strokes) && drawingData.strokes.length > 0;
      const existingHas = Array.isArray(existing?.strokes) && existing.strokes.length > 0;
      // Guard: do not overwrite a non-empty cached drawing with an empty one (server might be stale)
      if (!incomingHas && existingHas) {
        return; // keep existing cache
      }
      drawings[noteId] = {
        ...drawingData,
        lastUpdate: new Date().toISOString()
      };
      await AsyncStorage.setItem(this.DRAWINGS_CACHE_KEY, JSON.stringify(drawings));
    } catch (error) {
      console.error('Error saving offline drawing:', error);
      throw error;
    }
  }

  // Get drawing data for a note
  async getOfflineDrawing(noteId: string): Promise<DrawingData | null> {
    try {
      const drawings = await this.getOfflineDrawings();
      return drawings[noteId] || null;
    } catch (error) {
      console.error('Error getting offline drawing:', error);
      return null;
    }
  }

  // Get all offline drawings
  async getOfflineDrawings(): Promise<Record<string, DrawingData>> {
    try {
      const drawingsJson = await AsyncStorage.getItem(this.DRAWINGS_CACHE_KEY);
      return drawingsJson ? JSON.parse(drawingsJson) : {};
    } catch (error) {
      console.error('Error getting offline drawings:', error);
      return {};
    }
  }

  // Delete drawing data for a note
  async deleteOfflineDrawing(noteId: string): Promise<void> {
    try {
      const drawings = await this.getOfflineDrawings();
      delete drawings[noteId];
      await AsyncStorage.setItem(this.DRAWINGS_CACHE_KEY, JSON.stringify(drawings));
    } catch (error) {
      console.error('Error deleting offline drawing:', error);
      throw error;
    }
  }

  // ====== ANNOTATIONS MANAGEMENT ======

  // Save PDF annotation data
  async saveOfflineAnnotations(documentId: string, annotationData: PDFAnnotationData): Promise<void> {
    try {
      const annotations = await this.getOfflineAnnotations();
      annotations[documentId] = {
        ...annotationData,
        lastUpdate: new Date().toISOString()
      };
      await AsyncStorage.setItem(this.ANNOTATIONS_CACHE_KEY, JSON.stringify(annotations));
    } catch (error) {
      console.error('Error saving offline annotations:', error);
      throw error;
    }
  }

  // Get PDF annotation data
  async getOfflineAnnotations(): Promise<Record<string, PDFAnnotationData>> {
    try {
      const annotationsJson = await AsyncStorage.getItem(this.ANNOTATIONS_CACHE_KEY);
      return annotationsJson ? JSON.parse(annotationsJson) : {};
    } catch (error) {
      console.error('Error getting offline annotations:', error);
      return {};
    }
  }

  // Get annotation data for a specific document
  async getOfflineAnnotation(documentId: string): Promise<PDFAnnotationData | null> {
    try {
      const annotations = await this.getOfflineAnnotations();
      return annotations[documentId] || null;
    } catch (error) {
      console.error('Error getting offline annotation:', error);
      return null;
    }
  }

  // Delete annotation data for a document
  async deleteOfflineAnnotation(documentId: string): Promise<void> {
    try {
      const annotations = await this.getOfflineAnnotations();
      delete annotations[documentId];
      await AsyncStorage.setItem(this.ANNOTATIONS_CACHE_KEY, JSON.stringify(annotations));
    } catch (error) {
      console.error('Error deleting offline annotation:', error);
      throw error;
    }
  }

  // ====== SYNC QUEUE MANAGEMENT ======

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

  // ====== PENDING SYNC OPERATIONS ======

  // Add pending sync operation
  async addPendingSync(operation: PendingSync): Promise<void> {
    try {
      const pendingOps = await this.getPendingSyncOperations();
      const key = `${operation.entityType}:${operation.id}`;
      const newOps = pendingOps.filter(op => `${op.entityType}:${op.id}` !== key || op.action === 'create' || operation.action === 'delete');
      // If existing op is create and new is update, keep create; if new is delete, replace
      const existingIdx = newOps.findIndex(op => `${op.entityType}:${op.id}` === key);
      if (existingIdx >= 0) {
        const existing = newOps[existingIdx];
        if (existing.action === 'create' && operation.action !== 'delete') {
          // keep create; nothing to do
        } else if (operation.action === 'delete') {
          newOps[existingIdx] = operation;
        } else {
          newOps[existingIdx] = operation;
        }
      } else {
        newOps.push(operation);
      }
      await AsyncStorage.setItem(this.PENDING_SYNC_KEY, JSON.stringify(newOps));
    } catch (error) {
      console.error('Error adding pending sync operation:', error);
    }
  }

  // Get all pending sync operations
  async getPendingSyncOperations(): Promise<PendingSync[]> {
    try {
      const opsJson = await AsyncStorage.getItem(this.PENDING_SYNC_KEY);
      const ops: PendingSync[] = opsJson ? JSON.parse(opsJson) : [];
      // Compact: keep only the latest op per (entityType,id); if a create exists, drop later updates; coalesce multiple updates to last one
      const byKey = new Map<string, PendingSync>();
      for (const op of ops) {
        const key = `${op.entityType}:${op.id}`;
        const existing = byKey.get(key);
        if (!existing) {
          byKey.set(key, op);
          continue;
        }
        // If existing is create, keep it (updates will be represented by the data at create time)
        if (existing.action === 'create') {
          continue;
        }
        // If new op is delete, it overrides previous ones
        if (op.action === 'delete') {
          byKey.set(key, op);
          continue;
        }
        // Otherwise both are updates: keep the newer one
        const existingTs = Date.parse(existing.timestamp) || 0;
        const newTs = Date.parse(op.timestamp) || 0;
        byKey.set(key, newTs >= existingTs ? op : existing);
      }
      return Array.from(byKey.values());
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

  // ====== UTILITY METHODS ======

  // Generate a local ID for new items created offline
  generateLocalId(): string {
    return `local_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  // Record the last successful sync time
  async setLastSyncTime(): Promise<void> {
    await AsyncStorage.setItem(this.LAST_SYNC_KEY, new Date().toISOString());
  }

  // Get the last sync time
  async getLastSyncTime(): Promise<Date | null> {
    const timeStr = await AsyncStorage.getItem(this.LAST_SYNC_KEY);
    return timeStr ? new Date(timeStr) : null;
  }

  // Clear all offline data (for testing or reset)
  async clearAllOfflineData(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        this.NOTES_CACHE_KEY,
        this.FOLDERS_CACHE_KEY,
        this.DRAWINGS_CACHE_KEY,
        this.ANNOTATIONS_CACHE_KEY,
        this.SYNC_QUEUE_KEY,
        this.PENDING_SYNC_KEY,
        this.LAST_SYNC_KEY
      ]);
    } catch (error) {
      console.error('Error clearing offline data:', error);
    }
  }

  // Convert regular objects to offline objects
  noteToOfflineNote(note: any, syncStatus: 'synced' | 'pending' | 'failed' = 'synced'): OfflineNote {
    // Normalize drawing data: some APIs return `drawing_strokes` instead of `drawing_data`
    const hasNonEmpty = (val: any): boolean => {
      if (!val) return false;
      try {
        if (typeof val === 'string') { const p = JSON.parse(val); return Array.isArray(p) ? p.length>0 : Array.isArray(p?.strokes) ? p.strokes.length>0 : !!p; }
        if (Array.isArray(val)) return val.length>0;
        if (typeof val === 'object') { if (Array.isArray((val as any).strokes)) return (val as any).strokes.length>0; return Object.keys(val).length>0; }
      } catch {}
      return false;
    };
    const srcA = note.drawing_data;
    const srcB = (note as any).drawing_strokes;
    // Prefer the non-empty source; if both non-empty, prefer drawing_data; if both empty, keep drawing_data (could be '')
    const normalizedDrawing = hasNonEmpty(srcA) ? srcA : (hasNonEmpty(srcB) ? srcB : srcA ?? srcB);
    const normalized: OfflineNote = {
      ...note,
      drawing_data: normalizedDrawing !== undefined ? normalizedDrawing : note.drawing_data,
      has_drawing: hasNonEmpty(normalizedDrawing) || note.has_drawing || false,
      syncStatus,
      lastModified: new Date().toISOString(),
      // Preserve last_accessed from server if present
      last_accessed: (note as any).last_accessed || (note as any).lastAccessedAt || (note as any).last_accessed_at || undefined,
    };
    return normalized;
  }

  folderToOfflineFolder(folder: any, syncStatus: 'synced' | 'pending' | 'failed' = 'synced'): OfflineFolder {
    return {
      ...folder,
      syncStatus,
      lastModified: new Date().toISOString(),
    };
  }

  // Legacy methods for backward compatibility
  async cacheNotes(notes: any[]): Promise<void> {
    const offlineNotes = notes.map(note => this.noteToOfflineNote(note, 'synced'));
    await this.saveOfflineNotes(offlineNotes);
  }

  async getCachedNotes(): Promise<any[]> {
    return await this.getOfflineNotes();
  }

  async cacheFolders(folders: any[]): Promise<void> {
    const offlineFolders = folders.map(folder => this.folderToOfflineFolder(folder, 'synced'));
    await this.saveOfflineFolders(offlineFolders);
  }

  async getCachedFolders(): Promise<any[]> {
    return await this.getOfflineFolders();
  }
}

export default new OfflineStorage();
