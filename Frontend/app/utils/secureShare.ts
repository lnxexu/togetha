import { Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as FileSystem from 'expo-file-system';

export const shareFileAsync = async (fileUri: string, options?: { mimeType?: string; dialogTitle?: string }) => {
  try {
    if (await Sharing.isAvailableAsync()) {
      await Sharing.shareAsync(fileUri, {
        mimeType: options?.mimeType,
        dialogTitle: options?.dialogTitle || 'Share File',
      });
    } else {
      // Fallback to RN Share with URL (may not attach file)
      await Share.share({ url: fileUri, title: options?.dialogTitle || 'Share File' });
    }
  } catch (error) {
    console.error('Error sharing file:', error);
    throw error;
  }
};