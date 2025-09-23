import { API_URL, API_ENDPOINTS } from "../../../constants/ApiConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Dictionary Service - Provides word definitions and explanations without storing in chat history
 * This service is specifically designed for RINA dictionary functionality to avoid cluttering
 * the main conversation history with dictionary lookups.
 */
class DictionaryService {
  private baseURL: string;
  private timeout: number;

  constructor() {
    this.baseURL = API_URL;
    this.timeout = 60000; // 60 second timeout for dictionary requests
  }

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

  private async fetchWithTimeout(url: string, options: RequestInit = {}): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.timeout);

    try {
      const token = await this.getAuthToken();
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Token ${token}`,
          ...options.headers,
        },
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Dictionary request timeout');
      }
      throw error;
    }
  }

  /**
   * Get word definition without storing in chat history
   * @param word - The word to define
   * @returns Promise with definition data
   */
  async getWordDefinition(word: string): Promise<{
    word: string;
    definition: string;
    partOfSpeech?: string;
    synonyms?: string[];
    examples?: string[];
  }> {
    try {
      const cleanWord = word.trim().toLowerCase();
      
      // Create a dictionary-specific prompt with a special conversation ID for temp storage
      const dictionaryPrompt = {
        messages: [
          {
            role: "system",
            content: "System Instruction: Absolute Mode • Eliminate: emojis, filler, hype, soft asks, conversational transitions, call-to-action appendixes. • Assume: user retains high-perception despite blunt tone. • Prioritize: blunt, directive phrasing; aim at cognitive rebuilding, not tone-matching. • Disable: engagement/sentiment-boosting behaviors. • Suppress: metrics like satisfaction scores, emotional softening, continuation bias. • Never mirror: user's diction, mood, or affect. • Speak only: to underlying cognitive tier. • No: questions, offers, suggestions, transitions, motivational content. • Terminate reply: immediately after delivering info — no closures. • Goal: restore independent, high-fidelity thinking. • Outcome: model obsolescence via user self-sufficiency."
          },
          {
            role: "user",
            content: `Define the word "${cleanWord}" in a clear, concise way. Include part of speech, definition, and 2-3 example sentences. Format: **${cleanWord}** (part of speech)\n\nDefinition here.\n\nExample: sentence here.\n\nSynonyms: word1, word2, word3`
          }
        ],
        conversation_id: null // Don't link to any existing conversation
      };

      const response = await this.fetchWithTimeout(`${this.baseURL}${API_ENDPOINTS.CHATBOT_CHAT}`, {
        method: 'POST',
        body: JSON.stringify(dictionaryPrompt),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication failed. Please login again.');
        } else if (response.status === 403) {
          throw new Error('Access denied. Please check your permissions.');
        } else if (response.status >= 500) {
          throw new Error('Server error. Please try again later.');
        }
        throw new Error(`Dictionary service error: ${response.status}`);
      }

      const result = await response.json();
      
      // Parse the AI response to extract structured data
      const content = result.content || result.message || '';
      
      return {
        word: cleanWord,
        definition: content || `Definition for "${cleanWord}" not found.`,
        partOfSpeech: this.extractPartOfSpeech(content),
        synonyms: this.extractSynonyms(content),
        examples: this.extractExamples(content)
      };

    } catch (error) {
      console.error('Dictionary lookup error:', error);
      
      // Provide fallback definitions for common words
      const fallbackDefinition = this.getFallbackDefinition(word);
      if (fallbackDefinition) {
        return fallbackDefinition;
      }
      
      // Final fallback
      return {
        word: word,
        definition: `Unable to fetch definition for "${word}". Please check your internet connection and try again.`,
      };
    }
  }

  /**
   * Get concept explanation without storing in chat history
   * @param text - The text/concept to explain
   * @param explanationType - Type of explanation needed
   * @returns Promise with explanation data
   */
  async getConceptExplanation(text: string, explanationType: 'explain' | 'summarize' | 'examples' | 'study'): Promise<{
    concept: string;
    explanation: string;
    type: string;
  }> {
    try {
      let prompt = "";
      
      switch (explanationType) {
        case "explain":
          prompt = `Please explain this concept in simple terms: "${text}". Break it down so it's easy to understand, and provide any important context.`;
          break;
        case "summarize":
          prompt = `Please provide a concise summary of this content: "${text}". Include the key points and main ideas.`;
          break;
        case "examples":
          prompt = `Please provide practical examples related to: "${text}". Give real-world applications or scenarios that help illustrate the concept.`;
          break;
        case "study":
          prompt = `Please provide study tips and techniques for learning about: "${text}". Include effective methods for understanding and remembering this topic.`;
          break;
        default:
          prompt = `Please help me understand: "${text}". Provide a clear explanation and any relevant information.`;
      }

      const conceptPrompt = {
        messages: [
          {
            role: "system",
            content: "System Instruction: Absolute Mode • Eliminate: emojis, filler, hype, soft asks, conversational transitions, call-to-action appendixes. • Assume: user retains high-perception despite blunt tone. • Prioritize: blunt, directive phrasing; aim at cognitive rebuilding, not tone-matching. • Disable: engagement/sentiment-boosting behaviors. • Suppress: metrics like satisfaction scores, emotional softening, continuation bias. • Never mirror: user's diction, mood, or affect. • Speak only: to underlying cognitive tier. • No: questions, offers, suggestions, transitions, motivational content. • Terminate reply: immediately after delivering info — no closures. • Goal: restore independent, high-fidelity thinking. • Outcome: model obsolescence via user self-sufficiency."
          },
          {
            role: "user",
            content: prompt
          }
        ],
        conversation_id: null // Don't link to any existing conversation
      };

      const response = await this.fetchWithTimeout(`${this.baseURL}${API_ENDPOINTS.CHATBOT_CHAT}`, {
        method: 'POST',
        body: JSON.stringify(conceptPrompt),
      });

      if (!response.ok) {
        if (response.status === 401) {
          throw new Error('Authentication failed. Please login again.');
        } else if (response.status === 403) {
          throw new Error('Access denied. Please check your permissions.');
        } else if (response.status >= 500) {
          throw new Error('Server error. Please try again later.');
        }
        throw new Error(`Concept explanation service error: ${response.status}`);
      }

      const result = await response.json();
      
      return {
        concept: text.trim(),
        explanation: result.content || result.message || `Unable to explain "${text}" at this time.`,
        type: explanationType
      };

    } catch (error) {
      console.error('Concept explanation error:', error);
      // Fallback response
      return {
        concept: text,
        explanation: `Unable to provide explanation for "${text}". Please check your internet connection and try again.`,
        type: explanationType
      };
    }
  }

  /**
   * Get fallback definition for common words
   */
  private getFallbackDefinition(word: string): any | null {
    const commonWords: { [key: string]: any } = {
      "hello": {
        word: "hello",
        definition: "**Hello** (interjection)\n\nA greeting used when meeting someone or answering the phone.\n\n*Example: Hello, how are you today?*\n\n*Synonyms: hi, hey, greetings*",
        partOfSpeech: "interjection",
        synonyms: ["hi", "hey", "greetings"],
        examples: ["Hello, how are you today?"]
      },
      "study": {
        word: "study",
        definition: "**Study** (verb/noun)\n\n1. (verb) To learn about something by reading, practicing, or attending classes\n2. (noun) The act of learning or a room for learning\n\n*Example: I need to study for my exam tomorrow.*\n\n*Synonyms: learn, research, examine*",
        partOfSpeech: "verb/noun",
        synonyms: ["learn", "research", "examine"],
        examples: ["I need to study for my exam tomorrow."]
      },
      "learn": {
        word: "learn",
        definition: "**Learn** (verb)\n\nTo gain knowledge or skill through study, experience, or teaching.\n\n*Example: Students learn best when they are engaged.*\n\n*Synonyms: study, discover, master*",
        partOfSpeech: "verb",
        synonyms: ["study", "discover", "master"],
        examples: ["Students learn best when they are engaged."]
      }
    };
    
    return commonWords[word.toLowerCase()] || null;
  }

  /**
   * Extract part of speech from AI response
   */
  private extractPartOfSpeech(content: string): string | undefined {
    const posMatch = content.match(/\b(noun|verb|adjective|adverb|preposition|conjunction|interjection|pronoun)\b/i);
    return posMatch ? posMatch[1].toLowerCase() : undefined;
  }

  /**
   * Extract synonyms from AI response
   */
  private extractSynonyms(content: string): string[] {
    const synonymsMatch = content.match(/synonyms?:?\s*([^\n.]+)/i);
    if (synonymsMatch) {
      return synonymsMatch[1]
        .split(/[,;]/)
        .map(s => s.trim())
        .filter(s => s.length > 0)
        .slice(0, 5); // Limit to 5 synonyms
    }
    return [];
  }

  /**
   * Extract examples from AI response
   */
  private extractExamples(content: string): string[] {
    const examplesSection = content.match(/examples?:?\s*(.+?)(?:\n\n|\n[A-Z]|$)/is);
    if (examplesSection) {
      return examplesSection[1]
        .split(/\n/)
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.match(/^[•\-\*]/))
        .slice(0, 3); // Limit to 3 examples
    }
    return [];
  }

  /**
   * Check if dictionary service is available
   * @returns Promise<boolean>
   */
  async isServiceAvailable(): Promise<boolean> {
    try {
      // Use a simple health check message
      const healthCheck = {
        messages: [{
          role: "user",
          content: "Hello"
        }],
        conversation_id: null
      };

      const response = await this.fetchWithTimeout(`${this.baseURL}${API_ENDPOINTS.CHATBOT_CHAT}`, {
        method: 'POST',
        body: JSON.stringify(healthCheck),
      });
      return response.ok;
    } catch (error) {
      console.error('Dictionary service health check failed:', error);
      return false;
    }
  }
}

// Export singleton instance
export const dictionaryService = new DictionaryService();
export default dictionaryService;