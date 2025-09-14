import { API_URL, API_ENDPOINTS } from '@/constants/ApiConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import offlineStorage, { OfflineNote, OfflineFolder } from './offlineStorage';
import noteSyncService from './noteSyncService';
import networkService from '../../task-management/services/networkService';
import { DrawingData, DrawingStroke } from './drawingAPI';

export interface NoteFormData {
  title: string;
  content?: string;
  formatted_content?: string;
  folder?: string;
  folderId?: string;
  type?: "text" | "image" | "drawing" | "document";
  tags?: (string | { id: number; name: string })[];
  is_archived?: boolean;
  template?: string;
  document_file?: string;
  document_annotations?: any;
  drawing_data?: string | DrawingStroke[] | { strokes?: DrawingStroke[] };
}

export interface FolderFormData {
  name: string;
  description?: string;
  color?: string;
}

class OfflineNotesService {
  private async getAuthHeaders(): Promise<HeadersInit> {
    try {
      const token = await AsyncStorage.getItem('authToken');
      return {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        ...(token && { 'Authorization': `Bearer ${token}` }),
      };
    } catch (error) {
      console.error('Failed to get auth headers:', error);
      return {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
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

    const response = await fetch(`${API_URL}${endpoint}`, options);

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    if (method === 'DELETE') {
      return {} as T;
    }

    return await response.json();
  }

  // Convert OfflineNote to regular Note for UI compatibility
  private offlineNoteToNote(offlineNote: OfflineNote): any {
    return {
      id: offlineNote.id,
      title: offlineNote.title,
      content: offlineNote.content,
      formatted_content: offlineNote.formatted_content,
      folder: offlineNote.folder,
      folderId: offlineNote.folderId,
      createdAt: new Date(offlineNote.createdAt),
      updatedAt: new Date(offlineNote.updatedAt),
      type: offlineNote.type,
      tags: offlineNote.tags,
      linkedTaskId: offlineNote.linkedTaskId,
      attachments: offlineNote.attachments,
      is_archived: offlineNote.is_archived,
      template: offlineNote.template,
      document_file: offlineNote.document_file,
      document_url: offlineNote.document_url,
      document_annotations: offlineNote.document_annotations,
      drawing_data: offlineNote.drawing_data,
      has_drawing: offlineNote.has_drawing,
      user: offlineNote.user,
    };
  }

  // Convert OfflineFolder to regular Folder for UI compatibility
  private offlineFolderToFolder(offlineFolder: OfflineFolder): any {
    return {
      id: offlineFolder.id,
      name: offlineFolder.name,
      description: offlineFolder.description,
      color: offlineFolder.color,
      user: offlineFolder.user,
      created_at: offlineFolder.created_at,
      updated_at: offlineFolder.updated_at,
    };
  }

  // ====== NOTES OPERATIONS ======

  async getAllNotes(): Promise<any[]> {
    try {
      if (networkService.isOnline()) {
        // Try to fetch from server first
        try {
          const response = await this.makeApiRequest<any[]>(API_ENDPOINTS.NOTES);
          
          // Update local storage with server data
          const offlineNotes: OfflineNote[] = response.map(note => 
            offlineStorage.noteToOfflineNote(note, 'synced')
          );
          
          // Merge with local pending notes
          const localNotes = await offlineStorage.getOfflineNotes();
          const pendingNotes = localNotes.filter(n => n.syncStatus === 'pending' || n.syncStatus === 'failed');
          
          // Combine server notes with pending local notes
          const allOfflineNotes = [...offlineNotes, ...pendingNotes];
          await offlineStorage.saveOfflineNotes(allOfflineNotes);
          
          // Trigger sync for any pending operations
          noteSyncService.syncWithServer().catch(console.error);
          
          return allOfflineNotes.map(n => this.offlineNoteToNote(n));
        } catch (error) {
          console.warn("Failed to fetch notes from server, falling back to offline storage:", error);
          // Fall through to offline mode
        }
      }

      // Offline mode or server fetch failed
      console.log("Using offline storage for getAllNotes");
      const offlineNotes = await offlineStorage.getOfflineNotes();
      return offlineNotes.map(note => this.offlineNoteToNote(note));
    } catch (error) {
      console.error("Error fetching notes:", error);
      return [];
    }
  }

  async getNoteById(id: string): Promise<any | undefined> {
    try {
      if (networkService.isOnline()) {
        try {
          const response = await this.makeApiRequest<any>(`${API_ENDPOINTS.NOTES}${id}/`);
          
          // Update local storage
          const offlineNote = offlineStorage.noteToOfflineNote(response, 'synced');
          await offlineStorage.saveOfflineNote(offlineNote);
          
          return response;
        } catch (error) {
          console.warn(`Failed to fetch note ${id} from server, checking offline storage:`, error);
        }
      }

      // Check offline storage
      const offlineNote = await offlineStorage.getOfflineNoteById(id);
      return offlineNote ? this.offlineNoteToNote(offlineNote) : undefined;
    } catch (error) {
      console.error(`Error fetching note with id ${id}:`, error);
      return undefined;
    }
  }

  async createNote(noteData: NoteFormData): Promise<any> {
    try {
      const username = (await AsyncStorage.getItem("username")) || "default_user";
      
      if (networkService.isOnline()) {
        try {
          // Try to create on server first
          const payload = {
            title: noteData.title,
            content: noteData.content || "",
            formatted_content: noteData.formatted_content || "",
            folder: noteData.folderId || noteData.folder || null,
            type: noteData.type || "text",
            is_archived: noteData.is_archived || false,
            template: noteData.template || null,
            drawing_data: this.serializeDrawingData(noteData.drawing_data),
            document_annotations: noteData.document_annotations || null,
            tags: noteData.tags || []
          };

          console.log("Creating note on server:", payload);
          const serverNote = await this.makeApiRequest<any>(API_ENDPOINTS.NOTES, "POST", payload);
          
          // Save to local storage as synced
          const offlineNote = offlineStorage.noteToOfflineNote(serverNote, 'synced');
          await offlineStorage.saveOfflineNote(offlineNote);
          
          return serverNote;
        } catch (error) {
          console.warn("Failed to create note on server, creating offline:", error);
          // Fall through to offline creation
        }
      }

      // Create note offline
      console.log("Creating note offline");
      const localId = offlineStorage.generateLocalId();
      const now = new Date().toISOString();
      
      const offlineNote: OfflineNote = {
        id: localId,
        localId: localId,
        title: noteData.title,
        content: noteData.content || "",
        formatted_content: noteData.formatted_content || "",
        folder: noteData.folder,
        folderId: noteData.folderId,
        createdAt: now,
        updatedAt: now,
        type: noteData.type || "text",
        tags: noteData.tags || [],
        is_archived: noteData.is_archived || false,
        template: noteData.template,
        document_annotations: noteData.document_annotations,
        drawing_data: noteData.drawing_data,
        has_drawing: !!noteData.drawing_data,
        syncStatus: 'pending',
        lastModified: now,
        user: username
      };
      
      await offlineStorage.saveOfflineNote(offlineNote);
      
      // Queue for sync when online
      await noteSyncService.queueOperation('create', 'note', localId, noteData, localId);
      
      return this.offlineNoteToNote(offlineNote);
    } catch (error) {
      console.error("Error in createNote:", error);
      throw error;
    }
  }

  async updateNote(id: string, updates: Partial<NoteFormData>): Promise<any> {
    try {
      // Get current note (from offline storage first to ensure we have it)
      let currentNote = await offlineStorage.getOfflineNoteById(id);
      
      if (!currentNote) {
        // If not in offline storage, try to fetch from server
        if (networkService.isOnline()) {
          try {
            const serverNote = await this.makeApiRequest<any>(`${API_ENDPOINTS.NOTES}${id}/`);
            currentNote = offlineStorage.noteToOfflineNote(serverNote, 'synced');
          } catch (error) {
            throw new Error(`Note with id ${id} not found`);
          }
        } else {
          throw new Error(`Note with id ${id} not found in offline storage`);
        }
      }

      // Apply updates to the note
      const updatedNote: OfflineNote = {
        ...currentNote,
        ...updates,
        updatedAt: new Date().toISOString(),
        syncStatus: 'pending',
        lastModified: new Date().toISOString(),
      };

      // Save to offline storage
      await offlineStorage.saveOfflineNote(updatedNote);

      if (networkService.isOnline()) {
        try {
          // Transform data for API
          const payload = {
            title: updatedNote.title,
            content: updatedNote.content,
            formatted_content: updatedNote.formatted_content || "",
            folder: updatedNote.folderId || updatedNote.folder || null,
            type: updatedNote.type || "text",
            is_archived: updatedNote.is_archived || false,
            template: updatedNote.template || null,
            drawing_data: this.serializeDrawingData(updatedNote.drawing_data),
            document_annotations: updatedNote.document_annotations || null,
            tags: updatedNote.tags || []
          };

          console.log("Updating note on server:", payload);
          const serverNote = await this.makeApiRequest<any>(
            `${API_ENDPOINTS.NOTES}${id}/`,
            "PATCH",
            payload
          );
          
          // Update offline storage with server response
          const syncedNote = offlineStorage.noteToOfflineNote(serverNote, 'synced');
          await offlineStorage.saveOfflineNote(syncedNote);
          
          return serverNote;
        } catch (error) {
          console.warn("Failed to update note on server, saved offline for sync:", error);
          // Queue for sync when online
          await noteSyncService.queueOperation('update', 'note', id, updates);
        }
      } else {
        // Queue for sync when online
        await noteSyncService.queueOperation('update', 'note', id, updates);
      }

      return this.offlineNoteToNote(updatedNote);
    } catch (error) {
      console.error("Error in updateNote:", error);
      throw error;
    }
  }

  async deleteNote(id: string): Promise<void> {
    try {
      // Remove from offline storage first
      await offlineStorage.deleteOfflineNote(id);
      
      if (networkService.isOnline()) {
        try {
          // Try to delete from server
          await this.makeApiRequest(`${API_ENDPOINTS.NOTES}${id}/`, "DELETE");
          console.log(`Note ${id} deleted from server`);
        } catch (error) {
          console.warn("Failed to delete note from server, queuing for sync:", error);
          // Queue for sync when online
          await noteSyncService.queueOperation('delete', 'note', id);
        }
      } else {
        // Queue for sync when online
        await noteSyncService.queueOperation('delete', 'note', id);
      }
    } catch (error) {
      console.error("Error in deleteNote:", error);
      throw error;
    }
  }

  // ====== FOLDERS OPERATIONS ======

  async getAllFolders(): Promise<any[]> {
    try {
      if (networkService.isOnline()) {
        try {
          const response = await this.makeApiRequest<any[]>(API_ENDPOINTS.NOTE_FOLDERS);
          
          // Update local storage with server data
          const offlineFolders: OfflineFolder[] = response.map(folder => 
            offlineStorage.folderToOfflineFolder(folder, 'synced')
          );
          
          // Merge with local pending folders
          const localFolders = await offlineStorage.getOfflineFolders();
          const pendingFolders = localFolders.filter(f => f.syncStatus === 'pending' || f.syncStatus === 'failed');
          
          // Combine server folders with pending local folders
          const allOfflineFolders = [...offlineFolders, ...pendingFolders];
          await offlineStorage.saveOfflineFolders(allOfflineFolders);
          
          return allOfflineFolders.map(f => this.offlineFolderToFolder(f));
        } catch (error) {
          console.warn("Failed to fetch folders from server, falling back to offline storage:", error);
        }
      }

      // Offline mode or server fetch failed
      const offlineFolders = await offlineStorage.getOfflineFolders();
      return offlineFolders.map(folder => this.offlineFolderToFolder(folder));
    } catch (error) {
      console.error("Error fetching folders:", error);
      return [];
    }
  }

  async createFolder(folderData: FolderFormData): Promise<any> {
    try {
      const username = (await AsyncStorage.getItem("username")) || "default_user";
      
      if (networkService.isOnline()) {
        try {
          const payload = {
            name: folderData.name,
            description: folderData.description || "",
            color: folderData.color || null,
          };

          const serverFolder = await this.makeApiRequest<any>(API_ENDPOINTS.NOTE_FOLDERS, "POST", payload);
          
          // Save to local storage as synced
          const offlineFolder = offlineStorage.folderToOfflineFolder(serverFolder, 'synced');
          await offlineStorage.saveOfflineFolder(offlineFolder);
          
          return serverFolder;
        } catch (error) {
          console.warn("Failed to create folder on server, creating offline:", error);
        }
      }

      // Create folder offline
      const localId = offlineStorage.generateLocalId();
      const now = new Date().toISOString();
      
      const offlineFolder: OfflineFolder = {
        id: localId,
        localId: localId,
        name: folderData.name,
        description: folderData.description || "",
        color: folderData.color,
        user: username,
        created_at: now,
        updated_at: now,
        syncStatus: 'pending',
        lastModified: now
      };
      
      await offlineStorage.saveOfflineFolder(offlineFolder);
      
      // Queue for sync when online
      await noteSyncService.queueOperation('create', 'folder', localId, folderData, localId);
      
      return this.offlineFolderToFolder(offlineFolder);
    } catch (error) {
      console.error("Error in createFolder:", error);
      throw error;
    }
  }

  async updateFolder(id: string, updates: Partial<FolderFormData>): Promise<any> {
    try {
      let currentFolder = await offlineStorage.getOfflineFolderById(id);
      
      if (!currentFolder) {
        if (networkService.isOnline()) {
          try {
            const serverFolder = await this.makeApiRequest<any>(`${API_ENDPOINTS.NOTE_FOLDERS}${id}/`);
            currentFolder = offlineStorage.folderToOfflineFolder(serverFolder, 'synced');
          } catch (error) {
            throw new Error(`Folder with id ${id} not found`);
          }
        } else {
          throw new Error(`Folder with id ${id} not found in offline storage`);
        }
      }

      const updatedFolder: OfflineFolder = {
        ...currentFolder,
        ...updates,
        updated_at: new Date().toISOString(),
        syncStatus: 'pending',
        lastModified: new Date().toISOString(),
      };

      await offlineStorage.saveOfflineFolder(updatedFolder);

      if (networkService.isOnline()) {
        try {
          const payload = {
            name: updatedFolder.name,
            description: updatedFolder.description || "",
            color: updatedFolder.color || null,
          };

          const serverFolder = await this.makeApiRequest<any>(
            `${API_ENDPOINTS.NOTE_FOLDERS}${id}/`,
            "PATCH",
            payload
          );
          
          const syncedFolder = offlineStorage.folderToOfflineFolder(serverFolder, 'synced');
          await offlineStorage.saveOfflineFolder(syncedFolder);
          
          return serverFolder;
        } catch (error) {
          console.warn("Failed to update folder on server, saved offline for sync:", error);
          await noteSyncService.queueOperation('update', 'folder', id, updates);
        }
      } else {
        await noteSyncService.queueOperation('update', 'folder', id, updates);
      }

      return this.offlineFolderToFolder(updatedFolder);
    } catch (error) {
      console.error("Error in updateFolder:", error);
      throw error;
    }
  }

  async deleteFolder(id: string): Promise<void> {
    try {
      await offlineStorage.deleteOfflineFolder(id);
      
      if (networkService.isOnline()) {
        try {
          await this.makeApiRequest(`${API_ENDPOINTS.NOTE_FOLDERS}${id}/`, "DELETE");
          console.log(`Folder ${id} deleted from server`);
        } catch (error) {
          console.warn("Failed to delete folder from server, queuing for sync:", error);
          await noteSyncService.queueOperation('delete', 'folder', id);
        }
      } else {
        await noteSyncService.queueOperation('delete', 'folder', id);
      }
    } catch (error) {
      console.error("Error in deleteFolder:", error);
      throw error;
    }
  }

  // ====== DRAWING OPERATIONS ======

  async saveDrawing(noteId: string, strokes: DrawingStroke[]): Promise<any> {
    try {
      const drawingData: DrawingData = {
        strokes,
        noteId,
        hasDrawing: strokes.length > 0,
        lastUpdate: new Date().toISOString()
      };

      // Save drawing data to offline storage
      await offlineStorage.saveOfflineDrawing(noteId, drawingData);

      // Update note with drawing data
      const note = await offlineStorage.getOfflineNoteById(noteId);
      if (note) {
        const updatedNote: OfflineNote = {
          ...note,
          drawing_data: JSON.stringify(strokes),
          has_drawing: strokes.length > 0,
          type: strokes.length > 0 ? 'drawing' : note.type,
          syncStatus: 'pending',
          lastModified: new Date().toISOString(),
        };
        await offlineStorage.saveOfflineNote(updatedNote);
      }

      if (networkService.isOnline()) {
        try {
          // Try to save to server
          const payload = { drawing_data: JSON.stringify(strokes) };
          const result = await this.makeApiRequest<any>(
            `${API_ENDPOINTS.NOTES}${noteId}/`,
            'PATCH',
            payload
          );

          // Mark as synced
          if (note) {
            const syncedNote = { ...note, syncStatus: 'synced' as const };
            await offlineStorage.saveOfflineNote(syncedNote);
          }

          return {
            message: "Drawing saved successfully",
            note_id: noteId,
            stroke_count: strokes.length,
            last_update: result.updated_at || new Date().toISOString()
          };
        } catch (error) {
          console.warn("Failed to save drawing to server, queued for sync:", error);
          // Queue for sync when online
          await noteSyncService.queueOperation('update', 'drawing', noteId);
        }
      } else {
        // Queue for sync when online
        await noteSyncService.queueOperation('update', 'drawing', noteId);
      }

      return {
        message: "Drawing saved offline",
        note_id: noteId,
        stroke_count: strokes.length,
        last_update: new Date().toISOString()
      };
    } catch (error) {
      console.error("Error saving drawing:", error);
      throw error;
    }
  }

  async getDrawing(noteId: string): Promise<DrawingData> {
    try {
      if (networkService.isOnline()) {
        try {
          // Try to get from server first
          const note = await this.makeApiRequest<any>(`${API_ENDPOINTS.NOTES}${noteId}/`);
          
          let strokes: DrawingStroke[] = [];
          if (note.drawing_data) {
            try {
              if (typeof note.drawing_data === 'string') {
                strokes = JSON.parse(note.drawing_data);
              } else if (Array.isArray(note.drawing_data)) {
                strokes = note.drawing_data;
              }
            } catch (parseError) {
              console.error('Failed to parse drawing_data:', parseError);
            }
          }

          const drawingData: DrawingData = {
            strokes,
            noteId: note.id || noteId,
            hasDrawing: strokes.length > 0,
            lastUpdate: note.updated_at || note.last_update,
          };

          // Cache the drawing data
          await offlineStorage.saveOfflineDrawing(noteId, drawingData);

          return drawingData;
        } catch (error) {
          console.warn("Failed to get drawing from server, checking offline storage:", error);
        }
      }

      // Check offline storage
      const cachedDrawing = await offlineStorage.getOfflineDrawing(noteId);
      if (cachedDrawing) {
        return cachedDrawing;
      }

      // Return empty drawing data if not found
      return {
        strokes: [],
        noteId,
        hasDrawing: false,
        lastUpdate: new Date().toISOString()
      };
    } catch (error) {
      console.error("Error getting drawing:", error);
      throw error;
    }
  }

  async clearDrawing(noteId: string): Promise<any> {
    try {
      // Clear from offline storage
      await offlineStorage.deleteOfflineDrawing(noteId);

      // Update note
      const note = await offlineStorage.getOfflineNoteById(noteId);
      if (note) {
        const updatedNote: OfflineNote = {
          ...note,
          drawing_data: '',
          has_drawing: false,
          syncStatus: 'pending',
          lastModified: new Date().toISOString(),
        };
        await offlineStorage.saveOfflineNote(updatedNote);
      }

      if (networkService.isOnline()) {
        try {
          const result = await this.makeApiRequest<any>(
            `${API_ENDPOINTS.NOTES}${noteId}/`,
            'PATCH',
            { drawing_data: JSON.stringify([]) }
          );

          if (note) {
            const syncedNote = { ...note, syncStatus: 'synced' as const };
            await offlineStorage.saveOfflineNote(syncedNote);
          }

          return result;
        } catch (error) {
          console.warn("Failed to clear drawing on server, queued for sync:", error);
          await noteSyncService.queueOperation('update', 'drawing', noteId);
        }
      } else {
        await noteSyncService.queueOperation('update', 'drawing', noteId);
      }

      return { message: "Drawing cleared" };
    } catch (error) {
      console.error("Error clearing drawing:", error);
      throw error;
    }
  }

  // ====== UTILITY METHODS ======

  // Helper to serialize drawing data
  private serializeDrawingData(drawingData: any): string {
    if (!drawingData) return '';
    if (typeof drawingData === 'string') return drawingData;
    if (Array.isArray(drawingData)) return JSON.stringify(drawingData);
    if (typeof drawingData === 'object' && drawingData.strokes) {
      return JSON.stringify(drawingData.strokes);
    }
    return JSON.stringify(drawingData);
  }

  // Force sync with server
  async syncWithServer(): Promise<void> {
    if (!networkService.isOnline()) {
      throw new Error("Cannot sync while offline");
    }
    
    const result = await noteSyncService.syncWithServer();
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
    return await noteSyncService.hasPendingOperations();
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
    return noteSyncService.getSyncStatus();
  }
}

export default new OfflineNotesService();