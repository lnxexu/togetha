/**
 * Unified Download Utility
 * Provides a consistent download location for all file types across the app
 * Files are saved to the phone's Downloads folder or Photos/Gallery
 */

import * as FileSystem from "expo-file-system";
import * as MediaLibrary from "expo-media-library";
import { Platform, Alert } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { pushNotificationService } from "@/app/notifications/services/PushNotificationService";
import { showSuccessToast, showErrorToast, showInfoToast } from "@/app/utils/ToastUtils";

export type FileType = "pdf" | "jpeg" | "png" | "image";

interface DownloadOptions {
  fileUri: string;
  fileName: string;
  fileType: FileType;
  shareAfterSave?: boolean;
  showSuccessAlert?: boolean;
}

interface DownloadResult {
  success: boolean;
  assetUri?: string;
  error?: string;
}

// Persisted location key for Android SAF directory permission
const DOWNLOADS_DIR_URI_KEY = "togetha:android:downloadsDirUri";

// Try to save PDF using Android Storage Access Framework (reliable for Documents/Downloads)
const savePdfWithSAFAndroid = async (
  fileUri: string,
  fileName: string
): Promise<DownloadResult> => {
  try {
    // Ensure file exists
    const info = await FileSystem.getInfoAsync(fileUri);
    if (!info.exists) {
      return { success: false, error: "Source PDF not found" };
    }

    const SAF = FileSystem.StorageAccessFramework;

    // Reuse previously granted directory permission if present
    let dirUri = await AsyncStorage.getItem(DOWNLOADS_DIR_URI_KEY);

    // If no persisted dir, request once from user (system UI)
    if (!dirUri) {
      // One-time friendly guidance for the system directory picker
      showInfoToast("Select a folder (e.g., Downloads) to save PDFs");
      const perm = await SAF.requestDirectoryPermissionsAsync();
      if (!perm.granted || !perm.directoryUri) {
        return { success: false, error: "Directory permission not granted" };
      }
      dirUri = perm.directoryUri;
      await AsyncStorage.setItem(DOWNLOADS_DIR_URI_KEY, dirUri);
    }

    // Create a file in the picked directory
    const destUri = await SAF.createFileAsync(
      dirUri,
      sanitizeFileName(fileName),
      "application/pdf"
    );

    // Read source as base64 and write into SAF file
    const base64 = await FileSystem.readAsStringAsync(fileUri, {
      encoding: FileSystem.EncodingType.Base64,
    });
    await SAF.writeAsStringAsync(destUri, base64, {
      encoding: FileSystem.EncodingType.Base64,
    });

    return { success: true, assetUri: destUri };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Unknown SAF error";
    console.error("SAF save failed:", e);
    return { success: false, error: msg };
  }
};

const sanitizeFileName = (name: string): string => {
  // Remove path components and illegal characters for SAF file creation
  const justName = name.split("/").pop() || name;
  return justName.replace(/[:*?"<>|\\]/g, "_");
};

/**
 * Unified download function that saves files to phone's Downloads or Photos
 * - PDFs: Saved to Downloads/Documents (accessible via Files app)
 * - Images (JPEG/PNG): Saved to Photos/Gallery
 * 
 * @param options Download configuration
 * @returns Download result with success status and asset URI
 */
export const downloadFileToDevice = async (
  options: DownloadOptions
): Promise<DownloadResult> => {
  const {
    fileUri,
    fileName,
    fileType,
    shareAfterSave = false,
    showSuccessAlert = true,
  } = options;

  try {
    // Notify download started
    pushNotificationService.notifyDownloadStarted(fileName).catch(() => {});

    // Special handling for PDFs on Android: use Storage Access Framework
    if (fileType === "pdf" && Platform.OS === "android") {
      const safResult = await savePdfWithSAFAndroid(fileUri, fileName);
      if (safResult.success) {
        if (showSuccessAlert) {
          showSuccessToast("Saved to Downloads");
        }
        pushNotificationService
          .notifyDownloadComplete(fileName)
          .catch(() => {});
        // Optionally share
        if (shareAfterSave) {
          try {
            const Share = await import("expo-sharing");
            if (await Share.isAvailableAsync()) {
              await Share.shareAsync(safResult.assetUri!, {
                mimeType: getMimeType(fileType),
                dialogTitle: `Share ${fileName}`,
              });
            }
          } catch (err) {
            console.error("Share failed:", err);
          }
        }
        return safResult;
      }
      // If SAF failed due to permission, fall through to MediaLibrary as a secondary attempt
    }

    // Request permissions (writeOnly = true means write access, which includes read on iOS). MediaLibrary works for images and some docs on certain Android versions
    const { status } = await MediaLibrary.requestPermissionsAsync(true);
    if (status !== "granted") {
      // Show alert only for permission denial
      Alert.alert(
        "Permission Required",
        "Please allow access to save files to your device.",
        [{ text: "OK" }]
      );
      return {
        success: false,
        error: "Permission to access media library is required",
      };
    }

    // Ensure file URI is properly formatted
    const normalizedUri = fileUri.startsWith("file://")
      ? fileUri
      : `file://${fileUri}`;

    // Create asset in media library
    // This automatically saves to the appropriate location:
    // - Images (jpeg/png) -> Photos/Gallery
    // - PDFs -> Downloads/Documents (depending on Android version)
    const asset = await MediaLibrary.createAssetAsync(normalizedUri);

    // Try to create/add to app-specific album for better organization
    try {
      const albumName = "Togetha";
      const existingAlbum = await MediaLibrary.getAlbumAsync(albumName);
      
      if (existingAlbum) {
        await MediaLibrary.addAssetsToAlbumAsync([asset], existingAlbum, false);
      } else {
        await MediaLibrary.createAlbumAsync(albumName, asset, false);
      }
    } catch (albumErr) {
      // Non-fatal if album creation fails
      console.warn("Could not create/add to album:", albumErr);
    }

  // Notify completion
    pushNotificationService.notifyDownloadComplete(fileName).catch(() => {});

    // Show success message - use toast for non-intrusive feedback
    if (showSuccessAlert) {
      const locationText = fileType === "pdf" 
        ? "Downloads"
        : "Photos";
      
      showSuccessToast(`Saved to ${locationText}`);
    }

    // Handle share if requested
    if (shareAfterSave) {
      try {
        const Share = await import("expo-sharing");
        if (await Share.isAvailableAsync()) {
          await Share.shareAsync(asset.uri, {
            mimeType: getMimeType(fileType),
            dialogTitle: `Share ${fileName}`,
          });
        }
      } catch (err) {
        console.error("Share failed:", err);
      }
    }

    return {
      success: true,
      assetUri: asset.uri,
    };
  } catch (error) {
    console.error("Download failed:", error);
    
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    
    // Only show error alert for permission issues, use toast for other errors
    if (showSuccessAlert) {
      if (errorMessage.includes("permission") || errorMessage.includes("Permission")) {
        Alert.alert(
          "Permission Required",
          "Please allow access to save files to your device.",
          [{ text: "OK" }]
        );
      } else {
        showErrorToast(`Failed to save: ${errorMessage}`);
      }
    }

    return {
      success: false,
      error: errorMessage,
    };
  }
};

/**
 * Helper to get MIME type for file type
 */
const getMimeType = (fileType: FileType): string => {
  switch (fileType) {
    case "pdf":
      return "application/pdf";
    case "jpeg":
      return "image/jpeg";
    case "png":
      return "image/png";
    case "image":
      return "image/*";
    default:
      return "application/octet-stream";
  }
};

/**
 * Legacy compatibility function for saveImageToPhotos
 * @deprecated Use downloadFileToDevice instead
 */
export const saveImageToPhotos = async (
  fileUri: string,
  shareAfterSave = false
): Promise<string | null> => {
  const fileName = fileUri.split("/").pop() || "image.png";
  const fileType: FileType = fileName.endsWith(".jpeg") || fileName.endsWith(".jpg")
    ? "jpeg"
    : "png";

  const result = await downloadFileToDevice({
    fileUri,
    fileName,
    fileType,
    shareAfterSave,
    showSuccessAlert: true,
  });

  return result.success ? result.assetUri || null : null;
};

/**
 * Save PDF with annotations to Downloads
 */
export const savePDFToDownloads = async (
  pdfUri: string,
  fileName: string,
  shareAfterSave = false
): Promise<DownloadResult> => {
  return downloadFileToDevice({
    fileUri: pdfUri,
    fileName,
    fileType: "pdf",
    shareAfterSave,
    showSuccessAlert: true,
  });
};

/**
 * Save drawing as JPEG to Photos
 */
export const saveDrawingAsJPEG = async (
  imageUri: string,
  fileName: string,
  shareAfterSave = false
): Promise<DownloadResult> => {
  return downloadFileToDevice({
    fileUri: imageUri,
    fileName,
    fileType: "jpeg",
    shareAfterSave,
    showSuccessAlert: true,
  });
};

/**
 * Save drawing as PNG to Photos
 */
export const saveDrawingAsPNG = async (
  imageUri: string,
  fileName: string,
  shareAfterSave = false
): Promise<DownloadResult> => {
  return downloadFileToDevice({
    fileUri: imageUri,
    fileName,
    fileType: "png",
    shareAfterSave,
    showSuccessAlert: true,
  });
};
