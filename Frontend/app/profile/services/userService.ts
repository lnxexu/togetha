import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, API_ENDPOINTS } from "../../../constants/ApiConfig";

export interface UserProfile {
  id?: string;
  username?: string;
  email?: string;
  date_joined?: string;
  profile?: {
    bio?: string;
    location?: string;
    full_name?: string;
    phone_number?: string;
    gender?: string;
    birthdate?: string;
    profile_picture?: string
  }
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
      // use USER_PROFILE and GET_USER_INFO endpoint
      const [userProfile, userInfo] = await Promise.all([
        this.apiRequest<UserProfile>(API_ENDPOINTS.USER_PROFILE),
        this.apiRequest<UserProfile>(API_ENDPOINTS.GET_USER_INFO),
      ]);

      // Combine the results
      return { ...userProfile, ...userInfo };
    } catch (error) {
      console.error("Error fetching user info:", error);
      throw error;
    }
  }



  async getUserProgress(): Promise<UserProgress> {
  try {
    const response = await this.apiRequest<any>(API_ENDPOINTS.USER_PROGRESS);
    
    // Map the backend field names to your interface field names
    return {
      tasksCompleted: response.tasks_completed || 0,
      notesCreated: response.notes_created || 0,
      studyStreak: response.study_streak || 0,
      learningHours: response.learning_hours || 0,
      chatbot_interactions: response.chatbot_interactions || 0,
      username: response.username,
      email: response.email,
      date_joined: response.date_joined,
      last_login: response.last_login,
    };
  } catch (error) {
    console.error("Error fetching user progress:", error);
    return {
      tasksCompleted: 0,
      notesCreated: 0,
      studyStreak: 0,
      learningHours: 0,
      chatbot_interactions: 0
    };
  }
}

  async updateUserProfile(updates: Partial<UserProfile>): Promise<UserProfile> {
  try {
    const token = await this.getAuthToken();
    if (!token) {
      throw new Error("No authentication token found");
    }

    // Create FormData object
    const formData = new FormData();

    // Properly map fields to backend expected structure
    if (updates.username) formData.append("username", updates.username);
    if (updates.email) formData.append("email", updates.email);
    
    // Profile nested fields
    if (updates.profile?.full_name) formData.append("profile.full_name", updates.profile.full_name);
    if (updates.profile?.bio) formData.append("profile.bio", updates.profile.bio);
    if (updates.profile?.location) formData.append("profile.address", updates.profile.location);
    if (updates.profile?.phone_number) formData.append("profile.phone_number", updates.profile.phone_number);
    if (updates.profile?.gender) formData.append("profile.gender", updates.profile.gender);
    if (updates.profile?.birthdate) formData.append("profile.birthdate", updates.profile.birthdate);

    // Send the update request
    const response = await fetch(`${API_URL}${API_ENDPOINTS.USER_PROFILE}`, {
      method: "PATCH", // PATCH is better for partial updates
      headers: {
        Authorization: `Token ${token}`,
        
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(errorText || `Request failed with status ${response.status}`);
    }

    // Clear cache after successful update
    await this.clearProfileCache();
    
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

  async changePassword(data: {
    currentPassword: string;
    newPassword: string;
  }): Promise<{ message: string; token: string }> {
    try {
      const token = await this.getAuthToken();
      if (!token) {
        throw new Error("No authentication token found");
      }

      const response = await fetch(`${API_URL}${API_ENDPOINTS.CHANGE_PASSWORD}`, {
        method: "POST",
        headers: {
          Authorization: `Token ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          current_password: data.currentPassword,
          new_password: data.newPassword,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(
          errorData.detail || 
          errorData.error || 
          errorData.current_password?.[0] || 
          errorData.new_password?.[0] || 
          `Request failed with status ${response.status}`
        );
      }

      const result = await response.json();
      
      // Update the stored auth token with the new one
      if (result.token) {
        await AsyncStorage.setItem("authToken", result.token);
      }

      return result;
    } catch (error) {
      console.error("Error changing password:", error);
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
