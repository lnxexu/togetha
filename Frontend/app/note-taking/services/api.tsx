// API URL configuration
import { Platform } from 'react-native';  

const API_URL = __DEV__ 
  ? Platform.OS === 'android'
    ? 'http://10.0.2.2:8000'  // Android emulator 
    : 'http://localhost:8000'  // iOS simulator
  : 'https://your-production-api-url.com';  // Production API
  
let AUTH_TOKEN: string | null = null;

// Helper function for API requests
const fetchAPI = async (endpoint: string, options: RequestInit = {}) => {
  // Default headers with authentication
  const headers = {
    'Content-Type': 'application/json',
    ...(AUTH_TOKEN && { 'Authorization': `Token ${AUTH_TOKEN}` }),
    ...options.headers
  };

  // Merge options
  const fetchOptions = {
    ...options,
    headers
  };

  try {
    const response = await fetch(`${API_URL}${endpoint}`, fetchOptions);
    
    // Check for success status
    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.message || `API Error: ${response.status}`);
    }

    // Return parsed JSON or empty object if no content
    if (response.status === 204) {
      return {};
    }
    return await response.json();
  } catch (error) {
    console.error('API request failed:', error);
    throw error;
  }
};

// Set auth token for API calls
export const setAuthToken = (token: string) => {
  AUTH_TOKEN = token;
};

// Notes API functions
export const notesApi = {
  // Get all folders
  getFolders: async () => {
    return fetchAPI('/note-api/folders/');
  },
  
  // Create a new folder
  createFolder: async (folderData: any) => {
    return fetchAPI('/note-api/folders/', {
      method: 'POST',
      body: JSON.stringify(folderData)
    });
  },
  
  // Update a folder
  updateFolder: async (id: string, folderData: any) => {
    return fetchAPI(`/note-api/folders/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(folderData)
    });
  },
  
  // Delete a folder
  deleteFolder: async (id: string) => {
    return fetchAPI(`/note-api/folders/${id}/`, {
      method: 'DELETE'
    });
  },
  
  // Get all notes
  getNotes: async () => {
    return fetchAPI('/note-api//notes/');
  },
  
  // Get notes by folder ID
  getNotesByFolder: async (folderId: string) => {
    return fetchAPI(`/note-api/notes/?folder_id=${folderId}`);
  },
  
  // Create a new note
  createNote: async (noteData: any) => {
    return fetchAPI('/note-api/notes/', {
      method: 'POST',
      body: JSON.stringify(noteData)
    });
  },
  
  // Update a note
  updateNote: async (id: string, noteData: any) => {
    return fetchAPI(`/note-api/notes/${id}/`, {
      method: 'PATCH',
      body: JSON.stringify(noteData)
    });
  },
  
  // Delete a note
  deleteNote: async (id: string) => {
    return fetchAPI(`/note-api/notes/${id}/`, {
      method: 'DELETE'
    });
  },
  
  // Upload audio recording
  uploadAudioRecording: async (noteId: string, audioUri: string) => {
    // Create FormData for file upload
    const formData = new FormData();
    formData.append('note', noteId);
    
    // Extract filename from URI
    const uriParts = audioUri.split('/');
    const fileName = uriParts[uriParts.length - 1];
    
    // Add the audio file to the form data
    const fileType = 'audio/m4a'; // Adjust based on your recording format
    
    // @ts-ignore - TypeScript doesn't recognize the format needed for React Native
    formData.append('audio_file', {
      uri: audioUri,
      name: fileName,
      type: fileType
    });
    
    // Use fetch directly for FormData uploads
    const response = await fetch(`${API_URL}/api/notes/audio-recordings/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'multipart/form-data',
        ...(AUTH_TOKEN && { 'Authorization': `Token ${AUTH_TOKEN}` })
      },
      body: formData
    });
    
    if (!response.ok) {
      throw new Error(`Failed to upload audio: ${response.status}`);
    }
    
    return await response.json();
  },
  
  // Transcribe audio recording
  transcribeAudioRecording: async (id: string) => {
    return fetchAPI(`/api/notes/audio-recordings/${id}/transcribe/`, {
      method: 'POST'
    });
  },
};

export default notesApi;