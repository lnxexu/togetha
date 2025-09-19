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
import { useSafeAreaInsets } from "react-native-safe-area-context";

const API_URL = "http://192.168.1.187:8000/chatbot/chat/";
const PDF_UPLOAD_URL = "http://192.168.1.187:8000/chatbot/upload_pdf/";

type Role = "user" | "assistant";

interface Message {
  id?: string;
  role: Role;
  content: string;
  text?: string;
  isUser?: boolean;
  timestamp?: Date;
}

interface ChatSession {
  id: string;
  title: string;
  lastMessage: string;
  timestamp: Date;
  messageCount: number;
}

interface BackendResponse {
  content: string;
  source: string;
}

interface MutationVariables {
  updatedMessages: Message[];
}

type ChatBotNavigationProp = any;

interface ChatBotProps {
  navigation: ChatBotNavigationProp;
}

const queryClient = new QueryClient();

function ChatBot(): React.ReactElement {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  
  const [token, setToken] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hello! How can I assist you today?",
    },
  ]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [lastAttempt, setLastAttempt] = useState<Message[] | null>(null);
  const [showChatHistory, setShowChatHistory] = useState(false);

  useEffect(() => {
    const getToken = async () => {
      const authToken = await AsyncStorage.getItem("authToken");
      setToken(authToken);
    };
    getToken();
  }, []);

  const fetchOllamaMessage = async ({ updatedMessages }: MutationVariables): Promise<BackendResponse> => {
    try {
      const authToken = await AsyncStorage.getItem("authToken");
      if (!authToken) throw new Error("No auth token found");

      const response = await axios.post(
        API_URL,
        { messages: updatedMessages },
        {
          headers: {
            Authorization: `Token ${authToken}`,
          },
        }
      );

      return response.data as BackendResponse;
    } catch (err: any) {
      console.error("Chat request failed:", err.response?.data || err.message);
      throw err;
    }
  };

  const mutation = useMutation<BackendResponse, unknown, MutationVariables>({
    mutationFn: fetchOllamaMessage,
  });

  const suggestedPrompts = [
    { id: "1", text: "Help me understand complex concepts", icon: "🧠", description: "Break down difficult topics into simpler explanations" },
    { id: "2", text: "Create practice questions", icon: "📘", description: "Generate quiz questions from your study materials" },
    { id: "3", text: "Summarize documents", icon: "📄", description: "Get concise summaries of lengthy texts" },
    { id: "4", text: "Explain with examples", icon: "💡", description: "Provide real-world examples for better understanding" },
  ];

  const handleGoBack = () => {
    navigation.goBack();
  };

  const handleMenuPress = () => {
    setShowChatHistory(true);
  };

  const handlePromptSelection = (promptText: string) => {
    setInput(promptText);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    
    const updatedMessages: Message[] = [...messages, { role: "user", content: input }];
    setMessages(updatedMessages);
    setLastAttempt(updatedMessages);
    setErrorMessage(null);
    setLoading(true);
    setInput("");

    try {
      const aiReply = await mutation.mutateAsync({ updatedMessages });
      const replyContent =
        aiReply.source === "rag"
          ? `${aiReply.content} (from RAG)`
          : aiReply.content;

      setMessages((prev) => [...prev, { role: "assistant", content: replyContent }]);
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : "Error communicating with AI.";
      setErrorMessage(msg);
      setMessages((prev) => [...prev, { role: "assistant", content: "[Error] " + msg }]);
    } finally {
      setLoading(false);
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
        return [...withoutError, { role: "assistant", content: replyContent }];
      });
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : "Error communicating with AI.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const handleFileImport = async () => {
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
        { role: "assistant", content: "✅ PDF uploaded successfully!" },
      ]);
    } catch (err) {
      console.error("PDF upload error:", err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "❌ Failed to upload PDF." },
      ]);
    }
  };

  const handleSummarize = () => {
    setInput("Summarize the content we've discussed");
  };

  const handleExplain = () => {
    setInput("Explain this in simpler terms");
  };

  const handleGenerateQuiz = () => {
    setInput("Generate quiz questions based on our conversation");
  };

  const handleOCR = () => {
    setInput("Extract text from the uploaded image");
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#A855F7" />
      <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
        {/* Header */}
        <LinearGradient
          colors={["#A855F7", "#8B5CF6", "#7C3AED"]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 0 }}
          style={[styles.header, { 
            paddingTop: insets.top,
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
            {messages.length === 1 && (
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
                      <Text style={styles.promptDescription}>{prompt.description}</Text>
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

          {/* Action Buttons */}
          <View style={styles.actionsContainer}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.actionsScrollContent}
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
              value={input}
              onChangeText={setInput}
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
                input.trim() === "" && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={input.trim() === ""}
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
            <TouchableOpacity 
              style={styles.closeButton} 
              onPress={() => setShowChatHistory(false)}
            >
              <Text style={styles.closeButtonText}>Close</Text>
            </TouchableOpacity>
          </SafeAreaView>
        </Modal>
      </SafeAreaView>
    </>
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
    fontWeight: "bold",
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
    paddingTop: 120, // Account for header
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
  userMessageText: {
    color: "#FFFFFF",
    fontWeight: "500",
    fontSize: 16,
    lineHeight: 24,
  },
  aiMessageText: {
    color: "#1E293B",
    lineHeight: 22,
    fontSize: 16,
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
  },
  loadingText: {
    color: "#666",
    fontSize: 14,
    fontStyle: "italic",
    marginLeft: 8,
  },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    padding: 12,
    marginHorizontal: 16,
    borderRadius: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  errorText: {
    color: "#DC2626",
    flex: 1,
    fontSize: 14,
  },
  retryButton: {
    backgroundColor: "#DC2626",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 6,
    marginLeft: 8,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "bold",
  },
  actionsContainer: {
    backgroundColor: "#FFFFFF",
    borderTopWidth: 1,
    borderTopColor: "#E2E8F0",
    paddingVertical: 12,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
  },
  actionsScrollContent: {
    paddingHorizontal: 16,
    gap: 12,
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
  welcomeTitle: {
    fontSize: 32,
    fontWeight: "bold",
    color: "#1E293B",
    marginBottom: 12,
    textAlign: "center",
  },
  welcomeSubtitle: {
    fontSize: 18,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 32,
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
    lineHeight: 20,
  },
  promptDescription: {
    fontSize: 13,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 18,
  },

  // Chat History Modal
  chatHistoryContainer: {
    flex: 1,
    padding: 20,
    backgroundColor: "#F8FAFC",
  },
  chatHistoryTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1E293B",
    marginBottom: 20,
  },
  closeButton: {
    backgroundColor: "#6B46C1",
    padding: 12,
    borderRadius: 8,
    alignItems: "center",
    marginTop: 20,
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
});

export default function OllamaChatTanstack(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <ChatBot />
    </QueryClientProvider>
  );
}