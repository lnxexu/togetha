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
    return "http://192.168.36.165:8000"; // Replace with your actual local IP address or production URL
    // Kobe's local IP address is used here for demonstration purposes
    // return 'http://192.168.0.153:8000';
    // Paul's local IP address is used here for demonstration purposes
    // return 'http://192.168.1.177:8000';
}

export const API_URL = getApiBaseUrl();


// API endpoint paths
export const API_ENDPOINTS = {
    // Task Manager endpoints
    TASKS: '/task_manager/tasks/',
    TASK_CATEGORIES: '/task_manager/categories/',
    TASK_STATISTICS: '/task_manager/statistics/',
    
    // Auth endpoints
    LOGIN: '/login/',
    SIGNUP: '/signup/',
    TEST_TOKEN: '/test_token/',
    LOGOUT: '/logout_user/',

    // User profile endpoints
    USER_PROFILE: '/users/profile/',
    USER_PROGRESS: '/users/user_progress/',
    GET_USER_INFO: '/users/get_user_info/',
    UPLOAD_PROFILE_PICTURE: '/users/upload_profile_picture/',
    UPDATE_PROFILE_PICTURE: '/users/update_profile_picture/',

    // Notes endpoints
    NOTES: '/note_taking/notes/',
    NOTE_CATEGORIES: '/note_taking/categories/',
    NOTE_FOLDERS: '/note_taking/folders/',
    
    // Chatbot endpoints
    CHATBOT_OCR: '/chatbot/api/ocr/',
    CHATBOT_CONVERSATIONS: '/chatbot/conversations/',
    CHATBOT_MESSAGES: '/chatbot/api/messages/',
};
