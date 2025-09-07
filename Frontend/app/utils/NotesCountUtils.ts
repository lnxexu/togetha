import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, API_ENDPOINTS } from "../../constants/ApiConfig";

/**
 * Utility class for managing notes count across the app
 */
export class NotesCountUtils {
  private static instance: NotesCountUtils;
  private listeners: Array<(count: number) => void> = [];

  private constructor() {}

  public static getInstance(): NotesCountUtils {
    if (!NotesCountUtils.instance) {
      NotesCountUtils.instance = new NotesCountUtils();
    }
    return NotesCountUtils.instance;
  }

  /**
   * Subscribe to notes count changes
   */
  public subscribe(listener: (count: number) => void): () => void {
    this.listeners.push(listener);
    
    // Return unsubscribe function
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  /**
   * Notify all listeners of count change
   */
  private notifyListeners(count: number) {
    this.listeners.forEach(listener => {
      try {
        listener(count);
      } catch (error) {
        console.error('Error in notes count listener:', error);
      }
    });
  }

  /**
   * Fetch the current notes count from server
   */
  public async fetchNotesCount(): Promise<number> {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        throw new Error("No auth token found");
      }

      const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTES}`, {
        headers: {
          Authorization: `Token ${token}`,
          "Cache-Control": "no-cache",
        },
      });

      if (response.ok) {
        const notes = await response.json();
        const count = notes.length;
        
        // Update cache
        await AsyncStorage.setItem("notesCount", count.toString());
        
        // Notify listeners
        this.notifyListeners(count);
        
        return count;
      } else {
        throw new Error(`Failed to fetch notes: ${response.status}`);
      }
    } catch (error) {
      console.error("Error fetching notes count:", error);
      
      // Try to get cached count as fallback
      const cachedCount = await AsyncStorage.getItem("notesCount");
      if (cachedCount) {
        const count = parseInt(cachedCount);
        this.notifyListeners(count);
        return count;
      }
      
      throw error;
    }
  }

  /**
   * Increment notes count (call when a note is created)
   */
  public async incrementCount(): Promise<void> {
    try {
      const currentCount = await this.getCachedCount();
      const newCount = currentCount + 1;
      
      // Update cache immediately for responsive UI
      await AsyncStorage.setItem("notesCount", newCount.toString());
      this.notifyListeners(newCount);
      
      // Fetch actual count from server to ensure accuracy
      setTimeout(() => {
        this.fetchNotesCount().catch(console.error);
      }, 100);
      
    } catch (error) {
      console.error("Error incrementing notes count:", error);
    }
  }

  /**
   * Decrement notes count (call when a note is deleted)
   */
  public async decrementCount(): Promise<void> {
    try {
      const currentCount = await this.getCachedCount();
      const newCount = Math.max(0, currentCount - 1);
      
      // Update cache immediately for responsive UI
      await AsyncStorage.setItem("notesCount", newCount.toString());
      this.notifyListeners(newCount);
      
      // Fetch actual count from server to ensure accuracy
      setTimeout(() => {
        this.fetchNotesCount().catch(console.error);
      }, 100);
      
    } catch (error) {
      console.error("Error decrementing notes count:", error);
    }
  }

  /**
   * Get cached notes count
   */
  public async getCachedCount(): Promise<number> {
    try {
      const cachedCount = await AsyncStorage.getItem("notesCount");
      return cachedCount ? parseInt(cachedCount) : 0;
    } catch (error) {
      console.error("Error getting cached notes count:", error);
      return 0;
    }
  }

  /**
   * Refresh notes count from server (call when screen comes into focus)
   */
  public async refreshCount(): Promise<number> {
    return this.fetchNotesCount();
  }

  /**
   * Clear cached count (useful for logout or data reset)
   */
  public async clearCache(): Promise<void> {
    try {
      await AsyncStorage.removeItem("notesCount");
      this.notifyListeners(0);
    } catch (error) {
      console.error("Error clearing notes count cache:", error);
    }
  }
}

// Export singleton instance
export const notesCountUtils = NotesCountUtils.getInstance();
