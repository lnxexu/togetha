# Note-Taking Offline Functionality

This document explains how to use the comprehensive offline functionality implemented for the note-taking system. The offline features enable users to create, edit, delete, and manage notes, folders, drawings, and annotations even when disconnected from the internet.

## Overview

The offline functionality consists of three main services:

1. **OfflineStorage** (`offlineStorage.ts`) - Handles local data persistence
2. **NoteSyncService** (`noteSyncService.ts`) - Manages synchronization with the server  
3. **OfflineNotesService** (`offlineNotesService.ts`) - Provides unified online/offline operations

## Key Features

### ✅ Complete Offline Support
- **Notes**: Create, read, update, delete notes offline
- **Folders**: Organize notes in folders with full CRUD operations
- **Drawings**: Save and load hand-drawn content with offline storage
- **PDF Annotations**: Annotate documents and store annotations locally
- **Document Management**: Handle document uploads and downloads

### ✅ Intelligent Sync
- Automatic sync when network becomes available
- Conflict resolution for concurrent edits
- Queued operations for reliable data synchronization
- Merge strategies for local and server data

### ✅ Seamless Experience  
- Transparent online/offline operation switching
- Visual offline indicators and sync status
- Optimistic UI updates for immediate feedback
- Error handling with graceful fallbacks

## Getting Started

### 1. Import the Services

```typescript
import offlineNotesService from '../services/offlineNotesService';
import networkService from '../../task-management/services/networkService';
import { OfflineIndicator } from '../components/OfflineIndicator';
```

### 2. Basic Note Operations

```typescript
// Create a new note (works online/offline)
const newNote = await offlineNotesService.createNote({
  title: 'My Note',
  content: 'Note content here',
  folder_id: null,
  is_favorite: false,
});

// Get all notes (returns cached data when offline)
const notes = await offlineNotesService.getNotes();

// Update a note
const updatedNote = await offlineNotesService.updateNote(noteId, {
  title: 'Updated Title',
  content: 'Updated content',
});

// Delete a note
await offlineNotesService.deleteNote(noteId);
```

### 3. Folder Management

```typescript
// Create a folder
const folder = await offlineNotesService.createFolder({
  name: 'Project Notes',
  description: 'Notes for my project',
  color: '#FF6B6B',
});

// Get all folders
const folders = await offlineNotesService.getFolders();

// Update folder
const updatedFolder = await offlineNotesService.updateFolder(folderId, {
  name: 'Updated Folder Name',
});
```

### 4. Drawing Operations

```typescript
// Save drawing data
await offlineNotesService.saveDrawing(noteId, drawingData);

// Load drawing data
const drawingData = await offlineNotesService.getDrawing(noteId);

// Delete drawing
await offlineNotesService.deleteDrawing(noteId);
```

### 5. Network Status Monitoring

```typescript
// Check if online
const isOnline = networkService.isOnline();

// Listen for network changes
const unsubscribe = networkService.addNetworkStatusListener((status) => {
  console.log('Network status:', status.isConnected);
});

// Force sync when back online
if (isOnline) {
  await offlineNotesService.syncWithServer();
}
```

## UI Components

### Offline Indicator

Add the `OfflineIndicator` component to your UI to show connection status and sync information:

```typescript
import { OfflineIndicator } from '../components/OfflineIndicator';

// In your component render method
<View style={styles.header}>
  <Text style={styles.title}>Notes</Text>
  <OfflineIndicator showSyncStatus={true} />
</View>
```

The indicator automatically shows:
- **Offline status** when disconnected
- **Pending operations count** when changes are waiting to sync
- **Auto-updating** as network status changes

### Offline Warnings

Show users when they're working offline:

```typescript
{!isOnline && (
  <View style={styles.offlineWarning}>
    <Ionicons name="information-circle-outline" size={16} color="#FF6B6B" />
    <Text style={styles.offlineText}>
      Working offline. Changes will sync when connected.
    </Text>
  </View>
)}
```

## Best Practices

### 1. Error Handling

Always wrap offline operations in try-catch blocks:

```typescript
try {
  const note = await offlineNotesService.createNote(noteData);
  // Update UI optimistically
  setNotes(prevNotes => [note, ...prevNotes]);
  
  if (networkService.isOnline()) {
    showSuccessToast('Note created and synced');
  } else {
    showWarningToast('Note saved locally. Will sync when online.');
  }
} catch (error) {
  console.error('Failed to create note:', error);
  showErrorToast('Failed to create note. Please try again.');
}
```

### 2. Optimistic Updates

Update your UI immediately for better user experience:

```typescript
const handleDeleteNote = async (noteId: string) => {
  // Remove from UI immediately
  setNotes(prevNotes => prevNotes.filter(note => note.id !== noteId));
  
  try {
    await offlineNotesService.deleteNote(noteId);
  } catch (error) {
    // Revert UI change on error
    setNotes(prevNotes => [...prevNotes, deletedNote]);
    showErrorToast('Failed to delete note');
  }
};
```

### 3. Refresh Control

Implement pull-to-refresh for manual sync:

```typescript
const onRefresh = useCallback(async () => {
  setRefreshing(true);
  try {
    if (networkService.isOnline()) {
      await offlineNotesService.syncWithServer();
    }
    await loadNotes();
  } finally {
    setRefreshing(false);
  }
}, []);
```

### 4. Focus Effect Loading

Reload data when screen gains focus to ensure latest offline changes:

```typescript
import { useFocusEffect } from '@react-navigation/native';

useFocusEffect(
  useCallback(() => {
    loadNotes();
    loadFolders();
  }, [])
);
```

## Architecture Details

### Data Flow

1. **Online Mode**: 
   - Operations hit server directly
   - Successful responses cached locally
   - Failed operations queued for retry

2. **Offline Mode**:
   - All operations stored locally
   - Operations queued for sync
   - UI updated immediately

3. **Sync Process**:
   - Automatic sync when network available
   - Manual sync via pull-to-refresh
   - Conflict resolution for concurrent edits

### Storage Strategy

- **AsyncStorage**: Local persistence for all note data
- **Queue Management**: Pending operations stored and processed in order
- **Cache Invalidation**: Smart cache updates on successful syncs
- **Data Integrity**: Validation and error recovery for corrupted data

### Conflict Resolution

When conflicts occur during sync:

1. **Local wins**: For user-generated content (notes, drawings)
2. **Server wins**: For metadata (timestamps, IDs)
3. **Merge strategy**: For compatible changes
4. **Manual resolution**: For complex conflicts (future enhancement)

## Testing Offline Functionality

### Simulating Offline Mode

```typescript
// Force offline mode for testing
networkService.setOfflineMode(true);

// Test operations
await offlineNotesService.createNote(testData);

// Check pending operations
const pendingOps = await offlineStorage.getPendingSyncOperations();
console.log(`${pendingOps.length} operations pending`);

// Restore online mode
networkService.setOfflineMode(false);

// Trigger sync
await offlineNotesService.syncWithServer();
```

### Monitoring Sync Status

```typescript
// Check sync progress
const syncStatus = await offlineNotesService.getSyncStatus();
console.log('Sync in progress:', syncStatus.isSyncing);

// Get pending operations count
const pendingCount = (await offlineStorage.getPendingSyncOperations()).length;
console.log(`${pendingCount} operations waiting to sync`);
```

## Migration Guide

### From Existing Online-Only Components

1. **Replace direct API calls** with `offlineNotesService` methods
2. **Add network status monitoring** to your components
3. **Include offline indicators** in your UI
4. **Implement optimistic updates** for better UX
5. **Add error handling** for offline scenarios

### Example Migration

**Before (online-only):**
```typescript
const createNote = async (noteData) => {
  const response = await fetch(`${API_URL}/notes/`, {
    method: 'POST',
    body: JSON.stringify(noteData),
  });
  return response.json();
};
```

**After (offline-capable):**
```typescript
const createNote = async (noteData) => {
  return await offlineNotesService.createNote(noteData);
};
```

## Troubleshooting

### Common Issues

1. **Sync not triggering**: Check network listener registration
2. **Data not persisting**: Verify AsyncStorage permissions  
3. **Conflicts on sync**: Review conflict resolution strategy
4. **UI not updating**: Ensure proper state management

### Debug Information

```typescript
// Check offline storage status
const offlineNotes = await offlineStorage.getOfflineNotes();
const offlineFolders = await offlineStorage.getOfflineFolders();
const pendingOps = await offlineStorage.getPendingSyncOperations();

console.log('Debug info:', {
  offlineNotes: offlineNotes.length,
  offlineFolders: offlineFolders.length,
  pendingOps: pendingOps.length,
  isOnline: networkService.isOnline(),
});
```

## Future Enhancements

- **Enhanced conflict resolution** with user choice dialogs
- **Background sync** using background tasks
- **Offline search** with local indexing
- **Data compression** for large drawings/documents
- **Sync progress indicators** with detailed status
- **Selective sync** for bandwidth optimization

## Support

For questions or issues with the offline functionality:

1. Check the console logs for error details
2. Verify network connectivity and API endpoints
3. Test with simplified operations to isolate issues
4. Review the example components for implementation patterns

The offline note-taking system is designed to provide a seamless experience regardless of connectivity, ensuring users can always access and modify their notes, drawings, and documents.