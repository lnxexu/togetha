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