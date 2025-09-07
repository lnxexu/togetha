import * as AuthSession from 'expo-auth-session';
import * as WebBrowser from 'expo-web-browser';
import * as Crypto from 'expo-crypto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, API_ENDPOINTS } from '@/constants/ApiConfig';

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
  private clientId: string;
  private redirectUri: string;
  
  private constructor() {
    this.clientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID || '';
    this.redirectUri = AuthSession.makeRedirectUri();
    
    if (!this.clientId) {
      console.warn('Google Client ID not configured. Please set EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID in your environment variables.');
    }
  }

  static getInstance(): GoogleAuthService {
    if (!GoogleAuthService.instance) {
      GoogleAuthService.instance = new GoogleAuthService();
    }
    return GoogleAuthService.instance;
  }

  async signInWithGoogle(): Promise<GoogleSignInResponse> {
    try {
      if (!this.clientId) {
        return {
          success: false,
          error: 'Google OAuth is not configured. Please set up your client ID.',
        };
      }

      // Generate a random code verifier for PKCE
      const randomBytes = await Crypto.getRandomBytesAsync(32);
      const codeVerifier = Array.from(randomBytes, byte => byte.toString(16).padStart(2, '0')).join('');
      
      // Create the code challenge using crypto
      const codeChallenge = await Crypto.digestStringAsync(
        Crypto.CryptoDigestAlgorithm.SHA256,
        codeVerifier,
        { encoding: Crypto.CryptoEncoding.BASE64 }
      ).then(hash => hash.replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, ''));

      // Create auth request
      const request = new AuthSession.AuthRequest({
        clientId: this.clientId,
        scopes: ['openid', 'profile', 'email'],
        redirectUri: this.redirectUri,
        responseType: AuthSession.ResponseType.Code,
        codeChallenge,
        codeChallengeMethod: AuthSession.CodeChallengeMethod.S256,
      });

      // Start the authentication flow
      const result = await request.promptAsync({
        authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      });

      if (result.type === 'success') {
        // Exchange the code for tokens
        const tokenResponse = await AuthSession.exchangeCodeAsync(
          {
            clientId: this.clientId,
            code: result.params.code,
            redirectUri: this.redirectUri,
            extraParams: {
              code_verifier: codeVerifier,
            },
          },
          {
            tokenEndpoint: 'https://oauth2.googleapis.com/token',
          }
        );

        // Get user info from Google
        const userInfoResponse = await fetch(
          `https://www.googleapis.com/oauth2/v2/userinfo?access_token=${tokenResponse.accessToken}`,
          {
            headers: {
              Authorization: `Bearer ${tokenResponse.accessToken}`,
            },
          }
        );

        if (!userInfoResponse.ok) {
          throw new Error('Failed to fetch user information from Google');
        }

        const userInfo = await userInfoResponse.json();

        // Authenticate with your backend
        const backendResponse = await this.authenticateWithBackend({
          access_token: tokenResponse.accessToken,
          id_token: tokenResponse.idToken || '',
          user_info: userInfo,
        });

        if (backendResponse.success) {
          // Store authentication data
          if (backendResponse.token) {
            await AsyncStorage.setItem('authToken', backendResponse.token);
          }

          return {
            success: true,
            user: {
              id: userInfo.id,
              email: userInfo.email,
              name: userInfo.name,
              photo: userInfo.picture,
            },
            token: backendResponse.token,
          };
        } else {
          return {
            success: false,
            error: backendResponse.error || 'Backend authentication failed',
          };
        }
      } else if (result.type === 'cancel') {
        return {
          success: false,
          error: 'User cancelled the authentication',
        };
      } else {
        return {
          success: false,
          error: 'Authentication was dismissed',
        };
      }
    } catch (error) {
      console.error('Google Sign-In Error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error occurred',
      };
    }
  }

  private async authenticateWithBackend(googleAuthData: {
    access_token: string;
    id_token: string;
    user_info: any;
  }): Promise<{ success: boolean; token?: string; error?: string }> {
    try {
      const response = await fetch(`${API_URL}${API_ENDPOINTS.GOOGLE_AUTH}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          access_token: googleAuthData.access_token,
          id_token: googleAuthData.id_token,
          user_info: googleAuthData.user_info,
        }),
      });

      const data = await response.json();

      if (response.ok) {
        return {
          success: true,
          token: data.token,
        };
      } else {
        return {
          success: false,
          error: data.error || 'Backend authentication failed',
        };
      }
    } catch (error) {
      console.error('Backend authentication error:', error);
      return {
        success: false,
        error: 'Failed to connect to backend',
      };
    }
  }

  async signOut(): Promise<void> {
    try {
      // Clear stored token
      await AsyncStorage.removeItem('authToken');
      
      // You might want to revoke the token from Google as well
      // This is optional but recommended for better security
    } catch (error) {
      console.error('Sign out error:', error);
    }
  }

  async getCurrentUser(): Promise<any> {
    try {
      const token = await AsyncStorage.getItem('authToken');
      if (!token) {
        return null;
      }

      // Verify token with your backend
      const response = await fetch(`${API_URL}${API_ENDPOINTS.VERIFY_TOKEN}`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        return await response.json();
      } else {
        // Token is invalid, remove it
        await AsyncStorage.removeItem('authToken');
        return null;
      }
    } catch (error) {
      console.error('Get current user error:', error);
      return null;
    }
  }
}

export default GoogleAuthService.getInstance();
