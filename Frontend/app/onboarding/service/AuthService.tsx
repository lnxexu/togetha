import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, API_ENDPOINTS } from "@/constants/ApiConfig";
import * as Device from 'expo-device';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

class AuthService {
  private static instance: AuthService;
  private deviceId: string | null = null;
  
  private constructor() {
    // Initialize device ID when service is created
    this.initDeviceId();
  }

  // Generate a simple device ID without relying on UUID
  private generateDeviceId(): string {
    // Create a timestamp-based ID with random numbers
    const timestamp = new Date().getTime().toString(36);
    const randomPart = Math.floor(Math.random() * 1000000000).toString(36);
    return `${timestamp}-${randomPart}-${Platform.OS}`;
  }

  // Initialize or retrieve a unique device identifier
  private async initDeviceId() {
    try {
      let id = await AsyncStorage.getItem('device_id');
      
      if (!id) {
        // Generate a new device ID if not found
        id = this.generateDeviceId();
        await AsyncStorage.setItem('device_id', id);
      }
      
      this.deviceId = id;
      console.log("Device ID initialized:", this.deviceId);
    } catch (error) {
      console.error("Failed to initialize device ID:", error);
      // Fallback to generate ID in memory if AsyncStorage fails
      this.deviceId = this.generateDeviceId();
    }
  }

  // Get device information for session tracking
  async getDeviceInfo() {
    if (!this.deviceId) {
      await this.initDeviceId();
    }
    
    try {
      const deviceInfo = {
        device_id: this.deviceId || this.generateDeviceId(),
        device_name: Device.deviceName || 'Unknown Device',
        device_type: Device.deviceType === Device.DeviceType.TABLET ? 'tablet' : 'phone',
        os_name: Platform.OS,
        os_version: Platform.Version.toString(),
        app_version: Constants.expoConfig?.version || '1.0.0',
        login_timestamp: new Date().toISOString()
      };
      
      return deviceInfo;
    } catch (error) {
      // Fallback with minimal device info if full info can't be obtained
      return {
        device_id: this.deviceId || this.generateDeviceId(),
        os_name: Platform.OS,
        login_timestamp: new Date().toISOString()
      };
    }
  }

  static getInstance(): AuthService {
    if (!AuthService.instance) {
      AuthService.instance = new AuthService();
    }
    return AuthService.instance;
  }

  async clearUserData(): Promise<void> {
    try {
      // Get all keys from AsyncStorage
      const allKeys = await AsyncStorage.getAllKeys();
      
      // Keys that should be preserved (app settings, etc.)
      const preserveKeys = [
        "device_id", // Keep device ID to maintain device identity
        "appTheme",
        "notificationSettings",
        "languagePreference",
        "lastSyncTime",
        "userPreferences"
      ];
      
      // Filter out keys to preserve
      const keysToRemove = allKeys.filter(key => !preserveKeys.includes(key));
      
      // Clear all user-related data
      if (keysToRemove.length > 0) {
        await AsyncStorage.multiRemove(keysToRemove);
      }
      
      console.log("All user data cleared:", keysToRemove.length, "items");
    } catch (error) {
      console.error("Error clearing user data:", error);
    }
  }

    async login(username: string, password: string, forceLogin: boolean = false): Promise<any> {
    try {
      // First clear any existing user data
      await this.clearUserData();

      // Get device info for session tracking
      const deviceInfo = await this.getDeviceInfo();
      
      // First, get a CSRF token from the backend
      const csrfResponse = await fetch(`${API_URL}/users/csrf-token/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json"
        },
      });
      
      const csrfData = await csrfResponse.json();
      const csrfToken = csrfData.csrfToken;
      
      // Now make the login request with the CSRF token
      const response = await fetch(`${API_URL}${API_ENDPOINTS.LOGIN}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-CSRFToken": csrfToken
        },
        body: JSON.stringify({ 
          username, 
          password,
          device_info: deviceInfo,
          force_login: forceLogin
        }),
        credentials: "include"  // Important for cookies
      });

      // Handle session conflict (HTTP 409)
      if (response.status === 409) {
        const conflictData = await response.json();
        throw new Error(conflictData.message || "Account is already in use on another device");
      }

      // Handle unauthorized
      if (response.status === 401) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Invalid credentials");
      }

      // Handle other errors
      if (!response.ok) {
        const errorData = await response.text();
        throw new Error(`Login failed: ${errorData}`);
      }

      const data = await response.json();

      // Make sure we're storing the token and session data
      if (data.token) {
        await AsyncStorage.setItem("token", data.token);
        await AsyncStorage.setItem("authToken", data.token);
        await AsyncStorage.setItem("username", username);
        
        // Store session data
        if (data.session_id) {
          await AsyncStorage.setItem("session_id", data.session_id);
        }
        
        // Store user object if available
        if (data.user) {
          await AsyncStorage.setItem("userData", JSON.stringify(data.user));
        }
        
        console.log("Login successful for user:", username);
        return data;
      } else {
        throw new Error("No token received from server");
      }
    } catch (error) {
      console.error("Login error:", error);
      throw error; // Re-throw to handle in the UI
    }
  }

  async logout(): Promise<boolean> {
    try {
      // Get the token and session ID before clearing data
      const token = await AsyncStorage.getItem("token") || 
                    await AsyncStorage.getItem("authToken");
      const sessionId = await AsyncStorage.getItem("session_id");
      const deviceInfo = await this.getDeviceInfo();

      // If we have a token, invalidate it on the server
      if (token) {
        try {
          await fetch(`${API_URL}${API_ENDPOINTS.LOGOUT}`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Token ${token}`,
            },
            body: JSON.stringify({
              session_id: sessionId,
              device_info: deviceInfo
            }),
          });
          console.log("Logout request sent to server");
        } catch (serverError) {
          console.warn("Error during server logout:", serverError);
        }
      }
      
      // Always clear user data locally, even if server request fails
      await this.clearUserData();
      return true;
    } catch (error) {
      console.error("Logout error:", error);
      return false;
    }
  }

  async testToken(): Promise<boolean> {
    try {
      // Try both token storage keys
      const token = await AsyncStorage.getItem("token") || 
                    await AsyncStorage.getItem("authToken");
      const sessionId = await AsyncStorage.getItem("session_id");

      if (!token) {
        console.log("No token found for testing");
        return false;
      }

      const response = await fetch(`${API_URL}${API_ENDPOINTS.TEST_TOKEN}`, {
        method: "GET",
        headers: {
          Authorization: `Token ${token}`,
          "Cache-Control": "no-cache, no-store, must-revalidate",
          "X-Session-ID": sessionId || ''
        },
      });

      if (response.ok) {
        const data = await response.json();
        
        // Check if this is still the active session
        if (data.is_active_session === false) {
          console.log("Session has been invalidated by another login");
          await this.clearUserData();
          return false;
        }
        
        return true;
      } else {
        console.log("Token test failed, status:", response.status);
        // If token is invalid, clear user data
        if (response.status === 401 || response.status === 403) {
          await this.clearUserData();
        }
        return false;
      }
    } catch (error) {
      console.error("Token test error:", error);
      return false;
    }
  }

  async isAuthenticated(): Promise<boolean> {
    try {
      const token = await AsyncStorage.getItem("token") || 
                    await AsyncStorage.getItem("authToken");
      return !!token;
    } catch (error) {
      console.error("Auth check error:", error);
      return false;
    }
  }
}

export default AuthService;