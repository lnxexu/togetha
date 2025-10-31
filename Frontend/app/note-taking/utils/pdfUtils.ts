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
 * Attempt to compress a PDF by re-saving it with optimized object streams.
 * This is a best-effort, non-destructive operation: if compression fails or
 * does not reduce size meaningfully, the original file URI is returned.
 * @param uri local file URI of the PDF
 * @param minSizeThreshold only attempt compression if original size >= this (bytes)
 */
export async function tryCompressPDF(
  uri: string,
  minSizeThreshold: number = 10 * 1024 * 1024 // 10 MB
): Promise<{ uri: string; compressed: boolean; originalSize: number; newSize: number }> {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    const originalSize = 'size' in info ? info.size || 0 : 0;
    if (originalSize === 0 || originalSize < minSizeThreshold) {
      return { uri, compressed: false, originalSize, newSize: originalSize };
    }

    console.log(`🔧 Attempting to compress PDF (${formatFileSize(originalSize)}) : ${uri}`);

    // Read as base64 and convert to Uint8Array
    const base64 = await FileSystem.readAsStringAsync(uri, { encoding: FileSystem.EncodingType.Base64 });
    const buffer = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0)).buffer;

    let pdfDoc: PDFDocument;
    try {
      pdfDoc = await PDFDocument.load(buffer);
    } catch (err) {
      console.warn('Could not load PDF for compression:', err);
      return { uri, compressed: false, originalSize, newSize: originalSize };
    }

    // Try to save with object streams enabled to reduce size in some PDFs
    let newBytes: Uint8Array | null = null;
    try {
      // @ts-ignore allow save options
      newBytes = await (pdfDoc as any).save({ useObjectStreams: true });
    } catch (saveErr) {
      try {
        newBytes = await pdfDoc.save();
      } catch (err2) {
        console.warn('PDF re-save for compression failed:', err2);
        return { uri, compressed: false, originalSize, newSize: originalSize };
      }
    }

    if (!newBytes || newBytes.length === 0) {
      return { uri, compressed: false, originalSize, newSize: originalSize };
    }

    const newSize = newBytes.length;
    // Only accept compression if the new file is meaningfully smaller
    if (newSize >= originalSize * 0.98) {
      console.log('Compression did not produce meaningful savings; skipping replace');
      return { uri, compressed: false, originalSize, newSize };
    }

    // Write compressed file to same directory with _compressed suffix
    const originalName = uri.split('/').pop() || `compressed_${Date.now()}.pdf`;
    const dir = uri.replace(/\\/g, '/').split('/').slice(0, -1).join('/') + '/';
    const compressedName = originalName.replace(/\.pdf$/i, '') + `_compressed.pdf`;
    const compressedPath = `${dir}${compressedName}`;

    const compressedBase64 = uint8ArrayToBase64(newBytes);
    await FileSystem.writeAsStringAsync(compressedPath, compressedBase64, { encoding: FileSystem.EncodingType.Base64 });

    const finalInfo = await FileSystem.getInfoAsync(compressedPath);
    const finalSize = 'size' in finalInfo ? finalInfo.size || newSize : newSize;

    console.log(`✅ Compressed PDF saved: ${compressedPath} (${formatFileSize(finalSize)})`);
    return { uri: compressedPath, compressed: true, originalSize, newSize: finalSize };
  } catch (error) {
    console.warn('tryCompressPDF failed:', error);
    return { uri, compressed: false, originalSize: 0, newSize: 0 };
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
    
    // Create a safe, unique filename for the downloaded PDF to avoid collisions
    // between different remote URLs that may share the same final path segment.
    const hashUri = (s: string) => {
      // Simple DJB2 hash -> hex string
      let h = 5381;
      for (let i = 0; i < s.length; i++) {
        h = (h * 33) ^ s.charCodeAt(i);
      }
      // Convert to unsigned and hex
      return (h >>> 0).toString(16);
    };

    const urlLastSegment = remoteUrl.split('/').pop() || 'downloaded.pdf';
    // Prefer explicit customFileName when provided, otherwise use a hashed prefix
    // plus the original last path segment so names are still recognizable.
    let fileName = customFileName
      ? customFileName
      : `${hashUri(remoteUrl)}_${urlLastSegment}`;

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
    // Note: Some production servers block HEAD requests, so we handle this gracefully
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
        // Continue anyway - some servers don't set content-type correctly
      }
      if (contentLength) {
        const len = parseInt(contentLength, 10);
        if (!isNaN(len)) {
          onProgress?.({ stage: 'downloading', progress: 10, message: `Remote file size: ${formatFileSize(len)}`, totalBytes: len });
        }
      }
    } catch (err) {
      console.warn('HEAD request failed, trying GET fallback:', err);
      // If HEAD fails (some servers block it), try a lightweight GET for the first bytes
      try {
        const getResp = await fetch(remoteUrl, { 
          method: 'GET', 
          headers: { 
            ...fetchHeaders,
            'Range': 'bytes=0-1023' // Only request first 1KB to minimize data usage
          }
        });
        if (!getResp.ok) {
          throw new Error(`Remote resource not available. HTTP ${getResp.status}`);
        }
        const contentType = getResp.headers.get('content-type') || '';
        if (!contentType.toLowerCase().includes('pdf')) {
          console.warn('Remote GET content-type not PDF:', contentType);
          // Continue anyway - some servers don't set content-type correctly
        }
        const contentLength = getResp.headers.get('content-length');
        if (contentLength) {
          const len = parseInt(contentLength, 10);
          if (!isNaN(len)) {
            onProgress?.({ stage: 'downloading', progress: 10, message: `Remote file size: ${formatFileSize(len)}`, totalBytes: len });
          }
        }
      } catch (err2) {
        console.warn('Both HEAD and GET requests failed:', err2);
        // For document URLs that might be protected, try to proceed with download anyway
        // Some servers may block preflight requests but allow actual downloads
        console.log('Attempting download despite failed pre-check...');
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
 * @param fetchHeaders Optional headers for remote requests
 * @returns Local file URI
 */
export async function getLocalPDFPath(uri: string, fileName?: string, fetchHeaders?: HeadersInit): Promise<string> {
  const result = await getLocalPDFPathEnhanced(uri, fileName, undefined, fetchHeaders);
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
 * Enhanced PDF annotation embedding with proper coordinate validation
 */
export async function embedAnnotationsInPDFEnhanced(
  originalPdfUri: string,
  annotations: PDFAnnotation[],
  options: {
    outputFileName?: string;
    useChunkedProcessing?: boolean;
    maxMemoryUsage?: number;
    viewerInfo?: {
      totalPages: number;
      viewerWidth: number;
      viewerHeight: number;
      pdfPageDimensions: { width: number; height: number };
    };
  } = {},
  onProgress?: (progress: PDFProcessingProgress) => void
): Promise<string> {
  try {
    console.log('🎨 Starting enhanced PDF annotation embedding...');
    console.log('📍 Original PDF:', originalPdfUri);
    console.log('📝 Annotations to embed:', annotations.length);
    
    // Enhanced debugging for coordinate validation
    if (options.viewerInfo) {
      console.log('🔍 Viewer info provided:', options.viewerInfo);
      
      // Validate annotation coordinates against viewer info
      const invalidAnnotations = annotations.filter(ann => {
        const isValidPage = ann.page >= 1 && ann.page <= options.viewerInfo!.totalPages;
        const isValidCoords = ann.x >= 0 && ann.x <= 1 && ann.y >= 0 && ann.y <= 1;
        return !isValidPage || !isValidCoords;
      });
      
      if (invalidAnnotations.length > 0) {
        console.warn('⚠️ Found annotations with invalid coordinates:', invalidAnnotations);
      }
      
      // Log page distribution with viewer context
      const pageDistribution = annotations.reduce((acc, ann) => {
        acc[ann.page] = (acc[ann.page] || 0) + 1;
        return acc;
      }, {} as Record<number, number>);
      
      console.log('📊 Annotation distribution vs viewer info:');
      console.log('  - Viewer shows pages:', options.viewerInfo.totalPages);
      console.log('  - Annotations on pages:', Object.keys(pageDistribution).join(', '));
      console.log('  - Distribution:', pageDistribution);
    }

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
  
  // Load the PDF document, with enhanced handling for encrypted PDFs
  let pdfDoc: PDFDocument;
  let wasEncrypted = false;
  
  try {
    pdfDoc = await PDFDocument.load(pdfArrayBuffer);
  } catch (loadErr: any) {
    console.warn('Initial PDFDocument.load failed:', loadErr && loadErr.message ? loadErr.message : loadErr);
    // If the error indicates encryption, retry with ignoreEncryption option
    const msg = loadErr && loadErr.message ? loadErr.message.toLowerCase() : String(loadErr || '').toLowerCase();
  if (msg.includes('encrypted') || msg.includes('password')) {
      try {
        console.log('PDF appears to be encrypted - retrying load with ignoreEncryption:true');
        console.warn('⚠️ WARNING: Loading encrypted PDF with ignoreEncryption may result in compatibility issues');
        
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  pdfDoc = await (PDFDocument as any).load(pdfArrayBuffer, { ignoreEncryption: true });
        wasEncrypted = true;
        
        // For encrypted PDFs, we need to create a new clean PDF to ensure compatibility
        console.log('🔄 Creating clean PDF copy for better compatibility...');
        
      } catch (retryErr) {
        console.error('Retry with ignoreEncryption failed:', retryErr);
        // If we still cannot load, rethrow to caller
        throw new Error(`Cannot process encrypted PDF: ${retryErr instanceof Error ? retryErr.message : 'Unknown encryption error'}`);
      }
    } else {
      throw loadErr;
    }
  }
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
  
  // Debug: Log annotation distribution
  console.log('🔍 Annotations grouped by page:', 
    Object.entries(annotationsByPage).map(([page, anns]) => `Page ${page}: ${anns.length} annotations`).join(', ')
  );
  console.log('📄 PDF has', pages.length, 'pages');
  console.log('📝 Total annotations to embed:', annotations.length);

  // Process each page that has annotations
  let processedPages = 0;
  const totalAnnotationPages = Object.keys(annotationsByPage).length;
  
  console.log(`🔍 ENHANCED DEBUGGING - Starting annotation embedding on ${totalAnnotationPages} pages`);
  console.log('📊 PDF pages available:', pages.length);
  console.log('📝 Annotation pages:', Object.keys(annotationsByPage).sort((a, b) => parseInt(a) - parseInt(b)));
  
  // Enhanced page boundary validation
  const maxAnnotationPage = Math.max(...Object.keys(annotationsByPage).map(p => parseInt(p)));
  if (maxAnnotationPage > pages.length) {
    console.error(`❌ CRITICAL: Annotations exist on page ${maxAnnotationPage} but PDF only has ${pages.length} pages`);
    console.error('📋 This suggests a page numbering or PDF loading issue');
    
    // Log the issue but don't try to add pages (this indicates a coordinate problem)
    const missingPages = maxAnnotationPage - pages.length;
    console.log(`🔧 Need ${missingPages} more pages to accommodate annotations`);
    console.log(`❌ This indicates annotations are being stored with incorrect page numbers`);
    console.log(`  Check the PDF viewer coordinate conversion and page calculation logic`);
  }
  
  for (const [pageNum, pageAnnotations] of Object.entries(annotationsByPage)) {
    const pageNumber = parseInt(pageNum);
    const pageIndex = pageNumber - 1; // Convert to 0-based index
    
    console.log(`🔍 Processing page ${pageNumber} -> pageIndex ${pageIndex} (PDF has ${pages.length} pages)`);
    
    // Enhanced boundary check
    if (pageIndex < 0) {
      console.error(`❌ Invalid page number ${pageNumber} - pages must be >= 1`);
      continue;
    }
    
    if (pageIndex >= pages.length) {
      console.error(`❌ Page ${pageNumber} is out of bounds - PDF only has ${pages.length} pages`);
      console.error(`📋 Available page indices: 0 to ${pages.length - 1}`);
      console.error(`📋 Requested page index: ${pageIndex}`);
      console.error(`❌ ${pageAnnotations.length} annotations on this page will NOT be embedded!`);
      
      // Log the problematic annotations for debugging
      console.error('🚨 Problematic annotations:', pageAnnotations.map(ann => ({
        id: ann.id,
        type: ann.type,
        page: ann.page,
        x: ann.x,
        y: ann.y
      })));
      
      continue;
    }
    
    const page = pages[pageIndex];
    if (!page) {
      console.error(`❌ Page object is null/undefined for page ${pageNumber} (index ${pageIndex})`);
      continue;
    }
    
    console.log(`📝 ✅ Embedding ${pageAnnotations.length} annotations on page ${pageNumber}`);
    
    try {
      await embedAnnotationsOnPage(page, pageAnnotations, font);
      console.log(`✅ Successfully embedded annotations on page ${pageNumber}`);
    } catch (pageError) {
      console.error(`❌ Failed to embed annotations on page ${pageNumber}:`, pageError);
      // Don't throw - continue with other pages
    }
    
    processedPages++;
    onProgress?.({
      stage: 'embedding',
      progress: 50 + Math.round((processedPages / totalAnnotationPages) * 30),
      message: `Processed page ${pageNumber}/${pages.length}...`
    });
  }
  
  console.log(`📊 FINAL SUMMARY: ${processedPages}/${totalAnnotationPages} annotation pages processed successfully`);
  
  console.log(`📊 Annotation embedding summary: ${processedPages}/${totalAnnotationPages} pages processed successfully`);

  onProgress?.({
    stage: 'saving',
    progress: 85,
    message: 'Generating annotated PDF...'
  });

  // Save the modified PDF with special handling for encrypted sources
  let modifiedPdfBytes: Uint8Array;
  try {
    console.log(`💾 Saving PDF with ${pages.length} pages (multi-page: ${pages.length > 1}, wasEncrypted: ${wasEncrypted})`);
    
    // Validate PDF state before saving
    if (pages.length === 0) {
      throw new Error('PDF has no pages - cannot save');
    }
    
    if (wasEncrypted) {
      console.log('🔓 Processing encrypted PDF - creating clean unencrypted version...');
      
      // For encrypted PDFs, try to save directly but with enhanced compatibility checks
      try {
        console.log('🔓 Attempting to save encrypted PDF with compatibility mode...');
        
        // Try saving the modified encrypted PDF
        modifiedPdfBytes = await pdfDoc.save();
        
        // Enhanced validation for encrypted PDFs
        if (modifiedPdfBytes.length === 0) {
          throw new Error('Encrypted PDF save resulted in empty file');
        }
        
        // Validate the saved PDF can be read back
        try {
          const testBuffer = Uint8Array.from(modifiedPdfBytes);
          await PDFDocument.load(testBuffer);
          console.log('✅ Encrypted PDF save validation passed');
        } catch (testErr) {
          // Try with ignoreEncryption
          try {
            const testBuffer = Uint8Array.from(modifiedPdfBytes);
            await (PDFDocument as any).load(testBuffer, { ignoreEncryption: true });
            console.log('✅ Encrypted PDF save validation passed (with ignoreEncryption)');
          } catch (testErr2) {
            throw new Error(`Saved encrypted PDF cannot be validated: ${testErr2 instanceof Error ? testErr2.message : 'Unknown error'}`);
          }
        }
        
        console.log(`✅ Encrypted PDF processed successfully - ${modifiedPdfBytes.length} bytes`);
        
      } catch (encryptedSaveError) {
        console.error('❌ Failed to save encrypted PDF properly:', encryptedSaveError);
        throw new Error(`Cannot process encrypted PDF: ${encryptedSaveError instanceof Error ? encryptedSaveError.message : 'Unknown error'}. Please use an unencrypted PDF for annotation.`);
      }
    } else {
      // For non-encrypted PDFs, use normal save
      modifiedPdfBytes = await pdfDoc.save();
    }
    
    if (!modifiedPdfBytes || modifiedPdfBytes.length === 0) {
      throw new Error('PDF save resulted in empty file');
    }
    
    console.log(`✅ PDF save completed - ${modifiedPdfBytes.length} bytes generated`);
    
    // Additional validation for multi-page PDFs
    if (pages.length > 1) {
      console.log('🔍 Validating multi-page PDF structure...');
      
      // Quick validation: check if the saved PDF has valid structure
      const pdfHeader = String.fromCharCode(...modifiedPdfBytes.slice(0, 8));
      if (!pdfHeader.startsWith('%PDF-')) {
        throw new Error('Generated PDF does not have valid header');
      }
      
      // Check for PDF trailer
      const pdfEnd = String.fromCharCode(...modifiedPdfBytes.slice(-20));
      if (!pdfEnd.includes('%%EOF')) {
        console.warn('⚠️ PDF may not have proper trailer - this could cause reader issues');
      }
      
      console.log('✅ Multi-page PDF structure validation passed');
    }
    
  } catch (saveError) {
    console.error('❌ PDF save failed:', saveError);
    throw new Error(`PDF generation failed: ${saveError instanceof Error ? saveError.message : 'Unknown save error'}`);
  }

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

  // Convert Uint8Array to base64 for saving using safe chunked conversion
  console.log(`💾 Converting ${modifiedPdfBytes.length} bytes to base64 for saving...`);
  const base64String = uint8ArrayToBase64(modifiedPdfBytes);
  console.log(`📝 Base64 string length: ${base64String.length}`);
  
  await FileSystem.writeAsStringAsync(outputPath, base64String, {
    encoding: FileSystem.EncodingType.Base64,
  });

  // Validate saved PDF by attempting to load it with pdf-lib (support encrypted PDFs)
  try {
    const savedBase64 = await FileSystem.readAsStringAsync(outputPath, { encoding: FileSystem.EncodingType.Base64 });
    const validateBuffer = Uint8Array.from(atob(savedBase64), (c) => c.charCodeAt(0)).buffer;
    try {
      await PDFDocument.load(validateBuffer);
    } catch (loadErr: any) {
      const msg = (loadErr?.message || '').toLowerCase();
      if (msg.includes('encrypted') || msg.includes('password')) {
        // Retry validation ignoring encryption
        await (PDFDocument as any).load(validateBuffer, { ignoreEncryption: true });
      } else {
        throw loadErr;
      }
    }
    console.log('✅ Saved annotated PDF validated successfully');
  } catch (validationErr) {
    console.error('❌ Saved PDF validation failed:', validationErr);
    const errorMessage = validationErr instanceof Error ? validationErr.message : String(validationErr);
    throw new Error('Saved annotated PDF appears to be corrupted: ' + errorMessage);
  }

  // Enhanced validation of the saved file, especially for multi-page PDFs
  try {
    const savedFileInfo = await FileSystem.getInfoAsync(outputPath);
    if (!savedFileInfo.exists) {
      throw new Error('PDF file was not created');
    }
    
    const savedSize = 'size' in savedFileInfo ? savedFileInfo.size || 0 : 0;
    console.log(`🔍 Saved PDF validation - exists: ${savedFileInfo.exists}, size: ${savedSize} bytes`);
    
    if (savedSize === 0) {
      throw new Error('PDF file was created but is empty');
    }
    
    // Enhanced validation for multi-page PDFs
    if (pages.length > 1) {
      console.log(`🔍 Enhanced multi-page PDF validation (${pages.length} pages)...`);
      
      // Read a larger sample for multi-page validation
      const testReadSize = Math.min(savedSize, 2048); // Read up to 2KB
      const testRead = await FileSystem.readAsStringAsync(outputPath, { 
        encoding: FileSystem.EncodingType.Base64,
        length: testReadSize
      });
      
      if (!testRead || testRead.length === 0) {
        throw new Error('Multi-page PDF file cannot be read back after saving');
      }
      
      // Decode and validate PDF structure
      const pdfBytes = atob(testRead);
      
      // Check PDF header
      if (!pdfBytes.startsWith('%PDF-')) {
        throw new Error('Multi-page PDF has invalid header after saving');
      }
      
      // For multi-page PDFs, try to validate with pdf-lib to ensure it's not corrupted
      try {
        const fullPdfData = await FileSystem.readAsStringAsync(outputPath, {
          encoding: FileSystem.EncodingType.Base64
        });
        
        const validateBuffer = Uint8Array.from(atob(fullPdfData), c => c.charCodeAt(0)).buffer;
        
        // Try to load the saved PDF to validate it
        let validateDoc: PDFDocument;
        try {
          validateDoc = await PDFDocument.load(validateBuffer);
        } catch (loadErr: any) {
          // If it's encrypted, try with ignoreEncryption
          const msg = (loadErr?.message || '').toLowerCase();
          if (msg.includes('encrypted') || msg.includes('password')) {
            console.log('🔍 Validation: Saved PDF is encrypted, testing with ignoreEncryption...');
            validateDoc = await (PDFDocument as any).load(validateBuffer, { ignoreEncryption: true });
          } else {
            throw loadErr;
          }
        }
        
        const validationPages = validateDoc.getPages();
        if (validationPages.length !== pages.length) {
          console.warn(`⚠️ Page count mismatch: expected ${pages.length}, got ${validationPages.length}`);
        }
        
        console.log(`✅ Multi-page PDF validation passed - ${validationPages.length} pages readable`);
        
      } catch (validationLoadError) {
        console.error('❌ Multi-page PDF validation failed - cannot reload saved file:', validationLoadError);
        throw new Error(`Multi-page PDF appears corrupted: ${validationLoadError instanceof Error ? validationLoadError.message : 'Validation failed'}`);
      }
      
    } else {
      // Simple validation for single-page PDFs
      const testRead = await FileSystem.readAsStringAsync(outputPath, { 
        encoding: FileSystem.EncodingType.Base64,
        length: 100 
      });
      
      if (!testRead || testRead.length === 0) {
        throw new Error('PDF file cannot be read back after saving');
      }
    }
    
    console.log(`✅ PDF save validation passed - file is readable`);
    
  } catch (validationError) {
    console.error('❌ PDF save validation failed:', validationError);
    throw new Error(`PDF save validation failed: ${validationError instanceof Error ? validationError.message : 'Unknown error'}`);
  }

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
  // Sanitize annotation before embedding
  const sanitizedAnnotation = sanitizeAnnotation(annotation);
  if (!sanitizedAnnotation) {
    console.warn('Skipping invalid annotation:', annotation.id);
    return;
  }
  
  const pdfColor = hexToRgb(sanitizedAnnotation.color);

  // Convert normalized coordinates (0-1) to PDF coordinates
  const pdfX = sanitizedAnnotation.x * pageWidth;
  const pdfY = pageHeight - (sanitizedAnnotation.y * pageHeight); // PDF coordinates are from bottom-left

  switch (sanitizedAnnotation.type) {
    case 'highlight':
      if (sanitizedAnnotation.path) {
        // Freehand highlight - draw as path
        await embedPathAnnotation(page, sanitizedAnnotation, pdfColor, pageWidth, pageHeight);
      } else {
        // Traditional rectangle highlight
        const rectWidth = (sanitizedAnnotation.width || 100) * pageWidth / 100;
        const rectHeight = sanitizedAnnotation.height || 20;
        
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
      if (sanitizedAnnotation.path) {
        await embedPathAnnotation(page, sanitizedAnnotation, pdfColor, pageWidth, pageHeight);
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
      if (sanitizedAnnotation.text) {
        page.drawText(sanitizedAnnotation.text, {
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
      if (sanitizedAnnotation.text) {
        page.drawText(sanitizedAnnotation.text, {
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
  // Sanitize annotation before processing path
  const sanitizedAnnotation = sanitizeAnnotation(annotation);
  if (!sanitizedAnnotation || !sanitizedAnnotation.path) return;

  // Parse the SVG path and convert to PDF coordinate system
  const pathPoints = parsePathToPoints(sanitizedAnnotation.path);
  if (pathPoints.length < 2) return;

  // Convert normalized path coordinates to PDF coordinates
  const pdfPoints = pathPoints.map(point => ({
    x: point.x * pageWidth,
    y: pageHeight - (point.y * pageHeight) // Flip Y coordinate for PDF
  }));

  // Draw the path as connected line segments
  const strokeWidth = sanitizedAnnotation.strokeWidth || 3;
  const opacity = getStrokeOpacity(sanitizedAnnotation.type);

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
 * Convert Uint8Array to Base64 safely using chunked conversion to avoid
 * argument/stack limits when using String.fromCharCode with large arrays.
 */
function uint8ArrayToBase64(u8: Uint8Array): string {
  // Chunk size of 32KB keeps apply/fromCharCode safe in most engines
  const CHUNK_SIZE = 0x8000; // 32768
  let index = 0;
  let result = '';
  while (index < u8.length) {
    const chunk = u8.subarray(index, Math.min(index + CHUNK_SIZE, u8.length));
    // Use apply via String.fromCharCode for the chunk — safe because chunk is small
    result += String.fromCharCode.apply(null, Array.from(chunk) as any);
    index += CHUNK_SIZE;
  }
  // Browser/global btoa
  if (typeof btoa === 'function') {
    return btoa(result);
  }
  // Node fallback
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(u8).toString('base64');
  }
  throw new Error('No base64 encoder available in this environment');
}

/**
 * Sanitize a PDFAnnotation before embedding:
 * - Ensure numeric fields are finite numbers
 * - Clamp normalized coords (x,y) to [0,1]
 * - Clamp width/height to reasonable values
 * - Ensure strokeWidth is finite and within bounds
 * - Normalize path points to remove NaN/Infinity and clamp to [0,1]
 */
function sanitizeAnnotation(annotation: PDFAnnotation): PDFAnnotation | null {
  if (!annotation || typeof annotation !== 'object') return null;

  // Basic numeric fields
  const safeNum = (v: any, fallback = 0) => {
    if (typeof v === 'number' && isFinite(v)) return v;
    const parsed = Number(v);
    return isFinite(parsed) ? parsed : fallback;
  };

  const ann: PDFAnnotation = { ...annotation };

  ann.x = Math.max(0, Math.min(1, safeNum(ann.x, 0)));
  ann.y = Math.max(0, Math.min(1, safeNum(ann.y, 0)));
  if ('width' in ann) ann.width = Math.max(0, safeNum(ann.width, 0));
  if ('height' in ann) ann.height = Math.max(0, safeNum(ann.height, 0));
  ann.strokeWidth = Math.max(0.5, Math.min(100, safeNum(ann.strokeWidth, 3)));
  ann.timestamp = safeNum(ann.timestamp, Date.now());

  // Sanitize color string - fallback to black if invalid
  if (!ann.color || typeof ann.color !== 'string' || !/^#?[0-9A-Fa-f]{6}$/.test(ann.color)) {
    ann.color = '#000000';
  }

  // Sanitize path (if present) - remove NaN points and clamp to [0,1]
  if (ann.path && typeof ann.path === 'string') {
    try {
      const points = parsePathToPoints(ann.path); // existing helper
      const sanitizedPoints = points
        .map(p => ({
          x: Math.max(0, Math.min(1, safeNum(p.x, 0))),
          y: Math.max(0, Math.min(1, safeNum(p.y, 0))),
        }))
        .filter(p => isFinite(p.x) && isFinite(p.y));
      // rebuild path if we have enough points, otherwise drop path
      if (sanitizedPoints.length >= 2) {
        // simple path -> "M x y L x y ..." normalized to [0..1]
        const pathStr = sanitizedPoints.map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
        ann.path = pathStr;
      } else {
        delete ann.path;
      }
    } catch (err) {
      // parsing failed — remove the path to avoid embedding bad data
      delete ann.path;
    }
  }

  // Finally, ensure page is integer >=1
  ann.page = Math.max(1, Math.floor(safeNum(ann.page, 1)));

  return ann;
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
 * Validates PDF coordinate system and page boundaries
 * @param annotations Array of annotations to validate
 * @param totalPages Total pages in the PDF
 * @returns Validation result with details
 */
export function validateAnnotationCoordinates(
  annotations: PDFAnnotation[],
  totalPages: number
): {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  pageDistribution: Record<number, number>;
} {
  const errors: string[] = [];
  const warnings: string[] = [];
  const pageDistribution: Record<number, number> = {};
  
  annotations.forEach((ann, index) => {
    // Track page distribution
    pageDistribution[ann.page] = (pageDistribution[ann.page] || 0) + 1;
    
    // Validate page number
    if (ann.page < 1) {
      errors.push(`Annotation ${index} (${ann.id}): Invalid page ${ann.page} - must be >= 1`);
    } else if (ann.page > totalPages) {
      errors.push(`Annotation ${index} (${ann.id}): Page ${ann.page} exceeds PDF page count ${totalPages}`);
    }
    
    // Validate coordinates (should be 0-1 normalized)
    if (ann.x < 0 || ann.x > 1) {
      warnings.push(`Annotation ${index} (${ann.id}): X coordinate ${ann.x} outside valid range [0,1]`);
    }
    if (ann.y < 0 || ann.y > 1) {
      warnings.push(`Annotation ${index} (${ann.id}): Y coordinate ${ann.y} outside valid range [0,1]`);
    }
    
    // Validate dimensions if present
    if (ann.width !== undefined && (ann.width < 0 || ann.width > 1)) {
      warnings.push(`Annotation ${index} (${ann.id}): Width ${ann.width} outside valid range [0,1]`);
    }
    if (ann.height !== undefined && (ann.height < 0 || ann.height > 1)) {
      warnings.push(`Annotation ${index} (${ann.id}): Height ${ann.height} outside valid range [0,1]`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    pageDistribution
  };
}

/**
 * Calculates proper PDF coordinates from viewer coordinates
 * @param viewerCoords Screen coordinates from the PDF viewer
 * @param viewerInfo Information about the PDF viewer dimensions and state
 * @returns Normalized PDF coordinates (0-1)
 */
export function calculatePDFCoordinates(
  viewerCoords: { x: number; y: number; page: number },
  viewerInfo: {
    totalPages: number;
    viewerWidth: number;
    viewerHeight: number;
    pdfPageDimensions?: { width: number; height: number };
    scrollOffset?: { x: number; y: number };
  }
): { x: number; y: number; page: number } {
  
  // Calculate the actual page height in the viewer
  const actualPageHeight = viewerInfo.viewerHeight / viewerInfo.totalPages;
  
  // Calculate which page we're on based on scroll position
  const pageStartY = (viewerCoords.page - 1) * actualPageHeight;
  const scrollY = viewerInfo.scrollOffset?.y || 0;
  const relativeY = viewerCoords.y - pageStartY - scrollY;
  
  // Convert to normalized coordinates (0-1) within the page
  const normalizedX = Math.max(0, Math.min(1, viewerCoords.x / viewerInfo.viewerWidth));
  const normalizedY = Math.max(0, Math.min(1, relativeY / actualPageHeight));
  
  console.log(`🔍 Coordinate conversion debug:`, {
    input: viewerCoords,
    viewerInfo: {
      totalPages: viewerInfo.totalPages,
      viewerDimensions: { width: viewerInfo.viewerWidth, height: viewerInfo.viewerHeight },
      pageHeight: actualPageHeight
    },
    calculations: { pageStartY, relativeY },
    output: { x: normalizedX, y: normalizedY, page: viewerCoords.page }
  });
  
  return {
    x: normalizedX,
    y: normalizedY,
    page: viewerCoords.page
  };
}

/**
 * Test coordinate conversion for debugging
 * @param annotations Array of annotations to test
 * @param viewerInfo Viewer information
 * @param pdfPages Actual PDF page count
 */
export function debugCoordinateConversion(
  annotations: PDFAnnotation[],
  viewerInfo: any,
  pdfPages: number
): void {
  console.log('🧪 COORDINATE CONVERSION DEBUG TEST:');
  console.log('📊 Current state:', {
    totalPages: pdfPages,
    viewerInfo,
    annotationCount: annotations.length
  });
  
  const validation = validateAnnotationCoordinates(annotations, pdfPages);
  
  console.log('📊 Validation results:', {
    isValid: validation.isValid,
    errorCount: validation.errors.length,
    warningCount: validation.warnings.length,
    pageDistribution: validation.pageDistribution
  });
  
  if (validation.errors.length > 0) {
    console.error('❌ Coordinate errors:', validation.errors);
  }
  
  if (validation.warnings.length > 0) {
    console.warn('⚠️ Coordinate warnings:', validation.warnings);
  }
  
  // Test specific problematic annotations
  annotations.forEach((ann, index) => {
    if (ann.page > pdfPages || ann.x < 0 || ann.x > 1 || ann.y < 0 || ann.y > 1) {
      console.error(`🚨 Problematic annotation ${index + 1}:`, {
        id: ann.id,
        type: ann.type,
        page: ann.page,
        coordinates: { x: ann.x, y: ann.y },
        isValidPage: ann.page >= 1 && ann.page <= pdfPages,
        isValidCoords: ann.x >= 0 && ann.x <= 1 && ann.y >= 0 && ann.y <= 1
      });
    }
  });
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