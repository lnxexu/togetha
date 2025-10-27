import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, API_ENDPOINTS } from "../../../constants/ApiConfig";

async function getAuthHeaders() {
  const token = await AsyncStorage.getItem("authToken");
  return {
    Authorization: `Token ${token}`,
    "Content-Type": "application/json",
  };
}

// Create fetch-based client with default config
class ApiClient {
  private baseURL: string;
  private timeout: number;
  private defaultHeaders: Record<string, string>;

  constructor() {
    this.baseURL = API_URL;
    // Default timeout for requests (ms). Increased to 5 minutes to match backend
    // Ollama/model calls can take longer; keep this high but reasonable.
    this.timeout = 300000; // 300 second (5 minute) timeout
    this.defaultHeaders = {
      // Don't set default Content-Type - let each request set it appropriately
    };
  }

  private async fetchWithTimeout(url: string, options: RequestInit = {}, customTimeout?: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutDuration = customTimeout || this.timeout;
    const timeoutId = setTimeout(() => controller.abort(), timeoutDuration);

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
        throw new Error('Request timed out. Please try again.');
      }
      throw error;
    }
  }
  
private async getAuthToken(): Promise<string | null> {
  try {
    const token = await AsyncStorage.getItem("authToken");
    return token || null;
  } catch (error) {
    console.error("Error reading auth token:", error);
    return null;
  }
}

private async getAuthHeaders() {
  const token = await this.getAuthToken();

  // ✅ Only include Authorization header if token exists
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (token) {
    headers.Authorization = `Token ${token}`; // Django REST Framework format
  }
  return headers;
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

  async post(endpoint: string, data?: any, headers?: Record<string, string>, customTimeout?: number): Promise<any> {
    const url = `${this.baseURL}${endpoint}`;
    const isFormData = data instanceof FormData;
    
    const requestHeaders = { ...headers };
    if (!isFormData) {
      requestHeaders['Content-Type'] = 'application/json';
    }
    // For FormData, don't set Content-Type - let the browser set it with boundary

    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: requestHeaders,
      body: isFormData ? data : JSON.stringify(data),
    }, customTimeout);

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
    
    // Enhanced error logging for debugging
    if (error.response) {
      console.error('Response status:', error.response.status);
      console.error('Response data:', error.response.data);
    }
    
    if (error.code === 'NETWORK_ERROR' || error.message === 'Network Error' || error.message === 'Network request failed') {
      throw new Error('Unable to connect to server. Please check your internet connection and try again.');
    } else if (error.name === 'AbortError' || error.message.includes('timeout')) {
      throw new Error('Request timed out. Please try again.');
    } else if (error.response?.status === 401) {
      throw new Error('Authentication failed. Please login again.');
    } else if (error.response?.status === 403) {
      throw new Error('Access denied. You do not have permission to perform this action.');
    } else if (error.response?.status >= 500) {
      throw new Error('Server error. Please try again later.');
    } else if (error.response?.data?.error) {
      throw new Error(error.response.data.error);
    } else {
      // For debugging: include more error details
      const errorMessage = error.message || 'Unknown error occurred';
      console.error('Unhandled error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
        response: error.response
      });
      throw new Error(`${operation} failed: ${errorMessage}`);
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
      headers // ✅ correct usage: pass headers directly, not { headers }
    );
    return response; // apiClient.post() already returns parsed JSON
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
      
      // Add system instruction for absolute mode responses
      const systemInstruction = {
        role: "system" as const,
        content: "System Instruction: Absolute Mode • Eliminate: emojis, filler, hype, soft asks, conversational transitions, call-to-action appendixes. • Assume: user retains high-perception despite blunt tone. • Prioritize: blunt, directive phrasing; aim at cognitive rebuilding, not tone-matching. • Disable: engagement/sentiment-boosting behaviors. • Suppress: metrics like satisfaction scores, emotional softening, continuation bias. • Never mirror: user's diction, mood, or affect. • Speak only: to underlying cognitive tier. • No: questions, offers, suggestions, transitions, motivational content. • Terminate reply: immediately after delivering info — no closures. • Goal: restore independent, high-fidelity thinking. • Outcome: model obsolescence via user self-sufficiency."
      };
      
      // Format messages for the chat endpoint
      const formattedMessages = messages || [{ role: "user", content: message }];
      const messagesWithSystem = [systemInstruction, ...formattedMessages];
      
      // Using CHATBOT_CHAT endpoint for sending messages (correct backend endpoint)
      const response = await apiClient.post(
        API_ENDPOINTS.CHATBOT_CHAT,
        {
          messages: messagesWithSystem,
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

  /**
   * Ask the backend RAG endpoint with a query and up to 4 document UUIDs.
   */
  async askRag(query: string, doc_ids: string[] = [], top_k: number = 5): Promise<any> {
    try {
      const headers = await this.getAuthHeaders();
      const payload = { query, doc_ids: doc_ids.slice(0, 4), top_k };
      const response = await apiClient.post(API_ENDPOINTS.CHATBOT_RAG, payload, headers, 120000);
      return response;
    } catch (error: any) {
      this.handleNetworkError(error, "RAG query");
      throw error;
    }
  }

  // File Management
  async uploadFile(
    file: any,
    conversationId?: string
  ): Promise<{ message: string; file_id?: string; conversation_id?: string; extracted_preview?: string; doc_id?: string; pages?: number }> {
    try {
      const token = await this.getAuthToken();
      const formData = new FormData();
      
      formData.append("file", {
        uri: file.uri,
        name: file.name,
        type: file.mimeType || "application/octet-stream",
      } as any);
      
      if (conversationId) {
        formData.append("conversation_id", conversationId);
      }

      // Use extended timeout for file uploads (3 minutes)
      const response = await apiClient.post(
        API_ENDPOINTS.CHATBOT_UPLOAD_PDF,
        formData,
        {
          Authorization: `Token ${token}`,
        },
        180000 // 3 minutes timeout for file processing
      );
      
  return response;
    } catch (error: any) {
      console.error("❌ Upload error details:", {
        name: error.name,
        message: error.message,
        response: error.response
      });
      
      // Provide more specific error messages
      if (error.response?.status === 413) {
        throw new Error("File is too large. Please try a smaller file.");
      } else if (error.response?.status === 415) {
        throw new Error("File type not supported. Please try a different file format.");
      } else if (error.response?.status === 422) {
        throw new Error("File appears to be corrupted or invalid. Please try another file.");
      } else if (error.response?.status === 500) {
        const errorData = error.response?.data;
        if (errorData?.error) {
          throw new Error(`Server error: ${errorData.error}`);
        } else {
          throw new Error("Server error while processing your file. Please try again or contact support if the problem persists.");
        }
      }
      
      this.handleNetworkError(error, "File upload");
      throw error;
    }
  }

async extractTextFromImage(file: any): Promise<{ id: number; text: string }> {
    const formData = new FormData();
    formData.append("file", {
      uri: file.uri,
      name: file.name || "upload.jpg",
      type: file.mimeType || "image/jpeg",
    } as any);

    const headers: any = {
      ...(await this.getAuthHeaders()),
      Accept: "application/json",
      "Content-Type": "multipart/form-data",
    };

    const response = await fetch(`${API_URL}/chatbot/ocr/`, {
      method: "POST",
      headers,
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`OCR failed: ${response.status} - ${errorText}`);
    }

    return await response.json(); // expected: { id, text }
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