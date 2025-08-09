import { Platform } from 'react-native';
import Constants from 'expo-constants';

// API configuration settings that can versatilely be used across the application like emulators, real devices, etc.
function getApiBaseUrl() {
    // If running on Android emulator, use 10.0.2.2 to access host machine
    if (Platform.OS === 'android' && Constants.executionEnvironment?.includes('expo')) {
        return 'http://10.0.2.2:8000';
    }
    // For iOS simulator or Expo Go, localhost works
    if (Platform.OS === 'ios' && Constants.executionEnvironment?.includes('expo')) {
        return 'http://localhost:8000';
    }
    //For web, use the environment variable or default to localhost
    if (Platform.OS === 'web') {
        return process.env.REACT_APP_API_URL || 'http://localhost:8000';
    }
    // For real devices, use your machine's local IP address or production URL

    // return 'http://192.168.36.165:8000'; // IP for Kobe's DITO  

    // return 'http://192.168.81.162:8000'; // IP for ITRC
    
    // return 'http://172.16.5.215:8000'; // IP for Student3
  
    return 'http://192.168.0.153:8000';   // Kobe's local IP address 
    
    // return 'http://192.168.1.177:8000';// Paul's local IP address 
}

export const API_URL = getApiBaseUrl();


// API endpoint paths
export const API_ENDPOINTS = {
    // Task Manager endpoints
    TASKS: '/task_manager/tasks/',
    TASK_CATEGORIES: '/task_manager/categories/',
    TASK_STATISTICS: '/task_manager/statistics/',
    TASK_DETAIL: (taskId: string) => `/task_manager/tasks/${taskId}/`,
    
    // Auth endpoints
    LOGIN: '/login/',
    SIGNUP: '/signup/',
    TEST_TOKEN: '/test_token/',
    LOGOUT: '/logout_user/',

    // User profile endpoints
    GET_USER_INFO: "/get_user_info/",
    USER_PROFILE: "/users/profile/",
    USER_PROGRESS: "/users/progress/",
    CSRF_TOKEN: "/users/csrf-token/",

    // Notes endpoints
    NOTES: '/note_taking/notes/',
    NOTE_CATEGORIES: '/note_taking/categories/',
    NOTE_FOLDERS: '/note_taking/folders/',
    
    // Chatbot endpoints
    CHATBOT_OCR: '/chatbot/extract-text/',
    CHATBOT_CONVERSATIONS: '/chatbot/conversations/',
    CHATBOT_MESSAGES: '/chatbot/api/messages/',

    // Notification endpoints
    NOTIFICATIONS: '/notifications/',
};

export function getUserTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
}
