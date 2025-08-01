import { Platform } from 'react-native';

// Function to get the correct API URL based on platform
const getApiUrl = () => {
  if (Platform.OS === 'ios') {
    // Using your Wi-Fi IP address for iOS devices/simulator
    return 'http://192.168.1.8:8000'; 
  } else {
    // Android emulator uses 10.0.2.2 to access host machine
    return 'http://10.0.2.2:8000';
  }
};

// API configuration settings
export const API_BASE_URL = getApiUrl();

// API endpoint paths
export const API_ENDPOINTS = {
    // Task Manager endpoints
    TASKS: '/task_manager/tasks/',
    TASK_DETAIL: (id: string) => `/task_manager/tasks/${id}/`,
    TASK_CATEGORIES: '/task_manager/categories/',
    TASK_CATEGORY_DETAIL: (id: string) => `/task_manager/categories/${id}/`,
    TASK_SUBTASKS: (taskId: string) => `/task_manager/tasks/${taskId}/subtasks/`,
    TASK_STATISTICS: '/task_manager/statistics/',
    
    // Auth endpoints
    LOGIN: '/login',
    SIGNUP: '/signup',
    TEST_TOKEN: '/test_token',
    GET_USERNAME: '/get_username',
    
    // Notes endpoints
    NOTES: '/note_taking/notes/',
    NOTE_DETAIL: (id: string) => `/note_taking/notes/${id}/`,
    NOTE_CATEGORIES: '/note_taking/categories/',
    NOTE_CATEGORY_DETAIL: (id: string) => `/note_taking/categories/${id}/`,
    
    // Chatbot endpoints
    CHATBOT_MESSAGE: '/chatbot/message/',
};