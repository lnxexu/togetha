# Google OAuth Setup for Expo Web-Based Authentication

This guide will help you set up Google OAuth using Expo's web-based authentication system, which works across all platforms without requiring native modules.

## Prerequisites

1. Google Cloud Console account
2. Your React Native/Expo app running

## Step 1: Google Cloud Console Setup

### 1.1 Create or Select Project
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Note your project ID

### 1.2 Enable Required APIs
1. Go to "APIs & Services" > "Library"
2. Search for and enable:
   - Google+ API (for user profile data)
   - OAuth consent screen

### 1.3 Configure OAuth Consent Screen
1. Go to "APIs & Services" > "OAuth consent screen"
2. Choose "External" for user type
3. Fill in required fields:
   - App name: Your app name
   - User support email: Your email
   - Developer contact email: Your email
4. Add scopes: `email`, `profile`, `openid`
5. Save and continue

### 1.4 Create OAuth 2.0 Client ID
1. Go to "APIs & Services" > "Credentials"
2. Click "Create Credentials" > "OAuth 2.0 Client ID"
3. Select "Web application"
4. Add authorized redirect URIs:
   - For development: `https://auth.expo.io/@your-expo-username/your-app-slug`
   - For production: Your actual redirect URI
5. Save and note the Client ID and Client Secret

## Step 2: Configure Your App

### 2.1 Environment Variables
1. Copy `.env.example` to `.env`
2. Fill in your Google OAuth credentials:

```bash
# Google OAuth Configuration
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_client_id_here.googleusercontent.com
```

### 2.2 Update app.json (if needed)
Make sure your `app.json` includes your correct bundle identifier:

```json
{
  "expo": {
    "name": "Your App Name",
    "slug": "your-app-slug",
    "scheme": "your-app-scheme"
  }
}
```

## Step 3: Backend Integration

### 3.1 Django Backend Setup
Your Django backend should have an endpoint to handle Google OAuth tokens:

```python
# In your Django views.py
from google.oauth2 import id_token
from google.auth.transport import requests

def google_auth(request):
    try:
        # Verify the token with Google
        id_info = id_token.verify_oauth2_token(
            request.data.get('id_token'),
            requests.Request(),
            settings.GOOGLE_OAUTH2_CLIENT_ID
        )
        
        # Process user authentication
        # Create or get user based on id_info
        
        return Response({'token': user_token})
    except ValueError:
        return Response({'error': 'Invalid token'}, status=400)
```

### 3.2 API Endpoints
Make sure your backend has these endpoints configured:
- `POST /api/auth/google/` - For Google OAuth authentication
- `GET /api/auth/verify-token/` - For token verification

## Step 4: Testing

1. Start your Expo development server: `npm start`
2. Open your app in Expo Go or simulator
3. Try signing in with Google
4. Check that the authentication flow works end-to-end

## Troubleshooting

### Common Issues

1. **"Error 400: redirect_uri_mismatch"**
   - Make sure your redirect URI in Google Cloud Console matches exactly
   - For Expo development, use: `https://auth.expo.io/@your-username/your-slug`

2. **"Client ID not found"**
   - Check that `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` is set correctly
   - Make sure you're using the Web Client ID, not iOS or Android

3. **"Backend authentication failed"**
   - Verify your Django backend is running
   - Check that the Google OAuth endpoint exists and accepts POST requests
   - Ensure CORS is configured for your frontend domain

4. **"Invalid token"**
   - Make sure your backend is using the same Google Client ID for verification
   - Check that the token hasn't expired

### Debug Mode
Set `EXPO_PUBLIC_DEBUG=true` in your `.env` file to see more detailed logs.

## Security Notes

1. Never commit your `.env` file to version control
2. Use different Client IDs for development and production
3. Regularly rotate your client secrets
4. Implement proper token expiration on your backend
5. Validate all tokens server-side, never trust client-side validation alone

## Production Deployment

For production deployment:
1. Create a production Google OAuth Client ID
2. Update your environment variables
3. Configure your production redirect URIs in Google Cloud Console
4. Test the full authentication flow in your production environment

## Additional Resources

- [Expo AuthSession Documentation](https://docs.expo.dev/versions/latest/sdk/auth-session/)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)
