import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Utility class for managing folder cache across the app
 */
export class FolderCacheUtils {
  private static instance: FolderCacheUtils;
  private listeners: Array<() => void> = [];

  private constructor() {}

  public static getInstance(): FolderCacheUtils {
    if (!FolderCacheUtils.instance) {
      FolderCacheUtils.instance = new FolderCacheUtils();
    }
    return FolderCacheUtils.instance;
  }

  /**
   * Subscribe to folder cache invalidation events
   */
  public subscribe(listener: () => void): () => void {
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
   * Notify all listeners that folder cache should be refreshed
   */
  private notifyListeners() {
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch (error) {
        console.error('Error in folder cache listener:', error);
      }
    });
  }

  /**
   * Invalidate folder cache and notify listeners
   */
  public async invalidateCache(): Promise<void> {
    try {
      // Remove cached folder data
      await AsyncStorage.removeItem("notesFolders");
      
      // Notify all listeners to refresh
      this.notifyListeners();
    } catch (error) {
      console.error('Error invalidating folder cache:', error);
    }
  }

  /**
   * Clear all cached folder-related data
   */
  public async clearAllCache(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        "notesFolders",
        "lastFolderFetch",
      ]);
      
      // Notify all listeners to refresh
      this.notifyListeners();
    } catch (error) {
      console.error('Error clearing folder cache:', error);
    }
  }
}

// Export singleton instance
export const folderCacheUtils = FolderCacheUtils.getInstance();
