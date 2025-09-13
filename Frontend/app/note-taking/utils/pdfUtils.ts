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

/**
 * Embeds annotations directly into a PDF file and saves it as a new annotated PDF
 * @param originalPdfUri The URI of the original PDF file
 * @param annotations Array of annotations to embed
 * @param outputFileName Optional output filename (defaults to annotated_[original])
 * @returns Promise that resolves to the new annotated PDF file URI
 */
export async function embedAnnotationsInPDF(
  originalPdfUri: string,
  annotations: PDFAnnotation[],
  outputFileName?: string
): Promise<string> {
  try {
    console.log('Starting PDF annotation embedding...');
    console.log('Original PDF:', originalPdfUri);
    console.log('Annotations to embed:', annotations.length);

    // Read the original PDF file
    const pdfBytes = await FileSystem.readAsStringAsync(originalPdfUri, {
      encoding: FileSystem.EncodingType.Base64,
    });

    const pdfArrayBuffer = Uint8Array.from(atob(pdfBytes), (c) =>
      c.charCodeAt(0)
    ).buffer;

    // Load the PDF document
    const pdfDoc = await PDFDocument.load(pdfArrayBuffer);
    const pages = pdfDoc.getPages();
    console.log('PDF loaded, pages:', pages.length);

    // Embed a standard font for text annotations
    const font = await pdfDoc.embedFont('Helvetica');

    // Group annotations by page
    const annotationsByPage = groupAnnotationsByPage(annotations);

    // Process each page that has annotations
    for (const [pageNum, pageAnnotations] of Object.entries(annotationsByPage)) {
      const pageIndex = parseInt(pageNum) - 1; // Convert to 0-based index
      if (pageIndex >= 0 && pageIndex < pages.length) {
        const page = pages[pageIndex];
        console.log(`Processing page ${pageNum} with ${pageAnnotations.length} annotations`);
        
        await embedAnnotationsOnPage(page, pageAnnotations, font);
      }
    }

    // Save the modified PDF
    const modifiedPdfBytes = await pdfDoc.save();

    // Generate output filename
    const originalFilename = originalPdfUri.split('/').pop() || 'document.pdf';
    const baseName = originalFilename.replace('.pdf', '');
    const finalOutputName = outputFileName || `annotated_${Date.now()}_${baseName}.pdf`;

    // Ensure PDF directory exists
    const pdfDirectory = `${FileSystem.documentDirectory}pdfs/`;
    const dirInfo = await FileSystem.getInfoAsync(pdfDirectory);
    if (!dirInfo.exists) {
      await FileSystem.makeDirectoryAsync(pdfDirectory, { intermediates: true });
    }

    const outputPath = `${pdfDirectory}${finalOutputName}`;

    // Convert Uint8Array to base64 for saving
    const base64String = btoa(String.fromCharCode(...Array.from(modifiedPdfBytes)));
    await FileSystem.writeAsStringAsync(outputPath, base64String, {
      encoding: FileSystem.EncodingType.Base64,
    });

    console.log('Annotated PDF saved to:', outputPath);
    return outputPath;

  } catch (error) {
    console.error('Error embedding annotations in PDF:', error);
    throw new Error(`Failed to embed annotations in PDF: ${error instanceof Error ? error.message : 'Unknown error'}`);
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
