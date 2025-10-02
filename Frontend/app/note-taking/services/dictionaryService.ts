import axios from "axios";
import { API_URL, API_ENDPOINTS } from "@/constants/ApiConfig";
import AsyncStorage from "@react-native-async-storage/async-storage";

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
    const response = await api.post(API_ENDPOINTS.CHATBOT_DICTIONARY_CONCEPT, {
      text,
      action: "explain",
    });
    return response.data as DictionaryResponse;
  },
};
