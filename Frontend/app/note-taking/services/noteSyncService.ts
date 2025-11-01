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
  private syncScheduled = false;

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
      let responseBody = '';
      try {
        const errData = await response.json();
        detail = errData?.detail || errData?.error || JSON.stringify(errData);
        responseBody = JSON.stringify(errData, null, 2);
      } catch {
        try {
          responseBody = await response.text();
          detail = responseBody;
        } catch {}
      }
      throw new Error(`API Error: ${response.status} ${response.statusText}${detail ? ` - ${detail}` : ''}`);
    }

    if (method === 'DELETE') {
      return {} as T;
    }

    return await response.json();
  }

  // Sync all pending operations with the server
  async syncWithServer(): Promise<NoteSyncResult> {
    // Prevent concurrent syncs to avoid race conditions and duplicates
    if (this.isSyncing) {
      console.log(`⚠️ Sync already in progress, skipping duplicate sync request`);
      return {
        success: false,
        synced: 0,
        failed: 0,
        errors: [{ operation: 'sync', error: 'Sync already in progress' }]
      };
    }
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
      // De-dupe queue to avoid repeated updates causing 400 loops and drawing duplication
      let pendingOps = await offlineStorage.getPendingSyncOperations();

      // IMPORTANT: If there's a pending note "create" for an ID, drop any separate "drawing" ops for the same ID
      // because the initial create payload already contains drawing data. Processing both can duplicate strokes.
      const createNoteIds = new Set(
        pendingOps
          .filter((op) => op.entityType === 'note' && op.action === 'create')
          .map((op) => op.id)
      );
      const seenKeys = new Set<string>();
      pendingOps = pendingOps.filter((op) => {
        // Filter out drawing ops that would follow a create for the same note
        if (op.entityType === 'drawing' && createNoteIds.has(op.id)) {
          return false;
        }
        // De-dupe identical (entityType,id,action) keeping the latest timestamp
        const key = `${op.entityType}:${op.id}:${op.action}`;
        if (seenKeys.has(key)) return false;
        seenKeys.add(key);
        return true;
      });

      // Process operations in a safe order to avoid race conditions
      const actionPriority = (op: PendingSync) => {
        // Creates first, then updates, then deletes
        const base = op.action === 'create' ? 0 : op.action === 'update' ? 1 : 2;
        // Within same action group, notes before drawings/annotations, folders last
        const entityOrder = op.entityType === 'note' ? 0 : op.entityType === 'drawing' ? 1 : op.entityType === 'annotation' ? 2 : 3;
        return `${base}-${entityOrder}`;
      };
      pendingOps.sort((a, b) => actionPriority(a).localeCompare(actionPriority(b)));
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
          
          // Get note title for better logging
          const noteTitle = await this.getOperationTitle(operation);
          console.log(`✅ Successfully synced: ${operation.action} ${operation.entityType} "${noteTitle}" (${operation.id})`);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          
          // Get note title for better error logging
          const noteTitle = await this.getOperationTitle(operation);
          console.error(`❌ Failed to sync: ${operation.action} ${operation.entityType} "${noteTitle}" (${operation.id}):`, error);
          
          result.failed++;
          result.errors.push({
            operation: `${operation.action} ${operation.entityType} "${noteTitle}" (${operation.id})`,
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
          // For 500 errors, preserve note locally and retry later by keeping the pending operation
          else if (message.includes('API Error: 500')) {
            try {
              // Mark local note as failed but keep pending operation for retry
              if (operation.entityType === 'note' || operation.entityType === 'drawing') {
                const localNote = await offlineStorage.getOfflineNoteById(operation.localId || operation.id);
                if (localNote) {
                  const failedNote = { ...localNote, syncStatus: 'failed' as const, lastModified: new Date().toISOString() };
                  await offlineStorage.saveOfflineNote(failedNote);
                  console.log(`📝 Note "${localNote.title}" (${localNote.id}) marked as failed, will retry sync later`);
                  console.log(`🔄 Pending operation kept for retry: ${operation.action} ${operation.entityType} ${operation.id}`);
                  
                  // Verify the note state for debugging
                  const pendingOps = await offlineStorage.getPendingSyncOperations();
                  const thisOpExists = pendingOps.some(op => op.id === operation.id && op.action === operation.action && op.entityType === operation.entityType);
                  console.log(`🔍 Pending operation exists for retry: ${thisOpExists}`);
                } else {
                  console.warn(`⚠️ Could not find local note for failed operation: ${operation.id}`);
                }
              }
            } catch (err) {
              console.error(`❌ Error handling 500 failure for operation ${operation.id}:`, err);
            }
            // Don't remove pending sync for 500 errors - let them retry
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
        // Special-case: queued touch operation to update last_accessed
        if (operation.data && (operation.data as any).specialAction === 'touch') {
          // Fire touch endpoint; ignore response body
          await this.makeApiRequest(
            `${API_ENDPOINTS.NOTE_TOUCH(operation.id)}`,
            'POST'
          );
          return;
        }
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

    // De-duplicate strokes by id to avoid server-side duplicates
    const deduped = Array.isArray(drawingData)
      ? Array.from(new Map((drawingData as any[]).map((s: any) => [s?.id ?? `${s?.timestamp}-${s?.color}-${s?.width}`, s])).values())
      : drawingData;

    // Update note with drawing data (replace semantics)
    await this.makeApiRequest(
      `${API_ENDPOINTS.NOTES}${operation.id}/`,
      'PATCH',
      { drawing_strokes: deduped }
    );
  }

  // Sync annotation operations
  private async syncAnnotationOperation(operation: PendingSync): Promise<void> {
    const localNote = await offlineStorage.getOfflineNoteById(operation.id);
    if (!localNote) {
      throw new Error('Local note not found for annotation sync');
    }

    // Update note with annotation data
    if (localNote.document_annotations !== undefined && localNote.document_annotations !== null) {
      await this.makeApiRequest(
        `${API_ENDPOINTS.NOTES}${operation.id}/`,
        'PATCH',
        { document_annotations: localNote.document_annotations }
      );
    }
  }

  // Create note on server
  private async syncCreateNote(operation: PendingSync): Promise<void> {
    const localNote = await offlineStorage.getOfflineNoteById(operation.localId || operation.id);
    if (!localNote) {
      throw new Error('Local note not found');
    }

    // SAFEGUARD: Check if this note was already synced (has non-local ID)
    // This prevents duplicate creation if there are race conditions or sync status confusion
    if (localNote.id && !localNote.id.startsWith('local_')) {
      console.warn(`⚠️ SYNC SAFEGUARD: Note "${localNote.title}" already has server ID ${localNote.id}, skipping create operation`);
      console.warn(`🛡️ This prevented a potential duplicate. Marking operation as complete.`);
      return; // Skip creation, operation will be removed from queue
    }

    // ADDITIONAL SAFEGUARD: Check if a note with this title/content already exists on server
    // This prevents creating duplicates when local/server state gets confused
    try {
      const allLocalNotes = await offlineStorage.getOfflineNotes();
      const potentialDuplicates = allLocalNotes.filter(n => 
        n.id !== localNote.id && // Different ID
        n.title === localNote.title && // Same title
        n.syncStatus === 'synced' && // Already synced
        !n.id.startsWith('local_') && // Has server ID
        n.type === localNote.type // Same type
      );
      
      if (potentialDuplicates.length > 0) {
        console.warn(`⚠️ DUPLICATE SAFEGUARD: Found ${potentialDuplicates.length} existing synced note(s) with same title "${localNote.title}"`);
        console.warn(`🛡️ Existing note IDs: ${potentialDuplicates.map(n => n.id).join(', ')}`);
        console.warn(`🛡️ Skipping creation to prevent duplicate. Will merge instead.`);
        
        // Instead of creating, merge the local drawing data into the existing note
        const existingNote = potentialDuplicates[0]; // Take the first match
        
        // If local note has drawing data but existing doesn't, update the existing one
        const localHasDrawing = localNote.drawing_data && localNote.drawing_data !== '[]' && localNote.drawing_data !== '';
        const existingHasDrawing = existingNote.drawing_data && existingNote.drawing_data !== '[]' && existingNote.drawing_data !== '';
        
        if (localHasDrawing && !existingHasDrawing) {
          console.log(`🔄 Merging drawing data from local note into existing note ${existingNote.id}`);
          try {
            const serializedStrokes = this.serializeDrawingStrokes(localNote.drawing_data);
            if (serializedStrokes.length > 0) {
              await this.makeApiRequest<any>(
                `${API_ENDPOINTS.NOTES}${existingNote.id}/`,
                'PATCH',
                { 
                  drawing_strokes: serializedStrokes,
                  type: 'drawing'
                }
              );
              console.log(`✅ Successfully merged drawing data into existing note ${existingNote.id}`);
            }
          } catch (mergeError) {
            console.error(`❌ Failed to merge drawing data:`, mergeError);
          }
        }
        
        // Clean up the local note since we're not creating a new one
        try {
          console.log(`🗑️ Cleaning up local note ${localNote.id} (merged into ${existingNote.id})`);
          await offlineStorage.deleteOfflineNote(localNote.id);
        } catch (cleanupError) {
          console.warn(`⚠️ Failed to cleanup local note:`, cleanupError);
        }
        
        return; // Skip creation
      }
    } catch (duplicateCheckError) {
      console.warn(`⚠️ Duplicate check failed, proceeding with creation:`, duplicateCheckError);
    }

    console.log(`🔄 Creating note "${localNote.title}" (${operation.id}) on server...`);

    // If this is a document with a local file, upload using FormData to DOCUMENT_UPLOAD endpoint
    const isDocument = (localNote.type || '').toLowerCase() === 'document';
    const docUri = (localNote as any).document_file || (localNote as any).document_url;
    const isRemote = typeof docUri === 'string' && (docUri.startsWith('http://') || docUri.startsWith('https://'));
    if (isDocument && docUri && !isRemote) {
      // Upload file with FormData (mirrors online import behavior)
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        throw new Error('No auth token found for document upload');
      }

      console.log(`📄 Uploading document note "${localNote.title}" with file...`);
      const formData = new FormData();
      formData.append('title', localNote.title || 'PDF Document');
      formData.append('content', localNote.content || `Imported document: ${localNote.title || 'PDF'}`);
      formData.append('type', 'document');
      // Pass annotations if any were saved offline
      if ((localNote as any).document_annotations !== undefined && (localNote as any).document_annotations !== null) {
        formData.append('document_annotations', JSON.stringify((localNote as any).document_annotations));
      }
      // Attach the actual PDF file
      const fileName = (localNote.title && localNote.title.toLowerCase().endsWith('.pdf'))
        ? localNote.title
        : `${(localNote.title || 'document').replace(/\s+/g, '_')}.pdf`;
      formData.append('document', {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        uri: docUri,
        type: 'application/pdf',
        name: fileName,
      } as any);

      const uploadResp = await fetch(joinUrl(API_URL, API_ENDPOINTS.DOCUMENT_UPLOAD), {
        method: 'POST',
        headers: {
          Authorization: `Token ${token}`,
          'X-Requested-With': 'XMLHttpRequest',
          'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || '',
          // Intentionally omit Content-Type to let fetch set multipart/form-data with boundary
        },
        body: formData,
      });

      if (!uploadResp.ok) {
        const errText = await uploadResp.text().catch(() => '');
        console.error(`❌ Document upload failed for "${localNote.title}":`, {
          status: uploadResp.status,
          statusText: uploadResp.statusText,
          response: errText,
          localNote: {
            id: localNote.id,
            title: localNote.title,
            type: localNote.type,
            docUri: docUri
          }
        });
        throw new Error(`API Error: ${uploadResp.status} ${uploadResp.statusText}${errText ? ' - ' + errText : ''}`);
      }

      const serverNote = await uploadResp.json();

      // Delete the old local note with local_ ID to avoid duplicates
      const oldLocalId = operation.localId || operation.id;
      if (oldLocalId !== serverNote.id && oldLocalId.startsWith('local_')) {
        try {
          console.log(`🗑️ Deleting old local document note: ${oldLocalId}`);
          await offlineStorage.deleteOfflineNote(oldLocalId);
        } catch (e) {
          console.warn('Failed to delete old local document note:', e);
        }
      }

      // Create/update note with server id and mark synced, preserve last_accessed
      const updatedNoteDoc: OfflineNote = {
        ...localNote,
        id: serverNote.id,
        localId: undefined, // Clear local ID since we now have server ID
        document_url: serverNote.document_url || (localNote as any).document_url,
        document_file: serverNote.document_file || serverNote.document_url || (localNote as any).document_file,
        syncStatus: 'synced',
        lastModified: new Date().toISOString(),
        last_accessed: (localNote as any).last_accessed || (localNote as any).lastAccessedAt || new Date().toISOString(),
      } as OfflineNote;
      
      await offlineStorage.saveOfflineNote(updatedNoteDoc);
      console.log(`✅ Document note synced successfully: ${oldLocalId} → ${serverNote.id}`);
      return; // Done
    }

    // Prepare payload for server (non-file upload path)
    const rawFolder = localNote.folderId ?? (localNote as any).folder;
    const isUUID = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
    const normalizedFolder = isUUID(rawFolder) ? rawFolder : null;
    
    // Validate title and content
    const title = localNote.title ? String(localNote.title).trim() : 'Untitled';
    const content = localNote.content || '';
    
    if (title.length > 200) {
      console.warn(`⚠️ Note title truncated from ${title.length} to 200 characters`);
    }
    
    const payload: any = {
      title: title.substring(0, 200), // Prevent extremely long titles
      content: content,
      formatted_content: localNote.formatted_content || '',
      folder: normalizedFolder,
      type: localNote.type || 'text',
  is_archived: localNote.is_archived || false,
  // Note: template is UI-only, don't send to server
    };
    
    // Always serialize and send drawing data if it exists, regardless of note type
    // This prevents loss of drawing data when note type gets mixed up
    const serializedStrokes = this.serializeDrawingStrokes(localNote.drawing_data);
    if (serializedStrokes.length > 0) {
      payload.drawing_strokes = serializedStrokes;
      // Ensure type is set to 'drawing' if we have strokes
      if (!payload.type || payload.type === 'text') {
        payload.type = 'drawing';
      }
    }
    
    // Validate annotations data
    if (localNote.document_annotations !== undefined && localNote.document_annotations !== null) {
      try {
        // Ensure annotations is valid JSON-serializable
        JSON.stringify(localNote.document_annotations);
        payload.document_annotations = localNote.document_annotations;
      } catch (error) {
        console.warn('⚠️ Invalid document_annotations data, skipping:', error);
      }
    }

    console.log(`📝 Creating note "${localNote.title}" with payload:`, {
      type: payload.type,
      hasDrawing: !!(payload.drawing_strokes?.length),
      strokeCount: payload.drawing_strokes?.length || 0,
      totalPoints: payload.drawing_strokes?.reduce((sum: number, stroke: any) => sum + (stroke.points?.length || 0), 0) || 0,
      hasAnnotations: !!payload.document_annotations,
      folder: payload.folder,
      localNoteType: localNote.type,
      localDrawingDataType: typeof localNote.drawing_data,
      localDrawingDataLength: Array.isArray(localNote.drawing_data) ? localNote.drawing_data.length : 'not array',
      payloadSize: JSON.stringify(payload).length + ' bytes'
    });

    // Create note on server
    let serverNote;
    try {
      serverNote = await this.makeApiRequest<any>(API_ENDPOINTS.NOTES, 'POST', payload);
    } catch (error) {
      // If creation fails and we have drawing data, try creating without drawing data first
      if (payload.drawing_strokes && payload.drawing_strokes.length > 0 && 
          error instanceof Error && error.message.includes('API Error: 500')) {
        console.warn(`⚠️ Server rejected note with drawing data, attempting fallback creation without drawing...`);
        
        const fallbackPayload = { ...payload };
        delete fallbackPayload.drawing_strokes;
        fallbackPayload.type = 'text'; // Create as text first
        
        try {
          serverNote = await this.makeApiRequest<any>(API_ENDPOINTS.NOTES, 'POST', fallbackPayload);
          console.log(`✅ Fallback creation succeeded, now updating with drawing data...`);
          
          // Now try to update with drawing data
          await this.makeApiRequest<any>(
            `${API_ENDPOINTS.NOTES}${serverNote.id}/`,
            'PATCH',
            { 
              drawing_strokes: payload.drawing_strokes,
              type: 'drawing'
            }
          );
          console.log(`✅ Successfully added drawing data to note ${serverNote.id}`);
        } catch (fallbackError) {
          console.error(`❌ Fallback creation also failed:`, fallbackError);
          throw error; // Re-throw original error
        }
      } else {
        throw error; // Re-throw for non-500 errors or notes without drawings
      }
    }

    // Delete the old local note to avoid duplicates
    const oldLocalId = operation.localId || operation.id;
    console.log(`🔍 Sync cleanup check: oldLocalId="${oldLocalId}", serverNote.id="${serverNote.id}"`);
    
    if (oldLocalId !== serverNote.id) {
      try {
        console.log(`🗑️ Deleting old local note: ${oldLocalId} (replaced by ${serverNote.id})`);
        
        // CRITICAL: Check if old note exists before trying to delete
        const oldNoteExists = await offlineStorage.getOfflineNoteById(oldLocalId);
        if (oldNoteExists) {
          console.log(`🔍 Found old note to delete: ${oldLocalId} (title: "${oldNoteExists.title}")`);
          await offlineStorage.deleteOfflineNote(oldLocalId);
          console.log(`✅ Successfully deleted old local note: ${oldLocalId}`);
        } else {
          console.log(`⚠️ Old note ${oldLocalId} not found for deletion (already cleaned up?)`);
        }
      } catch (e) {
        console.error(`❌ CRITICAL: Failed to delete old local note ${oldLocalId}:`, e);
        // This is critical - if we can't delete the old note, we might have duplicates
        // Log this prominently so it's visible in user's logs
        console.error(`🚨 DUPLICATE RISK: Note "${localNote.title}" may appear twice due to cleanup failure`);
        
        // Force manual cleanup attempt
        try {
          console.log(`🔄 Attempting force cleanup of ${oldLocalId}...`);
          const allNotes = await offlineStorage.getOfflineNotes();
          const filteredNotes = allNotes.filter(n => n.id !== oldLocalId);
          await offlineStorage.saveOfflineNotes(filteredNotes);
          console.log(`✅ Force cleanup completed for ${oldLocalId}`);
        } catch (forceError) {
          console.error(`❌ Force cleanup also failed:`, forceError);
        }
      }
    } else {
      console.log(`⚠️ oldLocalId === serverNote.id, skipping deletion (${oldLocalId})`);
    }

    // Update local note with server ID and mark as synced, preserving last_accessed
    const updatedNote: OfflineNote = {
      ...localNote,
      id: serverNote.id,
      syncStatus: 'synced',
      lastModified: new Date().toISOString(),
      // Preserve last_accessed to maintain note position in list
      last_accessed: (localNote as any).last_accessed || (localNote as any).lastAccessedAt || new Date().toISOString(),
    };

    await offlineStorage.saveOfflineNote(updatedNote);
    console.log(`✅ Note "${localNote.title}" created successfully: ${oldLocalId} → ${serverNote.id}`);
    
    // ADDITIONAL CLEANUP: Remove any other pending operations for this note to prevent duplicate syncs
    try {
      const allPendingOps = await offlineStorage.getPendingSyncOperations();
      const duplicateOps = allPendingOps.filter(op => 
        op.id === oldLocalId || // Same local ID
        op.localId === oldLocalId || // Same local ID as localId
        (op.id === serverNote.id && op.action === 'create') // Create operation with server ID (shouldn't happen but safety)
      );
      
      if (duplicateOps.length > 1) { // More than just the current operation
        console.log(`🔄 Found ${duplicateOps.length} pending operations for this note, cleaning up duplicates...`);
        for (const dupOp of duplicateOps) {
          if (dupOp.id !== operation.id || dupOp.timestamp !== operation.timestamp) { // Don't remove the current operation (will be removed by caller)
            try {
              await offlineStorage.removePendingSync(dupOp.id);
              console.log(`🗑️ Removed duplicate pending operation: ${dupOp.action} ${dupOp.entityType} ${dupOp.id}`);
            } catch (removeError) {
              console.warn(`⚠️ Failed to remove duplicate operation ${dupOp.id}:`, removeError);
            }
          }
        }
      }
    } catch (cleanupError) {
      console.warn(`⚠️ Failed to cleanup duplicate pending operations:`, cleanupError);
    }
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
        console.log(`🔄 Updating note (${operation.id}) using queued data...`);
        const rawFolder = operation.data.folderId ?? operation.data.folder;
        const isUUID = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
        const normalizedFolder = isUUID(rawFolder) ? rawFolder : null;
        
        // Validate title
        const titleQ = operation.data.title ? String(operation.data.title).trim() : 'Untitled';
        
        const payload: any = {
          title: titleQ.substring(0, 200),
          content: operation.data.content || '',
          formatted_content: operation.data.formatted_content || '',
          folder: normalizedFolder,
          type: operation.data.type || 'text',
          is_archived: operation.data.is_archived || false,
          // Note: template is UI-only, don't send to server
        };
        
        // Always serialize and send drawing data if it exists, regardless of note type
        const serializedStrokesQ = this.serializeDrawingStrokes(operation.data.drawing_data);
        if (serializedStrokesQ.length > 0) {
          payload.drawing_strokes = serializedStrokesQ;
          // Ensure type is set to 'drawing' if we have strokes
          if (!payload.type || payload.type === 'text') {
            payload.type = 'drawing';
          }
        }
        
        // Validate annotations data
        if (operation.data.document_annotations !== undefined && operation.data.document_annotations !== null) {
          try {
            JSON.stringify(operation.data.document_annotations);
            payload.document_annotations = operation.data.document_annotations;
          } catch (error) {
            console.warn('⚠️ Invalid document_annotations data in queued operation, skipping:', error);
          }
        }
        
        console.log(`📝 Updating note "${operation.data.title || operation.id}" with queued payload:`, {
          type: payload.type,
          hasDrawing: !!(payload.drawing_strokes?.length),
          strokeCount: payload.drawing_strokes?.length || 0,
          hasAnnotations: !!payload.document_annotations,
          folder: payload.folder,
          tags: payload.tag_names,
          queuedDataType: operation.data.type,
          queuedDrawingDataType: typeof operation.data.drawing_data
        });
        
        await this.makeApiRequest<any>(
          `${API_ENDPOINTS.NOTES}${operation.id}/`,
          'PATCH',
          payload
        );
        return;
      }
      throw new Error('Local note not found');
    }

    console.log(`🔄 Updating note "${localNote.title}" (${operation.id}) on server...`);

    // Prepare update payload
    const rawFolderU = localNote.folderId ?? (localNote as any).folder;
    const isUUIDU = (v: any) => typeof v === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(v);
    const normalizedFolderU = isUUIDU(rawFolderU) ? rawFolderU : null;
    
    // Validate title and content
    const titleU = localNote.title ? String(localNote.title).trim() : 'Untitled';
    const contentU = localNote.content || '';
    
    if (titleU.length > 200) {
      console.warn(`⚠️ Note title truncated from ${titleU.length} to 200 characters`);
    }
    
    const payload: any = {
      title: titleU.substring(0, 200),
      content: contentU,
      formatted_content: localNote.formatted_content || '',
      folder: normalizedFolderU,
      type: localNote.type || 'text',
  is_archived: localNote.is_archived || false,
  // Note: template is UI-only, don't send to server
    };
    
    // Always serialize and send drawing data if it exists, regardless of note type
    const serializedStrokesU = this.serializeDrawingStrokes(localNote.drawing_data);
    if (serializedStrokesU.length > 0) {
      payload.drawing_strokes = serializedStrokesU;
      // Ensure type is set to 'drawing' if we have strokes
      if (!payload.type || payload.type === 'text') {
        payload.type = 'drawing';
      }
    }
    
    // Validate annotations data
    if (localNote.document_annotations !== undefined && localNote.document_annotations !== null) {
      try {
        JSON.stringify(localNote.document_annotations);
        payload.document_annotations = localNote.document_annotations;
      } catch (error) {
        console.warn('⚠️ Invalid document_annotations data, skipping:', error);
      }
    }

    console.log(`📝 Updating note "${localNote.title}" with payload:`, {
      type: payload.type,
      hasDrawing: !!(payload.drawing_strokes?.length),
      strokeCount: payload.drawing_strokes?.length || 0,
      hasAnnotations: !!payload.document_annotations,
      folder: payload.folder,
      tags: payload.tag_names,
      localNoteType: localNote.type,
      localDrawingDataType: typeof localNote.drawing_data
    });

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
    console.log(`✅ Note "${localNote.title}" updated successfully`);
  }

  // Delete note on server
  private async syncDeleteNote(operation: PendingSync): Promise<void> {
    // If the ID is not a UUID (e.g., local_*, note_*), skip server delete
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(operation.id);
    if (isUuid) {
      // Delete note on server
      await this.makeApiRequest(`${API_ENDPOINTS.NOTES}${operation.id}/`, 'DELETE');
    } else {
      console.log(`Skipping server delete for non-UUID note id: ${operation.id}`);
    }

    // Remove from local storage regardless
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

  // Update sync status of all synced items - but preserve 'failed' status and check for pending operations
  private async updateItemsSyncStatus(): Promise<void> {
    const notes = await offlineStorage.getOfflineNotes();
    const folders = await offlineStorage.getOfflineFolders();
    const pendingOps = await offlineStorage.getPendingSyncOperations();

    // Create a set of entity IDs that still have pending operations
    const pendingEntityIds = new Set(pendingOps.map(op => op.localId || op.id));

    const updatedNotes = notes.map(note => {
      // Only mark as 'synced' if:
      // 1. It was 'pending' status
      // 2. Doesn't have a local ID (already has server ID)
      // 3. No pending sync operations for this note
      // 4. Don't override 'failed' status - preserve it for retry logic
      if (note.syncStatus === 'pending' && !note.id.startsWith('local_') && !pendingEntityIds.has(note.id)) {
        return { ...note, syncStatus: 'synced' as const };
      }
      return note;
    });

    const updatedFolders = folders.map(folder => {
      // Same logic for folders
      if (folder.syncStatus === 'pending' && !folder.id.startsWith('local_') && !pendingEntityIds.has(folder.id)) {
        return { ...folder, syncStatus: 'synced' as const };
      }
      return folder;
    });

    await offlineStorage.saveOfflineNotes(updatedNotes);
    await offlineStorage.saveOfflineFolders(updatedFolders);
  }

  // Helper to serialize drawing data
  private serializeDrawingStrokes(drawingData: any): any[] {
    if (!drawingData) return [];
    
    try {
      if (Array.isArray(drawingData)) {
        // Validate and potentially simplify array elements
        const validated = drawingData.filter(stroke => {
          if (!stroke || typeof stroke !== 'object') return false;
          if (!stroke.id || !stroke.points || !Array.isArray(stroke.points)) return false;
          // Ensure points array has even number of elements (x,y pairs)
          if (stroke.points.length % 2 !== 0) {
            console.warn(`⚠️ Stroke ${stroke.id} has odd number of points, skipping`);
            return false;
          }
          // Validate essential stroke properties
          if (typeof stroke.color !== 'string' || typeof stroke.width !== 'number') {
            console.warn(`⚠️ Stroke ${stroke.id} missing color/width, skipping`);
            return false;
          }
          return true;
        }).map(stroke => {
          // Simplify strokes with too many points to prevent server overload
          const maxPoints = 1000; // 500 coordinate pairs max
          if (stroke.points.length > maxPoints) {
            console.warn(`⚠️ Stroke ${stroke.id} has ${stroke.points.length} points, simplifying to ${maxPoints}`);
            // Keep every nth point to reduce size while preserving general shape
            const step = Math.ceil(stroke.points.length / maxPoints);
            const simplifiedPoints = [];
            for (let i = 0; i < stroke.points.length; i += step * 2) { // step * 2 to maintain x,y pairs
              simplifiedPoints.push(stroke.points[i], stroke.points[i + 1]);
            }
            // Always include the last point to preserve stroke ending
            if (simplifiedPoints.length < stroke.points.length) {
              const lastX = stroke.points[stroke.points.length - 2];
              const lastY = stroke.points[stroke.points.length - 1];
              if (simplifiedPoints[simplifiedPoints.length - 2] !== lastX || simplifiedPoints[simplifiedPoints.length - 1] !== lastY) {
                simplifiedPoints.push(lastX, lastY);
              }
            }
            return { ...stroke, points: simplifiedPoints };
          }
          return stroke;
        });
        console.log(`📊 Serialized ${validated.length}/${drawingData.length} valid strokes:`, 
          validated.map(s => `${s.id}: ${s.points.length/2} points`).join(', '));
        return validated;
      }
      
      if (typeof drawingData === 'string') {
        try { 
          const parsed = JSON.parse(drawingData); 
          if (Array.isArray(parsed)) {
            return this.serializeDrawingStrokes(parsed); // Recursive validation
          }
          if (parsed?.strokes && Array.isArray(parsed.strokes)) {
            return this.serializeDrawingStrokes(parsed.strokes); // Recursive validation
          }
          return [];
        } catch { 
          console.warn('Failed to parse drawing data string:', drawingData);
          return []; 
        }
      }
      
      if (typeof drawingData === 'object' && Array.isArray(drawingData.strokes)) {
        return this.serializeDrawingStrokes(drawingData.strokes); // Recursive validation
      }
      
      console.warn('Unexpected drawing data format:', typeof drawingData, drawingData);
      return [];
    } catch (error) {
      console.error('Error serializing drawing strokes:', error);
      return [];
    }
  }

  // Helper method to get operation title for better logging
  private async getOperationTitle(operation: PendingSync): Promise<string> {
    try {
      if (operation.entityType === 'note' || operation.entityType === 'drawing' || operation.entityType === 'annotation') {
        const localNote = await offlineStorage.getOfflineNoteById(operation.localId || operation.id);
        if (localNote?.title) {
          return localNote.title;
        }
        
        // If no local note found, try to extract from operation data
        if (operation.data?.title) {
          return operation.data.title;
        }
      } else if (operation.entityType === 'folder') {
        const localFolder = await offlineStorage.getOfflineFolderById(operation.localId || operation.id);
        if (localFolder?.name) {
          return localFolder.name;
        }
        
        // If no local folder found, try to extract from operation data
        if (operation.data?.name) {
          return operation.data.name;
        }
      }
    } catch (error) {
      console.warn('Failed to get operation title:', error);
    }
    
    // Fallback to operation ID
    return operation.localId || operation.id || 'Unknown';
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

    // Schedule a one-shot sync if online (no loops or multiple triggers)
    if (networkService.isOnline() && !this.syncScheduled) {
      this.syncScheduled = true;
      setTimeout(async () => {
        try {
          await this.syncWithServer();
        } finally {
          this.syncScheduled = false;
        }
      }, 500);
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