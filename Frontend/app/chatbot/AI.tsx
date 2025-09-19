import React, { useState, useEffect } from "react";
import {
  SafeAreaView,
  ScrollView,
  StatusBar,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  ActivityIndicator,
  StyleSheet,
  KeyboardAvoidingView,
  Modal,
  Platform,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import axios from "axios";
import { useMutation, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import AsyncStorage from "@react-native-async-storage/async-storage";
import * as DocumentPicker from "expo-document-picker";
import { useNavigation } from "@react-navigation/native";

const API_URL = "http://192.168.1.187:8000/chatbot/chat/";
const PDF_UPLOAD_URL = "http://192.168.1.187:8000/chatbot/upload_pdf/";

type Role = "user" | "assistant";

interface Message {
  role: Role;
  content: string;
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
    if (!token) throw new Error("No auth token found");

    const response = await axios.post(
      API_URL,
      { messages: updatedMessages },
      {
        headers: {
          Authorization: `Token ${token}`,
        },
      }
    );

    return response.data as BackendResponse;
  } catch (err: any) {
    console.error("Chat request failed:", err.response?.data || err.message);
    throw err;
  }
}

const queryClient = new QueryClient();

function OllamaChatTanstackInner(): React.ReactElement {
  const [token, setToken] = useState<string | null>(null);

  useEffect(() => {
    const getToken = async () => {
      const authToken = await AsyncStorage.getItem("authToken");
      setToken(authToken);
    };
    getToken();
  }, []);

  const navigation = useNavigation();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<Message[] | null>(null);
  const [showChatHistory, setShowChatHistory] = useState(false);

  const mutation = useMutation<BackendResponse, unknown, MutationVariables>({
    mutationFn: fetchOllamaMessage,
  });

  const suggestedPrompts = [
    { id: "1", text: "Help me understand complex concepts", icon: "🧠" },
    { id: "2", text: "Create practice questions", icon: "📘" },
    { id: "3", text: "Summarize documents", icon: "📄" },
    { id: "4", text: "Explain with examples", icon: "💡" },
  ];

  const handleSend = async () => {
    if (!input.trim()) return;
    const updatedMessages: Message[] = [...messages, { role: "user", content: input }];
    setMessages(updatedMessages);
    setLastAttempt(updatedMessages);
    setErrorMessage(null);
    setLoading(true);
    try {
      const aiReply = await mutation.mutateAsync({ updatedMessages });
      const replyContent =
        aiReply.source === "rag"
          ? `${aiReply.content} (from RAG)`
          : aiReply.content;

      setMessages((prev) => [...updatedMessages, { role: "assistant", content: replyContent }]);
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : "Error communicating with AI.";
      setErrorMessage(msg);
      setMessages((prev) => [...prev, { role: "assistant", content: "[Error] " + msg }]);
    } finally {
      setLoading(false);
      setInput("");
    }
  };

  const handleRetry = async () => {
    if (!lastAttempt) return;
    setErrorMessage(null);
    setLoading(true);
    try {
      const aiReply = await mutation.mutateAsync({ updatedMessages: lastAttempt });
      const replyContent =
        aiReply.source === "rag"
          ? `${aiReply.content} (from RAG)`
          : aiReply.content;

      setMessages((prev) => {
        const withoutError = prev.filter(
          (m) => !(m.role === "assistant" && m.content.startsWith("[Error]"))
        );
        return [...withoutError, ...lastAttempt, { role: "assistant", content: replyContent }];
      });
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : "Error communicating with AI.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handlePickPDF = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];

      setMessages((prev) => [
        ...prev,
        { role: "user", content: `📄 Uploaded PDF: ${file.name}` },
      ]);

      const formData = new FormData();
      formData.append("file", {
        uri: file.uri,
        name: file.name,
        type: file.mimeType ?? "application/pdf",
      } as any);

      await axios.post(PDF_UPLOAD_URL, formData, {
        headers: {
          "Content-Type": "multipart/form-data",
          Authorization: `Token ${token}`,
        },
      });

      setMessages((prev) => [
        ...prev,
        { role: "user", content: "✅ PDF uploaded successfully!" },
      ]);
    } catch (err) {
      console.error("PDF upload error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "user", content: "❌ Failed to upload PDF." },
      ]);
    }
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
            <Text style={styles.avatarText}>A</Text>
          </View>
          <View>
            <Text style={styles.botDescription}>Your AI Tutoring Assistant</Text>
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

      {/* Messages */}
      <KeyboardAvoidingView
        style={styles.keyboardAvoidingView}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView style={styles.messagesContainer}>
          {messages.length === 0 && (
            <View style={styles.welcomeContainer}>
              <Text style={styles.welcomeTitle}>Welcome to Rina!</Text>
              <Text style={styles.welcomeSubtitle}>
                Your intelligent AI tutoring assistant
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
                  </TouchableOpacity>
                ))}
              </View>
            </View>
          )}

          {messages.map((msg, idx) => (
            <View
              key={idx}
              style={[
                styles.messageBubble,
                msg.role === "user" ? styles.userMessage : styles.aiMessage,
              ]}
            >
              <Text
                style={msg.role === "user" ? styles.userMessageText : styles.aiMessageText}
              >
                {msg.content}
              </Text>
            </View>
          ))}

          {loading && (
            <View style={styles.loadingRow}>
              <ActivityIndicator color="#6B21A8" />
              <Text style={styles.loadingText}>Thinking…</Text>
            </View>
          )}
        </ScrollView>

        {errorMessage && (
          <View style={styles.errorBanner}>
            <Text style={styles.errorText}>{errorMessage}</Text>
            <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
              <Text style={styles.retryText}>Retry</Text>
            </TouchableOpacity>
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

          {/* Send Button */}
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
      </KeyboardAvoidingView>

      {/* Chat History Modal */}
      <Modal
        visible={showChatHistory}
        animationType="slide"
        onRequestClose={() => setShowChatHistory(false)}
      >
        <SafeAreaView style={styles.chatHistoryContainer}>
          <Text style={styles.chatHistoryTitle}>Chat History</Text>
        </SafeAreaView>
      </Modal>
    </SafeAreaView>
  );
}

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
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#7C3AED",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
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
    borderRadius: 12,
    margin: 6,
    alignItems: "center",
    width: "45%",
  },
  promptIcon: { fontSize: 20 },
  promptTitle: { marginTop: 6, fontSize: 13, textAlign: "center" },
  chatHistoryContainer: { flex: 1, padding: 20 },
  chatHistoryTitle: { fontSize: 18, fontWeight: "700" },
});

export default function OllamaChatTanstack(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <OllamaChatTanstackInner />
    </QueryClientProvider>
  );
}
