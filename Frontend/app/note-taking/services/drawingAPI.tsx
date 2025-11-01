
import { API_URL, API_ENDPOINTS, joinUrl } from '@/constants/ApiConfig';
import { parseServerDate } from '../utils/localDate';
import AsyncStorage from '@react-native-async-storage/async-storage';
import offlineStorage from './offlineStorage';
import { 
  embedAnnotationsInPDF, 
  embedAnnotationsInPDFEnhanced, 
  saveAnnotationsDirectlyToPDF, 
  createPDFBackup, 
  PDFAnnotation 
} from '../utils/pdfUtils';

// Add these interfaces
export interface DrawingStroke {
  id: string;
  points: number[];
  color: string;
  width: number;
  tool: string;
  timestamp: number;
  opacity?: number;
}

export interface DrawingData {
  strokes: DrawingStroke[];
  noteId: string;
  hasDrawing: boolean;
  lastUpdate?: string;
}

// PDF-specific interfaces
export interface PDFAnnotationData {
  annotations: PDFAnnotation[];
  pdfUri: string;
  hasAnnotations: boolean;
  lastUpdate?: string;
}

export interface PDFSaveOptions {
  createBackup?: boolean;
  saveDirectly?: boolean;
  outputFileName?: string;
  viewerInfo?: {
    totalPages: number;
    viewerWidth: number;
    viewerHeight: number;
    pdfPageDimensions: { width: number; height: number };
  };
}

// Add this new class to your existing api.tsx file
export class DrawingAPI {

   private async getCSRFToken(): Promise<string | null> {
    try {
  const response = await fetch(joinUrl(API_URL, API_ENDPOINTS.CSRF_TOKEN), {
        method: 'GET',
        credentials: 'include',
      });
      if (response.ok) {
        const data = await response.json();
        return data.csrfToken;
      }
    } catch (error) {
      console.error('Failed to get CSRF token:', error);
    }
    return null;
  }

  private async getAuthHeaders(): Promise<HeadersInit> {
    try {
      const token = await AsyncStorage.getItem('authToken');
      const csrfToken = await this.getCSRFToken();
      
      return {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || '',
        ...(token && { 'Authorization': `Token ${token}` }),
        ...(csrfToken && { 'X-CSRFToken': csrfToken }),
      };
    } catch (error) {
      console.error('Failed to get auth headers:', error);
      return {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
        'X-Client-Timezone': Intl.DateTimeFormat().resolvedOptions().timeZone || '',
      };
    }
  }
  async saveDrawing(noteId: string, strokes: DrawingStroke[], tags?: string[]): Promise<any> {
    try {
      const drawingDataString = JSON.stringify(strokes);
      const headers = await this.getAuthHeaders();
      
      // Try using the regular notes endpoint with PATCH instead of the drawing-specific endpoint
      const requestBody: any = { 
        drawing_strokes: strokes
      };
      
      // Include tags if provided
      if (tags) {
        requestBody.tag_names = tags;
      }

      // Use the regular notes endpoint for updating drawing data
  const response = await fetch(joinUrl(API_URL, `${API_ENDPOINTS.NOTES}${noteId}/`), {
        method: 'PATCH',
        headers,
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('API error response:', errorData);
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      
      // Return a consistent format
      return {
        message: "Drawing saved successfully",
        note_id: noteId,
        stroke_count: strokes.length,
        last_update: result.updated_at || new Date().toISOString()
      };
    } catch (error) {
      console.error('Failed to save drawing:', error);
      throw error;
    }
  }

  async getDrawing(noteId: string): Promise<DrawingData> {
    try {
      const headers = await this.getAuthHeaders();
      // Use the regular notes endpoint instead of drawing-specific endpoint
      const response = await fetch(joinUrl(API_URL, `${API_ENDPOINTS.NOTES}${noteId}/`), {
        headers,
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

    const data = await response.json();
      console.log('API getDrawing response:', data);
      
  let strokes: DrawingStroke[] = [];
      
      // Try to parse drawing_data if it exists
      if (data.drawing_data) {
        try {
          if (typeof data.drawing_data === 'string') {
            strokes = JSON.parse(data.drawing_data);
          } else if (Array.isArray(data.drawing_data)) {
            strokes = data.drawing_data;
          }
        } catch (parseError) {
          console.error('Failed to parse drawing_data:', parseError);
        }
      }
      
      // Fallback to legacy strokes field
      if (strokes.length === 0 && data.strokes) {
        strokes = Array.isArray(data.strokes) ? data.strokes : [];
      }
      
      // De-duplicate strokes by unique id to avoid duplicates if sync double-applied
      if (Array.isArray(strokes) && strokes.length > 1) {
        const byId = new Map<string, DrawingStroke>();
        for (const s of strokes) {
          const key = (s as any)?.id || `${(s as any)?.timestamp}-${(s as any)?.color}-${(s as any)?.width}`;
          if (!byId.has(key)) byId.set(key, s as any);
        }
        strokes = Array.from(byId.values());
      }
      console.log('Parsed strokes (deduped):', strokes.length, strokes.length > 0 ? strokes[0] : 'none');
      
      const drawingData: DrawingData = {
        strokes,
        noteId: data.id || noteId,
        hasDrawing: strokes.length > 0,
        lastUpdate: (parseServerDate(data.updated_at) || parseServerDate(data.last_update) || new Date()).toISOString(),
      };

      // Trust server: if empty, clear stale offline cache; else cache server value
      if (strokes.length === 0) {
        try { await offlineStorage.deleteOfflineDrawing(String(noteId)); } catch {}
      } else {
        try { await offlineStorage.saveOfflineDrawing(String(noteId), drawingData); } catch {}
      }

      return drawingData;
    } catch (error) {
      console.error('Failed to get drawing:', error);
      // Fallback to offline cache
      try {
        const cached = await offlineStorage.getOfflineDrawing(String(noteId));
        if (cached) return cached;
      } catch {}
      throw error;
    }
  }

  async clearDrawing(noteId: string): Promise<any> {
    try {
      const headers = await this.getAuthHeaders();
      
      // Clear drawing by setting drawing_strokes to empty array
      const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTES}${noteId}/`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          drawing_strokes: [] // Clear with empty array
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      // Update offline caches to reflect deletion immediately
      try {
        await offlineStorage.deleteOfflineDrawing(String(noteId));
        const note = await offlineStorage.getOfflineNoteById(String(noteId));
        if (note) {
          await offlineStorage.saveOfflineNote({
            ...note,
            drawing_data: '',
            has_drawing: false,
            lastModified: new Date().toISOString(),
            syncStatus: 'synced',
          } as any);
        }
      } catch {}

      return await response.json();
    } catch (error) {
      console.error('Failed to clear drawing:', error);
      throw error;
    }
  }

  // Additional method for auto-saving
  async autoSaveDrawing(noteId: string, strokes: DrawingStroke[]): Promise<void> {
    try {
      // Implement a debounced auto-save mechanism
      await this.saveDrawing(noteId, strokes);
    } catch (error) {
      console.warn('Auto-save failed:', error);
      // Don't throw error for auto-save failures
    }
  }

  // Create a new note with drawing
  async createDrawingNote(
    title: string, 
    strokes: DrawingStroke[], 
    folderId?: string | null,
    tags?: string[]
  ): Promise<{noteId: string, note: any}> {
    try {
      const headers = await this.getAuthHeaders();
    console.log('Creating new note with title:', title);
      
      // First, create a new note
      const noteResponse = await fetch(`${API_URL}${API_ENDPOINTS.NOTES}`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          title: title,
          content: '', // Empty content since this is a drawing note
          type: 'drawing', // Set type to drawing when creating
          category: null, // You can add category support later
          folder: folderId,   // Include folder information
          drawing_strokes: strokes, // Add drawing data directly
          tag_names: tags || [], // Include tags
        }),
      });

      console.log('Note creation response status:', noteResponse.status);

      if (!noteResponse.ok) {
        const errorData = await noteResponse.json().catch(() => ({}));
        console.log('Note creation error:', errorData);
        throw new Error(errorData.detail || errorData.message || `HTTP error! status: ${noteResponse.status}`);
      }

      const noteData = await noteResponse.json();
      const noteId = noteData.id.toString(); // Ensure it's a string
      console.log('Created note with ID:', noteId);

      // Since we already included drawing_data in the note creation, 
      // we don't need to call saveDrawing separately anymore
      console.log('Drawing note created successfully with strokes included');

      return { noteId, note: noteData };
    } catch (error) {
      console.error('Failed to create drawing note:', error);
      throw error;
    }
  }

  // PDF Annotation Methods

  /**
   * Converts DrawingStroke array to PDFAnnotation array
   */
  convertStrokesToPDFAnnotations(strokes: DrawingStroke[], currentPage: number = 1): PDFAnnotation[] {
    return strokes.map(stroke => ({
      id: stroke.id,
      type: stroke.tool as PDFAnnotation['type'],
      page: currentPage,
      x: 0, // These would need to be set based on actual stroke positions
      y: 0, // These would need to be set based on actual stroke positions  
      color: stroke.color,
      path: this.convertPointsToPath(stroke.points),
      strokeWidth: stroke.width,
      timestamp: stroke.timestamp,
      opacity: stroke.opacity,
    }));
  }

  /**
   * Converts points array to SVG path string
   */
  private convertPointsToPath(points: number[]): string {
    if (points.length < 2) return '';
    
    let path = `M${points[0]},${points[1]}`;
    for (let i = 2; i < points.length; i += 2) {
      if (i + 1 < points.length) {
        path += ` L${points[i]},${points[i + 1]}`;
      }
    }
    return path;
  }

  /**
   * Saves annotations directly to a PDF file
   */
  async savePDFAnnotations(
    pdfUri: string, 
    annotations: PDFAnnotation[], 
    options: PDFSaveOptions = {}
  ): Promise<{savedPath: string, backupPath?: string}> {
    try {
      console.log('savePDFAnnotations called with:', {
        pdfUri,
        annotationsCount: annotations.length,
        options
      });

      const { createBackup = true, saveDirectly = false, outputFileName } = options;
      let backupPath: string | undefined;

      // Create backup if requested
      if (createBackup && saveDirectly) {
        backupPath = await createPDFBackup(pdfUri);
      }

      let savedPath: string;

      if (saveDirectly) {
        // Save annotations directly to the original PDF (modifies original)
        await saveAnnotationsDirectlyToPDF(pdfUri, annotations);
        savedPath = pdfUri;
      } else {
        // Create a new annotated PDF file (keeps original intact)
        if (options.viewerInfo) {
          // Use enhanced embedding with viewer validation
          savedPath = await embedAnnotationsInPDFEnhanced(pdfUri, annotations, {
            outputFileName,
            viewerInfo: options.viewerInfo
          });
        } else {
          // Fallback to legacy embedding
          savedPath = await embedAnnotationsInPDF(pdfUri, annotations, outputFileName);
        }
      }

      console.log('PDF annotations saved successfully:', {
        savedPath,
        backupPath,
        annotationsEmbedded: annotations.length
      });

      return { savedPath, backupPath };

    } catch (error) {
      console.error('Failed to save PDF annotations:', error);
      throw error;
    }
  }

  /**
   * Saves annotations to both the backend and directly to the PDF file
   */
  async savePDFAnnotationsWithBackend(
    noteId: string,
    pdfUri: string,
    annotations: PDFAnnotation[],
    options: PDFSaveOptions = {},
    tags?: string[]
  ): Promise<{savedPath: string, backupPath?: string, backendResponse: any}> {
    try {
      console.log('savePDFAnnotationsWithBackend called');
      // Save to backend as DOCUMENT annotations and ensure note type remains 'document'.
      // Also clear any drawing data to avoid misclassification as a drawing note on next load.
      const headers = await this.getAuthHeaders();
      const backendPatchBody: any = {
        document_annotations: annotations,
        type: 'document',
        // Explicitly clear drawing_strokes to prevent the backend from retaining drawing data
        // (NoteSerializer maps drawing_strokes -> drawing_data and will mark has_drawing false)
        drawing_strokes: [],
      };
      if (tags && tags.length) {
        backendPatchBody.tag_names = tags;
      }

      const backendResponseRaw = await fetch(
        joinUrl(API_URL, `${API_ENDPOINTS.NOTES}${noteId}/`),
        {
          method: 'PATCH',
          headers,
          body: JSON.stringify(backendPatchBody),
        }
      );

      if (!backendResponseRaw.ok) {
        const errorData = await backendResponseRaw.json().catch(() => ({}));
        console.error('Failed to save document annotations to backend:', errorData);
        throw new Error(errorData.detail || `HTTP error! status: ${backendResponseRaw.status}`);
      }

      const backendResponse = await backendResponseRaw.json();

      // Then save to PDF
      const pdfResult = await this.savePDFAnnotations(pdfUri, annotations, options);

      console.log('Both backend and PDF save completed successfully');

      return {
        ...pdfResult,
        backendResponse
      };

    } catch (error) {
      console.error('Failed to save annotations to both backend and PDF:', error);
      throw error;
    }
  }

  /**
   * Converts SVG path string to points array
   */
  private convertPathToPoints(path: string): number[] {
    const points: number[] = [];
    try {
      const commands = path.replace(/[ML]/g, ' ').split(/[\s,]+/).filter(cmd => cmd.trim());
      
      for (let i = 0; i < commands.length; i += 2) {
        if (i + 1 < commands.length) {
          const x = parseFloat(commands[i]);
          const y = parseFloat(commands[i + 1]);
          
          if (!isNaN(x) && !isNaN(y)) {
            points.push(x, y);
          }
        }
      }
    } catch (error) {
      console.warn('Error converting path to points:', error);
    }
    
    return points;
  }

  /**
   * Auto-saves PDF annotations (both backend and PDF)
   */
  async autoSavePDFAnnotations(
    noteId: string,
    pdfUri: string,
    annotations: PDFAnnotation[],
    options: PDFSaveOptions = {}
  ): Promise<void> {
    try {
      // Use non-direct save for auto-save to preserve original
      const safeOptions = { ...options, saveDirectly: false, createBackup: false };
      await this.savePDFAnnotationsWithBackend(noteId, pdfUri, annotations, safeOptions);
    } catch (error) {
      console.warn('Auto-save PDF annotations failed:', error);
      // Don't throw error for auto-save failures
    }
  }
}

// Export instance
export const drawingAPI = new DrawingAPI();