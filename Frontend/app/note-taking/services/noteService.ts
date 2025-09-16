import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, API_ENDPOINTS } from '@/constants/ApiConfig';
import { networkService } from './networkService';

export interface Note {
  id: string;
  title: string;
  content: string;
  formatted_content?: string;
  tags?: string[];
  folderId?: string | null;
  createdAt?: string;
  updatedAt?: string;
  version?: number;
  last_modified_by?: string;
}

export interface SaveStatus {
  status: 'saved' | 'saving' | 'offline' | 'conflict' | 'error';
  message?: string;
  lastSaved?: Date;
}

class NoteService {
  private saveInProgress = new Set<string>();
  private noteVersions = new Map<string, number>();

  /**
   * Google Docs-style save that handles new notes and updates intelligently
   */
  async saveNote(note: Note, isAutoSave = true): Promise<{ note: Note; status: SaveStatus }> {
    const noteKey = note.id;

    // Prevent duplicate saves for the same note
    if (this.saveInProgress.has(noteKey)) {
      return {
        note,
        status: { status: 'saving', message: 'Save already in progress' }
      };
    }

    try {
      this.saveInProgress.add(noteKey);

      // First, save to local storage immediately (optimistic update)
      await this.saveToLocalStorage(note);

      // Check network connectivity using real network service
      const networkStatus = networkService.getCurrentStatus();
      const isOnline = networkStatus.isConnected && 
                      networkStatus.isInternetReachable && 
                      networkStatus.isServerReachable;
      
      if (!isOnline) {
        return {
          note,
          status: { 
            status: 'offline', 
            message: 'Saved locally. Will sync when online.',
            lastSaved: new Date()
          }
        };
      }

      // Attempt to sync to cloud
      const result = await this.syncToCloud(note, isAutoSave);
      
      if (result.conflict) {
        return {
          note,
          status: {
            status: 'conflict',
            message: 'Note was modified elsewhere. Please refresh and try again.'
          }
        };
      }

      // Update local storage with server response
      if (result.savedNote) {
        await this.saveToLocalStorage(result.savedNote);
        this.noteVersions.set(result.savedNote.id, result.savedNote.version || 1);
      }

      return {
        note: result.savedNote || note,
        status: {
          status: 'saved',
          message: !isAutoSave ? 'Note saved successfully' : undefined,
          lastSaved: new Date()
        }
      };

    } catch (error) {
      console.error('Save error:', error);
      return {
        note,
        status: {
          status: 'error',
          message: 'Failed to save note. Please try again.'
        }
      };
    } finally {
      this.saveInProgress.delete(noteKey);
    }
  }

  /**
   * Determines if note should be created or updated
   */
  private shouldCreateNewNote(note: Note): boolean {
    // If note ID starts with 'note_' it's a local temporary ID
    if (note.id.startsWith('note_')) {
      return true;
    }

    // If note ID is a UUID but we don't have it in our version tracking, 
    // it might be a new note that was just created
    return !this.noteVersions.has(note.id);
  }

  /**
   * Sync note to cloud backend
   */
  private async syncToCloud(note: Note, isAutoSave: boolean): Promise<{
    savedNote?: Note;
    conflict?: boolean;
  }> {
    const token = await AsyncStorage.getItem('authToken');
    if (!token) {
      throw new Error('No auth token found');
    }

    const isNewNote = this.shouldCreateNewNote(note);
    const currentVersion = this.noteVersions.get(note.id);

    const requestBody: any = {
      title: note.title,
      content: note.content,
      formatted_content: note.formatted_content,
      tag_names: note.tags || [],
      folder: note.folderId,
      is_auto_save: isAutoSave, // Pass auto-save flag to backend
    };

    // Include version for conflict detection on updates
    if (!isNewNote && currentVersion) {
      requestBody.version = currentVersion;
    }

    const url = isNewNote
      ? `${API_URL}${API_ENDPOINTS.NOTES}`
      : `${API_URL}${API_ENDPOINTS.NOTES}${note.id}/`;

    const method = isNewNote ? 'POST' : 'PUT';

    const response = await fetch(url, {
      method,
      headers: {
        Authorization: `Token ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (response.status === 409) {
      // Version conflict
      return { conflict: true };
    }

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const savedNote = await response.json();

    // Handle the case where backend returns existing note instead of creating duplicate
    if (response.status === 200 && isNewNote && savedNote.message) {
      // Backend found existing note and returned it
      return { savedNote };
    }

    return { savedNote };
  }

  /**
   * Save note to local storage
   */
  private async saveToLocalStorage(note: Note): Promise<void> {
    try {
      const noteData = {
        ...note,
        lastSavedLocally: new Date().toISOString(),
      };
      await AsyncStorage.setItem(`note-${note.id}`, JSON.stringify(noteData));
    } catch (error) {
      console.error('Failed to save to local storage:', error);
      throw error;
    }
  }

  /**
   * Load note from local storage
   */
  async loadFromLocalStorage(noteId: string): Promise<Note | null> {
    try {
      const noteData = await AsyncStorage.getItem(`note-${noteId}`);
      if (noteData) {
        const note = JSON.parse(noteData);
        // Track version if available
        if (note.version) {
          this.noteVersions.set(note.id, note.version);
        }
        return note;
      }
      return null;
    } catch (error) {
      console.error('Failed to load from local storage:', error);
      return null;
    }
  }

  /**
   * Get current network connectivity status
   */
  isOnline(): boolean {
    const status = networkService.getCurrentStatus();
    return status.isConnected && status.isInternetReachable && status.isServerReachable;
  }

  /**
   * Force check server connectivity
   */
  async checkServerConnectivity(): Promise<boolean> {
    return await networkService.forceServerCheck();
  }

  /**
   * Generate a new temporary note ID
   */
  generateNoteId(): string {
    return `note_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Update note version tracking
   */
  updateNoteVersion(noteId: string, version: number): void {
    this.noteVersions.set(noteId, version);
  }

  /**
   * Check if note has unsaved changes
   */
  hasUnsavedChanges(note: Note): boolean {
    // Simple check - could be enhanced with more sophisticated comparison
    return true; // For now, always consider it might have changes
  }

  /**
   * Clean up old local notes (optional maintenance function)
   */
  async cleanupOldLocalNotes(daysOld = 30): Promise<void> {
    try {
      const allKeys = await AsyncStorage.getAllKeys();
      const noteKeys = allKeys.filter(key => key.startsWith('note-'));
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      for (const key of noteKeys) {
        try {
          const noteData = await AsyncStorage.getItem(key);
          if (noteData) {
            const note = JSON.parse(noteData);
            const lastSaved = new Date(note.lastSavedLocally || note.updatedAt || note.createdAt);
            
            if (lastSaved < cutoffDate) {
              await AsyncStorage.removeItem(key);
            }
          }
        } catch (error) {
          // If we can't parse the note, remove it
          await AsyncStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.error('Failed to cleanup old notes:', error);
    }
  }
}

export const noteService = new NoteService();