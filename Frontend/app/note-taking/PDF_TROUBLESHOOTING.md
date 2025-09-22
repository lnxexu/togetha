## PDF annotation implementation — how it works

This document explains how the PDF annotation feature in the note-taking flow was implemented, how data flows between UI, local storage and backend, what files and keys are used, and common troubleshooting steps.

### Files involved

- `ImportPDFPage.tsx` — main UI for importing, listing and opening PDF documents. This file manages the document lifecycle and orchestrates annotation loading/saving.
- `components/PDFAnnotationViewer.tsx` — (referenced) the viewer component that renders the PDF, exposes annotation events and props such as `onAnnotationChange` and `annotations`. It receives `source`, `fileName`, `onClose`, `autoSave`, and `enableDirectSave` props.
- `components/UnsavedChangesModal` — modal used to prevent navigation when there are unsaved annotations.
- Utility functions and constants: `pdfUtils` helpers (e.g. `getLocalPDFPath`, `isRemoteURL`) and any API constants such as `API_URL` and `API_ENDPOINTS` referenced by the page.

### Data shapes and local storage keys

PDF document (stored in AsyncStorage under key `pdf_documents`): array of objects with shape:

```
{
   id: string,            // local generated id (Date.now().toString())
   name: string,          // original filename
   uri: string,           // local file URI (in FileSystem.documentDirectory/pdf_documents/)
   size: number,
   mimeType: string,
   lastModified: number,
   annotationCount: number,
   noteId?: string,       // optional backend note ID if synced
   annotations?: any[]    // optional cached annotations
}
```

Annotations (per-document) are stored under key `pdf_annotations_<docId>` as a JSON object:

```
{
   annotations: Array<any>,
   lastModified: string (ISO timestamp)
}
```

Notes about the annotation format: the viewer component (`PDFAnnotationViewer`) is responsible for the exact annotation shape. The page treats annotations as an opaque array and persists/syncs them as-is.

### Import and file handling

- Document import uses `expo-document-picker` to choose a PDF. The selected file is copied into the app's document directory (under `FileSystem.documentDirectory + 'pdf_documents/'`) to ensure a stable local URI.
- Filenames are prefixed with a timestamp to avoid collisions. The resulting `uri` is saved in the document record.
- When opening a document, the app checks `FileSystem.getInfoAsync(document.uri)` to ensure the file still exists and shows a helpful alert if it's missing (offering to remove it from the list).

### Loading annotations

- When a document is opened, `ImportPDFPage` calls `loadAnnotations(docId)`:
   - First attempts to read `AsyncStorage.getItem('pdf_annotations_<docId>')` and returns that if present.
   - If not found and the app is online, it attempts to fetch from the backend by using the document's `noteId` (if available) and the configured `API_URL`/`API_ENDPOINTS.NOTES` endpoint.
   - If backend returns `document_annotations`, those are saved locally for offline use and returned to the viewer.

### Saving annotations

- The app uses a debounced save strategy in `handleAnnotationChange`:
   - Every annotation change sets a 2 second timeout (clearing the previous one) before calling `saveAnnotationsToBackend`.
   - This reduces API calls during active editing.

- `saveAnnotationsToBackend(docId, annotations)` does:
   1. If offline, call `saveAnnotationsLocally(docId, annotations)` and set save status to `offline`.
   2. If online, set save status to `saving`, get `authToken` from AsyncStorage and construct a payload (note metadata + `document_annotations`).
   3. If the document already has a `noteId`, use PUT to update that note; otherwise POST to create a new note.
   4. On success, update the local document's `noteId` (if newly created), persist annotations locally as backup, and set status to `saved`.
   5. On failure, fall back to local save and set status to `error`.

### Local save implementation

- `saveAnnotationsLocally` writes the JSON under `pdf_annotations_<docId>` and also updates the `annotationCount` and `annotations` fields in the `pdf_documents` array and persists that array under `pdf_documents`.

### Offline / Sync behavior

- When offline, annotations are always saved locally with saveStatus `offline` and a message indicating they'll be synced.
- On reconnection, the current code path triggers saves only when user edits or explicitly saves via the modal flow; there's no automatic background sync implemented yet. Consider adding a connectivity listener to attempt syncing outstanding local annotation backups when network returns.

### Navigation protection and unsaved changes

- The page attaches a `beforeRemove` listener to the navigation stack. If there are unsaved annotations (tracked via `hasUnsavedAnnotations`), it prevents navigation and shows `UnsavedChangesModal` with options:
   - Save and exit: cancels the pending timeout, attempts save and navigates back on success.
   - Discard and exit: clears unsaved state, cancels pending timeout and navigates back.
   - Continue editing: dismisses the modal and stays on the page.

### Save status UI

- The top header shows an icon and text representing the save state. `saveStatus` can be `saved | saving | offline | error` and there are helpers to determine icon name, color and human-friendly text. When offline the UI forces an offline icon and color.

### Error handling and fallbacks

- File copy/import errors and missing file errors are surfaced via Alerts and console logs.
- Backend save errors fall back to a local save and set `saveStatus` to `error` while informing the user via a toast.
- The app logs errors to console for debugging and keeps a local backup of annotations to avoid data loss.

### Troubleshooting

- I see "Failed to import PDF" alerts:
   - Check that the Document Picker returned a valid `uri` and that `FileSystem.copyAsync` succeeded. On some Android devices the initial `uri` may be content-uri that needs special handling.

- Annotations not visible after opening:
   - Ensure `pdf_annotations_<docId>` exists in AsyncStorage (inspect with a storage inspector or add debug logs).
   - If the doc had been synced to backend, ensure `noteId` exists on the document and that the backend returns `document_annotations` in the note payload.

- Save fails with HTTP errors:
   - Verify `authToken` exists in AsyncStorage and is valid.
   - Confirm `API_URL` and `API_ENDPOINTS.NOTES` are configured correctly. Check server logs for 4xx/5xx responses.

- Offline syncing issues:
   - Currently the app saves local backups when offline. If you need automatic sync on reconnect, add a connectivity listener in the page (or higher-level app state) that scans all `pdf_documents` for local annotation backups and replays `saveAnnotationsToBackend`.

### Suggested improvements / next steps

- Add automatic background sync on reconnect to flush local annotation backups to the server.
- Implement conflict resolution: if local annotations differ from server annotations, present a merge UI or choose a last-write-wins strategy.
- Encrypt local annotation backups if they can contain sensitive content.
- Add unit / integration tests for the save/load functions and for navigation protection behavior.

### Quick reference of keys and files

- AsyncStorage keys:
   - `pdf_documents` — array of imported documents
   - `pdf_annotations_<docId>` — per-document annotation backup
   - `authToken` — user's token for API calls

- Local FS directory: `FileSystem.documentDirectory + 'pdf_documents/'`

If you want, I can also add a small diagram or a unit test file that exercises `saveAnnotationsLocally`/`loadAnnotations` paths.

# PDF Annotation Viewer - Troubleshooting Guide

## Common Issues and Solutions

### 1. HTTP 404 - PDF Not Found

**Error Message:** "Failed to download PDF: Remote resource not available. HTTP 404"

**Causes:**
- The PDF file doesn't exist on the server
- Incorrect URL generation from backend
- Network routing issues

**Solutions:**
1. **Check if file exists on server:**
   ```bash
   # On your backend server, check if the file exists
   ls -la Backend/media/documents/
   ```

2. **Verify server is running:**
   ```bash
   cd Backend
   python manage.py runserver 0.0.0.0:8000
   ```
   Note: Use `0.0.0.0:8000` instead of `localhost:8000` to allow external connections

3. **Test URL directly:**
   - Open browser and go to: `http://[YOUR_SERVER_IP]:8000/media/documents/test.pdf`
   - Should download the PDF file

### 2. Network Connection Issues

**For Android Emulator:**
- Server should run on `0.0.0.0:8000`
- App should use `http://10.0.2.2:8000` (emulator's host mapping)

**For Physical Device:**
- Server should run on `0.0.0.0:8000`
- App should use your computer's local IP: `http://192.168.x.x:8000`

### 3. Authentication Issues

**Error:** HTTP 401 Unauthorized

**Solution:** The app now automatically includes auth headers for backend URLs.

### 4. URL Generation Issues

The backend generates PDF URLs using `request.build_absolute_uri()`. This can cause issues when:
- Server runs on localhost but device connects via IP
- Inconsistent host headers

**Fix:** Update your Django settings to ensure consistent URL generation:

```python
# In Backend/server/settings.py
ALLOWED_HOSTS = [
    'localhost',
    '127.0.0.1',
    '0.0.0.0',
    '10.0.2.2',  # Android emulator
    '192.168.1.11',  # Your local IP - update this
    '*',  # Remove in production
]

# Add this for consistent media URLs
USE_TZ = True
MEDIA_URL = '/media/'
MEDIA_ROOT = os.path.join(BASE_DIR, 'media')
```

## Testing Steps

1. **Start Django server:**
   ```bash
   cd Backend
   python manage.py runserver 0.0.0.0:8000
   ```

2. **Test media serving:**
   ```bash
   curl http://localhost:8000/media/documents/test.pdf
   ```

3. **Test from mobile device:**
   - Update .env with correct IP
   - Test PDF loading in app

## Debug Commands

1. **Check server logs:** Look at Django console output when PDF request is made
2. **Check file permissions:** Ensure media files are readable
3. **Network connectivity:** Try opening the PDF URL in device browser

## Recent Fixes Applied

1. ✅ Added automatic auth header detection for backend URLs
2. ✅ Improved error handling with retry and browser fallback options  
3. ✅ Added proper HEAD/GET validation before download
4. ✅ Download remote PDFs to local storage before validation
5. ✅ Prevent FileSystem.getInfoAsync calls on remote URLs