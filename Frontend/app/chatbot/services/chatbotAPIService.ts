import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, API_ENDPOINTS } from "../../../constants/ApiConfig";

// Create fetch-based client with default config
class ApiClient {
  private baseURL: string;
  private timeout: number;
  private defaultHeaders: Record<string, string>;

  constructor() {
    this.baseURL = API_URL;
    this.timeout = 30000; // 30 second timeout
    this.defaultHeaders = {
      'Content-Type': 'application/json',
    };
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          ...this.defaultHeaders,
          ...options.headers,
        },
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Request timeout');
      }
      throw error;
    }
  }

  async get(endpoint: string, headers?: Record<string, string>): Promise<any> {
    const url = `${this.baseURL}${endpoint}`;
    const response = await this.fetchWithTimeout(url, {
      method: 'GET',
      headers,
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async post(endpoint: string, data?: any, headers?: Record<string, string>): Promise<any> {
    const url = `${this.baseURL}${endpoint}`;
    const isFormData = data instanceof FormData;
    
    const requestHeaders = { ...headers };
    if (!isFormData) {
      requestHeaders['Content-Type'] = 'application/json';
    }

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: requestHeaders,
      body: isFormData ? data : JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      const error = new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      (error as any).response = { status: response.status, data: errorData };
      throw error;
    }

    return response.json();
  }

  async patch(endpoint: string, data?: any, headers?: Record<string, string>): Promise<any> {
    const url = `${this.baseURL}${endpoint}`;
    const response = await this.fetchWithTimeout(url, {
      method: 'PATCH',
      headers,
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      const error = new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      (error as any).response = { status: response.status, data: errorData };
      throw error;
    }

    return response.json();
  }

  async delete(endpoint: string, headers?: Record<string, string>): Promise<void> {
    const url = `${this.baseURL}${endpoint}`;
    const response = await this.fetchWithTimeout(url, {
      method: 'DELETE',
      headers,
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      const error = new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
      (error as any).response = { status: response.status, data: errorData };
      throw error;
    }
  }
}

const apiClient = new ApiClient();

// Types
export interface Message {
  id?: string;
  role: "user" | "assistant";
  content: string;
  text?: string;
  isUser?: boolean;
  timestamp?: Date;
  message_type?: string;
  created_at?: string;
  model_used?: string;
  attached_files?: ConversationFile[];
}

export interface Conversation {
  id: string;
  title: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  is_pinned: boolean;
  icon: string;
  summary: string;
  messages: Message[];
  attached_files: ConversationFile[];
  message_count: number;
  last_message: {
    content: string;
    created_at: string;
    message_type: string;
  } | null;
}

export interface ConversationFile {
  id: string;
  file_name: string;
  file_type: string;
  file_size: number;
  is_processed: boolean;
  processing_status: string;
  created_at: string;
}

export interface ChatResponse {
  content: string;
  source: string;
  conversation_id: string;
  message_id: string;
}

// API Service Class
class ChatbotAPIService {
  private async getAuthToken(): Promise<string | null> {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        throw new Error("No authentication token found. Please login again.");
      }
      return token;
    } catch (error) {
      console.error("Error getting auth token:", error);
      throw new Error("Authentication failed. Please login again.");
    }
  }

  private async getAuthHeaders() {
    const token = await this.getAuthToken();
    return {
      Authorization: `Token ${token}`,
      "Content-Type": "application/json",
    };
  }

  private handleNetworkError(error: any, operation: string) {
    console.error(`${operation} failed:`, error);
    
    if (error.code === 'NETWORK_ERROR' || error.message === 'Network Error') {
      throw new Error('Unable to connect to server. Please check your internet connection and try again.');
    } else if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please login again.');
    } else if (error.response?.status === 403) {
      throw new Error('Access denied. You do not have permission to perform this action.');
    } else if (error.response?.status >= 500) {
      throw new Error('Server error. Please try again later.');
    } else if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    } else {
      throw new Error(`${operation} failed. Please try again.`);
    }
  }

  // Conversation Management
  async getConversations(filter?: string, search?: string): Promise<Conversation[]> {
    try {
      const headers = await this.getAuthHeaders();
      const params = new URLSearchParams();
      if (filter) params.append("filter", filter);
      if (search) params.append("search", search);

      const endpoint = `${API_ENDPOINTS.CHATBOT_CONVERSATIONS}?${params.toString()}`;
      const response = await apiClient.get(endpoint, headers);
      return response;
    } catch (error) {
      this.handleNetworkError(error, "Fetching conversations");
      return []; // This won't be reached due to throw, but TypeScript needs it
    }
  }

  async getConversation(conversationId: string): Promise<Conversation> {
    try {
      const headers = await this.getAuthHeaders();
      const endpoint = `${API_ENDPOINTS.CHATBOT_CONVERSATIONS}${conversationId}/`;
      const response = await apiClient.get(endpoint, headers);
      return response;
    } catch (error) {
      this.handleNetworkError(error, "Fetching conversation");
      throw error; // Re-throw after handling
    }
  }

  async createConversation(data: Partial<Conversation>): Promise<Conversation> {
    try {
      const headers = await this.getAuthHeaders();
      const response = await apiClient.post(
        API_ENDPOINTS.CHATBOT_CONVERSATIONS,
        data,
        headers
      );
      return response;
    } catch (error) {
      this.handleNetworkError(error, "Creating conversation");
      throw error;
    }
  }

  async updateConversation(
    conversationId: string,
    data: Partial<Conversation>
  ): Promise<Conversation> {
    try {
      const headers = await this.getAuthHeaders();
      const endpoint = `${API_ENDPOINTS.CHATBOT_CONVERSATIONS}${conversationId}/`;
      const response = await apiClient.patch(endpoint, data, headers);
      return response;
    } catch (error) {
      this.handleNetworkError(error, "Updating conversation");
      throw error;
    }
  }

  async deleteConversation(conversationId: string): Promise<void> {
    try {
      const headers = await this.getAuthHeaders();
      const endpoint = `${API_ENDPOINTS.CHATBOT_CONVERSATIONS}${conversationId}/`;
      await apiClient.delete(endpoint, headers);
    } catch (error) {
      this.handleNetworkError(error, "Deleting conversation");
      throw error;
    }
  }

  // Message Management
  async getMessages(conversationId?: string) {
    try {
      const headers = await this.getAuthHeaders();
      const params = conversationId ? `?conversation_id=${conversationId}` : "";
      const endpoint = `${API_ENDPOINTS.CHATBOT_MESSAGES}${params}`;
      const response = await apiClient.get(endpoint, headers);
      return response;
    } catch (error) {
      this.handleNetworkError(error, "Fetching messages");
      throw error;
    }
  }

  async deleteMessage(messageId: string): Promise<void> {
    try {
      const headers = await this.getAuthHeaders();
      const endpoint = `${API_ENDPOINTS.CHATBOT_MESSAGES}${messageId}/`;
      await apiClient.delete(endpoint, headers);
    } catch (error) {
      this.handleNetworkError(error, "Deleting message");
      throw error;
    }
  }

  async sendMessage(
    message: string,
    conversationId?: string,
    messages?: Message[]
  ): Promise<ChatResponse> {
    try {
      const headers = await this.getAuthHeaders();
      
      // Format messages for the chat endpoint
      const formattedMessages = messages || [{ role: "user", content: message }];
      
      // Using CHATBOT_MESSAGES endpoint for sending messages
      const response = await apiClient.post(
        API_ENDPOINTS.CHATBOT_MESSAGES,
        {
          messages: formattedMessages,
          conversation_id: conversationId,
        },
        headers
      );
      return response;
    } catch (error: any) {
      this.handleNetworkError(error, "Sending message");
      throw error;
    }
  }

  // File Management
  async uploadFile(
    file: any,
    conversationId?: string
  ): Promise<{ message: string; file_id: string; conversation_id: string }> {
    try {
      const token = await this.getAuthToken();
      const formData = new FormData();
      
      formData.append("file", {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || "application/pdf",
      } as any);
      
      if (conversationId) {
        formData.append("conversation_id", conversationId);
      }

      const response = await apiClient.post(
        API_ENDPOINTS.DOCUMENT_UPLOAD,
        formData,
        {
          Authorization: `Token ${token}`,
        }
      );
      return response;
    } catch (error) {
      console.error("Error uploading file:", error);
      throw error;
    }
  }

  async extractTextFromImage(image: any): Promise<{ text: string }> {
    try {
      const token = await this.getAuthToken();
      const formData = new FormData();
      formData.append("image", {
        uri: image.uri,
        name: image.name || "image.jpg",
        type: image.mimeType || "image/jpeg",
      } as any);
      // Use pytesseract endpoint from API_ENDPOINTS
      const response = await apiClient.post(
        API_ENDPOINTS.CHATBOT_OCR,
        formData,
        {
          Authorization: `Token ${token}`,
        }
      );
      return response;
    } catch (error) {
      console.error("Error extracting text from image:", error);
      throw error;
    }
  }

  // Settings Management
  async getChatbotSettings() {
    try {
      const headers = await this.getAuthHeaders();
      // Using conversations endpoint as a fallback since CHATBOT_SETTINGS doesn't exist
      const response = await apiClient.get('/chatbot/settings/', headers);
      return response;
    } catch (error) {
      console.error("Error fetching settings:", error);
      throw error;
    }
  }

  async updateChatbotSettings(settings: any) {
    try {
      const headers = await this.getAuthHeaders();
      const response = await apiClient.post(
        '/chatbot/settings/',
        settings,
        headers
      );
      return response;
    } catch (error) {
      console.error("Error updating settings:", error);
      throw error;
    }
  }

  // Message Actions
  async provideFeedback(
    messageId: string,
    wasHelpful: boolean,
    feedback?: string
  ) {
    try {
      const headers = await this.getAuthHeaders();
      const response = await apiClient.post(
        `/chatbot/messages/${messageId}/actions/`,
        {
          action: "feedback",
          was_helpful: wasHelpful,
          feedback: feedback,
        },
        headers
      );
      return response;
    } catch (error) {
      console.error("Error providing feedback:", error);
      throw error;
    }
  }

  async generateTitle(conversationId: string) {
    try {
      const headers = await this.getAuthHeaders();
      const response = await apiClient.post(
        '/chatbot/messages/actions/',
        {
          action: "generate_title",
          conversation_id: conversationId,
        },
        headers
      );
      return response;
    } catch (error) {
      console.error("Error generating title:", error);
      throw error;
    }
  }

  async clearAllConversations() {
    try {
      const headers = await this.getAuthHeaders();
      const response = await apiClient.post(
        '/chatbot/messages/actions/',
        { action: "clear_all" },
        headers
      );
      return response;
    } catch (error) {
      console.error("Error clearing conversations:", error);
      throw error;
    }
  }
}

// Export singleton instance
export const chatbotAPI = new ChatbotAPIService();
export default chatbotAPI;