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

interface BackendResponse {
  content: string;
  source: "rag" | "chat";
}

interface MutationVariables {
  updatedMessages: Message[];
}

async function fetchOllamaMessage({
  updatedMessages,
}: MutationVariables): Promise<BackendResponse> {
  try {
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
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      {/* Header */}
      <LinearGradient
        colors={["#A855F7", "#8B5CF6", "#7C3AED"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        style={styles.header}
      >
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
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
        <TouchableOpacity style={styles.menuButton} onPress={() => setShowChatHistory(true)}>
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
                    onPress={() => setInput(prompt.text)}
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

        {/* Input Row */}
        <View style={styles.inputContainer}>
          <TextInput
            style={styles.textInput}
            value={input}
            onChangeText={setInput}
            placeholder="Ask me anything..."
            placeholderTextColor="#999"
            multiline
          />

          {/* PDF Upload Button */}
          <TouchableOpacity style={styles.uploadButton} onPress={handlePickPDF}>
            <Ionicons name="document-text-outline" size={22} color="#fff" />
          </TouchableOpacity>

          {/* Send Button */}
          <TouchableOpacity
            style={[styles.sendButton, (!input.trim() || loading) && styles.disabledButton]}
            onPress={handleSend}
            disabled={!input.trim() || loading}
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
  container: { flex: 1, backgroundColor: "#f8f9fa" },
  header: { flexDirection: "row", alignItems: "center", padding: 12 },
  backButton: { marginRight: 8 },
  headerInfo: { flex: 1, flexDirection: "row", alignItems: "center" },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#7C3AED",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
  },
  avatarText: { color: "#fff", fontWeight: "700" },
  botDescription: { color: "#ddd", fontSize: 12 },
  menuButton: { marginLeft: 8 },
  keyboardAvoidingView: { flex: 1 },
  messagesContainer: { flex: 1, padding: 12 },
  messageBubble: {
    marginVertical: 6,
    padding: 12,
    borderRadius: 18,
    maxWidth: "80%",
  },
  userMessage: { backgroundColor: "#7C3AED", alignSelf: "flex-end" },
  aiMessage: { backgroundColor: "#E5E7EB", alignSelf: "flex-start" },
  userMessageText: { color: "#fff", fontSize: 15 },
  aiMessageText: { color: "#111", fontSize: 15 },
  loadingRow: { flexDirection: "row", alignItems: "center", marginVertical: 6 },
  loadingText: { marginLeft: 8, color: "#6B21A8", fontStyle: "italic" },
  errorBanner: {
    backgroundColor: "#FEE2E2",
    padding: 8,
    borderRadius: 6,
    margin: 8,
    flexDirection: "row",
    alignItems: "center",
  },
  errorText: { color: "#B91C1C", flex: 1 },
  retryButton: {
    backgroundColor: "#B91C1C",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 4,
  },
  retryText: { color: "#fff", fontWeight: "700" },
  inputContainer: {
    flexDirection: "row",
    alignItems: "center",
    padding: 8,
    borderTopWidth: 1,
    borderColor: "#ddd",
    backgroundColor: "#fff",
  },
  textInput: { flex: 1, fontSize: 16, padding: 10 },
  uploadButton: {
    backgroundColor: "#7C3AED",
    padding: 10,
    borderRadius: 20,
    marginLeft: 6,
  },
  sendButton: {
    backgroundColor: "#7C3AED",
    padding: 10,
    borderRadius: 20,
    marginLeft: 6,
  },
  disabledButton: { backgroundColor: "#aaa" },
  welcomeContainer: { alignItems: "center", marginTop: 40 },
  welcomeTitle: { fontSize: 22, fontWeight: "700", color: "#333" },
  welcomeSubtitle: { fontSize: 14, color: "#666", marginBottom: 16 },
  suggestedPromptsGrid: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center" },
  promptCard: {
    backgroundColor: "#F3E8FF",
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
