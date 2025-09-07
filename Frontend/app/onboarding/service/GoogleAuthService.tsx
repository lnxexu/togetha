import { GoogleSignin, statusCodes } from '@react-native-google-signin/google-signin';
import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, API_ENDPOINTS } from '@/constants/ApiConfig';
import AuthService from './AuthService';

// Complete the auth session for better UX
WebBrowser.maybeCompleteAuthSession();

export interface GoogleSignInResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    photo?: string;
  };
  token?: string;
  error?: string;
}

class GoogleAuthService {
  private static instance: GoogleAuthService;
  
  private constructor() {
    this.configureGoogleSignIn();
  }

  static getInstance(): GoogleAuthService {
    if (!GoogleAuthService.instance) {
      GoogleAuthService.instance = new GoogleAuthService();
    }
    return GoogleAuthService.instance;
  }

  private configureGoogleSignIn() {
    try {
      GoogleSignin.configure({
        // You'll need to add your Google OAuth client IDs here
        // Get these from Google Cloud Console
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '', // Required for backend verification
        iosClientId: process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID || '', // Optional, auto-detected if not provided
        scopes: ['email', 'profile'],
        offlineAccess: true,
        hostedDomain: '', // Optional: restrict to specific domain
        forceCodeForRefreshToken: true,
      });
    } catch (error) {
      console.error('Google Sign-In configuration error:', error);
    }
  }

  async signInWithGoogle(): Promise<GoogleSignInResponse> {
    try {
      // Check if device supports Google Play Services (Android)
      await GoogleSignin.hasPlayServices({ 
        showPlayServicesUpdateDialog: true 
      });

      // Attempt to sign in
      const userInfo = await GoogleSignin.signIn();
      
      if (userInfo && userInfo.data) {
        // Get the ID token for backend verification
        const tokens = await GoogleSignin.getTokens();
        
        // Send to your backend for verification and user creation/login
        const backendResponse = await this.authenticateWithBackend(
          tokens.idToken,
          userInfo.data
        );

        if (backendResponse.success) {
          // Store authentication data
          await AsyncStorage.setItem('authToken', backendResponse.token);
          await AsyncStorage.setItem('googleUser', JSON.stringify(userInfo.data));
          
          const userData = userInfo.data as any; // Type assertion for flexibility
          
          return {
            success: true,
            user: {
              id: userData.id || '',
              email: userData.email || '',
              name: userData.name || userData.displayName || '',
              photo: userData.photo || userData.picture || undefined,
            },
            token: backendResponse.token,
          };
        } else {
          throw new Error(backendResponse.error || 'Backend authentication failed');
        }
      }
      
      throw new Error('No user information received');
    } catch (error: any) {
      console.error('Google Sign-In error:', error);
      
      // Handle different types of errors
      if (error.code === statusCodes.SIGN_IN_CANCELLED) {
        return {
          success: false,
          error: 'Sign-in was cancelled by user',
        };
      } else if (error.code === statusCodes.IN_PROGRESS) {
        return {
          success: false,
          error: 'Sign-in is already in progress',
        };
      } else if (error.code === statusCodes.PLAY_SERVICES_NOT_AVAILABLE) {
        return {
          success: false,
          error: 'Google Play Services is not available',
        };
      } else {
        return {
          success: false,
          error: error.message || 'An unexpected error occurred',
        };
      }
    }
  }

  private async authenticateWithBackend(idToken: string, userInfo: any) {
    try {
      const authService = AuthService.getInstance();
      const deviceInfo = await authService.getDeviceInfo();

      const response = await fetch(`${API_URL}/auth/google/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          id_token: idToken,
          user_info: userInfo,
          device_info: deviceInfo,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        return {
          success: true,
          token: data.token,
          user: data.user,
        };
      } else {
        return {
          success: false,
          error: data.error || data.detail || 'Authentication failed',
        };
      }
    } catch (error) {
      console.error('Backend authentication error:', error);
      return {
        success: false,
        error: 'Network error occurred',
      };
    }
  }

  async signOut(): Promise<boolean> {
    try {
      await GoogleSignin.signOut();
      await AsyncStorage.removeItem('googleUser');
      return true;
    } catch (error) {
      console.error('Google Sign-Out error:', error);
      return false;
    }
  }

  async isSignedIn(): Promise<boolean> {
    try {
      const currentUser = await GoogleSignin.getCurrentUser();
      return currentUser !== null;
    } catch (error) {
      console.error('Google Sign-In status check error:', error);
      return false;
    }
  }

  async getCurrentUser() {
    try {
      const userInfo = await GoogleSignin.getCurrentUser();
      return userInfo;
    } catch (error) {
      console.error('Get current Google user error:', error);
      return null;
    }
  }

  // Fallback method using Expo AuthSession for web or if Google Sign-In fails
  async signInWithGoogleWeb(): Promise<GoogleSignInResponse> {
    try {
      const redirectUri = AuthSession.makeRedirectUri();

      const authRequestConfig: AuthSession.AuthRequestConfig = {
        clientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '',
        scopes: ['email', 'profile'],
        responseType: AuthSession.ResponseType.Code,
        redirectUri,
        extraParams: {
          access_type: 'offline',
        },
      };

      const authRequest = new AuthSession.AuthRequest(authRequestConfig);
      const authUrl = 'https://accounts.google.com/oauth/authorize';

      const result = await authRequest.promptAsync({
        authorizationEndpoint: authUrl,
      });

      if (result.type === 'success' && result.params.code) {
        // Exchange code for tokens
        const tokenResponse = await AuthSession.exchangeCodeAsync(
          {
            code: result.params.code,
            clientId: authRequestConfig.clientId,
            redirectUri,
            extraParams: {
              client_secret: process.env.EXPO_PUBLIC_GOOGLE_CLIENT_SECRET || '',
            },
          },
          {
            tokenEndpoint: 'https://oauth2.googleapis.com/token',
          }
        );

        if (tokenResponse.accessToken) {
          // Get user info
          const userInfoResponse = await fetch(
            `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenResponse.accessToken}`
          );
          const userInfo = await userInfoResponse.json();

          // Authenticate with backend
          const backendResponse = await this.authenticateWithBackend(
            tokenResponse.idToken || tokenResponse.accessToken,
            userInfo
          );

          if (backendResponse.success) {
            await AsyncStorage.setItem('authToken', backendResponse.token);
            await AsyncStorage.setItem('googleUser', JSON.stringify(userInfo));

            return {
              success: true,
              user: {
                id: userInfo.id,
                email: userInfo.email,
                name: userInfo.name || '',
                photo: userInfo.picture || undefined,
              },
              token: backendResponse.token,
            };
          } else {
            throw new Error(backendResponse.error || 'Backend authentication failed');
          }
        }
      }

      return {
        success: false,
        error: 'Authentication was cancelled or failed',
      };
    } catch (error: any) {
      console.error('Google Web Sign-In error:', error);
      return {
        success: false,
        error: error.message || 'An unexpected error occurred',
      };
    }
  }
}

export default GoogleAuthService;
