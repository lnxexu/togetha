# Google OAuth Setup Guide for Togetha

This guide will walk you through setting up Google OAuth authentication for the Togetha mobile app.

## Prerequisites

- Google Account with Google Cloud Console access
- React Native/Expo development environment set up
- Backend server running (Django)

## Step 1: Google Cloud Console Setup

### 1.1 Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click "Select a project" → "New Project"
3. Enter project name: "Togetha" (or your preferred name)
4. Click "Create"

### 1.2 Enable Required APIs

1. Navigate to "APIs & Services" → "Library"
2. Search for and enable the following APIs:
   - **Google+ API** (for user profile information)
   - **Gmail API** (if you plan to integrate email features)

### 1.3 Configure OAuth Consent Screen

1. Go to "APIs & Services" → "OAuth consent screen"
2. Choose "External" (for public app) or "Internal" (for organization-only)
3. Fill in the required information:
   - **App name**: Togetha
   - **User support email**: Your email
   - **Developer contact information**: Your email
   - **App domain**: Your app's domain (if you have one)
   - **Logo**: Upload your app logo (optional)
4. Add scopes:
   - `../auth/userinfo.email`
   - `../auth/userinfo.profile`
   - `openid`
5. Add test users (for development phase)
6. Save and continue

### 1.4 Create OAuth 2.0 Client IDs

#### For Android:
1. Go to "APIs & Services" → "Credentials"
2. Click "Create Credentials" → "OAuth 2.0 Client ID"
3. Application type: "Android"
4. Name: "Togetha Android"
5. Package name: `com.togetha.app` (or your app's package name)
6. SHA-1 certificate fingerprint:
   - For development: Get from `expo credentials:manager`
   - For production: Get from your signed APK

#### For iOS:
1. Create another OAuth 2.0 Client ID
2. Application type: "iOS"
3. Name: "Togetha iOS"
4. Bundle ID: `com.togetha.app` (or your app's bundle ID)

#### For Web (Required for backend verification):
1. Create another OAuth 2.0 Client ID
2. Application type: "Web application"
3. Name: "Togetha Web"
4. Authorized redirect URIs: Add your backend's OAuth callback URL
   - `http://localhost:8000/auth/google/callback/` (for development)
   - `https://yourbackend.com/auth/google/callback/` (for production)

## Step 2: Frontend Configuration

### 2.1 Environment Variables

Copy `.env.example` to `.env` and fill in your Google OAuth credentials:

```bash
# Google OAuth Configuration
EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID=your_web_client_id.googleusercontent.com
EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID=your_ios_client_id.googleusercontent.com
EXPO_PUBLIC_GOOGLE_CLIENT_SECRET=your_client_secret
```

### 2.2 App Configuration (app.json/app.config.js)

Add the following to your Expo app configuration:

```json
{
  "expo": {
    "android": {
      "googleServicesFile": "./google-services.json"
    },
    "ios": {
      "googleServicesFile": "./GoogleService-Info.plist"
    },
    "plugins": [
      [
        "@react-native-google-signin/google-signin",
        {
          "iosUrlScheme": "your_ios_client_id_reversed"
        }
      ]
    ]
  }
}
```

### 2.3 Download Configuration Files

#### For Android:
1. In Google Cloud Console, go to "APIs & Services" → "Credentials"
2. Download the `google-services.json` file for your Android client
3. Place it in your project root directory

#### For iOS:
1. Download the `GoogleService-Info.plist` file for your iOS client
2. Place it in your project root directory

## Step 3: Backend Configuration (Django)

### 3.1 Install Required Packages

```bash
pip install google-auth google-auth-oauthlib google-auth-httplib2
```

### 3.2 Django Settings

Add to your `settings.py`:

```python
# Google OAuth Configuration
GOOGLE_OAUTH2_CLIENT_ID = 'your_web_client_id.googleusercontent.com'
GOOGLE_OAUTH2_CLIENT_SECRET = 'your_client_secret'

# Social Auth (if using django-allauth)
INSTALLED_APPS = [
    # ... other apps
    'allauth',
    'allauth.account',
    'allauth.socialaccount',
    'allauth.socialaccount.providers.google',
]

SOCIALACCOUNT_PROVIDERS = {
    'google': {
        'SCOPE': [
            'profile',
            'email',
        ],
        'AUTH_PARAMS': {
            'access_type': 'online',
        }
    }
}
```

### 3.3 Create Google OAuth Endpoint

Create a view to handle Google OAuth:

```python
# views.py
from google.oauth2 import id_token
from google.auth.transport import requests
from rest_framework.decorators import api_view
from rest_framework.response import Response
from django.contrib.auth import get_user_model

User = get_user_model()

@api_view(['POST'])
def google_oauth(request):
    token = request.data.get('id_token')
    
    try:
        # Verify the token
        idinfo = id_token.verify_oauth2_token(
            token, 
            requests.Request(), 
            settings.GOOGLE_OAUTH2_CLIENT_ID
        )
        
        # Extract user information
        email = idinfo['email']
        name = idinfo['name']
        google_id = idinfo['sub']
        
        # Create or get user
        user, created = User.objects.get_or_create(
            email=email,
            defaults={
                'username': email,
                'first_name': name.split(' ')[0] if name else '',
                'last_name': ' '.join(name.split(' ')[1:]) if name else '',
            }
        )
        
        # Generate auth token
        token, created = Token.objects.get_or_create(user=user)
        
        return Response({
            'token': token.key,
            'user': {
                'id': user.id,
                'email': user.email,
                'name': f"{user.first_name} {user.last_name}".strip(),
            }
        })
        
    except ValueError:
        return Response({'error': 'Invalid token'}, status=400)
```

### 3.4 URL Configuration

Add to your `urls.py`:

```python
urlpatterns = [
    # ... other URLs
    path('auth/google/', views.google_oauth, name='google_oauth'),
]
```

## Step 4: Testing

### 4.1 Development Testing

1. Start your backend server
2. Run your Expo app: `expo start`
3. Test Google sign-in on both Android and iOS devices/simulators
4. Check that user data is properly saved to your backend

### 4.2 Production Testing

1. Build signed APK/IPA with production certificates
2. Test with production Google OAuth credentials
3. Verify that the OAuth consent screen appears correctly for new users

## Troubleshooting

### Common Issues:

1. **"Sign in failed"**: Check that your client IDs match your app's package/bundle ID
2. **"Invalid token"**: Ensure your web client ID is correctly configured in backend
3. **"App not verified"**: Submit your app for Google verification for production use
4. **SHA-1 mismatch**: Make sure your development and production SHA-1 fingerprints are added

### Debug Steps:

1. Check Expo logs: `expo start` and look for error messages
2. Verify environment variables are loaded correctly
3. Test with Google OAuth Playground to ensure your credentials work
4. Check Django logs for backend authentication errors

## Security Considerations

1. **Never commit** your `google-services.json`, `GoogleService-Info.plist`, or `.env` files to version control
2. Use different OAuth client IDs for development and production
3. Regularly rotate your client secrets
4. Implement proper token validation on your backend
5. Set up proper CORS and CSRF protection

## Resources

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [React Native Google Sign-In](https://github.com/react-native-google-signin/google-signin)
- [Expo AuthSession](https://docs.expo.dev/guides/authentication/#google)
- [Django AllAuth](https://django-allauth.readthedocs.io/)

---

Need help? Check the Togetha documentation or contact the development team.
