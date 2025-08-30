import { OLLAMA_API_URL, API_ENDPOINTS } from '@/constants/ApiConfig';

export interface OllamaModel {
  name: string;
  modified_at: string;
  size: number;
  digest: string;
  details?: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaModelInfo {
  license: string;
  modelfile: string;
  parameters: string;
  template: string;
  details: {
    format: string;
    family: string;
    families: string[] | null;
    parameter_size: string;
    quantization_level: string;
  };
}

export interface GenerateRequest {
  model: string;
  prompt: string;
  stream?: boolean;
  raw?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repeat_penalty?: number;
    seed?: number;
    num_predict?: number;
    stop?: string[];
  };
  system?: string;
  context?: number[];
  keep_alive?: string;
}

export interface ChatRequest {
  model: string;
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  stream?: boolean;
  format?: 'json';
  options?: {
    temperature?: number;
    top_p?: number;
    top_k?: number;
    repeat_penalty?: number;
    seed?: number;
    num_predict?: number;
    stop?: string[];
  };
  keep_alive?: string;
}

class OllamaService {
  private baseUrl = OLLAMA_API_URL;

  // Health check - verify Ollama is running
  async healthCheck(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/api/tags`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      return response.ok;
    } catch (error) {
      console.warn('Ollama health check failed:', error);
      return false;
    }
  }

  // Get all available models
  async listModels(): Promise<OllamaModel[]> {
    try {
      const response = await fetch(`${this.baseUrl}${API_ENDPOINTS.OLLAMA_TAGS}`, {
        method: 'GET',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch models: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.models || [];
    } catch (error) {
      console.error('Error listing models:', error);
      throw error;
    }
  }

  // Get information about a specific model
  async getModelInfo(modelName: string): Promise<OllamaModelInfo> {
    try {
      const response = await fetch(`${this.baseUrl}${API_ENDPOINTS.OLLAMA_SHOW}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: modelName
        }),
      });

      if (!response.ok) {
        throw new Error(`Failed to get model info: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Error getting model info:', error);
      throw error;
    }
  }

  // Generate text using a prompt (non-streaming)
  async generate(request: GenerateRequest): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}${API_ENDPOINTS.OLLAMA_GENERATE}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...request,
          stream: false
        }),
      });

      if (!response.ok) {
        throw new Error(`Generation failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.response || '';
    } catch (error) {
      console.error('Error generating text:', error);
      throw error;
    }
  }

  // Chat with model (non-streaming)
  async chat(request: ChatRequest): Promise<string> {
    try {
      const response = await fetch(`${this.baseUrl}${API_ENDPOINTS.OLLAMA_CHAT}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...request,
          stream: false
        }),
      });

      if (!response.ok) {
        throw new Error(`Chat failed: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.message?.content || '';
    } catch (error) {
      console.error('Error in chat:', error);
      throw error;
    }
  }

  // Streaming generate
  async streamGenerate(
    request: GenerateRequest,
    onChunk: (chunk: string) => void,
    onComplete?: () => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}${API_ENDPOINTS.OLLAMA_GENERATE}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...request,
          stream: true
        }),
      });

      if (!response.ok) {
        throw new Error(`Streaming generate failed: ${response.status} ${response.statusText}`);
      }

      await this.processStreamingResponse(response, onChunk, onComplete, onError);
    } catch (error) {
      console.error('Error in streaming generate:', error);
      if (onError) {
        onError(error as Error);
      } else {
        throw error;
      }
    }
  }

  // Streaming chat
  async streamChat(
    request: ChatRequest,
    onChunk: (chunk: string) => void,
    onComplete?: () => void,
    onError?: (error: Error) => void
  ): Promise<void> {
    try {
      const response = await fetch(`${this.baseUrl}${API_ENDPOINTS.OLLAMA_CHAT}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...request,
          stream: true
        }),
      });

      if (!response.ok) {
        throw new Error(`Streaming chat failed: ${response.status} ${response.statusText}`);
      }

      await this.processStreamingResponse(response, onChunk, onComplete, onError, 'chat');
    } catch (error) {
      console.error('Error in streaming chat:', error);
      if (onError) {
        onError(error as Error);
      } else {
        throw error;
      }
    }
  }

  // Helper method to process streaming responses
  private async processStreamingResponse(
    response: Response,
    onChunk: (chunk: string) => void,
    onComplete?: () => void,
    onError?: (error: Error) => void,
    type: 'generate' | 'chat' = 'generate'
  ): Promise<void> {
    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('No response body available');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            try {
              const json = JSON.parse(line);
              
              if (type === 'chat') {
                if (json.message && json.message.content) {
                  onChunk(json.message.content);
                }
              } else {
                if (json.response) {
                  onChunk(json.response);
                }
              }

              if (json.done) {
                if (onComplete) onComplete();
                return;
              }
            } catch (parseError) {
              console.warn('Failed to parse streaming response line:', line);
            }
          }
        }
      }

      if (onComplete) onComplete();
    } catch (error) {
      if (onError) {
        onError(error as Error);
      } else {
        throw error;
      }
    }
  }

  // Utility methods for common tasks
  async summarizeText(text: string, model: string = 'llama3'): Promise<string> {
    return this.generate({
      model,
      prompt: `Please provide a concise summary of the following text:\n\n${text}`,
      options: {
        temperature: 0.3,
        num_predict: 500
      }
    });
  }

  async explainConcept(concept: string, model: string = 'llama3'): Promise<string> {
    return this.generate({
      model,
      prompt: `Please explain the concept of "${concept}" in simple, easy-to-understand terms with examples:`,
      options: {
        temperature: 0.5,
        num_predict: 800
      }
    });
  }

  async generateQuiz(topic: string, numQuestions: number = 5, model: string = 'llama3'): Promise<string> {
    return this.generate({
      model,
      prompt: `Generate ${numQuestions} multiple choice questions about "${topic}". Format each question with 4 options (A, B, C, D) and provide the correct answer at the end.`,
      options: {
        temperature: 0.7,
        num_predict: 1000
      }
    });
  }

  async analyzeDocument(documentText: string, analysisType: 'summary' | 'key-points' | 'questions', model: string = 'llama3'): Promise<string> {
    const prompts = {
      summary: `Please provide a comprehensive summary of the following document:\n\n${documentText}`,
      'key-points': `Please extract the key points and main ideas from the following document:\n\n${documentText}`,
      questions: `Please generate study questions based on the following document:\n\n${documentText}`
    };

    return this.generate({
      model,
      prompt: prompts[analysisType],
      options: {
        temperature: 0.4,
        num_predict: 800
      }
    });
  }
}

export default new OllamaService();
