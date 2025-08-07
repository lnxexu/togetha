import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, API_ENDPOINTS } from "../../../constants/ApiConfig";

export interface UserProfile {
  id?: string;
  username?: string;
  full_name?: string;
  email?: string;
  profile_picture?: string;
  date_joined?: string;
  bio?: string;
  location?: string;
  phone?: string;
}

export interface UserProgress {
  tasksCompleted: number;
  notesCreated: number;
  studyStreak: number;
  learningHours: number;
  chatbot_interactions?: number;
  username?: string;
  email?: string;
  date_joined?: string;
  last_login?: string;
}

class UserService {
  async getAuthToken(): Promise<string | null> {
    return await AsyncStorage.getItem("authToken");
  }

  async apiRequest<T>(
    endpoint: string,
    method: string = "GET",
    data?: any
  ): Promise<T> {
    const token = await this.getAuthToken();
    if (!token) {
      throw new Error("No authentication token found");
    }

    const headers: HeadersInit = {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
    };

    const config: RequestInit = {
      method,
      headers,
      body: data ? JSON.stringify(data) : undefined,
    };

    const response = await fetch(`${API_URL}${endpoint}`, config);

    // First check if response is OK
    if (!response.ok) {
      const contentType = response.headers.get("content-type");
      console.error("Failed request:", {
        status: response.status,
        statusText: response.statusText,
        url: response.url,
        contentType,
      });

      // Create a clone of the response before trying to read it
      // This avoids the "Already read" error
      const responseClone = response.clone();

      try {
        const errorData = await response.json();
        throw new Error(
          errorData.detail || `Request failed with status ${response.status}`
        );
      } catch (parseError) {
        // If we can't parse the error as JSON, use the cloned response for text
        const errorText = await responseClone.text();
        throw new Error(
          errorText || `Request failed with status ${response.status}`
        );
      }
    }

    // Check content type before parsing as JSON
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("application/json")) {
      return (await response.json()) as T;
    } else {
      // If not JSON, throw an appropriate error
      const text = await response.text();
      console.error("Unexpected response format:", text.substring(0, 200)); // Log the beginning of response
      throw new Error("Response was not in JSON format");
    }
  }

  async getUserInfo(forceRefresh = false): Promise<UserProfile> {
    if (forceRefresh) {
      // Clear any cached data first
      await this.clearProfileCache();
    }
    try {
      return await this.apiRequest<UserProfile>(API_ENDPOINTS.USER_PROFILE);
    } catch (error) {
      console.error("Error fetching user info:", error);
      throw error;
    }
  }

  async getUserProfile(forceRefresh = false): Promise<UserProfile> {
    if (forceRefresh) {
      // Clear any cached data first
      await this.clearProfileCache();
    }
    try {
      return await this.apiRequest<UserProfile>(API_ENDPOINTS.GET_USER_INFO);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      throw error;
    }
  }

  async getUserProgress(): Promise<UserProgress> {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        throw new Error("No auth token found");
      }

      const response = await fetch(`${API_URL}${API_ENDPOINTS.USER_PROGRESS}`, {
        method: "GET",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch user progress: ${response.status}`);
      }

      const data = await response.json();

      // Map the backend field names to your interface field names
      return {
        tasksCompleted: data.tasks_completed || 0,
        notesCreated: data.notes_created || 0,
        studyStreak: 0, // This field isn't in the backend response
        learningHours: 0, // This field isn't in the backend response
        chatbot_interactions: data.chatbot_interactions,
        username: data.username,
        email: data.email,
        date_joined: data.date_joined,
        last_login: data.last_login,
      };
    } catch (error) {
      console.error("Error fetching user progress:", error);
      // Return default values instead of throwing
      return {
        learningHours: 0,
        notesCreated: 0,
        studyStreak: 0,
        tasksCompleted: 0,
      };
    }
  }

  async updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
    try {
      const token = await this.getAuthToken();
      if (!token) {
        throw new Error("No authentication token found");
      }

      // Create FormData object instead of JSON
      const formData = new FormData();


      // Add each field to the FormData
      if (updates.username) formData.append("username", updates.username);
      if (updates.full_name) formData.append("profile.full_name", updates.full_name);
      if (updates.email) formData.append("email", updates.email);
      if (updates.bio) formData.append("profile.bio", updates.bio);
      if (updates.location)
        formData.append("profile.address", updates.location);
      if (updates.phone) formData.append("profile.phone_number", updates.phone);

      // First get the CSRF token by making a GET request to the server
      const csrfResponse = await fetch(`${API_URL}/users/csrf-token/`, {
        method: "GET",
        headers: {
          Authorization: `Token ${token}`,
        },
      });

      const csrfData = await csrfResponse.json();
      const csrfToken = csrfData.csrfToken;

      // Direct fetch with FormData
      const response = await fetch(`${API_URL}${API_ENDPOINTS.USER_PROFILE}`, {
        method: "PUT",
        headers: {
          Authorization: `Token ${token}`,
          "X-CSRFToken": csrfToken,
        },
        body: formData,
        credentials: "include", // Important for cookies
      });

      if (!response.ok) {
        console.error("Failed request:", {
          status: response.status,
          statusText: response.statusText,
          url: response.url,
        });

        const responseClone = response.clone();

        try {
          const errorData = await response.json();
          throw new Error(
            errorData.detail || `Request failed with status ${response.status}`
          );
        } catch (parseError) {
          const errorText = await responseClone.text();
          throw new Error(
            errorText || `Request failed with status ${response.status}`
          );
        }
      }

      return await response.json();
    } catch (error) {
      console.error("Error updating profile:", error);
      throw error;
    }
  }

  async uploadProfilePicture(
    imageUri: string
  ): Promise<{ profile_picture: string }> {
    const token = await this.getAuthToken();
    if (!token) {
      throw new Error("No authentication token found");
    }

    // Create form data for file upload
    const formData = new FormData();
    formData.append("profile_picture", {
      uri: imageUri,
      name: "profile-picture.jpg",
      type: "image/jpeg",
    } as any);

    // Uncommented and fixed the implementation to ensure a return value
    const response = await fetch(`${API_URL}${API_ENDPOINTS.USER_PROFILE}`, {
      method: "PATCH",
      headers: {
        Authorization: `Token ${token}`,
        // Do not set 'Content-Type' header; let fetch set it automatically for FormData
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(
        errorText || `Upload failed with status ${response.status}`
      );
    }

    return await response.json();
  }

  // Add this method to your userService

  async updateProfilePicture(formData: FormData): Promise<UserProfile> {
    try {
      const token = await this.getAuthToken();

      if (!token) {
        throw new Error("Authentication token not found");
      }

      const response = await fetch(`${API_URL}${API_ENDPOINTS.USER_PROFILE}`, {
        method: "PATCH",
        headers: {
          Authorization: `Token ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        throw new Error("Failed to update profile picture");
      }

      return await response.json();
    } catch (error) {
      console.error("Error updating profile picture:", error);
      throw error;
    }
  }

  async clearProfileCache() {
    try {
     await AsyncStorage.multiRemove([
      "cachedUserInfo",
      "cachedUserProfile",
      "lastProfileFetch",
      "username",
      "userProfilePicture",
      "userName"
    ]);
    } catch (error) {
      console.error("Error clearing profile cache:", error);
    }
  }
}

export const userService = new UserService();
