import AsyncStorage from "@react-native-async-storage/async-storage";
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert } from 'react-native';
import { progressService } from './progressService';

class UtilityService {
  
  /**
   * Export user data to a JSON file
   */
  async exportUserData(): Promise<void> {
    try {
      const userData = await progressService.exportUserData();
      
      const filename = `togetha_data_export_${new Date().toISOString().split('T')[0]}.json`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      
      await FileSystem.writeAsStringAsync(fileUri, userData);
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Export your Togetha data',
        });
      } else {
        Alert.alert(
          'Export Complete',
          `Your data has been exported to: ${fileUri}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error exporting data:', error);
      throw new Error('Failed to export data. Please try again.');
    }
  }

  /**
   * Clear all app cache and temporary files
   */
  async clearAppCache(): Promise<void> {
    try {
      // Clear AsyncStorage cache
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => 
        key.includes('cached') || 
        key.includes('temp') || 
        key.includes('last') ||
        key.includes('progress') ||
        key.includes('userProfile')
      );
      
      if (cacheKeys.length > 0) {
        await AsyncStorage.multiRemove(cacheKeys);
      }

      // Clear progress service cache
      await progressService.clearProgressCache();

      // Clear temporary files
      const documentDir = FileSystem.documentDirectory;
      if (documentDir) {
        const files = await FileSystem.readDirectoryAsync(documentDir);
        const tempFiles = files.filter(file => 
          file.includes('temp') || 
          file.includes('cache') ||
          file.endsWith('.tmp')
        );
        
        for (const tempFile of tempFiles) {
          try {
            await FileSystem.deleteAsync(`${documentDir}${tempFile}`, { idempotent: true });
          } catch (fileError) {
            console.warn(`Could not delete temp file ${tempFile}:`, fileError);
          }
        }
      }

      console.log('Cache cleared successfully');
    } catch (error) {
      console.error('Error clearing cache:', error);
      throw new Error('Failed to clear cache. Some files may still be cached.');
    }
  }

  /**
   * Get app cache size information
   */
  async getCacheInfo(): Promise<{ size: string; itemCount: number }> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const cacheKeys = keys.filter(key => 
        key.includes('cached') || 
        key.includes('temp') || 
        key.includes('last')
      );

      let totalSize = 0;
      for (const key of cacheKeys) {
        try {
          const value = await AsyncStorage.getItem(key);
          if (value) {
            totalSize += new Blob([value]).size;
          }
        } catch (error) {
          console.warn(`Could not read cache item ${key}:`, error);
        }
      }

      const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
      
      return {
        size: `${sizeInMB} MB`,
        itemCount: cacheKeys.length,
      };
    } catch (error) {
      console.error('Error getting cache info:', error);
      return { size: 'Unknown', itemCount: 0 };
    }
  }

  /**
   * Generate app diagnostic information
   */
  async generateDiagnosticInfo(): Promise<string> {
    try {
      const cacheInfo = await getCacheInfo();
      const keys = await AsyncStorage.getAllKeys();
      
      const diagnosticData = {
        timestamp: new Date().toISOString(),
        app_version: '1.0.0', // You can get this from app.json or constants
        platform: 'react-native',
        cache_info: cacheInfo,
        storage_keys_count: keys.length,
        available_features: [
          'task_management',
          'note_taking',
          'ai_chatbot',
          'progress_tracking',
          'user_profile'
        ],
        system_info: {
          document_directory: FileSystem.documentDirectory,
          bundle_directory: FileSystem.bundleDirectory,
        }
      };

      return JSON.stringify(diagnosticData, null, 2);
    } catch (error) {
      console.error('Error generating diagnostic info:', error);
      return JSON.stringify({
        error: 'Failed to generate diagnostic information',
        timestamp: new Date().toISOString()
      }, null, 2);
    }
  }

  /**
   * Contact support with diagnostic information
   */
  async contactSupport(userMessage?: string): Promise<void> {
    try {
      const diagnosticInfo = await this.generateDiagnosticInfo();
      const cacheInfo = await this.getCacheInfo();
      
      const supportData = {
        user_message: userMessage || 'User requested support',
        diagnostic_info: JSON.parse(diagnosticInfo),
        cache_info: cacheInfo,
        timestamp: new Date().toISOString(),
      };

      const filename = `togetha_support_${new Date().toISOString().split('T')[0]}.json`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(supportData, null, 2));
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Share diagnostic information with support',
        });
      } else {
        Alert.alert(
          'Support Information Generated',
          `Diagnostic information saved to: ${fileUri}\n\nPlease send this file to our support team.`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error contacting support:', error);
      throw new Error('Failed to generate support information. Please try again.');
    }
  }

  /**
   * Backup user settings
   */
  async backupUserSettings(): Promise<void> {
    try {
      const keys = await AsyncStorage.getAllKeys();
      const settingsKeys = keys.filter(key => 
        !key.includes('cached') && 
        !key.includes('temp') && 
        !key.includes('authToken') // Don't backup sensitive tokens
      );

      const settings: { [key: string]: string | null } = {};
      for (const key of settingsKeys) {
        settings[key] = await AsyncStorage.getItem(key);
      }

      const backupData = {
        backup_timestamp: new Date().toISOString(),
        app_version: '1.0.0',
        settings: settings,
      };

      const filename = `togetha_settings_backup_${new Date().toISOString().split('T')[0]}.json`;
      const fileUri = `${FileSystem.documentDirectory}${filename}`;
      
      await FileSystem.writeAsStringAsync(fileUri, JSON.stringify(backupData, null, 2));
      
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, {
          mimeType: 'application/json',
          dialogTitle: 'Backup your app settings',
        });
      } else {
        Alert.alert(
          'Backup Complete',
          `Settings backed up to: ${fileUri}`,
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error backing up settings:', error);
      throw new Error('Failed to backup settings. Please try again.');
    }
  }
}

// Helper function to get cache info (used in diagnostic)
async function getCacheInfo() {
  try {
    const keys = await AsyncStorage.getAllKeys();
    const cacheKeys = keys.filter(key => 
      key.includes('cached') || 
      key.includes('temp') || 
      key.includes('last')
    );

    let totalSize = 0;
    for (const key of cacheKeys) {
      try {
        const value = await AsyncStorage.getItem(key);
        if (value) {
          totalSize += new Blob([value]).size;
        }
      } catch (error) {
        console.warn(`Could not read cache item ${key}:`, error);
      }
    }

    const sizeInMB = (totalSize / (1024 * 1024)).toFixed(2);
    
    return {
      size: `${sizeInMB} MB`,
      itemCount: cacheKeys.length,
    };
  } catch (error) {
    console.error('Error getting cache info:', error);
    return { size: 'Unknown', itemCount: 0 };
  }
}

export const utilityService = new UtilityService();