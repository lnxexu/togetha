import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as DocumentPicker from "expo-document-picker";
import { LinearGradient } from "expo-linear-gradient";
import React, { useEffect, useState } from "react";
import chatbotServices from "./services/chatbotServices";
import {
  Alert,
  SafeAreaView,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Platform,
  Modal,
  FlatList,
  KeyboardAvoidingView,
} from "react-native";
import { RootStackParamList } from "../navigation/AppNavigator";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getEnhancedSafeAreaConfig, getStatusBarConfig } from '../utils/SafeAreaUtils';

type ChatBotNavigationProp = NativeStackNavigationProp<
  RootStackParamList,
  "RINA"
>;

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  messageCount: number;
}

interface ChatBotProps {
  navigation: ChatBotNavigationProp;
}

const ChatBot: React.FC<ChatBotProps> = ({ navigation }) => {
  // Safe area configuration
  const insets = useSafeAreaInsets();
  const safeAreaConfig = getEnhancedSafeAreaConfig(insets, 800, false, 'main'); // Assuming portrait, main screen type
  const statusBarConfig = getStatusBarConfig('main');
  
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      text: "Hello! How can I assist you today?",
      isUser: false,
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingMessage, setStreamingMessage] = useState("");
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [chatSessions, setChatSessions] = useState<ChatSession[]>([
    {
      id: "1",
      title: "Study Session - Math",
      lastMessage: "Can you help me with calculus derivatives?",
      timestamp: new Date(Date.now() - 86400000), // 1 day ago
      messageCount: 12,
    },
    {
      id: "2",
      title: "Physics Homework",
      lastMessage: "Explain quantum mechanics principles",
      timestamp: new Date(Date.now() - 172800000), // 2 days ago
      messageCount: 8,
    },
    {
      id: "3",
      title: "Essay Writing Help",
      lastMessage: "Help me structure my thesis statement",
      timestamp: new Date(Date.now() - 259200000), // 3 days ago
      messageCount: 15,
    },
    {
      id: "4",
      title: "Chemistry Lab Report",
      lastMessage: "Summarize the experiment results",
      timestamp: new Date(Date.now() - 604800000), // 1 week ago
      messageCount: 6,
    },
  ]);

  const suggestedPrompts = [
    {
      id: "1",
      text: "Help me understand complex concepts",
      description: "Break down difficult topics into simpler explanations",
      icon: "🧠",
    },
    {
      id: "2",
      text: "Create practice questions",
      description: "Generate quiz questions from your study materials",
      icon: "❓",
    },
    {
      id: "3",
      text: "Summarize documents",
      description: "Get concise summaries of lengthy texts",
      icon: "📄",
    },
    {
      id: "4",
      text: "Explain with examples",
      description: "Provide real-world examples for better understanding",
      icon: "💡",
    },
  ];

  useEffect(() => {
    checkAuthentication();
  }, []);

  const checkAuthentication = async () => {
    const token = await AsyncStorage.getItem("authToken");
    if (!token) {
      handleLogout();
    }
  };

  const handleLogout = async () => {
    try {
      // Clear all authentication data
      await AsyncStorage.removeItem("authToken");
      await AsyncStorage.removeItem("token");
      await AsyncStorage.removeItem("username");
      await AsyncStorage.removeItem("session_id");

      // Navigate to login screen
      navigation.reset({
        index: 0,
        routes: [{ name: "Login" }],
      });
    } catch (error) {
      console.error("Logout error:", error);
    }
  };

  // Ollama API configuration
  const OLLAMA_URL = "http://localhost:11434/api/chat";

  // Message transformation utilities
  const transformToOllamaFormat = (messages: Message[]) => {
    return messages.map(msg => ({
      role: (msg.isUser ? 'user' : 'assistant') as 'user' | 'assistant',
      content: msg.text
    }));
  };

  // Ollama API call function (following TanStack Query pattern)
  const fetchOllamaMessage = async (ollamaMessages: { role: 'user' | 'assistant'; content: string }[]): Promise<string> => {
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
        throw new Error(`Ollama API error: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      return data.message?.content || "I couldn't generate a response. Please try again.";
    } catch (error) {
      if (error instanceof Error) {
        if (error.message.includes('Failed to fetch') || error.message.includes('ECONNREFUSED')) {
          throw new Error('Cannot connect to Ollama. Make sure Ollama is running on localhost:11434');
        }
        if (error.message.includes('404')) {
          throw new Error('Model "llama3.2" not found. Make sure it\'s installed in Ollama');
        }
      }
      throw error;
    }
  };

  const handleSendMessage = async () => {
    if (inputText.trim() === "") return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
      timestamp: new Date(),
    };

    // Update messages with user message
    const updatedMessages = [...messages, userMessage];
    setMessages(updatedMessages);
    const currentInput = inputText;
    setInputText("");
    setIsLoading(true);
    setIsStreaming(false);
    setStreamingMessage("");

    try {
      // Transform messages to Ollama format
      const ollamaMessages = transformToOllamaFormat(updatedMessages);

      // Call Ollama API (following the TanStack Query pattern)
      const aiReply = await fetchOllamaMessage(ollamaMessages);

      // Create AI response message
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: aiReply,
        isUser: false,
        timestamp: new Date(),
      };

      // Update messages with AI response
      setMessages([...updatedMessages, aiResponse]);
      setIsLoading(false);

    } catch (error) {
      console.error('Chat Error:', error);
      setIsLoading(false);
      setIsStreaming(false);
      setStreamingMessage("");
      
      // Enhanced error handling based on TanStack Query example
      let errorMessage = "Error communicating with Ollama.";
      
      if (error instanceof Error) {
        errorMessage = error.message;
      }
      
      // Fallback response on error
      const errorResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: errorMessage,
        isUser: false,
        timestamp: new Date(),
      };
      setMessages([...updatedMessages, errorResponse]);
    }
  };

  // Optional: Streaming version (currently not used but available for future enhancement)
  const handleSendMessageStreaming = async () => {
    if (inputText.trim() === "") return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    const currentInput = inputText;
    setInputText("");
    setIsLoading(false);
    setIsStreaming(true);
    setStreamingMessage("");

    // Create placeholder message for streaming
    const streamingMessageId = (Date.now() + 1).toString();
    const placeholderMessage: Message = {
      id: streamingMessageId,
      text: "",
      isUser: false,
      timestamp: new Date(),
    };
    
    setMessages((prev) => [...prev, placeholderMessage]);

    try {
      const OLLAMA_URL = "http://localhost:11434/api/chat";
      
      const ollamaMessages = messages.map(msg => ({
        role: (msg.isUser ? 'user' : 'assistant') as 'user' | 'assistant',
        content: msg.text
      }));
      
      ollamaMessages.push({
        role: 'user' as const,
        content: currentInput
      });

      const response = await fetch(OLLAMA_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: "llama3.2",
          messages: ollamaMessages,
          stream: true,
        }),
      });

      if (!response.ok) {
        throw new Error(`Streaming failed: ${response.status}`);
      }

      const reader = response.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let buffer = '';
      let fullResponse = '';

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
              if (json.message?.content) {
                fullResponse += json.message.content;
                setStreamingMessage(fullResponse);
                
                setMessages((prev) =>
                  prev.map(msg =>
                    msg.id === streamingMessageId
                      ? { ...msg, text: fullResponse }
                      : msg
                  )
                );
              }
              if (json.done) break;
            } catch (parseError) {
              console.warn('Failed to parse streaming response:', line);
            }
          }
        }
      }

      setIsStreaming(false);
      setStreamingMessage("");

    } catch (error) {
      console.error('Streaming Error:', error);
      setIsStreaming(false);
      setStreamingMessage("");
      
      // Remove placeholder and add error message
      setMessages((prev) => prev.filter(msg => msg.id !== streamingMessageId));
      
      const errorResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: "Failed to stream response from Ollama. Please try again.",
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, errorResponse]);
    }
  };

  const handleFileImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.assets && result.assets.length > 0) {
        const file = result.assets[0];

        // Check if token exists before attempting OCR
        const token = await AsyncStorage.getItem("authToken");
        if (!token) {
          Alert.alert(
            "Authentication Required",
            "Please log in to use the OCR feature.",
            [
              {
                text: "Login",
                onPress: () => handleLogout(), // This will redirect to login
              },
              {
                text: "Cancel",
                style: "cancel",
              },
            ]
          );
          return;
        }

        Alert.alert(
          "File Imported",
          `File "${file.name}" has been imported and is ready for processing.`,
          [
            {
              text: "Extract Text",
              onPress: async () => {
                try {
                  setIsLoading(true); // Show loading indicator
                  const extractedText =
                    await chatbotServices.extractTextFromImages(file.uri);
                  setIsLoading(false);

                  if (extractedText.trim()) {
                    setInputText(`Extracted Text: ${extractedText}`);
                  } else {
                    Alert.alert(
                      "No Text Found",
                      "The system couldn't detect any text in this image."
                    );
                  }
                } catch (error) {
                  setIsLoading(false);
                  const errorMessage =
                    error instanceof Error ? error.message : "Unknown error";

                  if (errorMessage.includes("401")) {
                    Alert.alert(
                      "Session Expired",
                      "Your session has expired. Please log in again.",
                      [
                        {
                          text: "Login",
                          onPress: () => handleLogout(), // Logout and redirect to login
                        },
                      ]
                    );
                  } else {
                    Alert.alert(
                      "Error",
                      "Failed to extract text from the image"
                    );
                    console.error("OCR Error:", error);
                  }
                }
              },
            },
            { text: "Cancel", style: "cancel" },
          ]
        );
      }
    } catch (error: unknown) {
      // Check if the error is because user cancelled the document picker
      const isCancelled =
        error instanceof Error &&
        (error.name === "canceled" ||
          error.message?.includes("canceled") ||
          error.message?.includes("cancelled"));

      if (isCancelled) {
        // User cancelled the picker
      } else {
        Alert.alert("Error", "Failed to import file");
        console.log("Document picker error:", error);
      }
    }
  };

  const handleGoBack = () => {
    navigation.goBack(); // Use navigation.goBack() instead of useRouter()
  };

  const handleMenuPress = () => {
    setShowChatHistory(true);
  };

  const handleCloseChatHistory = () => {
    setShowChatHistory(false);
  };

  const handleSelectChatSession = (sessionId: string) => {
    // Here you would load the selected chat session
    // For now, we'll just close the modal
    setShowChatHistory(false);
    // You could implement loading historical messages here
    console.log("Selected chat session:", sessionId);
  };

  const handleDeleteChatSession = (sessionId: string) => {
    Alert.alert(
      "Delete Chat",
      "Are you sure you want to delete this chat session?",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            setChatSessions((prev) =>
              prev.filter((session) => session.id !== sessionId)
            );
          },
        },
      ]
    );
  };

  const handleNewChat = () => {
    setShowChatHistory(false);
    setMessages([
      {
        id: "1",
        text: "Hello! How can I assist you today?",
        isUser: false,
        timestamp: new Date(),
      },
    ]);
  };

  const handlePromptSelection = (prompt: string) => {
    setInputText(prompt);
  };

  const handleSummarize = async () => {
    if (!streamingMessage && messages.length > 1) {
      try {
        setIsLoading(true);
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage.isUser) {
          const summary = await chatbotServices.summarizeText(lastMessage.text);
          
          const summaryMessage: Message = {
            id: Date.now().toString(),
            text: `**Summary:** ${summary}`,
            isUser: false,
            timestamp: new Date(),
          };
          
          setMessages((prev) => [...prev, summaryMessage]);
        }
      } catch (error) {
        console.error('Summarization error:', error);
        Alert.alert('Error', 'Failed to generate summary. Please try again.');
      } finally {
        setIsLoading(false);
      }
    } else {
      handlePromptSelection("Please summarize the uploaded document");
    }
  };

  const handleExplain = async () => {
    if (!streamingMessage && messages.length > 1) {
      try {
        setIsLoading(true);
        const lastMessage = messages[messages.length - 1];
        if (!lastMessage.isUser) {
          const explanation = await chatbotServices.explainConcept(lastMessage.text);
          
          const explanationMessage: Message = {
            id: Date.now().toString(),
            text: `**Explanation:** ${explanation}`,
            isUser: false,
            timestamp: new Date(),
          };
          
          setMessages((prev) => [...prev, explanationMessage]);
        }
      } catch (error) {
        console.error('Explanation error:', error);
        Alert.alert('Error', 'Failed to generate explanation. Please try again.');
      } finally {
        setIsLoading(false);
      }
    } else {
      handlePromptSelection("Please explain the key concepts in the uploaded document");
    }
  };

  const handleGenerateQuiz = async () => {
    if (!streamingMessage && messages.length > 1) {
      try {
        setIsLoading(true);
        const conversationText = messages
          .filter(msg => !msg.isUser)
          .map(msg => msg.text)
          .join('\n\n');
        
        const quiz = await chatbotServices.generateQuiz(conversationText, 5);
        
        const quizMessage: Message = {
          id: Date.now().toString(),
          text: `**Quiz Questions:** ${quiz}`,
          isUser: false,
          timestamp: new Date(),
        };
        
        setMessages((prev) => [...prev, quizMessage]);
      } catch (error) {
        console.error('Quiz generation error:', error);
        Alert.alert('Error', 'Failed to generate quiz. Please try again.');
      } finally {
        setIsLoading(false);
      }
    } else {
      handlePromptSelection("Please generate a quiz based on the uploaded document");
    }
  };

  const handleOCR = () => {
    handlePromptSelection("Please extract text from the uploaded document");
  };

  return (
    <>
      <StatusBar {...statusBarConfig} />
      <SafeAreaView style={[styles.container, { paddingTop: safeAreaConfig.paddingTop }]}>
        {/* Header */}
        <LinearGradient
          colors={["#A855F7", "#8B5CF6", "#7C3AED"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.header, { 
            paddingTop: safeAreaConfig.paddingTop,
            paddingBottom: 20,
          }]}
        >
        <TouchableOpacity 
          style={styles.backButton} 
          onPress={handleGoBack}
          accessibilityLabel="Go back"
          accessibilityHint="Navigate to the previous screen"
        >
          <Ionicons name="chevron-back" size={24} color="#FFFFFF" />
        </TouchableOpacity>
        <View style={styles.headerInfo}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>R</Text>
          </View>
          <View>
            <Text style={styles.botName}>Rina</Text>
            <Text style={styles.botDescription}>
              Your AI Tutoring Assistant
            </Text>
          </View>
        </View>
        <TouchableOpacity 
          style={styles.menuButton} 
          onPress={handleMenuPress}
          accessibilityLabel="Chat history"
          accessibilityHint="View previous chat sessions"
        >
          <MaterialIcons name="history" size={24} color="#FFFFFF" />
        </TouchableOpacity>
      </LinearGradient>

      <KeyboardAvoidingView 
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 0}
      >
        {/* Messages */}
        <ScrollView style={[styles.messagesContainer, { 
          paddingTop: safeAreaConfig.paddingTop + 80 // Space for the header + safe area
        }]}>
        {messages.length === 1 && (
          <View style={styles.welcomeContainer}>
            <View style={styles.welcomeHeader}>
              <View style={styles.welcomeAvatar}>
                <Text style={styles.welcomeAvatarText}>✨</Text>
              </View>
              <Text style={styles.welcomeTitle}>Welcome to Rina!</Text>
              <Text style={styles.welcomeSubtitle}>
                Your intelligent AI tutoring assistant
              </Text>
            </View>

            <View style={styles.featuresContainer}>
              <Text style={styles.featuresTitle}>
                What I can help you with:
              </Text>
              <View style={styles.suggestedPromptsGrid}>
                {suggestedPrompts.map((prompt) => (
                  <TouchableOpacity
                    key={prompt.id}
                    style={styles.promptCard}
                    onPress={() => handlePromptSelection(prompt.text)}
                    accessibilityLabel={prompt.text}
                    accessibilityHint={prompt.description}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.promptIcon}>{prompt.icon}</Text>
                    <Text style={styles.promptTitle}>{prompt.text}</Text>
                    <Text style={styles.promptDescription}>
                      {prompt.description}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Regular Messages */}
        {messages.slice(1).map((message) => (
          <View
            key={message.id}
            style={[
              styles.messageBubble,
              message.isUser ? styles.userMessage : styles.aiMessage,
            ]}
          >
            {!message.isUser && (
              <View style={styles.aiMessageHeader}>
                <View style={styles.aiAvatar}>
                  <Text style={styles.aiAvatarText}>R</Text>
                </View>
              </View>
            )}
            <Text
              style={[
                styles.messageText,
                message.isUser ? styles.userMessageText : styles.aiMessageText,
              ]}
            >
              {message.text}
            </Text>
            <Text style={styles.messageTime}>
              {message.timestamp.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
        ))}

        {/* Initial Message */}
        {messages.length > 1 && (
          <View style={[styles.messageBubble, styles.aiMessage]}>
            <View style={styles.aiMessageHeader}>
              <View style={styles.aiAvatar}>
                <Text style={styles.aiAvatarText}>R</Text>
              </View>
            </View>
            <Text style={styles.aiMessageText}>{messages[0].text}</Text>
            <Text style={styles.messageTime}>
              {messages[0].timestamp.toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </Text>
          </View>
        )}

        {/* Suggested Prompts */}
        {messages.length === 1 && (
          <View style={styles.legacyPromptsContainer}>
            {suggestedPrompts.map((prompt) => (
              <TouchableOpacity
                key={prompt.id}
                style={styles.legacyPromptCard}
                onPress={() => handlePromptSelection(prompt.text)}
              >
                <Text style={styles.legacyPromptText}>{prompt.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {isLoading && (
          <View style={styles.loadingContainer}>
            <View style={styles.typingIndicatorContainer}>
              <View style={styles.typingAvatar}>
                <Text style={styles.typingAvatarText}>R</Text>
              </View>
              <View style={styles.typingBubble}>
                <Text style={styles.loadingText}>Rina is thinking</Text>
                <View style={styles.typingIndicator}>
                  <View style={styles.typingDot} />
                  <View style={styles.typingDot} />
                  <View style={styles.typingDot} />
                </View>
              </View>
            </View>
          </View>
        )}
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.actionsContainer}
        >
          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleSummarize}
            accessibilityLabel="Summarize content"
            accessibilityHint="Generate a summary of the conversation or document"
          >
            <Ionicons name="document-text" size={16} color="#6B46C1" />
            <Text style={styles.actionButtonText}>Summarize</Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={handleExplain}
            accessibilityLabel="Explain concepts"
            accessibilityHint="Get detailed explanations of concepts"
          >
            <Ionicons name="bulb" size={16} color="#6B46C1" />
            <Text style={styles.actionButtonText}>Explain</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleGenerateQuiz}
            accessibilityLabel="Generate quiz"
            accessibilityHint="Create practice questions based on the content"
          >
            <Ionicons name="help-circle" size={16} color="#6B46C1" />
            <Text style={styles.actionButtonText}>Generate Quiz</Text>
          </TouchableOpacity>
          
          <TouchableOpacity 
            style={styles.actionButton} 
            onPress={handleOCR}
            accessibilityLabel="Extract text"
            accessibilityHint="Extract text from uploaded images"
          >
            <Ionicons name="scan" size={16} color="#6B46C1" />
            <Text style={styles.actionButtonText}>Extract Text</Text>
          </TouchableOpacity>
        </ScrollView>
      </View>

        {/* Input Area */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={inputText}
            onChangeText={setInputText}
            placeholder="Ask me anything about your studies..."
            placeholderTextColor="#94A3B8"
            multiline
            maxLength={1000}
            accessibilityLabel="Message input"
            accessibilityHint="Type your message to send to Rina"
          />
          <TouchableOpacity
            style={styles.attachButton}
            onPress={handleFileImport}
            accessibilityLabel="Attach file"
            accessibilityHint="Import and upload a document or image"
          >
            <Ionicons name="attach" size={24} color="#6B46C1" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[
              styles.sendButton,
              inputText.trim() === "" && styles.sendButtonDisabled,
            ]}
            onPress={handleSendMessage}
            disabled={inputText.trim() === ""}
            accessibilityLabel="Send message"
            accessibilityHint="Send your message to Rina"
          >
            <Ionicons name="send" size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>      {/* Chat History Modal */}
      <Modal
        visible={showChatHistory}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={handleCloseChatHistory}
      >
        <SafeAreaView style={styles.chatHistoryContainer}>
          {/* Chat History Header */}
          <LinearGradient
            colors={["#A855F7", "#8B5CF6", "#7C3AED"]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.chatHistoryHeader}
          >
            <TouchableOpacity
              style={styles.closeButton}
              onPress={handleCloseChatHistory}
            >
              <Ionicons name="close" size={24} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={styles.chatHistoryTitle}>Chat History</Text>
            <TouchableOpacity
              style={styles.newChatButton}
              onPress={handleNewChat}
            >
              <Ionicons name="add" size={24} color="#FFFFFF" />
            </TouchableOpacity>
          </LinearGradient>

          {/* Chat Sessions List */}
          <View style={styles.chatHistoryContent}>
            <FlatList
              data={chatSessions}
              keyExtractor={(item) => item.id}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.chatSessionsList}
              renderItem={({ item }) => (
                <TouchableOpacity
                  style={styles.chatSessionCard}
                  onPress={() => handleSelectChatSession(item.id)}
                >
                  <View style={styles.chatSessionContent}>
                    <View style={styles.chatSessionIcon}>
                      <Ionicons
                        name="chatbubble-ellipses"
                        size={24}
                        color="#6B46C1"
                      />
                    </View>
                    <View style={styles.chatSessionInfo}>
                      <Text style={styles.chatSessionTitle}>{item.title}</Text>
                      <Text
                        style={styles.chatSessionLastMessage}
                        numberOfLines={2}
                      >
                        {item.lastMessage}
                      </Text>
                      <View style={styles.chatSessionMeta}>
                        <Text style={styles.chatSessionTime}>
                          {item.timestamp.toLocaleDateString()}
                        </Text>
                        <Text style={styles.chatSessionCount}>
                          {item.messageCount} messages
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.deleteSessionButton}
                      onPress={() => handleDeleteChatSession(item.id)}
                    >
                      <Ionicons
                        name="trash-outline"
                        size={20}
                        color="#EF4444"
                      />
                    </TouchableOpacity>
                  </View>
                </TouchableOpacity>
              )}
              ListEmptyComponent={
                <View style={styles.emptyChatHistory}>
                  <Ionicons
                    name="chatbubbles-outline"
                    size={48}
                    color="#D1D5DB"
                  />
                  <Text style={styles.emptyChatHistoryText}>
                    No chat history yet
                  </Text>
                  <Text style={styles.emptyChatHistorySubtext}>
                    Start a conversation to see your chat history here
                  </Text>
                </View>
              }
            />
          </View>
        </SafeAreaView>
      </Modal>
      </SafeAreaView>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  keyboardAvoidingView: {
    flex: 1,
  },
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 2000,
  },
  backButton: {
    marginRight: 12,
    padding: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  headerInfo: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
    borderWidth: 2,
    borderColor: "rgba(255, 255, 255, 0.3)",
  },
  avatarText: {
    color: "#FFFFFF",
    fontSize: 18,
    fontWeight: "bold",
  },
  botName: {
    fontSize: 18,
    fontFamily: "Lexend",
    color: "#FFFFFF",
  },
  botDescription: {
    fontSize: 13,
    color: "rgba(255, 255, 255, 0.8)",
    marginTop: 2,
  },
  menuButton: {
    marginLeft: 12,
    padding: 8,
    borderRadius: 12,
    backgroundColor: "rgba(255, 255, 255, 0.2)",
  },
  messagesContainer: {
    flex: 1,
    padding: 16,
    paddingBottom: 20,
  },
  messageBubble: {
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 20,
    borderRadius: 20,
    maxWidth: "85%",
    shadowColor: "#1E293B",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  userMessage: {
    backgroundColor: "#6B46C1",
    alignSelf: "flex-end",
    borderBottomRightRadius: 8,
    shadowColor: "#6B46C1",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  aiMessage: {
    backgroundColor: "#FFFFFF",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderBottomLeftRadius: 8,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
    fontFamily: "Inter-Regular",
  },
  userMessageText: {
    color: "#FFFFFF",
    fontWeight: "500",
  },
  aiMessageText: {
    color: "#1E293B",
    lineHeight: 22,
  },
  suggestedPromptsContainer: {
    marginTop: 16,
  },
  promptText: {
    fontSize: 14,
    color: "#666",
    textAlign: "center",
  },
  loadingContainer: {
    paddingVertical: 8,
  },
  loadingText: {
    color: "#666",
    fontSize: 14,
    fontStyle: "italic",
    marginBottom: 4,
  },
  actionsContainer: {
    flexDirection: "row",
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    gap: 12,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  actionButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 24,
    backgroundColor: "#F8FAFC",
    borderWidth: 1.5,
    borderColor: "#6B46C1",
    minHeight: 40,
    shadowColor: "#6B46C1",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  actionButtonText: {
    color: "#6B46C1",
    fontSize: 13,
    marginLeft: 6,
    fontWeight: "600",
    fontFamily: "Inter-SemiBold",
  },
  inputContainer: {
    flexDirection: "row",
    padding: 16,
    backgroundColor: "#FFFFFF",
    alignItems: "flex-end",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    shadowColor: "#1E293B",
    shadowOffset: {
      width: 0,
      height: -4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 8,
  },
  textInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: "#E2E8F0",
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 14,
    maxHeight: 120,
    fontSize: 16,
    backgroundColor: "#F8FAFC",
    minHeight: 48,
    fontFamily: "Inter-Regular",
    color: "#1E293B",
  },
  attachButton: {
    marginLeft: 12,
    padding: 12,
    borderRadius: 25,
    backgroundColor: "#F8FAFC",
    borderWidth: 2,
    borderColor: "#E2E8F0",
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
  },
  sendButton: {
    backgroundColor: "#6B46C1",
    borderRadius: 25,
    padding: 12,
    marginLeft: 8,
    minWidth: 48,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6B46C1",
    shadowOffset: {
      width: 0,
      height: 3,
    },
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 6,
  },
  sendButtonDisabled: {
    backgroundColor: "#CBD5E1",
    shadowOpacity: 0,
    elevation: 0,
  },

  // Welcome section styles
  welcomeContainer: {
    paddingHorizontal: 20,
    paddingVertical: 40,
  },
  welcomeHeader: {
    alignItems: "center",
    marginBottom: 32,
  },
  welcomeAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: "#6B46C1",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 20,
    shadowColor: "#6B46C1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  welcomeAvatarText: {
    fontSize: 32,
    color: "white",
  },
  welcomeTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1E293B",
    marginBottom: 12,
    textAlign: "center",
    fontFamily: "Inter-Bold",
  },
  welcomeSubtitle: {
    fontSize: 18,
    color: "#64748B",
    textAlign: "center",
    fontFamily: "Inter-Medium",
    lineHeight: 24,
  },
  featuresContainer: {
    marginTop: 24,
  },
  featuresTitle: {
    fontSize: 22,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 24,
    textAlign: "center",
    fontFamily: "Inter-Bold",
  },
  suggestedPromptsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 16,
  },
  promptCard: {
    backgroundColor: "#FFFFFF",
    padding: 24,
    marginBottom: 16,
    borderRadius: 20,
    width: "47%",
    shadowColor: "#1E293B",
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 6,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    minHeight: 140,
    justifyContent: "space-between",
  },
  promptIcon: {
    fontSize: 32,
    marginBottom: 12,
    textAlign: "center",
  },
  promptTitle: {
    fontSize: 16,
    fontWeight: "700",
    color: "#1E293B",
    marginBottom: 8,
    textAlign: "center",
    fontFamily: "Inter-Bold",
    lineHeight: 20,
  },
  promptDescription: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
    fontFamily: "Inter-Regular",
  },

  // Enhanced message styles
  aiMessageHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  aiAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#6B46C1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
  },
  aiAvatarText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "white",
  },
  messageTime: {
    fontSize: 11,
    color: "#94A3B8",
    marginTop: 6,
    alignSelf: "flex-end",
    fontFamily: "Inter-Regular",
  },

  // Legacy prompt styles for backward compatibility
  legacyPromptsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  legacyPromptCard: {
    backgroundColor: "#f8f9fa",
    padding: 16,
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#e9ecef",
  },
  legacyPromptText: {
    fontSize: 16,
    color: "#495057",
    textAlign: "center",
  },

  // Typing indicator styles
  typingIndicatorContainer: {
    flexDirection: "row",
    alignItems: "flex-end",
    marginVertical: 8,
    marginHorizontal: 20,
    maxWidth: "85%",
  },
  typingAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: "#6B46C1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 8,
    marginBottom: 4,
  },
  typingAvatarText: {
    fontSize: 12,
    fontWeight: "bold",
    color: "white",
  },
  typingBubble: {
    backgroundColor: "white",
    padding: 16,
    borderRadius: 20,
    borderBottomLeftRadius: 8,
    borderWidth: 1,
    borderColor: "#f0f0f0",
    shadowColor: "#000",
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  typingIndicator: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#6B46C1",
    marginHorizontal: 2,
    opacity: 0.7,
  },

  // File preview styles
  filePreview: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#f0f0f0",
    padding: 12,
    margin: 16,
    borderRadius: 12,
    justifyContent: "space-between",
  },
  filePreviewText: {
    fontSize: 14,
    color: "#333",
    flex: 1,
  },

  // Chat History Modal Styles
  chatHistoryContainer: {
    flex: 1,
    backgroundColor: "#f8f9fa",
  },
  chatHistoryHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    padding: 16,
    paddingTop: Platform.OS === "ios" ? 50 : 35,
    paddingBottom: 20,
  },
  closeButton: {
    padding: 4,
  },
  chatHistoryTitle: {
    fontSize: 20,
    fontFamily: "Lexend",
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  newChatButton: {
    padding: 4,
  },
  chatHistoryContent: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    borderTopLeftRadius: 25,
    borderTopRightRadius: 25,
    marginTop: -10,
    paddingTop: 20,
  },
  chatSessionsList: {
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  chatSessionCard: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    marginBottom: 12,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: "rgba(226, 232, 240, 0.6)",
  },
  chatSessionContent: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
  },
  chatSessionIcon: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: "#F3F4F6",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 16,
  },
  chatSessionInfo: {
    flex: 1,
  },
  chatSessionTitle: {
    fontSize: 16,
    fontFamily: "Inter-Bold",
    color: "#1E293B",
    marginBottom: 4,
  },
  chatSessionLastMessage: {
    fontSize: 14,
    color: "#64748B",
    fontFamily: "Inter-Regular",
    marginBottom: 8,
    lineHeight: 18,
  },
  chatSessionMeta: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chatSessionTime: {
    fontSize: 12,
    color: "#94A3B8",
    fontFamily: "Inter-Medium",
  },
  chatSessionCount: {
    fontSize: 12,
    color: "#6B46C1",
    fontFamily: "Inter-Medium",
    backgroundColor: "#F3F4F6",
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  deleteSessionButton: {
    padding: 8,
    marginLeft: 8,
  },
  emptyChatHistory: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyChatHistoryText: {
    fontSize: 18,
    fontFamily: "Inter-SemiBold",
    color: "#64748B",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyChatHistorySubtext: {
    fontSize: 14,
    color: "#94A3B8",
    fontFamily: "Inter-Regular",
    textAlign: "center",
    lineHeight: 20,
    paddingHorizontal: 40,
  },
});

export default ChatBot;
