
import { API_URL, API_ENDPOINTS } from '@/constants/ApiConfig';
import AsyncStorage from '@react-native-async-storage/async-storage';

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
}

// Export instance
export const drawingAPI = new DrawingAPI();