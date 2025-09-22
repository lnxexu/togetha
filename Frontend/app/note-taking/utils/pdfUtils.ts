import * as FileSystem from 'expo-file-system';
import { PDFDocument, rgb, PDFPage, PDFFont } from 'pdf-lib';

// Define annotation interfaces for PDF embedding
export interface PDFAnnotation {
  id: string;
  type: "highlight" | "note" | "text" | "pen" | "brush" | "pencil";
  page: number;
  x: number;
  y: number;
  width?: number;
  height?: number;
  color: string;
  text?: string;
  path?: string;
  strokeWidth?: number;
  pressure?: number[];
  timestamp: number;
}

// Enhanced interfaces for large PDF support
export interface PDFProcessingProgress {
  stage: 'downloading' | 'validating' | 'processing' | 'embedding' | 'saving';
  progress: number; // 0-100
  message: string;
  bytesProcessed?: number;
  totalBytes?: number;
}

export interface PDFMemoryInfo {
  availableMemory: number;
  usedMemory: number;
  fileSize: number;
  recommendChunking: boolean;
}

export interface PDFChunkInfo {
  chunkSize: number;
  totalChunks: number;
  currentChunk: number;
}

export interface PDFValidationResult {
  isValid: boolean;
  fileSize: number;
  pageCount?: number;
  needsChunking: boolean;
  estimatedMemoryUsage: number;
  error?: string;
}

// Configuration for large PDF handling
export const PDF_CONFIG = {
  MAX_MEMORY_USAGE: 512 * 1024 * 1024, // 512MB max memory usage
  CHUNK_SIZE: 64 * 1024 * 1024, // 64MB chunks
  MAX_FILE_SIZE: 2 * 1024 * 1024 * 1024, // 2GB max file size
  CONCURRENT_CHUNKS: 2, // Process 2 chunks simultaneously
  VALIDATION_TIMEOUT: 30000, // 30 seconds timeout for validation
  PROCESSING_TIMEOUT: 300000, // 5 minutes timeout for processing
};

/**
 * Format file size in human readable format
 * @param bytes File size in bytes
 * @returns Formatted file size string
 */
export function formatFileSize(bytes: number): string {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

/**
 * Get file size safely from FileInfo
 * @param fileInfo FileInfo object from FileSystem
 * @returns File size in bytes or 0 if not available
 */
function getFileSize(fileInfo: FileSystem.FileInfo): number {
  return 'size' in fileInfo ? fileInfo.size || 0 : 0;
}

/**
 * Enhanced PDF validation with memory and size checks
 * @param uri The PDF URI to validate
 * @returns Detailed validation result with recommendations
 */
export async function validatePDFForAnnotation(uri: string): Promise<PDFValidationResult> {
  try {
    console.log('🔍 Validating PDF for annotation support:', uri);
    
    // Check file existence and basic info
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      return {
        isValid: false,
        fileSize: 0,
        needsChunking: false,
        estimatedMemoryUsage: 0,
        error: 'File does not exist'
      };
    }

    const fileSize = getFileSize(fileInfo);
    console.log(`📊 File size: ${formatFileSize(fileSize)}`);

    // Check if file is too large
    if (fileSize > PDF_CONFIG.MAX_FILE_SIZE) {
      return {
        isValid: false,
        fileSize,
        needsChunking: false,
        estimatedMemoryUsage: fileSize * 3, // Rough estimate
        error: `File too large: ${formatFileSize(fileSize)}. Maximum supported: ${formatFileSize(PDF_CONFIG.MAX_FILE_SIZE)}`
      };
    }

    // Estimate memory usage (PDF processing typically needs 2-3x file size in memory)
    const estimatedMemoryUsage = fileSize * 2.5;
    const needsChunking = estimatedMemoryUsage > PDF_CONFIG.MAX_MEMORY_USAGE || fileSize > 100 * 1024 * 1024; // 100MB+

    // Quick PDF validation by reading header
    try {
      const headerSize = Math.min(1024, fileSize); // Read first 1KB
      const headerData = await FileSystem.readAsStringAsync(uri, {
        encoding: FileSystem.EncodingType.Base64,
        length: headerSize,
        position: 0
      });
      
      const headerBytes = atob(headerData);
      if (!headerBytes.startsWith('%PDF-')) {
        return {
          isValid: false,
          fileSize,
          needsChunking,
          estimatedMemoryUsage,
          error: 'Invalid PDF format - missing PDF header'
        };
      }
      
      console.log('✅ PDF header validation successful');
    } catch (error) {
      console.error('Header validation failed:', error);
      return {
        isValid: false,
        fileSize,
        needsChunking,
        estimatedMemoryUsage,
        error: 'Cannot read PDF file header'
      };
    }

    // For large files, do basic structure validation without loading entire file
    let pageCount: number | undefined;
    if (fileSize < 50 * 1024 * 1024) { // Only for files < 50MB
      try {
        // Quick page count estimation by scanning for page objects
        pageCount = await estimatePageCountQuick(uri);
      } catch (error) {
        console.warn('Page count estimation failed:', error);
      }
    }

    return {
      isValid: true,
      fileSize,
      pageCount,
      needsChunking,
      estimatedMemoryUsage,
    };

  } catch (error) {
    console.error('PDF validation failed:', error);
    return {
      isValid: false,
      fileSize: 0,
      needsChunking: false,
      estimatedMemoryUsage: 0,
      error: error instanceof Error ? error.message : 'Unknown validation error'
    };
  }
}

/**
 * Quick page count estimation without loading entire PDF
 * @param uri PDF file URI
 * @returns Estimated page count
 */
async function estimatePageCountQuick(uri: string): Promise<number> {
  try {
    // Read a sample of the PDF to estimate page count
    const fileInfo = await FileSystem.getInfoAsync(uri);
    const fileSize = getFileSize(fileInfo);
    const sampleSize = Math.min(fileSize, 500 * 1024); // Read up to 500KB
    
    const sampleData = await FileSystem.readAsStringAsync(uri, {
      encoding: FileSystem.EncodingType.UTF8,
      length: sampleSize
    });
    
    // Count occurrences of "/Type /Page" which indicates page objects
    const pageMatches = sampleData.match(/\/Type\s*\/Page(?!\w)/g);
    const estimatedPages = pageMatches ? pageMatches.length : 1;
    
    // If we found pages in the sample, extrapolate for the full file
    if (estimatedPages > 0 && sampleSize < fileSize) {
      const ratio = fileSize / sampleSize;
      return Math.max(1, Math.round(estimatedPages * ratio));
    }
    
    return Math.max(1, estimatedPages);
    
  } catch (error) {
    console.warn('Quick page estimation failed:', error);
    return 1; // Default to 1 page
  }
}

/**
 * Enhanced PDF download with progress tracking and chunked processing
 * @param remoteUrl The remote PDF URL
 * @param customFileName Optional custom filename
 * @param onProgress Progress callback
 * @returns Local file URI and processing info
 */
export async function downloadPDFToLocalEnhanced(
  remoteUrl: string, 
  customFileName?: string,
  onProgress?: (progress: PDFProcessingProgress) => void,
  fetchHeaders?: HeadersInit
): Promise<{ uri: string; fileSize: number; needsChunking: boolean }> {
  try {
    onProgress?.({
      stage: 'downloading',
      progress: 0,
      message: 'Starting PDF download...'
    });

    console.log('📥 Enhanced PDF download from:', remoteUrl);
    
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
    
    // Check if file already exists locally and is valid
    const fileInfo = await FileSystem.getInfoAsync(localPath);
    if (fileInfo.exists && fileInfo.size && fileInfo.size > 0) {
      console.log('📁 PDF already exists locally, validating...');
      const validation = await validatePDFForAnnotation(localPath);
      if (validation.isValid) {
        onProgress?.({
          stage: 'downloading',
          progress: 100,
          message: 'Using cached PDF file'
        });
        return { 
          uri: localPath, 
          fileSize: validation.fileSize,
          needsChunking: validation.needsChunking 
        };
      }
    }
    
    onProgress?.({
      stage: 'downloading',
      progress: 25,
      message: 'Downloading PDF file...'
    });
    
    // Do a quick HTTP check (HEAD) to ensure the remote resource exists and is a PDF
    try {
      const headResp = await fetch(remoteUrl, { method: 'HEAD', headers: fetchHeaders });
      if (!headResp.ok) {
        const statusText = headResp.statusText || '';
        throw new Error(`Remote resource not available. HTTP ${headResp.status} ${statusText}`);
      }

      const contentType = headResp.headers.get('content-type') || '';
      const contentLength = headResp.headers.get('content-length');
      if (!contentType.toLowerCase().includes('pdf')) {
        console.warn('Remote resource content-type is not PDF:', contentType);
        // continue but mark as potentially invalid — downstream validation will fail if not a PDF
      }
      if (contentLength) {
        const len = parseInt(contentLength, 10);
        if (!isNaN(len)) {
          onProgress?.({ stage: 'downloading', progress: 10, message: `Remote file size: ${formatFileSize(len)}`, totalBytes: len });
        }
      }
    } catch (err) {
      // If HEAD fails (some servers block it), try a lightweight GET for the first bytes
      try {
        const getResp = await fetch(remoteUrl, { method: 'GET', headers: fetchHeaders });
        if (!getResp.ok) {
          throw new Error(`Remote resource not available. HTTP ${getResp.status}`);
        }
        const ct = getResp.headers.get('content-type') || '';
        if (!ct.toLowerCase().includes('pdf')) {
          console.warn('Remote GET content-type not PDF:', ct);
        }
      } catch (err2) {
        throw new Error(`Remote file check failed: ${(err2 && (err2 as Error).message) || err}`);
      }
    }

    // Download the PDF with progress tracking
    // Normalize headers to plain object expected by expo-file-system
    const normalizedHeaders: Record<string, string> = {};
    if (fetchHeaders) {
      if (fetchHeaders instanceof Headers) {
        fetchHeaders.forEach((value, key) => {
          normalizedHeaders[key] = value;
        });
      } else if (Array.isArray(fetchHeaders)) {
        (fetchHeaders as [string, string][]).forEach(([k, v]) => {
          normalizedHeaders[k] = v;
        });
      } else {
        Object.assign(normalizedHeaders, fetchHeaders as Record<string, string>);
      }
    }

    const downloadResumable = FileSystem.createDownloadResumable(
      remoteUrl,
      localPath,
      { headers: normalizedHeaders },
      (downloadProgress) => {
        const progress = Math.round(
          (downloadProgress.totalBytesWritten / downloadProgress.totalBytesExpectedToWrite) * 75 + 25
        );
        onProgress?.({
          stage: 'downloading',
          progress: Math.min(progress, 100),
          message: `Downloading PDF: ${Math.round(progress)}%`,
          bytesProcessed: downloadProgress.totalBytesWritten,
          totalBytes: downloadProgress.totalBytesExpectedToWrite
        });
      }
    );
    
    const downloadResult = await downloadResumable.downloadAsync();
    if (!downloadResult) {
      throw new Error('Download failed - no result returned');
    }
    
    onProgress?.({
      stage: 'validating',
      progress: 100,
      message: 'Validating downloaded PDF...'
    });
    
    // Validate the downloaded file
    const validation = await validatePDFForAnnotation(downloadResult.uri);
    if (!validation.isValid) {
      await FileSystem.deleteAsync(downloadResult.uri, { idempotent: true });
      throw new Error(`Invalid PDF downloaded: ${validation.error}`);
    }
    
    console.log(`✅ PDF downloaded successfully: ${formatFileSize(validation.fileSize)}`);
    
    return { 
      uri: downloadResult.uri, 
      fileSize: validation.fileSize,
      needsChunking: validation.needsChunking 
    };
    
  } catch (error) {
    console.error('❌ Enhanced PDF download failed:', error);
    onProgress?.({
      stage: 'downloading',
      progress: 0,
      message: `Download failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
    throw new Error(`Failed to download PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Legacy function - now delegates to enhanced version
 */
export async function downloadPDFToLocal(remoteUrl: string, customFileName?: string): Promise<string> {
  const result = await downloadPDFToLocalEnhanced(remoteUrl, customFileName);
  return result.uri;
}

/**
 * Gets the local path for a PDF, downloading it if it's remote (legacy version)
 * @param uri The PDF URI (local or remote)
 * @param fileName Optional custom filename
 * @returns Local file URI
 */
export async function getLocalPDFPath(uri: string, fileName?: string): Promise<string> {
  const result = await getLocalPDFPathEnhanced(uri, fileName);
  return result.uri;
}

/**
 * Enhanced memory management and large file support utilities
 */
export class PDFProcessingManager {
  private static instance: PDFProcessingManager;
  private processingQueue: Array<{ id: string; promise: Promise<any> }> = [];
  private memoryUsage: number = 0;

  public static getInstance(): PDFProcessingManager {
    if (!PDFProcessingManager.instance) {
      PDFProcessingManager.instance = new PDFProcessingManager();
    }
    return PDFProcessingManager.instance;
  }

  /**
   * Queue PDF processing to manage memory usage
   */
  async queueProcessing<T>(id: string, processingFunction: () => Promise<T>): Promise<T> {
    // Wait for memory to be available
    while (this.memoryUsage > PDF_CONFIG.MAX_MEMORY_USAGE * 0.8) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    const promise = processingFunction();
    this.processingQueue.push({ id, promise });
    
    try {
      this.memoryUsage += PDF_CONFIG.MAX_MEMORY_USAGE * 0.3; // Estimate
      const result = await promise;
      return result;
    } finally {
      this.memoryUsage -= PDF_CONFIG.MAX_MEMORY_USAGE * 0.3;
      this.processingQueue = this.processingQueue.filter(item => item.id !== id);
    }
  }

  /**
   * Get current memory usage estimate
   */
  getMemoryUsage(): number {
    return this.memoryUsage;
  }

  /**
   * Clean up processing queue
   */
  cleanup(): void {
    this.processingQueue = [];
    this.memoryUsage = 0;
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
 * @param onProgress Optional progress callback
 * @returns Local file URI and processing info
 */
export async function getLocalPDFPathEnhanced(
  uri: string, 
  fileName?: string,
  onProgress?: (progress: PDFProcessingProgress) => void
  ,
  fetchHeaders?: HeadersInit
): Promise<{ uri: string; fileSize: number; needsChunking: boolean }> {
  if (isRemoteURL(uri)) {
    return await downloadPDFToLocalEnhanced(uri, fileName, onProgress, fetchHeaders);
  }
  
  // For local files, validate and return info
  const validation = await validatePDFForAnnotation(uri);
  if (!validation.isValid) {
    throw new Error(`Invalid local PDF: ${validation.error}`);
  }
  
  return { 
    uri, 
    fileSize: validation.fileSize,
    needsChunking: validation.needsChunking 
  };
}

/**
 * Process PDF in chunks for large files to manage memory usage
 * @param pdfUri URI of the PDF file
 * @param chunkInfo Chunking configuration
 * @param onProgress Progress callback
 * @returns Processed PDF info
 */
async function processPDFInChunks(
  pdfUri: string,
  chunkInfo: PDFChunkInfo,
  onProgress?: (progress: PDFProcessingProgress) => void
): Promise<{ pageCount: number; totalSize: number }> {
  try {
    console.log(`🧩 Processing PDF in ${chunkInfo.totalChunks} chunks`);
    let totalPageCount = 0;
    let totalSize = 0;
    
    for (let i = 0; i < chunkInfo.totalChunks; i++) {
      onProgress?.({
        stage: 'processing',
        progress: Math.round((i / chunkInfo.totalChunks) * 100),
        message: `Processing chunk ${i + 1}/${chunkInfo.totalChunks}...`
      });
      
      const startOffset = i * chunkInfo.chunkSize;
      const chunkData = await FileSystem.readAsStringAsync(pdfUri, {
        encoding: FileSystem.EncodingType.Base64,
        position: startOffset,
        length: chunkInfo.chunkSize
      });
      
      totalSize += chunkData.length;
      
      // For now, we estimate pages from chunk size
      // In a full implementation, you'd parse PDF structure
      const estimatedPagesInChunk = Math.ceil(chunkData.length / (50 * 1024)); // Rough estimate
      totalPageCount += estimatedPagesInChunk;
      
      // Add small delay to prevent blocking UI
      if (i % 10 === 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }
    }
    
    return { pageCount: totalPageCount, totalSize };
    
  } catch (error) {
    console.error('Chunked processing failed:', error);
    throw error;
  }
}

/**
 * Enhanced PDF annotation embedding with chunked processing for large files
 * @param originalPdfUri The URI of the original PDF file
 * @param annotations Array of annotations to embed
 * @param options Processing options
 * @param onProgress Progress callback
 * @returns Promise that resolves to the new annotated PDF file URI
 */
export async function embedAnnotationsInPDFEnhanced(
  originalPdfUri: string,
  annotations: PDFAnnotation[],
  options: {
    outputFileName?: string;
    useChunkedProcessing?: boolean;
    maxMemoryUsage?: number;
  } = {},
  onProgress?: (progress: PDFProcessingProgress) => void
): Promise<string> {
  try {
    console.log('🎨 Starting enhanced PDF annotation embedding...');
    console.log('📍 Original PDF:', originalPdfUri);
    console.log('📝 Annotations to embed:', annotations.length);

    onProgress?.({
      stage: 'validating',
      progress: 10,
      message: 'Validating PDF and annotations...'
    });

    // Validate the PDF first
    const validation = await validatePDFForAnnotation(originalPdfUri);
    if (!validation.isValid) {
      throw new Error(`Invalid PDF: ${validation.error}`);
    }

    const useChunking = options.useChunkedProcessing ?? validation.needsChunking;
    console.log(`📊 PDF size: ${formatFileSize(validation.fileSize)}, Use chunking: ${useChunking}`);

    if (useChunking) {
      return await embedAnnotationsChunked(originalPdfUri, annotations, validation, options, onProgress);
    } else {
      return await embedAnnotationsInMemory(originalPdfUri, annotations, options, onProgress);
    }

  } catch (error) {
    console.error('❌ Enhanced annotation embedding failed:', error);
    onProgress?.({
      stage: 'processing',
      progress: 0,
      message: `Failed: ${error instanceof Error ? error.message : 'Unknown error'}`
    });
    throw new Error(`Failed to embed annotations in PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Embed annotations using chunked processing for large PDFs
 */
async function embedAnnotationsChunked(
  originalPdfUri: string,
  annotations: PDFAnnotation[],
  validation: PDFValidationResult,
  options: any,
  onProgress?: (progress: PDFProcessingProgress) => void
): Promise<string> {
  
  onProgress?.({
    stage: 'processing',
    progress: 20,
    message: 'Preparing chunked processing...'
  });

  // Calculate chunk configuration
  const chunkSize = Math.min(PDF_CONFIG.CHUNK_SIZE, Math.floor(validation.fileSize / 10));
  const totalChunks = Math.ceil(validation.fileSize / chunkSize);
  
  const chunkInfo: PDFChunkInfo = {
    chunkSize,
    totalChunks,
    currentChunk: 0
  };

  console.log(`🧩 Chunked processing: ${totalChunks} chunks of ${formatFileSize(chunkSize)} each`);

  // Process PDF structure in chunks to understand layout
  onProgress?.({
    stage: 'processing',
    progress: 30,
    message: 'Analyzing PDF structure...'
  });

  const { pageCount } = await processPDFInChunks(originalPdfUri, chunkInfo, onProgress);
  
  onProgress?.({
    stage: 'processing',
    progress: 50,
    message: `Processing ${pageCount} pages with annotations...`
  });

  // For chunked processing, we need to use a different approach
  // Create a temporary working directory
  const workDir = `${FileSystem.documentDirectory}pdf_temp_${Date.now()}/`;
  await FileSystem.makeDirectoryAsync(workDir, { intermediates: true });

  try {
    // For now, fallback to memory processing but with progress tracking
    // In a full implementation, you'd process chunks separately
    const result = await embedAnnotationsInMemory(originalPdfUri, annotations, options, (progress) => {
      onProgress?.({
        ...progress,
        progress: 50 + (progress.progress * 0.5) // Scale progress from 50-100%
      });
    });

    return result;

  } finally {
    // Clean up temporary directory
    try {
      await FileSystem.deleteAsync(workDir, { idempotent: true });
    } catch (error) {
      console.warn('Failed to cleanup temp directory:', error);
    }
  }
}

/**
 * Embed annotations in memory (for smaller PDFs)
 */
async function embedAnnotationsInMemory(
  originalPdfUri: string,
  annotations: PDFAnnotation[],
  options: any,
  onProgress?: (progress: PDFProcessingProgress) => void
): Promise<string> {
  
  onProgress?.({
    stage: 'processing',
    progress: 10,
    message: 'Loading PDF into memory...'
  });

  // Read the original PDF file
  const pdfBytes = await FileSystem.readAsStringAsync(originalPdfUri, {
    encoding: FileSystem.EncodingType.Base64,
  });

  onProgress?.({
    stage: 'processing',
    progress: 30,
    message: 'Parsing PDF structure...'
  });

  const pdfArrayBuffer = Uint8Array.from(atob(pdfBytes), (c) =>
    c.charCodeAt(0)
  ).buffer;

  // Load the PDF document
  const pdfDoc = await PDFDocument.load(pdfArrayBuffer);
  const pages = pdfDoc.getPages();
  console.log('📄 PDF loaded, pages:', pages.length);

  onProgress?.({
    stage: 'embedding',
    progress: 50,
    message: 'Embedding annotations...'
  });

  // Embed a standard font for text annotations
  const font = await pdfDoc.embedFont('Helvetica');

  // Group annotations by page
  const annotationsByPage = groupAnnotationsByPage(annotations);

  // Process each page that has annotations
  let processedPages = 0;
  for (const [pageNum, pageAnnotations] of Object.entries(annotationsByPage)) {
    const pageIndex = parseInt(pageNum) - 1; // Convert to 0-based index
    if (pageIndex >= 0 && pageIndex < pages.length) {
      const page = pages[pageIndex];
      console.log(`📝 Processing page ${pageNum} with ${pageAnnotations.length} annotations`);
      
      await embedAnnotationsOnPage(page, pageAnnotations, font);
      
      processedPages++;
      onProgress?.({
        stage: 'embedding',
        progress: 50 + Math.round((processedPages / Object.keys(annotationsByPage).length) * 30),
        message: `Processed page ${pageNum}/${pages.length}...`
      });
    }
  }

  onProgress?.({
    stage: 'saving',
    progress: 85,
    message: 'Generating annotated PDF...'
  });

  // Save the modified PDF
  const modifiedPdfBytes = await pdfDoc.save();

  // Generate output filename
  const originalFilename = originalPdfUri.split('/').pop() || 'document.pdf';
  const baseName = originalFilename.replace('.pdf', '');
  const finalOutputName = options.outputFileName || `annotated_${Date.now()}_${baseName}.pdf`;

  // Ensure PDF directory exists
  const pdfDirectory = `${FileSystem.documentDirectory}pdfs/`;
  const dirInfo = await FileSystem.getInfoAsync(pdfDirectory);
  if (!dirInfo.exists) {
    await FileSystem.makeDirectoryAsync(pdfDirectory, { intermediates: true });
  }

  const outputPath = `${pdfDirectory}${finalOutputName}`;

  onProgress?.({
    stage: 'saving',
    progress: 95,
    message: 'Saving annotated PDF...'
  });

  // Convert Uint8Array to base64 for saving
  const base64String = btoa(String.fromCharCode(...Array.from(modifiedPdfBytes)));
  await FileSystem.writeAsStringAsync(outputPath, base64String, {
    encoding: FileSystem.EncodingType.Base64,
  });

  onProgress?.({
    stage: 'saving',
    progress: 100,
    message: 'Annotation embedding completed!'
  });

  console.log('✅ Annotated PDF saved to:', outputPath);
  return outputPath;
}

/**
 * Legacy function - now delegates to enhanced version
 */
export async function embedAnnotationsInPDF(
  originalPdfUri: string,
  annotations: PDFAnnotation[],
  outputFileName?: string
): Promise<string> {
  return embedAnnotationsInPDFEnhanced(originalPdfUri, annotations, { outputFileName });
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

/**
 * Enhanced cleanup with memory management
 * @param olderThanDays Clean files older than specified days
 * @param maxCacheSize Maximum cache size in bytes
 */
export async function clearPDFCacheEnhanced(olderThanDays: number = 7, maxCacheSize: number = 1024 * 1024 * 1024): Promise<void> {
  try {
    const pdfDirectory = `${FileSystem.documentDirectory}pdfs/`;
    const dirInfo = await FileSystem.getInfoAsync(pdfDirectory);
    
    if (!dirInfo.exists) return;

    console.log('🧹 Starting enhanced PDF cache cleanup...');
    
    // Read directory contents
    const files = await FileSystem.readDirectoryAsync(pdfDirectory);
    const fileInfos: Array<{ uri: string; size: number; modTime: number }> = [];
    
    let totalCacheSize = 0;
    
    // Gather file information
    for (const fileName of files) {
      const filePath = `${pdfDirectory}${fileName}`;
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      
      if (fileInfo.exists && !fileInfo.isDirectory) {
        const fileSize = getFileSize(fileInfo);
        const modTime = 'modificationTime' in fileInfo ? fileInfo.modificationTime || Date.now() : Date.now();
        
        fileInfos.push({
          uri: filePath,
          size: fileSize,
          modTime
        });
        
        totalCacheSize += fileSize;
      }
    }
    
    console.log(`📊 Found ${fileInfos.length} cached files, total size: ${formatFileSize(totalCacheSize)}`);
    
    // Sort by modification time (oldest first)
    fileInfos.sort((a, b) => a.modTime - b.modTime);
    
    const cutoffTime = Date.now() - (olderThanDays * 24 * 60 * 60 * 1000);
    let deletedFiles = 0;
    let freedSpace = 0;
    
    for (const fileInfo of fileInfos) {
      let shouldDelete = false;
      
      // Delete if older than cutoff
      if (fileInfo.modTime < cutoffTime) {
        shouldDelete = true;
        console.log(`🗑️  Deleting old file: ${fileInfo.uri.split('/').pop()}`);
      }
      // Delete if cache is too large
      else if (totalCacheSize > maxCacheSize) {
        shouldDelete = true;
        console.log(`🗑️  Deleting to reduce cache size: ${fileInfo.uri.split('/').pop()}`);
      }
      
      if (shouldDelete) {
        try {
          await FileSystem.deleteAsync(fileInfo.uri);
          deletedFiles++;
          freedSpace += fileInfo.size;
          totalCacheSize -= fileInfo.size;
        } catch (error) {
          console.warn(`Failed to delete ${fileInfo.uri}:`, error);
        }
      }
    }
    
    console.log(`✅ Cache cleanup completed: ${deletedFiles} files deleted, ${formatFileSize(freedSpace)} freed`);
    
  } catch (error) {
    console.error('Enhanced cache cleanup failed:', error);
  }
}

/**
 * Groups annotations by page number
 */
function groupAnnotationsByPage(annotations: PDFAnnotation[]): Record<number, PDFAnnotation[]> {
  return annotations.reduce((acc, annotation) => {
    if (!acc[annotation.page]) {
      acc[annotation.page] = [];
    }
    acc[annotation.page].push(annotation);
    return acc;
  }, {} as Record<number, PDFAnnotation[]>);
}

/**
 * Embeds annotations on a specific PDF page
 */
async function embedAnnotationsOnPage(
  page: PDFPage, 
  annotations: PDFAnnotation[], 
  font: PDFFont
): Promise<void> {
  const { width, height } = page.getSize();
  console.log('Page dimensions:', { width, height });

  for (const annotation of annotations) {
    try {
      await embedSingleAnnotation(page, annotation, font, width, height);
    } catch (error) {
      console.warn(`Failed to embed annotation ${annotation.id}:`, error);
    }
  }
}

/**
 * Embeds a single annotation on the page
 */
async function embedSingleAnnotation(
  page: PDFPage,
  annotation: PDFAnnotation,
  font: PDFFont,
  pageWidth: number,
  pageHeight: number
): Promise<void> {
  const pdfColor = hexToRgb(annotation.color);

  // Convert normalized coordinates (0-1) to PDF coordinates
  const pdfX = annotation.x * pageWidth;
  const pdfY = pageHeight - (annotation.y * pageHeight); // PDF coordinates are from bottom-left

  switch (annotation.type) {
    case 'highlight':
      if (annotation.path) {
        // Freehand highlight - draw as path
        await embedPathAnnotation(page, annotation, pdfColor, pageWidth, pageHeight);
      } else {
        // Traditional rectangle highlight
        const rectWidth = (annotation.width || 100) * pageWidth / 100;
        const rectHeight = annotation.height || 20;
        
        page.drawRectangle({
          x: pdfX,
          y: pdfY - rectHeight,
          width: rectWidth,
          height: rectHeight,
          color: rgb(pdfColor.r / 255, pdfColor.g / 255, pdfColor.b / 255),
          opacity: 0.4,
        });
      }
      break;

    case 'pen':
    case 'brush':
    case 'pencil':
      // Draw pen/brush/pencil strokes as paths
      if (annotation.path) {
        await embedPathAnnotation(page, annotation, pdfColor, pageWidth, pageHeight);
      }
      break;

    case 'note':
      // Draw note icon (circle) and text
      const noteSize = 12;
      page.drawCircle({
        x: pdfX + noteSize,
        y: pdfY - noteSize,
        size: noteSize,
        color: rgb(pdfColor.r / 255, pdfColor.g / 255, pdfColor.b / 255),
      });

      // Add note text
      if (annotation.text) {
        page.drawText(annotation.text, {
          x: pdfX + noteSize * 2.5,
          y: pdfY - noteSize * 1.5,
          size: 10,
          font: font,
          color: rgb(pdfColor.r / 255, pdfColor.g / 255, pdfColor.b / 255),
        });
      }
      break;

    case 'text':
      // Add text annotation directly
      if (annotation.text) {
        page.drawText(annotation.text, {
          x: pdfX,
          y: pdfY,
          size: 14,
          font: font,
          color: rgb(pdfColor.r / 255, pdfColor.g / 255, pdfColor.b / 255),
        });
      }
      break;
  }
}

/**
 * Embeds a path-based annotation (pen, brush, pencil, freehand highlight)
 */
async function embedPathAnnotation(
  page: PDFPage,
  annotation: PDFAnnotation,
  color: { r: number; g: number; b: number },
  pageWidth: number,
  pageHeight: number
): Promise<void> {
  if (!annotation.path) return;

  // Parse the SVG path and convert to PDF coordinate system
  const pathPoints = parsePathToPoints(annotation.path);
  if (pathPoints.length < 2) return;

  // Convert normalized path coordinates to PDF coordinates
  const pdfPoints = pathPoints.map(point => ({
    x: point.x * pageWidth,
    y: pageHeight - (point.y * pageHeight) // Flip Y coordinate for PDF
  }));

  // Draw the path as connected line segments
  const strokeWidth = annotation.strokeWidth || 3;
  const opacity = getStrokeOpacity(annotation.type);

  // Draw lines between consecutive points
  for (let i = 0; i < pdfPoints.length - 1; i++) {
    const startPoint = pdfPoints[i];
    const endPoint = pdfPoints[i + 1];
    
    // For very close points, draw a small circle instead of a line
    const distance = Math.sqrt(
      Math.pow(endPoint.x - startPoint.x, 2) + 
      Math.pow(endPoint.y - startPoint.y, 2)
    );
    
    if (distance < 2) {
      page.drawCircle({
        x: startPoint.x,
        y: startPoint.y,
        size: strokeWidth / 2,
        color: rgb(color.r / 255, color.g / 255, color.b / 255),
        opacity: opacity,
      });
    } else {
      // Draw line segment
      page.drawLine({
        start: { x: startPoint.x, y: startPoint.y },
        end: { x: endPoint.x, y: endPoint.y },
        thickness: strokeWidth,
        color: rgb(color.r / 255, color.g / 255, color.b / 255),
        opacity: opacity,
      });
    }
  }
}

/**
 * Gets the appropriate opacity for different stroke types
 */
function getStrokeOpacity(type: string): number {
  switch (type) {
    case 'highlight':
      return 0.4;
    case 'brush':
      return 0.9;
    case 'pencil':
      return 0.8;
    default:
      return 1.0;
  }
}

/**
 * Parses SVG path string to array of points
 */
function parsePathToPoints(path: string): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];
  
  try {
    // Remove path commands and split by spaces/commas
    const commands = path.replace(/[ML]/g, ' ').split(/[\s,]+/).filter(cmd => cmd.trim());
    
    // Parse coordinate pairs
    for (let i = 0; i < commands.length; i += 2) {
      if (i + 1 < commands.length) {
        const x = parseFloat(commands[i]);
        const y = parseFloat(commands[i + 1]);
        
        if (!isNaN(x) && !isNaN(y)) {
          points.push({ x, y });
        }
      }
    }
  } catch (error) {
    console.warn('Error parsing path:', error);
  }
  
  return points;
}

/**
 * Converts hex color to RGB values
 */
function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16),
      }
    : { r: 0, g: 0, b: 0 };
}

/**
 * Saves annotations directly to the original PDF file (modifies the original)
 * WARNING: This will overwrite the original file
 * @param pdfUri The URI of the PDF file to modify
 * @param annotations Array of annotations to embed
 * @returns Promise that resolves when annotations are saved
 */
export async function saveAnnotationsDirectlyToPDF(
  pdfUri: string,
  annotations: PDFAnnotation[]
): Promise<void> {
  try {
    console.log('Saving annotations directly to PDF:', pdfUri);
    
    // Create annotated PDF
    const annotatedPdfPath = await embedAnnotationsInPDF(pdfUri, annotations, 'temp_annotated.pdf');
    
    // Replace original with annotated version
    await FileSystem.moveAsync({
      from: annotatedPdfPath,
      to: pdfUri,
    });
    
    console.log('Annotations saved directly to original PDF');
    
  } catch (error) {
    console.error('Error saving annotations directly to PDF:', error);
    throw error;
  }
}

/**
 * Creates a backup of the original PDF before modifying it
 * @param pdfUri The URI of the PDF file to backup
 * @returns Promise that resolves to the backup file URI
 */
export async function createPDFBackup(pdfUri: string): Promise<string> {
  try {
    const timestamp = Date.now();
    const originalFilename = pdfUri.split('/').pop() || 'document.pdf';
    const baseName = originalFilename.replace('.pdf', '');
    const backupFilename = `backup_${timestamp}_${baseName}.pdf`;
    
    const pdfDirectory = `${FileSystem.documentDirectory}pdfs/`;
    const dirInfo = await FileSystem.getInfoAsync(pdfDirectory);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(pdfDirectory, { intermediates: true });
    }
    
    const backupPath = `${pdfDirectory}${backupFilename}`;
    
    await FileSystem.copyAsync({
      from: pdfUri,
      to: backupPath,
    });
    
    console.log('PDF backup created:', backupPath);
    return backupPath;
    
  } catch (error) {
    console.error('Error creating PDF backup:', error);
    throw error;
  }
}

// Export the processing manager instance
export const pdfProcessingManager = PDFProcessingManager.getInstance();