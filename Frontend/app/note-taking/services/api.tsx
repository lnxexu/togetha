import axios from 'axios';

// Replace with your actual backend URL
const API_URL = 'http://127.0.0.1:8000';

// Create axios instance with authentication
const api = axios.create({
  baseURL: API_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Configure auth token (you'll need to implement this)
export const setAuthToken = (token: string) => {
  api.defaults.headers.common['Authorization'] = `Token ${token}`;
};

// Notes API functions
export const notesApi = {
  // Get all folders
  getFolders: async () => {
    const response = await api.get('/api/notes/folders/');
    return response.data;
  },
  
  // Create a new folder
  createFolder: async (folderData: any) => {
    const response = await api.post('/api/notes/folders/', folderData);
    return response.data;
  },
  
  // Update a folder
  updateFolder: async (id: string, folderData: any) => {
    const response = await api.patch(`/api/notes/folders/${id}/`, folderData);
    return response.data;
  },
  
  // Delete a folder
  deleteFolder: async (id: string) => {
    const response = await api.delete(`/api/notes/folders/${id}/`);
    return response.data;
  },
  
  // Get all notes
  getNotes: async () => {
    const response = await api.get('/api/notes/notes/');
    return response.data;
  },
  
  // Get notes by folder ID
  getNotesByFolder: async (folderId: string) => {
    const response = await api.get(`/api/notes/notes/?folder_id=${folderId}`);
    return response.data;
  },
  
  // Get audio recordings by note ID
  getAudioRecordings: async (noteId: string) => {
    const response = await api.get(`/api/notes/audio-recordings/?note_id=${noteId}`);
    return response.data;
  },
  
  // Create a new note
  createNote: async (noteData: any) => {
    const response = await api.post('/api/notes/notes/', noteData);
    return response.data;
  },
  
  // Update a note
  updateNote: async (id: string, noteData: any) => {
    const response = await api.patch(`/api/notes/notes/${id}/`, noteData);
    return response.data;
  },
  
  // Delete a note
  deleteNote: async (id: string) => {
    const response = await api.delete(`/api/notes/notes/${id}/`);
    return response.data;
  },
  
  // Upload audio recording
  uploadAudioRecording: async (noteId: string, audioUri: string) => {
    const formData = new FormData();
    formData.append('note', noteId);
    
    // Extract filename from URI
    const uriParts = audioUri.split('/');
    const fileName = uriParts[uriParts.length - 1];
    
    formData.append('audio_file', {
      uri: audioUri,
      name: fileName,
      type: 'audio/m4a', // Adjust based on your recording format
    } as any);
    
    const response = await api.post('/api/notes/audio-recordings/', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
    });
    return response.data;
  },
  
  // Transcribe audio recording
  transcribeAudioRecording: async (id: string) => {
    const response = await api.post(`/api/notes/audio-recordings/${id}/transcribe/`);
    return response.data;
  },
};

export default notesApi;