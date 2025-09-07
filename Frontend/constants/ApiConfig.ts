import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { DEFAULT_CONFIG, PLATFORM_DEFAULTS, EnvironmentConfig } from './EnvironmentConfig';

/**
 * Secure API configuration that uses environment variables.
 * No hardcoded IP addresses or sensitive URLs are stored in this file.
 */

function getEnvironmentConfig(): EnvironmentConfig {
    // Try to get configuration from environment variables first
    const envConfig = {
        apiUrl: process.env.EXPO_PUBLIC_API_URL,
        ollamaApiUrl: process.env.EXPO_PUBLIC_OLLAMA_API_URL,
        environment: process.env.EXPO_PUBLIC_ENVIRONMENT as 'development' | 'staging' | 'production',
        debug: process.env.EXPO_PUBLIC_DEBUG === 'true',
    };

    // Use environment config if available, otherwise fall back to defaults
    return {
        apiUrl: envConfig.apiUrl || DEFAULT_CONFIG.apiUrl,
        ollamaApiUrl: envConfig.ollamaApiUrl || DEFAULT_CONFIG.ollamaApiUrl,
        environment: envConfig.environment || DEFAULT_CONFIG.environment,
        debug: envConfig.debug !== undefined ? envConfig.debug : DEFAULT_CONFIG.debug,
    };
}

function getApiBaseUrl(): string {
    const config = getEnvironmentConfig();
    
    // If we have a configured API URL from environment, use it
    if (config.apiUrl && config.apiUrl !== DEFAULT_CONFIG.apiUrl) {
        return config.apiUrl;
    }

    // Otherwise, use platform-specific defaults for development
    if (Platform.OS === 'android' && Constants.executionEnvironment?.includes('expo')) {
        return PLATFORM_DEFAULTS.android.emulator.apiUrl;
    }
    
    if (Platform.OS === 'ios' && Constants.executionEnvironment?.includes('expo')) {
        return PLATFORM_DEFAULTS.ios.simulator.apiUrl;
    }
    
    if (Platform.OS === 'web') {
        return PLATFORM_DEFAULTS.web.apiUrl;
    }
    
    // Default fallback
    return DEFAULT_CONFIG.apiUrl;
}

function getOllamaApiUrl(): string {
    const config = getEnvironmentConfig();
    
    // If we have a configured Ollama URL from environment, use it
    if (config.ollamaApiUrl && config.ollamaApiUrl !== DEFAULT_CONFIG.ollamaApiUrl) {
        return config.ollamaApiUrl;
    }

    // Otherwise, use platform-specific defaults for development
    if (Platform.OS === 'android' && Constants.executionEnvironment?.includes('expo')) {
        return PLATFORM_DEFAULTS.android.emulator.ollamaApiUrl;
    }
    
    if (Platform.OS === 'ios' && Constants.executionEnvironment?.includes('expo')) {
        return PLATFORM_DEFAULTS.ios.simulator.ollamaApiUrl;
    }
    
    if (Platform.OS === 'web') {
        return PLATFORM_DEFAULTS.web.ollamaApiUrl;
    }
    
    // Default fallback
    return DEFAULT_CONFIG.ollamaApiUrl;
}

export const API_URL = getApiBaseUrl();
export const OLLAMA_API_URL = getOllamaApiUrl();

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
    GOOGLE_AUTH: '/users/google-auth/',
    VERIFY_TOKEN: '/users/verify-token/',
    FORGOT_PASSWORD: '/users/forgot-password/',
    VERIFY_RESET_CODE: '/users/verify-reset-code/',

    // User profile endpoints
    GET_USER_INFO: "/get_user_info/",
    USER_PROFILE: "/users/profile/",
    USER_PROGRESS: "/users/progress/",
    CHANGE_PASSWORD: "/users/change-password/",
    CSRF_TOKEN: "/users/csrf-token/",

    // Notes endpoints
    NOTES: '/note_taking/notes/',
    NOTE_CATEGORIES: '/note_taking/categories/',
    NOTE_FOLDERS: '/note_taking/folders/',
    MANAGE_NOTE_FOLDERS: '/note_taking/manage-note-folders/',
    
    // Drawing endpoints
    NOTE_DRAWING_SAVE: (noteId: string) => `/note_taking/notes/${noteId}/drawing/save/`,
    NOTE_DRAWING_GET: (noteId: string) => `/note_taking/notes/${noteId}/drawing/`,
    NOTE_DRAWING_CLEAR: (noteId: string) => `/note_taking/notes/${noteId}/drawing/clear/`,

    // Chatbot endpoints
    CHATBOT_OCR: '/chatbot/extract-text/',
    CHATBOT_CONVERSATIONS: '/chatbot/conversations/',
    CHATBOT_MESSAGES: '/chatbot/api/messages/',
    
    // Ollama endpoints
    OLLAMA_CHAT: '/api/chat',
    OLLAMA_GENERATE: '/api/generate',
    OLLAMA_TAGS: '/api/tags',
    OLLAMA_SHOW: '/api/show',

    // Notification endpoints
    NOTIFICATIONS: '/notifications/',
    NOTIFICATIONS_MARK_ALL_READ: '/notifications/mark_all_read/',
    NOTIFICATION_MARK_READ: (notificationId: string) => `/notifications/${notificationId}/mark_read/`,
    NOTIFICATIONS_CREATE_SAMPLE: '/notifications/create_sample/',
    // Logs endpoints
    LOGS: '/activity_logs/logs/',

    // Document endpoints
    DOCUMENT_UPLOAD: '/note_taking/documents/upload/',
    DOCUMENT_ANNOTATIONS: (noteId: string) => `/note_taking/documents/${noteId}/annotations/`,
    DELETE_ANNOTATION: (noteId: string, annotationId: string) => `/note_taking/documents/${noteId}/annotations/${annotationId}/`,
    SERVE_DOCUMENT: (noteId: string) => `/note_taking/documents/${noteId}/serve/`,

};

export function getUserTimezone(): string {
    try {
        return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
        return 'UTC';
    }
}

/**
 * Development helper function to log current configuration
 * Only logs in development mode and if debug is enabled
 */
export function logCurrentConfiguration(): void {
    const config = getEnvironmentConfig();
    if (config.debug && config.environment === 'development') {
        console.log('🔧 API Configuration:', {
            apiUrl: API_URL,
            ollamaApiUrl: OLLAMA_API_URL,
            environment: config.environment,
            platform: Platform.OS,
        });
    }
}

/**
 * Security check to ensure no hardcoded sensitive URLs are being used
 * This helps developers catch potential security issues during development
 */
export function validateConfiguration(): { isSecure: boolean; warnings: string[] } {
    const warnings: string[] = [];
    const config = getEnvironmentConfig();
    
    // Check if we're using localhost/default URLs in production
    if (config.environment === 'production') {
        if (API_URL.includes('localhost') || API_URL.includes('127.0.0.1')) {
            warnings.push('⚠️  Using localhost URL in production environment');
        }
        if (OLLAMA_API_URL.includes('localhost') || OLLAMA_API_URL.includes('127.0.0.1')) {
            warnings.push('⚠️  Using localhost Ollama URL in production environment');
        }
    }
    
    // Check if URLs look like development IPs in production
    const privateIPPattern = /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2[0-9]|3[01])\.|127\.)/;
    if (config.environment === 'production') {
        if (privateIPPattern.test(API_URL)) {
            warnings.push('⚠️  Using private IP address in production environment');
        }
        if (privateIPPattern.test(OLLAMA_API_URL)) {
            warnings.push('⚠️  Using private Ollama IP address in production environment');
        }
    }
    
    return {
        isSecure: warnings.length === 0,
        warnings,
    };
}
