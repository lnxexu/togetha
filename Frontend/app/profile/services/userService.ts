<<<<<<< HEAD
import AsyncStorage from '@react-native-async-storage/async-storage';

export interface UserProfile {
    id: string;
    name: string;
    email: string;
    bio?: string;
    phone?: string;
    location?: string;
    profilePicture?: string;
    joinDate: string;
    tasksCompleted: number;
    notesCreated: number;
    studyStreak: number;
    learningHours: number;
}

class UserService {
    private static instance: UserService;
    private readonly STORAGE_KEY = '@user_profile';

    private constructor() {}

    static getInstance(): UserService {
        if (!UserService.instance) {
            UserService.instance = new UserService();
        }
        return UserService.instance;
    }

    async getUserProfile(): Promise<UserProfile | null> {
        try {
            const userData = await AsyncStorage.getItem(this.STORAGE_KEY);
            if (userData) {
                return JSON.parse(userData);
            }
            
            // Return default user if no data exists
            const defaultUser: UserProfile = {
                id: '1',
                name: 'John Doe',
                email: 'john.doe@example.com',
                bio: 'Computer Science student passionate about learning and productivity.',
                phone: '+1 (555) 123-4567',
                location: 'New York, NY',
                profilePicture: undefined,
                joinDate: 'January 2024',
                tasksCompleted: 24,
                notesCreated: 18,
                studyStreak: 7,
                learningHours: 42,
            };
            
            // Save default user to storage
            await this.updateUserProfile(defaultUser);
            return defaultUser;
        } catch (error) {
            console.error('Error getting user profile:', error);
            return null;
        }
    }

    async updateUserProfile(profile: UserProfile): Promise<boolean> {
        try {
            await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(profile));
            return true;
        } catch (error) {
            console.error('Error updating user profile:', error);
            return false;
        }
    }

    async updateUserStats(stats: {
        tasksCompleted?: number;
        notesCreated?: number;
        studyStreak?: number;
        learningHours?: number;
    }): Promise<boolean> {
        try {
            const currentProfile = await this.getUserProfile();
            if (!currentProfile) return false;

            const updatedProfile: UserProfile = {
                ...currentProfile,
                ...stats,
            };

            return await this.updateUserProfile(updatedProfile);
        } catch (error) {
            console.error('Error updating user stats:', error);
            return false;
        }
    }

    async incrementTasksCompleted(): Promise<boolean> {
        try {
            const currentProfile = await this.getUserProfile();
            if (!currentProfile) return false;

            return await this.updateUserStats({
                tasksCompleted: currentProfile.tasksCompleted + 1,
            });
        } catch (error) {
            console.error('Error incrementing tasks completed:', error);
            return false;
        }
    }

    async incrementNotesCreated(): Promise<boolean> {
        try {
            const currentProfile = await this.getUserProfile();
            if (!currentProfile) return false;

            return await this.updateUserStats({
                notesCreated: currentProfile.notesCreated + 1,
            });
        } catch (error) {
            console.error('Error incrementing notes created:', error);
            return false;
        }
    }

    async updateStudyStreak(days: number): Promise<boolean> {
        try {
            return await this.updateUserStats({
                studyStreak: days,
            });
        } catch (error) {
            console.error('Error updating study streak:', error);
            return false;
        }
    }

    async clearUserData(): Promise<boolean> {
        try {
            await AsyncStorage.removeItem(this.STORAGE_KEY);
            return true;
        } catch (error) {
            console.error('Error clearing user data:', error);
            return false;
        }
    }
}

export const userService = UserService.getInstance();
=======
import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, API_ENDPOINTS } from "../../../constants/ApiConfig";

export interface UserProfile {
  id?: string;
  username?: string;
  name?: string;
  email?: string;
  profilePicture?: string;
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

  async getUserInfo(): Promise<UserProfile> {
    try {
      return await this.apiRequest<UserProfile>(API_ENDPOINTS.USER_PROFILE);
    } catch (error) {
      console.error("Error fetching user info:", error);
      throw error;
    }
  }

  async getUserProfile(): Promise<UserProfile> {
    try {
      return await this.apiRequest<UserProfile>(API_ENDPOINTS.GET_USER_INFO);
    } catch (error) {
      console.error("Error fetching user profile:", error);
      throw error;
    }
  }

  async getUserProgress(): Promise<UserProgress> {
    try {
      return await this.apiRequest<UserProgress>(API_ENDPOINTS.USER_PROGRESS);
    } catch (error) {
      console.error("Error fetching user progress:", error);
      return {
        tasksCompleted: 0,
        notesCreated: 0,
        studyStreak: 0,
        learningHours: 0,
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
    
    // Add each field to the FormData (following the structure from myProfile.html)
    if (updates.name) formData.append('profile.full_name', updates.name);
    if (updates.email) formData.append('email', updates.email);
    if (updates.bio) formData.append('profile.bio', updates.bio);
    if (updates.location) formData.append('profile.address', updates.location);
    if (updates.phone) formData.append('profile.phone_number', updates.phone);
    
    // Direct fetch with FormData rather than using apiRequest which is JSON-specific
    const response = await fetch(`${API_URL}${API_ENDPOINTS.USER_PROFILE}`, {
      method: "PUT", 
      headers: {
        // 'Authorization': `Token ${token}`, 
      },
      body: formData,
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

async uploadProfilePicture(imageUri: string): Promise<{ profilePicture: string }> {
  const token = await this.getAuthToken();
  if (!token) {
    throw new Error('No authentication token found');
  }

  // Create form data for file upload
  const formData = new FormData();
  formData.append('profilePicture', {
    uri: imageUri,
    name: 'profile-picture.jpg',
    type: 'image/jpeg',
  } as any);

  // Uncommented and fixed the implementation to ensure a return value
  const response = await fetch(`${API_URL}${API_ENDPOINTS.UPLOAD_PROFILE_PICTURE}`, {
    method: 'POST',
    headers: {
      'Authorization': `Token ${token}`,
      // Do not set 'Content-Type' header; let fetch set it automatically for FormData
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(errorText || `Upload failed with status ${response.status}`);
  }

  return await response.json();
}

// Add this method to your userService

async updateProfilePicture(formData: FormData): Promise<UserProfile> {
  try {
    const token = await AsyncStorage.getItem('userToken');
    
    if (!token) {
      throw new Error('Authentication token not found');
    }
    
    const response = await fetch(`${API_URL}${API_ENDPOINTS.UPDATE_PROFILE_PICTURE}`, {
      method: 'POST',
      headers: {
        // 'Authorization': `Token ${token}`,
        // Don't set Content-Type here as it will be automatically set with the boundary
      },
      body: formData,
    });
    
    if (!response.ok) {
      throw new Error('Failed to update profile picture');
    }
    
    return await response.json();
  } catch (error) {
    console.error('Error updating profile picture:', error);
    throw error;
  }
}
}

export const userService = new UserService();
>>>>>>> kobe
