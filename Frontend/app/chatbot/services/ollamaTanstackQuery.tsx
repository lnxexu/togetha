// Optional: TanStack Query implementation for AI.tsx
// To use this, you would need to install @tanstack/react-query
// and set up the QueryClient in your app

import { useMutation } from '@tanstack/react-query';

// Add this to your component (replace the current handleSendMessage implementation)

// Ollama API types (matching your example)
interface OllamaMessage {
  role: "user" | "assistant";
  content: string;
}

interface OllamaResponse {
  message: {
    content: string;
  };
}

interface MutationVariables {
  updatedMessages: Message[];
}

// API call function (following your TanStack example exactly)
const fetchOllamaMessage = async ({ updatedMessages }: MutationVariables): Promise<string> => {
  const OLLAMA_URL = "http://localhost:11434/api/chat";
  
  // Transform React Native Message format to Ollama format
  const ollamaMessages: OllamaMessage[] = updatedMessages.map(msg => ({
    role: msg.isUser ? "user" : "assistant",
    content: msg.text
  }));

  try {
    const response = await fetch(OLLAMA_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: "llama3.2",
        messages: ollamaMessages,
        stream: false,
      }),
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error('Model "llama3.2" not found. Make sure it\'s installed in Ollama');
      }
      throw new Error(`Ollama error: ${response.status} ${response.statusText}`);
    }

    const data: OllamaResponse = await response.json();
    return data.message.content;
  } catch (error) {
    if (error instanceof Error) {
      if (error.message.includes('Failed to fetch')) {
        throw new Error('Cannot connect to Ollama. Make sure Ollama is running on localhost:11434');
      }
    }
    throw error;
  }
};

// Inside your ChatBot component, replace handleSendMessage with this:
export const useOllamaMutation = () => {
  const {
    mutate: sendMessage,
    isPending: isLoading,
    error,
  } = useMutation<string, Error, MutationVariables>({
    mutationFn: fetchOllamaMessage,
    onSuccess: (aiReply, { updatedMessages }) => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: aiReply,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages([...updatedMessages, aiResponse]);
    },
    onError: (error: Error, { updatedMessages }) => {
      const errorMessage = error.message || "Error communicating with Ollama.";
      const errorResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: errorMessage,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages([...updatedMessages, errorResponse]);
    },
  });

  const handleSendMessage = () => {
    if (inputText.trim() === "") return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
      timestamp: new Date(),
    };

    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    setInputText("");

    sendMessage({ updatedMessages });
  };

  return { handleSendMessage, isLoading, error };
};

// Installation commands:
// npm install @tanstack/react-query
// 
// Then wrap your App with QueryClient:
// import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
// const queryClient = new QueryClient();
// 
// <QueryClientProvider client={queryClient}>
//   <YourApp />
// </QueryClientProvider>
