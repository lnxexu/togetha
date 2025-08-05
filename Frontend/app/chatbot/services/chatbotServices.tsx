import AsyncStorage from '@react-native-async-storage/async-storage';
import { API_URL } from '@/constants/ApiConfig';

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
      const response = await fetch(`${API_URL}/chatbot/api/ocr/`, {
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