
import { API_URL, API_ENDPOINTS } from '@/constants/ApiConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { embedAnnotationsInPDF, saveAnnotationsDirectlyToPDF, createPDFBackup, PDFAnnotation } from '../utils/pdfUtils';

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
}

// Add this new class to your existing api.tsx file
export class DrawingAPI {

   private async getCSRFToken(): Promise<string | null> {
    try {
      const response = await fetch(`${API_URL}${API_ENDPOINTS.CSRF_TOKEN}`, {
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
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...(csrfToken && { 'X-CSRFToken': csrfToken }),
      };
    } catch (error) {
      console.error('Failed to get auth headers:', error);
      return {
        'Content-Type': 'application/json',
        'X-Requested-With': 'XMLHttpRequest',
      };
    }
  }
  async saveDrawing(noteId: string, strokes: DrawingStroke[]): Promise<any> {
    try {
      console.log('drawingAPI.saveDrawing called with:', {
        noteId,
        strokesCount: strokes.length,
        firstStroke: strokes.length > 0 ? strokes[0] : null
      });

      const drawingDataString = JSON.stringify(strokes);
      console.log('Serialized drawing data:', {
        length: drawingDataString.length,
        preview: drawingDataString.substring(0, 200) + '...',
        strokesPreview: strokes.map(s => ({ id: s.id, pointsCount: s.points.length, tool: s.tool }))
      });

      const headers = await this.getAuthHeaders();
      
      // Try using the regular notes endpoint with PATCH instead of the drawing-specific endpoint
      const requestBody = { 
        drawing_data: drawingDataString
      };
      
      console.log('Request body structure:', {
        hasDrawingData: !!requestBody.drawing_data,
        drawingDataLength: requestBody.drawing_data.length,
        drawingDataType: typeof requestBody.drawing_data
      });

      // Use the regular notes endpoint for updating drawing data
      const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTES}${noteId}/`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify(requestBody),
      });

      console.log('API response status:', response.status);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        console.error('API error response:', errorData);
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

      const result = await response.json();
      console.log('API success response:', result);
      
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
      const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTES}${noteId}/`, {
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
      
      console.log('Parsed strokes:', strokes.length, strokes.length > 0 ? strokes[0] : 'none');
      
      return {
        strokes,
        noteId: data.id || noteId,
        hasDrawing: strokes.length > 0,
        lastUpdate: data.updated_at || data.last_update,
      };
    } catch (error) {
      console.error('Failed to get drawing:', error);
      throw error;
    }
  }

  async clearDrawing(noteId: string): Promise<any> {
    try {
      const headers = await this.getAuthHeaders();
      
      // Clear drawing by setting drawing_data to empty array
      const response = await fetch(`${API_URL}${API_ENDPOINTS.NOTES}${noteId}/`, {
        method: 'PATCH',
        headers,
        body: JSON.stringify({
          drawing_data: JSON.stringify([]) // Clear with empty array
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || `HTTP error! status: ${response.status}`);
      }

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
    folderId?: string | null
  ): Promise<{noteId: string, note: any}> {
    try {
      const headers = await this.getAuthHeaders();
      console.log('Creating new note with title:', title);
      console.log('Headers:', headers);
      
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
          drawing_data: JSON.stringify(strokes), // Add drawing data directly
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
        savedPath = await embedAnnotationsInPDF(pdfUri, annotations, outputFileName);
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
    options: PDFSaveOptions = {}
  ): Promise<{savedPath: string, backupPath?: string, backendResponse: any}> {
    try {
      console.log('savePDFAnnotationsWithBackend called');

      // Convert PDF annotations to drawing strokes format for backend
      const strokes: DrawingStroke[] = annotations.map(annotation => ({
        id: annotation.id,
        points: annotation.path ? this.convertPathToPoints(annotation.path) : [annotation.x, annotation.y],
        color: annotation.color,
        width: annotation.strokeWidth || 3,
        tool: annotation.type,
        timestamp: annotation.timestamp,
        opacity: 1.0
      }));

      // Save to backend first
      const backendResponse = await this.saveDrawing(noteId, strokes);

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