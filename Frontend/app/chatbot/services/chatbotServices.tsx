import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL, OLLAMA_API_URL, API_ENDPOINTS } from '@/constants/ApiConfig';
import OllamaService from './ollamaService';

interface OllamaMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface OllamaChatResponse {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
  };
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}

interface OllamaGenerateResponse {
  model: string;
  created_at: string;
  response: string;
  done: boolean;
  total_duration?: number;
  load_duration?: number;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
}


class ChatbotServices {
  // Check and refresh token if needed
  private async ensureValidToken() {
    const token = await AsyncStorage.getItem('authToken');
    
    if (!token) {
      throw new Error('401 Unauthorized: No token available');
    }
    
    // Here you could also implement token refresh logic if needed
    return token;
  }

  // Send a chat message to Ollama and get response
  async sendChatMessage(messages: OllamaMessage[], model: string = 'llama3'): Promise<string> {
    try {
      return await OllamaService.chat({
        model,
        messages,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 2000
        }
      });
    } catch (error) {
      console.error('Ollama Chat Error:', error);
      throw error;
    }
  }

  // Generate response from Ollama using a prompt
  async generateResponse(prompt: string, model: string = 'llama3'): Promise<string> {
    try {
      return await OllamaService.generate({
        model,
        prompt,
        options: {
          temperature: 0.7,
          top_p: 0.9,
          num_predict: 2000
        }
      });
    } catch (error) {
      console.error('Ollama Generate Error:', error);
      throw error;
    }
  }

  // Stream chat response from Ollama (for real-time typing effect)
  async streamChatMessage(
    messages: OllamaMessage[], 
    model: string = 'llama3',
    onChunk: (chunk: string) => void,
    onComplete?: () => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    try {
      await OllamaService.streamChat(
        {
          model,
          messages,
          options: {
            temperature: 0.7,
            top_p: 0.9,
            num_predict: 2000
          }
        },
        onChunk,
        onComplete,
        onError
      );
    } catch (error) {
      console.error('Ollama Stream Error:', error);
      if (onError) {
        onError(error as Error);
      } else {
        throw error;
      }
    }
  }

  // Get available models from Ollama
  async getAvailableModels(): Promise<string[]> {
    try {
      const models = await OllamaService.listModels();
      return models.map(model => model.name);
    } catch (error) {
      console.error('Ollama Models Error:', error);
      throw error;
    }
  }

  // Check if Ollama is available
  async isOllamaAvailable(): Promise<boolean> {
    try {
      return await OllamaService.healthCheck();
    } catch (error) {
      console.warn('Ollama not available:', error);
      return false;
    }
  }

  // Enhanced utility methods using OllamaService
  async summarizeText(text: string, model: string = 'llama3'): Promise<string> {
    try {
      return await OllamaService.summarizeText(text, model);
    } catch (error) {
      console.error('Summarization Error:', error);
      throw error;
    }
  }

  async explainConcept(concept: string, model: string = 'llama3'): Promise<string> {
    try {
      return await OllamaService.explainConcept(concept, model);
    } catch (error) {
      console.error('Explanation Error:', error);
      throw error;
    }
  }

  async generateQuiz(topic: string, numQuestions: number = 5, model: string = 'llama3'): Promise<string> {
    try {
      return await OllamaService.generateQuiz(topic, numQuestions, model);
    } catch (error) {
      console.error('Quiz Generation Error:', error);
      throw error;
    }
  }

  async analyzeDocument(documentText: string, analysisType: 'summary' | 'key-points' | 'questions', model: string = 'llama3'): Promise<string> {
    try {
      return await OllamaService.analyzeDocument(documentText, analysisType, model);
    } catch (error) {
      console.error('Document Analysis Error:', error);
      throw error;
    }
  }
  
  // Extract text from images using OCR
  async extractTextFromImages(imageUri: string): Promise<string> {
    try {
      // Ensure we have a valid token before proceeding
      const token = await this.ensureValidToken();
      
      // Create form data with the image
      const formData = new FormData();
      formData.append('image', {
        uri: imageUri,
        type: 'image/jpeg', // You might need to detect actual mime type
        name: 'image.jpg',
      } as any);

      // Send the request
      const response = await fetch(`${API_URL}${API_ENDPOINTS.CHATBOT_OCR}`, {
        method: 'POST',
        headers: {
          'Authorization': `Token ${token}`,
        },
        body: formData,
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('401 Unauthorized: Session expired');
        }
        throw new Error(`Error ${response.status}: ${response.statusText}`);
      }

      const result = await response.json();
      return result.text || '';
    } catch (error) {
      console.error('OCR Error:', error);
      throw error;
    }
  }
}

export default new ChatbotServices();