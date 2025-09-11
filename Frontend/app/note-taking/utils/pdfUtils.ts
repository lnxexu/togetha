import * as FileSystem from 'expo-file-system';

/**
 * Downloads a remote PDF and returns the local file URI.
 * @param remoteUrl The remote PDF URL (http/https)
 * @param customFileName Optional custom filename
 * @returns The local file URI (file://...)
 */
export async function downloadPDFToLocal(remoteUrl: string, customFileName?: string): Promise<string> {
  try {
    console.log('Downloading PDF from:', remoteUrl);
    
    // Extract filename from URL or use custom name
    let fileName = customFileName || remoteUrl.split('/').pop() || 'downloaded.pdf';
    
    // Ensure .pdf extension
    if (!fileName.toLowerCase().endsWith('.pdf')) {
      fileName += '.pdf';
    }
    
    // Create directory for PDF downloads if it doesn't exist
    const pdfDirectory = `${FileSystem.documentDirectory}pdfs/`;
    const dirInfo = await FileSystem.getInfoAsync(pdfDirectory);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(pdfDirectory, { intermediates: true });
    }
    
    const localPath = `${pdfDirectory}${fileName}`;
    
    // Check if file already exists locally
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (fileInfo.exists && fileInfo.size && fileInfo.size > 0) {
      console.log('PDF already exists locally at:', localPath);
      return localPath;
    }
    
    // Download the PDF
    console.log('Downloading to:', localPath);
    const downloadResult = await FileSystem.downloadAsync(remoteUrl, localPath);
    
    // Verify the download
    const downloadedFileInfo = await FileSystem.getInfoAsync(downloadResult.uri);
    if (!downloadedFileInfo.exists || downloadedFileInfo.size === 0) {
      throw new Error('Downloaded file is empty or corrupted');
    }
    
    console.log('PDF downloaded successfully:', downloadResult.uri, 'Size:', downloadedFileInfo.size, 'bytes');
    return downloadResult.uri;
    
  } catch (error) {
    console.error('Error downloading PDF:', error);
    throw new Error(`Failed to download PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Checks if a URI is a remote URL
 * @param uri The URI to check
 * @returns true if remote URL, false if local file
 */
export function isRemoteURL(uri: string): boolean {
  return uri.startsWith('http://') || uri.startsWith('https://');
}

/**
 * Gets the local path for a PDF, downloading it if it's remote
 * @param uri The PDF URI (local or remote)
 * @param fileName Optional custom filename
 * @returns Local file URI
 */
export async function getLocalPDFPath(uri: string, fileName?: string): Promise<string> {
  if (isRemoteURL(uri)) {
    return await downloadPDFToLocal(uri, fileName);
  }
  return uri; // Already local
}

/**
 * Clears cached PDF files
 * @returns Promise that resolves when cleanup is complete
 */
export async function clearPDFCache(): Promise<void> {
  try {
    const pdfDirectory = `${FileSystem.documentDirectory}pdfs/`;
    const dirInfo = await FileSystem.getInfoAsync(pdfDirectory);
    
    if (dirInfo.exists) {
      await FileSystem.deleteAsync(pdfDirectory, { idempotent: true });
      console.log('PDF cache cleared');
    }
  } catch (error) {
    console.error('Error clearing PDF cache:', error);
  }
}
