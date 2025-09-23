import AsyncStorage from "@react-native-async-storage/async-storage";
import { API_URL, API_ENDPOINTS } from "../../constants/ApiConfig";

/**
 * Debug utility to test API connectivity and authentication
 * This helps diagnose "Network request failed" and 403 errors
 */
export class APITestUtility {
  
  static async checkAuthToken(): Promise<{ hasToken: boolean; token?: string; error?: string }> {
    try {
      const token = await AsyncStorage.getItem("authToken");
      return {
        hasToken: !!token,
        token: token ? `${token.substring(0, 10)}...` : undefined
      };
    } catch (error) {
      return {
        hasToken: false,
        error: error instanceof Error ? error.message : "Unknown error"
      };
    }
  }

  static async testBasicConnectivity(): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
      console.log("🔍 Testing basic connectivity to:", API_URL);
      
      const response = await fetch(`${API_URL}/users/csrf-token/`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
        timeout: 10000,
      } as any);

      if (!response.ok) {
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          details: { status: response.status, url: `${API_URL}/users/csrf-token/` }
        };
      }

      const data = await response.json();
      return {
        success: true,
        details: { status: response.status, hasCSRF: !!data.csrfToken }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        details: { type: error instanceof Error ? error.name : "Unknown" }
      };
    }
  }

  static async testAuthenticatedRequest(): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        return {
          success: false,
          error: "No auth token found",
          details: { step: "token_retrieval" }
        };
      }

      console.log("🔍 Testing authenticated request with token:", `${token.substring(0, 10)}...`);

      const response = await fetch(`${API_URL}${API_ENDPOINTS.CHATBOT_CONVERSATIONS}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
        timeout: 10000,
      } as any);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          details: { 
            status: response.status, 
            errorData,
            endpoint: API_ENDPOINTS.CHATBOT_CONVERSATIONS 
          }
        };
      }

      const data = await response.json();
      return {
        success: true,
        details: { 
          status: response.status, 
          conversationCount: Array.isArray(data) ? data.length : "Unknown format" 
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        details: { type: error instanceof Error ? error.name : "Unknown" }
      };
    }
  }

  static async testDictionaryRequest(): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        return {
          success: false,
          error: "No auth token found",
          details: { step: "token_retrieval" }
        };
      }

      console.log("🔍 Testing dictionary request...");

      const response = await fetch(`${API_URL}${API_ENDPOINTS.CHATBOT_CHAT}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
        },
        body: JSON.stringify({
          messages: [
            {
              role: "user",
              content: "Define the word 'test' briefly. Provide only the definition without conversation."
            }
          ],
          conversation_id: null,
          is_dictionary_lookup: true
        }),
        timeout: 15000,
      } as any);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: response.statusText }));
        return {
          success: false,
          error: `HTTP ${response.status}: ${response.statusText}`,
          details: { 
            status: response.status, 
            errorData,
            endpoint: API_ENDPOINTS.CHATBOT_CHAT 
          }
        };
      }

      const data = await response.json();
      return {
        success: true,
        details: { 
          status: response.status, 
          hasContent: !!data.content || !!data.message,
          responseKeys: Object.keys(data)
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        details: { type: error instanceof Error ? error.name : "Unknown" }
      };
    }
  }

  static async testFileUploadPrepare(): Promise<{ success: boolean; error?: string; details?: any }> {
    try {
      const token = await AsyncStorage.getItem("authToken");
      if (!token) {
        return {
          success: false,
          error: "No auth token found",
          details: { step: "token_retrieval" }
        };
      }

      // Test if the upload endpoint is reachable
      console.log("🔍 Testing file upload endpoint reachability...");

      const testPayload = new FormData();
      testPayload.append("test", "connection_test");

      const response = await fetch(`${API_URL}${API_ENDPOINTS.CHATBOT_UPLOAD_PDF}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`,
          // No Content-Type for FormData
        },
        body: testPayload,
        timeout: 10000,
      } as any);

      // We expect this to fail with 400 (no file), but it should not be 403 or network error
      const errorData = await response.json().catch(() => ({ error: response.statusText }));
      
      return {
        success: response.status === 400, // 400 is expected for test payload
        error: response.status === 400 ? undefined : `HTTP ${response.status}: ${response.statusText}`,
        details: { 
          status: response.status, 
          errorData,
          endpoint: API_ENDPOINTS.CHATBOT_UPLOAD_PDF,
          isExpected400: response.status === 400
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
        details: { type: error instanceof Error ? error.name : "Unknown" }
      };
    }
  }

  static async runFullDiagnostic(): Promise<{
    summary: string;
    tokenCheck: any;
    connectivity: any;
    authentication: any;
    dictionary: any;
    fileUpload: any;
  }> {
    console.log("🚀 Starting API diagnostic...");
    
    const tokenCheck = await this.checkAuthToken();
    const connectivity = await this.testBasicConnectivity();
    const authentication = await this.testAuthenticatedRequest();
    const dictionary = await this.testDictionaryRequest();
    const fileUpload = await this.testFileUploadPrepare();

    const results = {
      tokenCheck,
      connectivity,
      authentication,
      dictionary,
      fileUpload
    };

    let summary = "API Diagnostic Results:\n";
    summary += `✅ Token: ${tokenCheck.hasToken ? "Found" : "Missing"}\n`;
    summary += `✅ Connectivity: ${connectivity.success ? "Success" : "Failed"}\n`;
    summary += `✅ Authentication: ${authentication.success ? "Success" : "Failed"}\n`;
    summary += `✅ Dictionary: ${dictionary.success ? "Success" : "Failed"}\n`;
    summary += `✅ File Upload: ${fileUpload.success ? "Ready" : "Failed"}\n`;

    console.log(summary);
    console.log("Full results:", results);

    return {
      summary,
      ...results
    };
  }
}

export default APITestUtility;