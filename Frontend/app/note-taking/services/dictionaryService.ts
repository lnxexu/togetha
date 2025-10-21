import axios from "axios";
import { API_URL, API_ENDPOINTS } from "@/constants/ApiConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { ensureModel } from "../../../src/llama/setup";
import { initLlama } from "llama.rn";

const api = axios.create({
  baseURL: API_URL,
  headers: {
    "Content-Type": "application/json",
  },
});

// Interceptor to add Authorization header dynamically
api.interceptors.request.use(async (config) => {
  const token = await AsyncStorage.getItem("authToken"); // <-- make sure key matches your login save
  if (token) {
    config.headers.Authorization = `Token ${token}`; // 👈 DRF TokenAuth uses `Token`, not `Bearer`
  }
  return config;
});

// ✅ Match backend response structure from ConceptHelpView
export interface DictionaryResponse {
  Meaning: string[];
  PartOfSpeech: string[];
  Synonyms: string[];
  Antonyms: string[];
  Examples: string[];
}

export const dictionaryService = {
  async getConcept(text: string): Promise<DictionaryResponse> {
    try {
      // Try online first
      const response = await api.post(API_ENDPOINTS.CHATBOT_DICTIONARY_CONCEPT, {
        text,
        action: "explain",
      });
      return response.data as DictionaryResponse;
    } catch (error) {
      console.log('Online dictionary failed, using offline mode');
      // Fallback to offline LLM
      return await this.getConceptOffline(text);
    }
  },

  async getConceptOffline(text: string): Promise<DictionaryResponse> {
    try {
      const modelPath = await ensureModel();
      const llama = await initLlama({ model: modelPath });
      
      const prompt = `Define the word "${text}" as a JSON object with these keys:
{"Meaning":"definition here","PartOfSpeech":"noun/verb/etc","Synonyms":"word1, word2","Antonyms":"word1, word2","Example":"sentence using the word"}
Return only valid JSON, no other text.`;

      const result = await llama.completion({ prompt, n_predict: 200, temperature: 0.3 });
      await llama.release();
      
      const jsonMatch = result.text.match(/\{[^}]+\}/);
      if (!jsonMatch) throw new Error('No JSON found');
      
      const parsed = JSON.parse(jsonMatch[0]);
      const splitComma = (str: string) => str ? str.split(',').map(s => s.trim()).filter(Boolean) : [];
      
      return {
        Meaning: [parsed.Meaning || `Definition of "${text}"`],
        PartOfSpeech: [parsed.PartOfSpeech || "Unknown"],
        Synonyms: splitComma(parsed.Synonyms),
        Antonyms: splitComma(parsed.Antonyms),
        Examples: parsed.Example ? [parsed.Example] : []
      };
    } catch (error) {
      console.error('Offline dictionary failed:', error);
      return {
        Meaning: [`Definition of "${text}" (offline mode)`],
        PartOfSpeech: ["Unknown"],
        Synonyms: [],
        Antonyms: [],
        Examples: []
      };
    }
  },
};
