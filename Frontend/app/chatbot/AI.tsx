import React, { useState, useEffect, useRef } from "react";
import {
  Animated,
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
  Alert,
  Image,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons, MaterialIcons } from "@expo/vector-icons";
import { useMutation, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import { useNavigation } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Markdown from "react-native-markdown-display";
import AsyncStorage from '@react-native-async-storage/async-storage';
import chatbotAPI, { 
  Conversation, 
  Message as APIMessage, 
  ConversationFile,
  ChatResponse 
} from "./services/chatbotAPIService";
// Guarded import for ChatHeadContext (fallback if not available)
let useChatHead: any = () => ({ setActiveConversation: () => {}, setHasActiveConversation: () => {}, disableChatHead: () => {}, enableChatHead: () => {}, resetUnreadCount: () => {} });
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const ctx = require('../contexts/ChatHeadContext');
  if (ctx && typeof ctx.useChatHead === 'function') {
    useChatHead = ctx.useChatHead;
  }
} catch {}

type Role = "user" | "assistant";

interface Message {
  id?: string;
  role: Role;
  content: string;
  timestamp?: Date;
  created_at?: string;
}

interface BackendResponse {
  content: string;
  source: string;
  conversation_id: string;
  message_id: string;
}

interface MutationVariables {
  messageContent: string;
}

type ChatBotNavigationProp = any;

interface ChatBotProps {
  navigation: ChatBotNavigationProp;
}

const queryClient = new QueryClient();

function ChatBot(): React.ReactElement {
  const navigation = useNavigation();
  const scrollViewRef = useRef<ScrollView>(null);
  const insets = useSafeAreaInsets();
  const { setActiveConversation, setHasActiveConversation, disableChatHead, enableChatHead } = useChatHead();
  
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [currentConversation, setCurrentConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [showChatHistory, setShowChatHistory] = useState(false);
  const [showChatOptions, setShowChatOptions] = useState(false);
  const [isOnline, setIsOnline] = useState(true);
  const [retryCount, setRetryCount] = useState(0);
  const [editingMessageIndex, setEditingMessageIndex] = useState<number | null>(null);
  const [editingContent, setEditingContent] = useState("");
  const [pendingFiles, setPendingFiles] = useState<any[]>([]);
  const [showFilePreview, setShowFilePreview] = useState(false);
  const [previewFile, setPreviewFile] = useState<any>(null);
  const [attachmentMenuVisible, setAttachmentMenuVisible] = useState(false);
  const [processingFiles, setProcessingFiles] = useState(false);
  const [isKeyboardVisible, setIsKeyboardVisible] = useState(false);
  const [keyboardHeight, setKeyboardHeight] = useState(0);
  // Animated value for smooth keyboard movement
  const animatedBottomValue = useRef(new Animated.Value(0)).current;
  const [inputContainerHeight, setInputContainerHeight] = useState(0);
  
  // OCR Modal states
  const [showOCRModal, setShowOCRModal] = useState(false);
  const [ocrImage, setOCRImage] = useState<any>(null);
  const [ocrResult, setOCRResult] = useState<string>("");
  const [ocrLoading, setOCRLoading] = useState(false);

  useEffect(() => {
    loadConversations();
    restoreActiveConversation();
    
    // Disable chat head while on the main chat interface to prevent conflicts
    disableChatHead();
    
    // Set up keyboard visibility listeners with frame information
    const keyboardDidShowListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow',
      (event) => {
        const kbHeight = event.endCoordinates?.height || 0;
        console.log('Keyboard height:', kbHeight);
        setKeyboardHeight(kbHeight);
        setIsKeyboardVisible(true);
        
        // Animate the bottom value
        Animated.timing(animatedBottomValue, {
          toValue: kbHeight,
          duration: 250,
          useNativeDriver: false,
        }).start();
        
        // Auto scroll to bottom when keyboard appears
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
      }
    );
    
    const keyboardDidHideListener = Keyboard.addListener(
      Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide',
      () => {
        // Animate back to zero
        Animated.timing(animatedBottomValue, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }).start();
        setKeyboardHeight(0);
        setIsKeyboardVisible(false);
      }
    );
    
    // Re-enable when component unmounts and remove listeners
    return () => {
      enableChatHead();
      keyboardDidShowListener.remove();
      keyboardDidHideListener.remove();
    };
  }, [disableChatHead, enableChatHead]);

  // Update chat head context when current conversation changes
  useEffect(() => {
    if (currentConversation) {
      setActiveConversation(currentConversation.id);
      // Save active conversation to storage
      saveActiveConversation(currentConversation.id);
    } else {
      setActiveConversation(null);
      // Clear active conversation from storage
      clearActiveConversation();
    }
  }, [currentConversation, setActiveConversation]);
  
  // Scroll to bottom effect when messages change or keyboard visibility changes
  useEffect(() => {
    const timer = setTimeout(() => {
      scrollViewRef.current?.scrollToEnd({ animated: true });
    }, 100);
    
    return () => clearTimeout(timer);
  }, [messages, isKeyboardVisible]);

  const saveActiveConversation = async (conversationId: string) => {
    try {
      await AsyncStorage.setItem('activeConversationId', conversationId);
    } catch (error) {
      console.warn('Failed to save active conversation:', error);
    }
  };

  const clearActiveConversation = async () => {
    try {
      await AsyncStorage.removeItem('activeConversationId');
    } catch (error) {
      console.warn('Failed to clear active conversation:', error);
    }
  };

  const restoreActiveConversation = async () => {
    try {
      const savedConversationId = await AsyncStorage.getItem('activeConversationId');
      if (savedConversationId) {
        // Load the saved conversation
        loadConversation(savedConversationId);
      }
    } catch (error) {
      console.warn('Failed to restore active conversation:', error);
    }
  };

  const loadConversations = async (silent = false) => {
    try {
      if (!silent) setErrorMessage(null);
      const conversationList = await chatbotAPI.getConversations();
      setConversations(conversationList);
      setIsOnline(true);
      setRetryCount(0);
    } catch (error: any) {
      if (!silent) {
        setIsOnline(false);
        setErrorMessage(error.message || "Failed to load conversations");
      }
      
      // Auto-retry logic only if not already retrying
      if (retryCount < 2 && !silent) {
        setTimeout(() => {
          setRetryCount(prev => prev + 1);
          loadConversations(true); // Silent retry
        }, 3000 * (retryCount + 1)); // Exponential backoff
      }
    }
  };

  const loadConversation = async (conversationId: string) => {
    try {
      const conversation = await chatbotAPI.getConversation(conversationId);
      setCurrentConversation(conversation);
      
      // Update chat head context with active conversation
      setActiveConversation(conversationId);
      
      // Save as active conversation
      await saveActiveConversation(conversationId);
      
      // Convert API messages to local format
      const formattedMessages: Message[] = conversation.messages.map(msg => ({
        id: msg.id,
        role: msg.message_type === 'user' ? 'user' : 'assistant',
        content: msg.content,
        created_at: msg.created_at
      }));
      
      setMessages(formattedMessages);
      setShowChatHistory(false);
    } catch (error) {
      console.error("Error loading conversation:", error);
      Alert.alert("Error", "Failed to load conversation");
    }
  };

  const createNewConversation = async () => {
    try {
      const newConversation = await chatbotAPI.createConversation({
        title: "New Conversation"
      });
      setCurrentConversation(newConversation);
      setMessages([]);
      setShowChatOptions(false);
      
      // Update chat head context with new active conversation
      setActiveConversation(newConversation.id);
      
      // Save the new conversation as active
      await saveActiveConversation(newConversation.id);
      
      await loadConversations();
    } catch (error) {
      console.error("Error creating conversation:", error);
      Alert.alert("Error", "Failed to create new conversation");
    }
  };

  const deleteConversation = async (conversationId: string) => {
    try {
      await chatbotAPI.deleteConversation(conversationId);
      
      // If we deleted the current conversation, clear it
      if (currentConversation?.id === conversationId) {
        setCurrentConversation(null);
        setMessages([]);
        // Remove chat head when no active conversation
        setActiveConversation(null);
        // Clear from AsyncStorage
        await clearActiveConversation();
      }
      
      await loadConversations();
    } catch (error) {
      console.error("Error deleting conversation:", error);
      Alert.alert("Error", "Failed to delete conversation");
    }
  };

  const updateConversationTitle = async (conversationId: string, newTitle: string) => {
    try {
      await chatbotAPI.updateConversation(conversationId, { title: newTitle });
      await loadConversations();
      
      // Update current conversation if it's the one being edited
      if (currentConversation?.id === conversationId) {
        setCurrentConversation({ ...currentConversation, title: newTitle });
      }
    } catch (error) {
      console.error("Error updating conversation title:", error);
      Alert.alert("Error", "Failed to update conversation title");
    }
  };

  const deleteMessage = async (messageId: string, messageIndex: number) => {
    try {
      if (messageId) {
        await chatbotAPI.deleteMessage(messageId);
      }
      
      // Remove message from local state
      setMessages(prev => prev.filter((_, index) => index !== messageIndex));
      
      Alert.alert("Success", "Message deleted successfully");
    } catch (error) {
      console.error("Error deleting message:", error);
      Alert.alert("Error", "Failed to delete message");
    }
  };

  const resetCurrentConversation = () => {
    if (!currentConversation) return;
    
    Alert.alert(
      "Reset Conversation",
      "Are you sure you want to reset this conversation? All messages will be cleared.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Reset",
          style: "destructive",
          onPress: () => {
            setMessages([]);
            setShowChatOptions(false);
          }
        }
      ]
    );
  };

  const deleteCurrentConversation = () => {
    if (!currentConversation) return;
    
    Alert.alert(
      "Delete Conversation",
      "Are you sure you want to delete this conversation? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: () => {
            deleteConversation(currentConversation.id);
            setShowChatOptions(false);
          }
        }
      ]
    );
  };

  const confirmDeleteMessage = (messageId: string, messageIndex: number) => {
    Alert.alert(
      "Delete Message",
      "Are you sure you want to delete this message? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMessage(messageId, messageIndex) }
      ]
    );
  };

  const startEditMessage = (messageIndex: number, content: string) => {
    setEditingMessageIndex(messageIndex);
    setEditingContent(content);
  };

  const cancelEditMessage = () => {
    setEditingMessageIndex(null);
    setEditingContent("");
  };

  const saveEditMessage = async (messageIndex: number) => {
    if (!editingContent.trim()) return;
    
    // Update the message content locally
    const updatedMessages = [...messages];
    updatedMessages[messageIndex].content = editingContent.trim();
    
    // Remove all messages after the edited message (like Perplexity)
    const messagesUpToEdit = updatedMessages.slice(0, messageIndex + 1);
    setMessages(messagesUpToEdit);
    
    // Clear edit state
    setEditingMessageIndex(null);
    setEditingContent("");
    
    // If the edited message was a user message, regenerate response
    if (messagesUpToEdit[messageIndex].role === "user") {
      setLoading(true);
      setErrorMessage(null);
      
      try {
        const response = await mutation.mutateAsync({ messageContent: editingContent.trim() });
        
        // Add AI response
        const aiMessage: Message = {
          role: "assistant",
          content: response.content,
          timestamp: new Date()
        };
        
        setMessages(prev => [...prev, aiMessage]);
        
        // Auto-scroll to bottom
        setTimeout(() => {
          scrollViewRef.current?.scrollToEnd({ animated: true });
        }, 100);
        
      } catch (err: any) {
        const errorMsg = err?.message || "Error regenerating response. Please try again.";
        setErrorMessage(errorMsg);
        
        // Add error message to chat
        setMessages(prev => [...prev, { 
          role: "assistant", 
          content: `[Error] ${errorMsg}` 
        }]);
      } finally {
        setLoading(false);
      }
    }
  };

  const generateConversationTitle = async (conversationId: string, firstPrompt: string) => {
    try {
      // Create a smart title from the first prompt
      let smartTitle = firstPrompt.trim();
      
      // Remove common question words and clean up
      smartTitle = smartTitle
        .replace(/^(what|how|why|when|where|who|can you|could you|please|help me|i need)/i, '')
        .replace(/[?!.]+$/, '')
        .trim();
      
      // Capitalize first letter and limit length
      if (smartTitle.length > 0) {
        smartTitle = smartTitle.charAt(0).toUpperCase() + smartTitle.slice(1);
        if (smartTitle.length > 40) {
          smartTitle = smartTitle.substring(0, 37) + '...';
        }
      } else {
        smartTitle = 'New Conversation';
      }
      
      // Update the conversation title
      await updateConversationTitle(conversationId, smartTitle);
      
    } catch (error) {
      console.warn('Failed to generate conversation title:', error);
      // Don't throw - title generation failure shouldn't break the conversation
    }
  };

  const fetchOllamaMessage = async ({ messageContent }: MutationVariables): Promise<BackendResponse> => {
    try {
      // Format all messages properly for the API (including conversation history)
      const formattedMessages = messages.map(msg => ({
        role: msg.role,
        content: msg.content
      }));
      
      // Add the new user message
      formattedMessages.push({ role: "user", content: messageContent });
      
      console.log(`Sending ${formattedMessages.length} messages to backend`);
      
      const response = await chatbotAPI.sendMessage(
        messageContent, 
        currentConversation?.id, 
        formattedMessages
      );
      
      return {
        content: response.content,
        source: response.source,
        conversation_id: response.conversation_id,
        message_id: response.message_id
      };
    } catch (err: any) {
      console.error("fetchOllamaMessage error:", err);
      // Re-throw with more specific error message
      throw new Error(err.message || "Failed to send message. Please check your connection and try again.");
    }
  };

  const mutation = useMutation<BackendResponse, Error, MutationVariables>({
    mutationFn: fetchOllamaMessage,
    onError: (error) => {
      // Only set error message, don't log as it's already logged in fetchOllamaMessage
      setErrorMessage(error.message);
    },
    onSuccess: (data) => {
      setErrorMessage(null);
      setIsOnline(true);
      setRetryCount(0);
    }
  });

  const suggestedPrompts = [
    { id: "1", text: "Understand concepts", icon: "🧠", description: "Break down difficult topics" },
    { id: "2", text: "Practice questions", icon: "📘", description: "Generate quiz questions" },
    { id: "3", text: "Summarize docs", icon: "📄", description: "Get concise summaries" },
    { id: "4", text: "Learn with examples", icon: "💡", description: "Real-world examples" },
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
    if (!input.trim() && pendingFiles.length === 0) return;
    
    // Check if we're online
    if (!isOnline) {
      Alert.alert(
        "Connection Error", 
        "You appear to be offline. Please check your internet connection and try again.",
        [
          { text: "Retry", onPress: () => loadConversations() },
          { text: "Cancel", style: "cancel" }
        ]
      );
      return;
    }
    
    setErrorMessage(null);
    
    // Store current message and files for this specific message
    const currentInput = input.trim();
    const currentFiles = [...pendingFiles];
    
    // Clear input and pending files immediately for better UX
    setInput("");
    setPendingFiles([]);
    setAttachmentMenuVisible(false);

    try {
      let messageContent = currentInput;
      let fileContext = "";
      let successfulFiles: string[] = [];
      let failedFiles: string[] = [];
      
      // Process files attached to THIS message
      if (currentFiles.length > 0) {
        console.log(`📁 Processing ${currentFiles.length} files...`);
        
        for (const file of currentFiles) {
          try {
            console.log(`🔄 Processing file: ${file.name} (${file.mimeType})`);
            
            // Handle images with OCR
            if (file.mimeType?.startsWith('image/')) {
              try {
                console.log(`📸 Extracting text from image: ${file.name}`);
                const ocrResponse = await chatbotAPI.extractTextFromImage(file);
                
                if (ocrResponse.text && ocrResponse.text.trim().length > 0) {
                  fileContext += `\n\n**📷 Image: ${file.name}**\n`;
                  fileContext += `*Extracted text:*\n${ocrResponse.text.trim()}\n`;
                  successfulFiles.push(file.name);
                  console.log(`✅ OCR successful for ${file.name}: ${ocrResponse.text.length} characters`);
                } else {
                  fileContext += `\n\n**📷 Image: ${file.name}**\n`;
                  fileContext += `*No readable text detected in this image*\n`;
                  successfulFiles.push(file.name);
                  console.log(`⚠️ No text detected in ${file.name}`);
                }
              } catch (ocrError: any) {
                console.error(`❌ OCR failed for ${file.name}:`, ocrError);
                fileContext += `\n\n**📷 Image: ${file.name}**\n`;
                fileContext += `*Error: Could not extract text from this image*\n`;
                failedFiles.push(`${file.name} (OCR failed)`);
              }
            } 
            // Handle documents with upload
            else {
              try {
                console.log(`📄 Uploading document: ${file.name}`);
                const uploadResponse = await chatbotAPI.uploadFile(file, currentConversation?.id);
                
                fileContext += `\n\n**📄 Document: ${file.name}**\n`;
                fileContext += `*Document uploaded successfully and available for analysis*\n`;
                
                if ((uploadResponse as any).extracted_preview) {
                  fileContext += `*Preview:* ${(uploadResponse as any).extracted_preview}...\n`;
                }
                
                successfulFiles.push(file.name);
                console.log(`✅ Document uploaded successfully: ${file.name}`);
              } catch (uploadError: any) {
                console.error(`❌ Upload failed for ${file.name}:`, uploadError);
                
                let errorMessage = "Upload failed";
                
                // Provide specific error messages based on the error
                if (uploadError.message?.includes("413") || uploadError.message?.includes("too large")) {
                  errorMessage = "File too large (max 50MB)";
                } else if (uploadError.message?.includes("415") || uploadError.message?.includes("not supported")) {
                  errorMessage = "File type not supported";
                } else if (uploadError.message?.includes("500")) {
                  errorMessage = "Server processing error";
                } else if (uploadError.message?.includes("timeout")) {
                  errorMessage = "Upload timed out";
                } else if (uploadError.message?.includes("401")) {
                  errorMessage = "Authentication error";
                } else if (uploadError.message?.includes("404")) {
                  errorMessage = "Upload service unavailable";
                }
                
                fileContext += `\n\n**📄 Document: ${file.name}**\n`;
                fileContext += `*Error: ${errorMessage}*\n`;
                failedFiles.push(`${file.name} (${errorMessage})`);
              }
            }
          } catch (generalError: any) {
            console.error(`❌ General file processing error for ${file.name}:`, generalError);
            fileContext += `\n\n**📄 File: ${file.name}**\n`;
            fileContext += `*Error: Failed to process file*\n`;
            failedFiles.push(`${file.name} (Processing error)`);
          }
        }

        // Add file processing summary
        if (successfulFiles.length > 0 || failedFiles.length > 0) {
          fileContext += `\n\n**📋 File Processing Summary:**\n`;
          if (successfulFiles.length > 0) {
            fileContext += `✅ Successfully processed: ${successfulFiles.length} file(s)\n`;
          }
          if (failedFiles.length > 0) {
            fileContext += `❌ Failed to process: ${failedFiles.length} file(s)\n`;
          }
        }
      }
      
      // Create the final message content
      const finalMessageContent = messageContent + fileContext;
      
      // Validate that we have some content to send
      const hasContent = finalMessageContent.trim().length > 0;
      const hasValidFiles = successfulFiles.length > 0;
      
      if (!hasContent && !hasValidFiles) {
        setLoading(false);
        Alert.alert(
          "Nothing to Send",
          "Please enter a message or attach files that can be processed.",
          [{ text: "OK" }]
        );
        return;
      }
      
      // Add user message to local state immediately for better UX
      const userMessage: Message = { 
        role: "user", 
        content: finalMessageContent || "[Files processed - see details above]",
        timestamp: new Date()
      };
      setMessages(prev => [...prev, userMessage]);

      // Set loading after user message is added
      setLoading(true);

      // Auto-scroll to bottom when user sends message
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
      
      // Send to AI with the message and file context
      const response = await mutation.mutateAsync({ 
        messageContent: finalMessageContent || "Please analyze the attached files and their content." 
      });
      
      // Add AI response to local state
      const aiMessage: Message = {
        role: "assistant",
        content: response.content,
        timestamp: new Date()
      };
      
      setMessages(prev => [...prev, aiMessage]);
      
      // Show file processing results to user if there were any issues
      if (failedFiles.length > 0) {
        setTimeout(() => {
          Alert.alert(
            "File Processing Results",
            `Successfully processed: ${successfulFiles.length} file(s)\n` +
            `Failed to process: ${failedFiles.length} file(s)\n\n` +
            `Failed files:\n• ${failedFiles.join('\n• ')}`,
            [{ text: "OK" }]
          );
        }, 1000);
      }
      
      // Update current conversation if we got an ID back
      if (response.conversation_id && !currentConversation) {
        try {
          const newConversation = await chatbotAPI.getConversation(response.conversation_id);
          setCurrentConversation(newConversation);
          
          // Update chat head context with new active conversation
          setActiveConversation(newConversation.id);
          
          // Save the new conversation as active
          await saveActiveConversation(newConversation.id);
          
          await loadConversations(); // Refresh conversation list
        } catch (convError) {
          console.warn("Failed to load conversation details, but message was sent successfully");
        }
      }

      // Generate title if this is the first AI response (conversation has 2 messages)
      if (messages.length === 1 && response.conversation_id) {
        try {
          await generateConversationTitle(response.conversation_id, messageContent);
        } catch (titleError) {
          console.warn("Failed to generate title, but conversation continues normally");
        }
      }
      
      // Auto-scroll to bottom
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
      
    } catch (err: any) {
      // Error already handled by mutation, just remove the message from UI if send failed
      setMessages(prev => prev.slice(0, -1)); // Remove the last message (the failed one)
      
      const errorMsg = err?.message || "Error communicating with AI. Please try again.";
      
      // Add error message to chat
      setMessages((prev) => [...prev, { 
        role: "assistant", 
        content: `[Error] ${errorMsg}` 
      }]);
      
      // Show alert for serious errors
      if (errorMsg.includes("authentication") || errorMsg.includes("login")) {
        Alert.alert(
          "Authentication Error",
          "Your session has expired. Please login again.",
          [{ text: "OK" }]
        );
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRetry = async () => {
    if (messages.length === 0) return;
    
    // Get the last user message
    const lastUserMessage = [...messages].reverse().find(m => m.role === "user");
    if (!lastUserMessage) return;
    
    setErrorMessage(null);
    setLoading(true);
    
    try {
      const response = await mutation.mutateAsync({ messageContent: lastUserMessage.content });
      
      // Remove any error messages and add new response
      setMessages((prev) => {
        const withoutError = prev.filter(
          (m) => !(m.role === "assistant" && m.content.startsWith("[Error]"))
        );
        return [...withoutError, { role: "assistant", content: response.content }];
      });
    } catch (err: any) {
      const msg = err?.message ? String(err.message) : "Error communicating with AI.";
      setErrorMessage(msg);
    } finally {
      setLoading(false);
    }
  };

  const removePendingFile = (index: number) => {
    setPendingFiles(prev => prev.filter((_, i) => i !== index));
  };

  const handleFileImport = async (type: 'file' | 'image' | 'camera') => {
    try {
      let result;
      
      if (type === 'image') {
        result = await DocumentPicker.getDocumentAsync({
          type: "image/*",
          copyToCacheDirectory: true,
          multiple: false,
        });
      } else if (type === 'camera') {
        // TODO: Implement camera functionality with expo-image-picker
        // For now, fallback to image picker
        result = await DocumentPicker.getDocumentAsync({
          type: "image/*",
          copyToCacheDirectory: true,
          multiple: false,
        });
      } else {
        result = await DocumentPicker.getDocumentAsync({
          type: "*/*",
          copyToCacheDirectory: true,
          multiple: false,
        });
      }

      if (result.canceled) return;

      const file = result.assets[0];
      
      // Validate file size (50MB limit)
      const maxSize = 50 * 1024 * 1024; // 50MB
      if (file.size && file.size > maxSize) {
        Alert.alert(
          "File Too Large",
          `The selected file is ${(file.size / (1024 * 1024)).toFixed(1)}MB. Maximum allowed size is 50MB.`,
          [{ text: "OK" }]
        );
        return;
      }
      
      // Validate file type for images
      if (type === 'image' || type === 'camera') {
        const imageTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/bmp', 'image/tiff', 'image/webp'];
        if (!imageTypes.includes(file.mimeType || '')) {
          Alert.alert(
            "Invalid Image Type",
            "Please select a valid image file (JPEG, PNG, BMP, TIFF, WEBP).",
            [{ text: "OK" }]
          );
          return;
        }
      }
      
      // Check if file is already pending
      const isDuplicate = pendingFiles.some(pendingFile => 
        pendingFile.name === file.name && pendingFile.size === file.size
      );
      
      if (isDuplicate) {
        Alert.alert(
          "File Already Added",
          `"${file.name}" is already in your pending files list.`,
          [{ text: "OK" }]
        );
        return;
      }
      
      // Add file to pending list
      setPendingFiles(prev => [...prev, file]);
      setAttachmentMenuVisible(false);
      
      // Show success message
      console.log(`✅ File added: ${file.name} (${file.mimeType}, ${file.size} bytes)`);
      
    } catch (err: any) {
      console.error("File selection error:", err);
      
      let errorMessage = "Failed to select file. Please try again.";
      if (err.message?.includes("permissions")) {
        errorMessage = "Permission denied. Please check app permissions.";
      } else if (err.message?.includes("cancelled")) {
        return; // User cancelled, no need to show error
      }
      
      Alert.alert("Error", errorMessage);
    }
  };



  const handleSummarize = () => {
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === "assistant");
    if (lastAssistantMessage) {
      setInput("Please provide a summary of your previous response.");
    } else {
      setInput("Please summarize the content we've discussed or any uploaded files");
    }
  };

  const handleExplain = () => {
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === "assistant");
    if (lastAssistantMessage) {
      setInput("Please explain your previous response in simpler terms.");
    } else {
      setInput("Explain this content in simpler terms");
    }
  };

  const handleGenerateQuiz = () => {
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === "assistant");
    if (lastAssistantMessage) {
      setInput("Generate quiz questions based on your previous response.");
    } else {
      setInput("Generate quiz questions based on our conversation or any uploaded content");
    }
  };

  const handleOCRModalOpen = () => {
    setShowOCRModal(true);
    setShowChatOptions(false);
  };

  const handleOCRImageSelect = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'image/*',
        copyToCacheDirectory: true,
        multiple: false
      });
      
      if (result.canceled) return;
      
      const file = result.assets[0];
      
      if (!file) {
        Alert.alert("Error", "No image selected");
        return;
      }
      
      // Validate file size (50MB limit)
      const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB
      if (file.size && file.size > MAX_FILE_SIZE) {
        Alert.alert("Error", "File too large (max 50MB)");
        return;
      }
      
      setOCRImage(file);
      setOCRResult("");
    } catch (error: any) {
      console.error('Image selection error:', error);
      Alert.alert("Error", "Failed to select image");
    }
  };

  const handleOCRProcess = async () => {
    if (!ocrImage) {
      Alert.alert("Error", "Please select an image first");
      return;
    }

    try {
      setOCRLoading(true);
      setOCRResult("");
      
      console.log(`📸 Starting OCR for: ${ocrImage.name}`);
      
      const ocrResponse = await chatbotAPI.extractTextFromImage(ocrImage);
      
      if (ocrResponse.text && ocrResponse.text.trim().length > 0) {
        setOCRResult(ocrResponse.text.trim());
        console.log(`✅ OCR successful: ${ocrResponse.text.length} characters extracted`);
      } else {
        setOCRResult("No readable text found in the image.");
      }
    } catch (error: any) {
      console.error(`❌ OCR processing error:`, error);
      
      let errorMessage = "Failed to extract text from image";
      
      if (error.message?.includes("413") || error.message?.includes("too large")) {
        errorMessage = "Image file is too large (max 50MB)";
      } else if (error.message?.includes("415") || error.message?.includes("not supported")) {
        errorMessage = "Image format not supported. Please use JPG, PNG, or GIF.";
      } else if (error.message?.includes("500")) {
        errorMessage = "Server error during OCR processing";
      } else if (error.message?.includes("timeout")) {
        errorMessage = "OCR processing timed out. Please try with a smaller image.";
      }
      
      setOCRResult(`Error: ${errorMessage}`);
      Alert.alert("OCR Error", errorMessage);
    } finally {
      setOCRLoading(false);
    }
  };

  const handleOCRCopyText = async () => {
    if (!ocrResult) return;
    
    // Copy to clipboard would need expo-clipboard
    // For now, we'll just close the modal and put the text in input
    setInput(ocrResult);
    setShowOCRModal(false);
    Alert.alert("Success", "Text copied to message input");
  };

  const handleOCRClose = () => {
    setShowOCRModal(false);
    setOCRImage(null);
    setOCRResult("");
    setOCRLoading(false);
  };

  const handleOCR = async () => {
    if (pendingFiles.length === 0) {
      Alert.alert(
        "No Files Selected", 
        "Please upload image files first to extract text from them.",
        [{ text: "OK" }]
      );
      return;
    }
    
    const imageFiles = pendingFiles.filter(file => file.mimeType?.startsWith('image/'));
    
    if (imageFiles.length === 0) {
      Alert.alert(
        "No Images Found", 
        "OCR can only extract text from image files. Please upload some images first.",
        [{ text: "OK" }]
      );
      return;
    }
    
    setLoading(true);
    setErrorMessage(null);
    
    try {
      let extractedText = "";
      let successCount = 0;
      let failureCount = 0;
      let processedResults: { name: string; success: boolean; text?: string; error?: string }[] = [];
      
      console.log(`🔍 Starting OCR for ${imageFiles.length} image(s)...`);
      
      for (const file of imageFiles) {
        try {
          console.log(`📸 Extracting text from: ${file.name}`);
          const ocrResponse = await chatbotAPI.extractTextFromImage(file);
          
          if (ocrResponse.text && ocrResponse.text.trim().length > 0) {
            const cleanText = ocrResponse.text.trim();
            extractedText += `\n\n**📷 ${file.name}:**\n${cleanText}`;
            successCount++;
            processedResults.push({ 
              name: file.name, 
              success: true, 
              text: cleanText.substring(0, 100) + (cleanText.length > 100 ? '...' : '')
            });
            console.log(`✅ OCR successful for ${file.name}: ${cleanText.length} characters`);
          } else {
            extractedText += `\n\n**📷 ${file.name}:**\n[No readable text detected in this image]`;
            successCount++;
            processedResults.push({ 
              name: file.name, 
              success: true, 
              text: 'No text detected'
            });
            console.log(`⚠️ No text detected in ${file.name}`);
          }
        } catch (error: any) {
          console.error(`❌ OCR error for ${file.name}:`, error);
          
          let errorMsg = "OCR processing failed";
          if (error.message?.includes("503")) {
            errorMsg = "OCR service unavailable";
          } else if (error.message?.includes("400")) {
            errorMsg = "Invalid image format";
          } else if (error.message?.includes("413")) {
            errorMsg = "Image too large";
          }
          
          extractedText += `\n\n**📷 ${file.name}:**\n[Error: ${errorMsg}]`;
          failureCount++;
          processedResults.push({ 
            name: file.name, 
            success: false, 
            error: errorMsg
          });
        }
      }
      
      if (extractedText.trim()) {
        // Add the extracted text as user input
        const summaryText = `Here is the text extracted from ${imageFiles.length} image(s):${extractedText}`;
        setInput(summaryText);
        
        // Show detailed results
        const resultMessage = processedResults.map(result => 
          `• ${result.name}: ${result.success ? (result.text || 'No text') : result.error}`
        ).join('\n');
        
        Alert.alert(
          "Text Extraction Complete", 
          `Successfully processed: ${successCount}/${imageFiles.length} image(s)\n\n${resultMessage}`,
          [
            { 
              text: "Send Message", 
              onPress: () => {
                if (summaryText.trim()) {
                  handleSend();
                }
              }
            },
            { text: "Edit First", style: "cancel" }
          ]
        );
      } else {
        Alert.alert(
          "No Text Extracted", 
          "Could not extract any readable text from the uploaded images. The images may not contain text or the text quality may be too poor for OCR.",
          [{ text: "OK" }]
        );
      }
    } catch (error: any) {
      console.error("❌ OCR processing error:", error);
      
      let errorMessage = "Failed to extract text from images.";
      if (error.message?.includes("network")) {
        errorMessage = "Network error. Please check your connection and try again.";
      } else if (error.message?.includes("timeout")) {
        errorMessage = "Request timed out. Please try again.";
      }
      
      setErrorMessage(errorMessage);
      Alert.alert("OCR Error", errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <StatusBar barStyle="light-content" backgroundColor="#8B5CF6" />
      <View style={styles.rootContainer}>
        {/* Header */}
      <LinearGradient
        colors={["#6366F1", "#8B5CF6", "#A855F7"]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 0 }}
        // Respect the device safe area so header content won't overlap the status bar
        style={[styles.header, { paddingTop: insets.top + 12 }]}
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
            onPress={handleOCRModalOpen}
            accessibilityLabel="Image to Text"
            accessibilityHint="Extract text from images using OCR"
          >
            <MaterialIcons name="image-search" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.menuButton} 
            onPress={handleMenuPress}
            accessibilityLabel="Chat history"
            accessibilityHint="View previous chat sessions"
          >
            <MaterialIcons name="history" size={24} color="#FFFFFF" />
          </TouchableOpacity>
          <TouchableOpacity 
            style={styles.menuButton} 
            onPress={() => setShowChatOptions(!showChatOptions)}
            accessibilityLabel="Chat options"
            accessibilityHint="Manage chat conversations"
          >
            <Ionicons name="ellipsis-vertical" size={24} color="#FFFFFF" />
          </TouchableOpacity>
        </LinearGradient>

        {/* Chat Options Dropdown */}
        {showChatOptions && (
          <View style={[styles.chatOptionsContainer, { top: insets.top + 72 }]}> 
             <TouchableOpacity style={styles.chatOption} onPress={createNewConversation}>
               <Ionicons name="add" size={20} color="#6B46C1" />
               <Text style={styles.chatOptionText}>New Chat</Text>
             </TouchableOpacity>
            
            {currentConversation && (
              <>
                <TouchableOpacity 
                  style={styles.chatOption} 
                  onPress={deleteCurrentConversation}
                >
                  <Ionicons name="trash" size={20} color="#EF4444" />
                  <Text style={[styles.chatOptionText, { color: "#EF4444" }]}>Delete Conversation</Text>
                </TouchableOpacity>
                
                <TouchableOpacity 
                  style={styles.chatOption} 
                  onPress={resetCurrentConversation}
                >
                  <Ionicons name="refresh" size={20} color="#F59E0B" />
                  <Text style={[styles.chatOptionText, { color: "#F59E0B" }]}>Reset Conversation</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        )}

        {/* Messages ScrollView - Independent of KeyboardAvoidingView for better positioning */}
        <ScrollView 
          ref={scrollViewRef}
          style={styles.messagesContainer}
          // Dynamic padding based on keyboard visibility to ensure content isn't hidden behind input container
          contentContainerStyle={[
            styles.messagesContentContainer,
            { 
              // Ensure enough bottom padding for both keyboard presence and the actual input container height
              paddingBottom: Math.max(
                isKeyboardVisible 
                  ? (keyboardHeight > 0 ? keyboardHeight + 90 : 180) + insets.bottom 
                  : 130 + insets.bottom,
                inputContainerHeight + insets.bottom + 8
              )
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          removeClippedSubviews={true}
          onTouchStart={() => {
            setShowChatOptions(false);
            setAttachmentMenuVisible(false);
          }}
          onScrollBeginDrag={() => {
            setAttachmentMenuVisible(false);
          }}
        >
          {messages.length === 0 && (
            <View style={styles.welcomeContainer}>
              <View style={styles.welcomeHeader}>
                <LinearGradient
                  colors={["#6366F1", "#8B5CF6"]}
                  style={styles.welcomeAvatar}
                >
                  <Text style={styles.welcomeAvatarText}>R</Text>
                </LinearGradient>
                <Text style={styles.welcomeTitle}>Hello! I'm Rina</Text>
                <Text style={styles.welcomeSubtitle}>
                  Your AI assistant ready to help with anything
                </Text>
              </View>
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
                    <View style={styles.promptIconContainer}>
                      <Text style={styles.promptIcon}>{prompt.icon}</Text>
                    </View>
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
              {editingMessageIndex === idx ? (
                // Edit mode
                <View style={styles.editMessageContainer}>
                  <TextInput
                    style={styles.editMessageInput}
                    value={editingContent}
                    onChangeText={setEditingContent}
                    multiline
                    autoFocus
                    placeholder="Edit your message..."
                    placeholderTextColor="#94A3B8"
                  />
                  <View style={styles.editMessageActions}>
                    <TouchableOpacity
                      style={styles.editCancelButton}
                      onPress={cancelEditMessage}
                    >
                      <Ionicons name="close" size={16} color="#DC2626" />
                      <Text style={styles.editCancelText}>Cancel</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      style={styles.editSaveButton}
                      onPress={() => saveEditMessage(idx)}
                      disabled={!editingContent.trim()}
                    >
                      <Ionicons name="checkmark" size={16} color="#FFFFFF" />
                      <Text style={styles.editSaveText}>Save</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                // Normal message display
                <View style={styles.messageContent}>
                  {msg.role === "user" ? (
                    <Text
                      style={[styles.userMessageText, { flex: 1 }]}
                    >
                      {msg.content}
                    </Text>
                  ) : (
                    <Markdown
                      style={{
                        body: styles.aiMessageText,
                        heading1: styles.markdownH1,
                        heading2: styles.markdownH2,
                        heading3: styles.markdownH3,
                        strong: styles.markdownStrong,
                        em: styles.markdownEm,
                        bullet_list: styles.markdownList,
                        ordered_list: styles.markdownList,
                        list_item: styles.markdownListItem,
                        table: styles.markdownTable,
                        tr: styles.markdownTableRow,
                        td: styles.markdownTableCell,
                        th: styles.markdownTableHeader,
                        code_inline: styles.markdownCodeInline,
                        code_block: styles.markdownCodeBlock,
                      }}
                    >
                      {msg.content}
                    </Markdown>
                  )}
                  {msg.role === "user" && (
                    <View style={styles.messageActions}>
                      <TouchableOpacity
                        style={styles.editButton}
                        onPress={() => startEditMessage(idx, msg.content)}
                        accessibilityLabel="Edit message"
                        accessibilityHint="Edit this user message"
                      >
                        <Ionicons name="pencil" size={16} color="rgba(255, 255, 255, 0.8)" />
                      </TouchableOpacity>
                      <TouchableOpacity
                        style={styles.deleteButton}
                        onPress={() => confirmDeleteMessage(msg.id || '', idx)}
                        accessibilityLabel="Delete message"
                        accessibilityHint="Delete this user message"
                      >
                        <Ionicons name="close-circle" size={16} color="rgba(255, 255, 255, 0.8)" />
                      </TouchableOpacity>
                    </View>
                  )}
                </View>
              )}
            </View>
          ))}

          {loading && (
            <View style={styles.loadingContainer}>
              <View style={styles.loadingBubble}>
                <View style={styles.loadingContent}>
                  <ActivityIndicator color="#6B46C1" size="small" />
                  <Text style={styles.loadingText}>Rina is thinking...</Text>
                </View>
                <View style={styles.loadingDots}>
                  <View style={[styles.loadingDot, styles.loadingDot1]} />
                  <View style={[styles.loadingDot, styles.loadingDot2]} />
                  <View style={[styles.loadingDot, styles.loadingDot3]} />
                </View>
              </View>
            </View>
          )}
        </ScrollView>
      </View>

      {/* Input Container - Moved outside root container */}
      <View style={[
        styles.inputContainer,
        { backgroundColor: 'transparent' }
      ]}>

        {/* Input Container - Always positioned at bottom */}
        <KeyboardAvoidingView
          style={styles.keyboardAvoidingView}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
          keyboardVerticalOffset={Platform.OS === "ios" ? insets.top : 0}
          enabled={true}
        >
          <View style={[
            styles.inputContainer, 
            { paddingBottom: insets.bottom, paddingTop: 8}
          ]}
          onLayout={(e) => {
            const h = e.nativeEvent.layout.height;
            if (Math.abs(h - inputContainerHeight) > 1) {
              setInputContainerHeight(h);
            }
          }}
          >
            {errorMessage && (
              <View style={styles.errorBanner}>
                <Text style={styles.errorText}>{errorMessage}</Text>
                <TouchableOpacity onPress={handleRetry} style={styles.retryButton}>
                  <Text style={styles.retryText}>Retry</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Compact Action Buttons */}
            {messages.length > 0 && (
              <View style={styles.compactActionsContainer}>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.compactActionsContent}
                >
                  <TouchableOpacity
                    style={styles.compactActionButton}
                    onPress={handleSummarize}
                    accessibilityLabel="Summarize content"
                  >
                    <Ionicons name="document-text" size={18} color="#6B46C1" />
                  </TouchableOpacity>

                  <TouchableOpacity 
                    style={styles.compactActionButton} 
                    onPress={handleExplain}
                    accessibilityLabel="Explain concepts"
                  >
                    <Ionicons name="bulb" size={18} color="#6B46C1" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.compactActionButton}
                    onPress={handleGenerateQuiz}
                    accessibilityLabel="Generate quiz"
                  >
                    <Ionicons name="help-circle" size={18} color="#6B46C1" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.compactActionButton} 
                    onPress={() => handlePromptSelection("Please analyze the key concepts from our conversation and provide a detailed study guide.")}
                    accessibilityLabel="Study guide"
                  >
                    <Ionicons name="library" size={18} color="#6B46C1" />
                  </TouchableOpacity>
                  
                  <TouchableOpacity 
                    style={styles.compactActionButton} 
                    onPress={handleOCR}
                    accessibilityLabel="Extract text from images"
                  >
                    <Ionicons name="image" size={18} color="#6B46C1" />
                  </TouchableOpacity>
                </ScrollView>
              </View>
            )}

            {/* Input Area */}
            <View style={styles.inputAreaContainer}>
              {/* Pending Files Display */}
              {pendingFiles.length > 0 && (
                <View style={styles.pendingFilesContainer}>
                  <View style={styles.pendingFilesHeaderRow}>
                    <Text style={styles.pendingFilesHeader}>
                      📎 Files ready to send ({pendingFiles.length})
                    </Text>
                    <TouchableOpacity
                      style={styles.clearAllFilesButton}
                      onPress={() => setPendingFiles([])}
                      accessibilityLabel="Clear all files"
                    >
                      <Ionicons name="trash-outline" size={16} color="#DC2626" />
                      <Text style={styles.clearAllFilesText}>Clear All</Text>
                    </TouchableOpacity>
                  </View>
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    style={styles.pendingFilesScroll}
                    contentContainerStyle={styles.pendingFilesScrollContent}
                  >
                    {pendingFiles.map((file, index) => {
                      const isImage = file.mimeType?.startsWith('image/');
                      const fileSizeKB = file.size ? (file.size / 1024).toFixed(1) : 'Unknown';
                      const fileExtension = file.name?.split('.').pop()?.toUpperCase() || 'FILE';
                      
                      return (
                        <View key={index} style={styles.pendingFileItem}>
                          <View style={styles.pendingFileIconContainer}>
                            <Ionicons 
                              name={isImage ? 'image' : 'document-text'} 
                              size={20} 
                              color={isImage ? "#10B981" : "#6B46C1"} 
                            />
                            <Text style={styles.fileTypeIndicator}>{fileExtension}</Text>
                          </View>
                          <View style={styles.pendingFileDetails}>
                            <Text style={styles.pendingFileName} numberOfLines={1}>
                              {file.name}
                            </Text>
                            <Text style={styles.pendingFileSize}>
                              {fileSizeKB} KB • {isImage ? 'Image' : 'Document'}
                            </Text>
                          </View>
                          <TouchableOpacity
                            style={styles.removePendingFile}
                            onPress={() => removePendingFile(index)}
                            accessibilityLabel={`Remove ${file.name}`}
                          >
                            <Ionicons name="close-circle" size={18} color="#DC2626" />
                          </TouchableOpacity>
                        </View>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* inputRow moved out to sibling below */}
            </View>
          </View>

        {/* Floating Input Row - positioned to stay above keyboard with animation */}
        <Animated.View style={[
          styles.floatingInputRow, 
          { 
            paddingBottom: insets.bottom + 8,
            bottom: animatedBottomValue, // Animated value for smooth keyboard following
          }
        ]}>
          <View style={styles.inputRow}>
            <View style={styles.inputWrapper}>
              <TextInput
                style={styles.textInput}
                value={input}
                onChangeText={setInput}
                placeholder="Type a message..."
                placeholderTextColor="#94A3B8"
                multiline
                maxLength={1000}
                accessibilityLabel="Message input"
                accessibilityHint="Type your message to send to Rina"
                onFocus={() => {
                  // Ensure content scrolls when keyboard appears
                  setTimeout(() => {
                    scrollViewRef.current?.scrollToEnd({ animated: true });
                  }, 300);
                }}
              />
              <TouchableOpacity
                style={styles.attachButton}
                onPress={() => setAttachmentMenuVisible(!attachmentMenuVisible)}
                accessibilityLabel="Attach file"
                accessibilityHint="Import and upload a document or image"
              >
                <Ionicons name="attach" size={24} color="#6B46C1" />
              </TouchableOpacity>

              {/* Attachment Menu */}
              {attachmentMenuVisible && (
                <View style={[styles.attachmentMenu, { bottom: 50 + insets.bottom, right: 8 }]}>
                  <TouchableOpacity
                    style={styles.attachmentOption}
                    onPress={() => handleFileImport('file')}
                  >
                    <Ionicons name="document" size={20} color="#6B46C1" />
                    <Text style={styles.attachmentOptionText}>Document</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.attachmentOption}
                    onPress={() => handleFileImport('image')}
                  >
                    <Ionicons name="image" size={20} color="#6B46C1" />
                    <Text style={styles.attachmentOptionText}>Image</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.attachmentOption}
                    onPress={() => handleFileImport('camera')}
                  >
                    <Ionicons name="camera" size={20} color="#6B46C1" />
                    <Text style={styles.attachmentOptionText}>Camera</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Send Button */}
            <TouchableOpacity
              style={[
                styles.sendButton,
                (input.trim() === "" && pendingFiles.length === 0) && styles.sendButtonDisabled,
              ]}
              onPress={handleSend}
              disabled={input.trim() === "" && pendingFiles.length === 0}
              accessibilityLabel="Send message"
              accessibilityHint="Send your message to Rina"
            >
              <LinearGradient
                colors={["#6366F1", "#8B5CF6"]}
                style={styles.sendButtonGradient}
              >
                <Ionicons name="send" size={20} color="#fff" />
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </Animated.View>
        {/* Close wrappers for input area */}
        </KeyboardAvoidingView>
      </View>

      {/* OCR Modal */}
      <Modal
          visible={showOCRModal}
          animationType="slide"
          presentationStyle="pageSheet"
          onRequestClose={handleOCRClose}
        >
          <View style={styles.ocrModalContainer}>
            <LinearGradient
              colors={["#6366F1", "#8B5CF6"]}
              style={styles.ocrModalHeader}>
              <Text style={styles.ocrModalTitle}>Image to Text</Text>
              <TouchableOpacity 
                style={styles.closeButton} 
                onPress={handleOCRClose}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </LinearGradient>
            
            <ScrollView style={styles.ocrModalContent} showsVerticalScrollIndicator={false}>
              {/* Image Selection */}
              <View style={styles.ocrSection}>
                <Text style={styles.ocrSectionTitle}>Select Image</Text>
                <TouchableOpacity 
                  style={styles.imageSelectButton}
                  onPress={handleOCRImageSelect}
                >
                  {ocrImage ? (
                    <View style={styles.selectedImageContainer}>
                      <Image 
                        source={{ uri: ocrImage.uri }}
                        style={styles.selectedImage}
                        resizeMode="cover"
                      />
                      <View style={styles.selectedImageOverlay}>
                        <Ionicons name="checkmark-circle" size={32} color="#10B981" />
                        <Text style={styles.selectedImageText}>{ocrImage.name}</Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.imageSelectContent}>
                      <Ionicons name="image" size={48} color="#6B46C1" />
                      <Text style={styles.imageSelectText}>Tap to select an image</Text>
                      <Text style={styles.imageSelectSubtext}>JPG, PNG, or GIF (max 50MB)</Text>
                    </View>
                  )}
                </TouchableOpacity>
              </View>

              {/* Process Button */}
              {ocrImage && (
                <View style={styles.ocrSection}>
                  <TouchableOpacity 
                    style={[styles.processButton, ocrLoading && styles.processButtonDisabled]}
                    onPress={handleOCRProcess}
                    disabled={ocrLoading}
                  >
                    {ocrLoading ? (
                      <ActivityIndicator color="#FFFFFF" size="small" />
                    ) : (
                      <Ionicons name="scan" size={20} color="#FFFFFF" />
                    )}
                    <Text style={styles.processButtonText}>
                      {ocrLoading ? "Processing..." : "Extract Text"}
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Results */}
              {ocrResult && (
                <View style={styles.ocrSection}>
                  <Text style={styles.ocrSectionTitle}>Extracted Text</Text>
                  <View style={styles.ocrResultContainer}>
                    <ScrollView style={styles.ocrResultScroll} showsVerticalScrollIndicator={true}>
                      <Text style={styles.ocrResultText}>{ocrResult}</Text>
                    </ScrollView>
                    <View style={styles.ocrResultActions}>
                      <TouchableOpacity 
                        style={styles.copyTextButton}
                        onPress={handleOCRCopyText}
                      >
                        <Ionicons name="copy" size={16} color="#6B46C1" />
                        <Text style={styles.copyTextButtonText}>Use in Chat</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </Modal>

        {/* Chat History Modal */}
        <Modal
          visible={showChatHistory}
          animationType="slide"
          onRequestClose={() => setShowChatHistory(false)}
        >
          <SafeAreaView style={styles.chatHistoryContainer}>
            <LinearGradient
              colors={["#6366F1", "#8B5CF6"]}
              style={styles.chatHistoryHeader}>
              <Text style={styles.chatHistoryTitle}>Chat History</Text>
              <TouchableOpacity 
                style={styles.closeButton} 
                onPress={() => setShowChatHistory(false)}
              >
                <Ionicons name="close" size={24} color="#FFFFFF" />
              </TouchableOpacity>
            </LinearGradient>
            
            <ScrollView style={styles.chatHistoryList}>
              {conversations.map((conversation) => (
                <View key={conversation.id} style={styles.chatSessionItem}>
                  <TouchableOpacity 
                    style={styles.chatSessionContent}
                    onPress={() => loadConversation(conversation.id)}
                  >
                    <Text style={styles.chatSessionTitle}>{conversation.title}</Text>
                    <Text style={styles.chatSessionLastMessage} numberOfLines={2}>
                      {conversation.last_message?.content || "No messages yet"}
                    </Text>
                    <Text style={styles.chatSessionTime}>
                      {new Date(conversation.updated_at).toLocaleDateString()} • {conversation.message_count} messages
                    </Text>
                  </TouchableOpacity>
                  
                  <View style={styles.chatSessionActions}>
                    <TouchableOpacity 
                      style={styles.actionButtonSmall}
                      onPress={() => {
                        Alert.prompt(
                          "Edit Title",
                          "Enter new title:",
                          [
                            { text: "Cancel", style: "cancel" },
                            { 
                              text: "Save", 
                              onPress: (text) => text && updateConversationTitle(conversation.id, text)
                            }
                          ],
                          "plain-text",
                          conversation.title
                        );
                      }}
                    >
                      <Ionicons name="pencil" size={16} color="#6B46C1" />
                    </TouchableOpacity>
                    
                    <TouchableOpacity 
                      style={styles.actionButtonSmall}
                      onPress={() => {
                        Alert.alert(
                          "Delete Conversation",
                          "Are you sure you want to delete this conversation?",
                          [
                            { text: "Cancel", style: "cancel" },
                            { text: "Delete", style: "destructive", onPress: () => deleteConversation(conversation.id) }
                          ]
                        );
                      }}
                    >
                      <Ionicons name="trash" size={16} color="#DC2626" />
                    </TouchableOpacity>
                  </View>
                </View>
              ))}
              
              {conversations.length === 0 && (
                <View style={styles.emptyChatHistory}>
                  <Text style={styles.emptyChatText}>No chat history yet</Text>
                  <Text style={styles.emptyChatSubtext}>Start a conversation to see your chats here</Text>
                </View>
              )}
            </ScrollView>
            
            <TouchableOpacity 
              style={styles.newChatButton} 
              onPress={createNewConversation}
            >
              <LinearGradient
                colors={["#6366F1", "#8B5CF6"]}
                style={styles.newChatButtonGradient}
              >
                <Ionicons name="add" size={24} color="#FFFFFF" />
                <Text style={styles.newChatButtonText}>New Chat</Text>
              </LinearGradient>
            </TouchableOpacity>
          </SafeAreaView>
        </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: "#FFFFFF",
    position: 'relative',
    overflow: 'hidden', // Ensure no elements bleed outside the container
  },
  container: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  keyboardAvoidingView: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    justifyContent: 'flex-end'
  },
  keyboardAvoidingContainer: {
    width: '100%',
    position: 'absolute', 
    bottom: 0, 
    left: 0, 
    right: 0,
    zIndex: 1000,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    padding: 16,
    paddingTop: 40,
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1000,
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
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: "#7C3AED",
    justifyContent: "center",
    alignItems: "center",
    marginRight: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
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
    paddingHorizontal: 16,
    paddingTop: 16,
    backgroundColor: "#FAFBFF",
  },
  messageBubble: {
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 12,
    borderRadius: 20,
    maxWidth: "75%",
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
    backgroundColor: "#6366F1",
    alignSelf: "flex-end",
    borderBottomRightRadius: 6,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
  },
  aiMessage: {
    backgroundColor: "#FFFFFF",
    alignSelf: "flex-start",
    borderWidth: 1,
    borderColor: "#F1F5F9",
    borderBottomLeftRadius: 6,
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
  messageContent: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    width: "100%",
  },
  messageActions: {
    flexDirection: "row",
    alignItems: "center",
    marginLeft: 8,
  },
  editButton: {
    marginRight: 4,
    padding: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    minWidth: 24,
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  deleteButton: {
    padding: 4,
    borderRadius: 8,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    minWidth: 24,
    minHeight: 24,
    alignItems: "center",
    justifyContent: "center",
  },
  editMessageContainer: {
    width: "100%",
  },
  editMessageInput: {
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.3)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 16,
    color: "#FFFFFF",
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    minHeight: 40,
    maxHeight: 120,
  },
  editMessageActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
    gap: 8,
  },
  editCancelButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(220, 38, 38, 0.2)",
    borderWidth: 1,
    borderColor: "rgba(220, 38, 38, 0.4)",
  },
  editCancelText: {
    color: "#DC2626",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  editSaveButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: "rgba(34, 197, 94, 0.8)",
  },
  editSaveText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
  },
  loadingContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  loadingBubble: {
    backgroundColor: "#FFFFFF",
    alignSelf: "flex-start",
    borderRadius: 20,
    borderBottomLeftRadius: 6,
    padding: 16,
    maxWidth: "85%",
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  loadingContent: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
  },
  loadingText: {
    color: "#64748B",
    fontSize: 14,
    fontStyle: "italic",
    marginLeft: 8,
  },
  loadingDots: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    gap: 4,
  },
  loadingDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: "#6366F1",
  },
  loadingDot1: {
    opacity: 0.4,
  },
  loadingDot2: {
    opacity: 0.7,
  },
  loadingDot3: {
    opacity: 1,
  },
  errorContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  errorBanner: {
    backgroundColor: "#FEF2F2",
    borderLeftWidth: 4,
    borderLeftColor: "#DC2626",
    borderRadius: 8,
    padding: 16,
    flexDirection: "row",
    alignItems: "flex-start",
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  errorIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  errorContent: {
    flex: 1,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#DC2626",
    marginBottom: 4,
  },
  errorText: {
    color: "#991B1B",
    fontSize: 14,
    lineHeight: 18,
    marginBottom: 4,
  },
  errorHint: {
    color: "#7F1D1D",
    fontSize: 12,
    fontStyle: "italic",
    lineHeight: 16,
  },
  retryButton: {
    backgroundColor: "#DC2626",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 8,
    marginLeft: 12,
    flexDirection: "row",
    alignItems: "center",
    shadowColor: "#DC2626",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  retryText: {
    color: "#FFFFFF",
    fontSize: 12,
    fontWeight: "600",
    marginLeft: 4,
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
  compactActionsContainer: {
    backgroundColor: "#FFFFFF",
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    paddingVertical: 12,
  },
  compactActionsContent: {
    paddingHorizontal: 12,
    gap: 6,
    alignItems: 'center',
  },
  compactActionButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#6B46C1",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 1,
    elevation: 1,
  },
  inputContainer: {
    width: "100%",
    backgroundColor: "transparent",
    zIndex: 100,
  },
  floatingInputRow: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: 'rgba(249, 250, 255, 0.95)', // More opacity for better legibility over keyboard
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    zIndex: 1100,
    shadowColor: '#1E293B',
    shadowOffset: {
      width: 0,
      height: -3,
    },
    shadowOpacity: 0.12,
    shadowRadius: 6,
    elevation: 8
  },
  inputAreaContainer: {
    backgroundColor: "transparent",
    bottom: 0,
  },
  touchOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 999,
  },
  pendingFilesContainer: {
    paddingHorizontal: 16,
    paddingTop: 12,
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
    backgroundColor: "#FAFBFC",
  },
  pendingFilesHeaderRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  pendingFilesHeader: {
    fontSize: 12,
    color: "#64748B",
    fontWeight: "600",
  },
  clearAllFilesButton: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
    backgroundColor: "#FEF2F2",
    borderWidth: 1,
    borderColor: "#FECACA",
  },
  clearAllFilesText: {
    fontSize: 11,
    color: "#DC2626",
    fontWeight: "500",
    marginLeft: 4,
  },
  pendingFilesScroll: {
    maxHeight: 80,
  },
  pendingFilesScrollContent: {
    paddingRight: 16,
  },
  pendingFileItem: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    padding: 12,
    marginRight: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    minWidth: 160,
    maxWidth: 200,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
  },
  pendingFileIconContainer:{
    alignItems: "center",
    marginRight: 8,
  },
  fileTypeIndicator: {
    fontSize: 8,
    color: "#64748B",
    fontWeight: "600",
    marginTop: 2,
  },
  pendingFileDetails: {
    flex: 1,
  },
  pendingFileName: {
    fontSize: 12,
    color: "#1E293B",
    fontWeight: "500",
    marginBottom: 2,
  },
  pendingFileSize: {
    fontSize: 10,
    color: "#64748B",
  },
  pendingFileContent: {
    flexDirection: "row",
    alignItems: "center",
    flex: 1,
  },
  removePendingFile: {
    marginLeft: 8,
    padding: 4,
  },
  inputRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 6,
    alignItems: "flex-end",
    gap: 8,
    borderRadius: 30
  },
  inputWrapper: {
    flex: 1,
    position: "relative",
  },
  textInput: {
    borderWidth: 2,
    borderColor: "#E2E8F0",
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 14,
    paddingRight: 56,
    maxHeight: 120,
    fontSize: 16,
    backgroundColor: "rgba(248, 250, 252, 0.8)",
    minHeight: 48,
    color: "#1E293B",
  },
  attachButton: {
    position: "absolute",
    right: 8,
    bottom: 8,
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: "rgba(248, 250, 252, 0.8)",
    borderWidth: 1,
    borderColor: "#E2E8F0",
    alignItems: "center",
    justifyContent: "center",
  },
  attachmentMenu: {
    position: "absolute",
    bottom: 50,
    right: 8,
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1000,
    minWidth: 160,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    paddingVertical: 4,
  },
  attachmentOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F1F5F9",
  },
  attachmentOptionText: {
    marginLeft: 10,
    fontSize: 14,
    color: "#1E293B",
    fontWeight: "500",
  },
  sendButton: {
    borderRadius: 25,
    overflow: 'hidden',
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  sendButtonDisabled: {
    opacity: 0.5,
  },
  sendButtonGradient: {
    padding: 14,
    borderRadius: 25,
    minWidth: 52,
    minHeight: 52,
    alignItems: "center",
    justifyContent: "center",
  },

  // Welcome section styles
  welcomeContainer: {
    paddingHorizontal: 20,
    paddingVertical: 40,
    alignItems: 'center',
  },
  welcomeHeader: {
    alignItems: 'center',
    marginBottom: 40,
  },
  welcomeAvatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 20,
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  welcomeAvatarText: {
    color: "#FFFFFF",
    fontSize: 32,
    fontWeight: "bold",
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: "bold",
    color: "#1E293B",
    marginBottom: 8,
    textAlign: "center",
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 24,
    marginBottom: 20,
  },
  suggestedPromptsGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    gap: 10,
  },
  promptCard: {
    backgroundColor: "#FFFFFF",
    padding: 20,
    borderRadius: 16,
    width: "48%",
    shadowColor: "#1E293B",
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    alignItems: "center",
  },
  promptIconContainer: {
    marginBottom: 12,
  },
  promptIcon: {
    fontSize: 28,
    textAlign: "center",
  },
  promptTitle: {
    fontSize: 14,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 6,
    textAlign: "center",
    lineHeight: 16,
  },
  promptDescription: {
    fontSize: 12,
    color: "#64748B",
    textAlign: "center",
    lineHeight: 16,
  },

  // Chat History Modal
  chatHistoryContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  chatHistoryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    backgroundColor: "#6B46C1",
  },
  chatHistoryTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  closeButton: {
    backgroundColor: "rgba(255, 255, 255, 0.2)",
    padding: 8,
    borderRadius: 8,
    alignItems: "center",
  },
  closeButtonText: {
    color: "#FFFFFF",
    fontWeight: "bold",
  },
  safeAreaBottom: {
    backgroundColor: "#FFFFFF",
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },

  // Chat Options Dropdown Styles
  chatOptionsContainer: {
    position: "absolute",
    top: 100,
    right: 12,
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
    zIndex: 1000,
    minWidth: 200,
    borderWidth: 1,
    borderColor: "#F1F5F9",
    paddingVertical: 8,
  },
  chatOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 0.5,
    borderBottomColor: "#F1F5F9",
  },
  chatOptionText: {
    marginLeft: 8,
    fontSize: 14,
    color: "#1E293B",
    fontWeight: "500",
  },

  // Messages Container
  messagesContentContainer: {
    flexGrow: 1,
  },

  // Markdown Styles
  markdownH1: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#1E293B",
    marginVertical: 8,
  },
  markdownH2: {
    fontSize: 20,
    fontWeight: "bold",
    color: "#1E293B",
    marginVertical: 6,
  },
  markdownH3: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1E293B",
    marginVertical: 4,
  },
  markdownStrong: {
    fontWeight: "bold",
    color: "#1E293B",
  },
  markdownEm: {
    fontStyle: "italic",
    color: "#1E293B",
  },
  markdownList: {
    marginVertical: 4,
  },
  markdownListItem: {
    marginVertical: 2,
    color: "#1E293B",
  },
  markdownTable: {
    borderWidth: 1,
    borderColor: "#E2E8F0",
    borderRadius: 8,
    marginVertical: 8,
  },
  markdownTableRow: {
    borderBottomWidth: 1,
    borderBottomColor: "#F1F5F9",
  },
  markdownTableCell: {
    padding: 8,
    borderRightWidth: 1,
    borderRightColor: "#F1F5F9",
  },
  markdownTableHeader: {
    padding: 8,
    backgroundColor: "#F8FAFC",
    fontWeight: "600",
    borderRightWidth: 1,
    borderRightColor: "#E2E8F0",
  },
  markdownCodeInline: {
    backgroundColor: "#F1F5F9",
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
    fontFamily: "monospace",
    fontSize: 14,
  },
  markdownCodeBlock: {
    backgroundColor: "#F8FAFC",
    padding: 12,
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: "#6B46C1",
    fontFamily: "monospace",
    fontSize: 14,
    marginVertical: 8,
  },

  // Chat History Modal Styles
  chatHistoryList: {
    flex: 1,
    paddingHorizontal: 16,
  },
  chatSessionItem: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    marginVertical: 8,
    padding: 16,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: "#F1F5F9",
  },
  chatSessionContent: {
    flex: 1,
  },
  chatSessionTitle: {
    fontSize: 16,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 4,
  },
  chatSessionLastMessage: {
    fontSize: 14,
    color: "#64748B",
    marginBottom: 8,
    lineHeight: 20,
  },
  chatSessionTime: {
    fontSize: 12,
    color: "#94A3B8",
  },
  chatSessionActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    marginTop: 12,
    gap: 8,
  },
  actionButtonSmall: {
    padding: 8,
    borderRadius: 8,
    backgroundColor: "#F8FAFC",
    borderWidth: 1,
    borderColor: "#E2E8F0",
  },
  emptyChatHistory: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 60,
  },
  emptyChatText: {
    fontSize: 18,
    fontWeight: "600",
    color: "#64748B",
    marginBottom: 8,
  },
  emptyChatSubtext: {
    fontSize: 14,
    color: "#94A3B8",
    textAlign: "center",
  },
  newChatButton: {
    margin: 16,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: "#6366F1",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  newChatButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
    marginLeft: 8,
  },
  newChatButtonGradient: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    borderRadius: 16,
  },

  // OCR Modal Styles
  ocrModalContainer: {
    flex: 1,
    backgroundColor: "#F8FAFC",
  },
  ocrModalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 20,
    paddingTop: 50,
    backgroundColor: "#6B46C1",
  },
  ocrModalTitle: {
    fontSize: 24,
    fontWeight: "bold",
    color: "#FFFFFF",
  },
  ocrModalContent: {
    flex: 1,
    padding: 20,
  },
  ocrSection: {
    marginBottom: 24,
  },
  ocrSectionTitle: {
    fontSize: 18,
    fontWeight: "600",
    color: "#1E293B",
    marginBottom: 12,
  },
  imageSelectButton: {
    backgroundColor: "#FFFFFF",
    borderRadius: 16,
    padding: 20,
    borderWidth: 2,
    borderColor: "#E2E8F0",
    borderStyle: "dashed",
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  imageSelectContent: {
    alignItems: "center",
  },
  imageSelectText: {
    fontSize: 16,
    fontWeight: "600",
    color: "#6B46C1",
    marginTop: 12,
  },
  imageSelectSubtext: {
    fontSize: 14,
    color: "#64748B",
    marginTop: 4,
    textAlign: "center",
  },
  selectedImageContainer: {
    position: "relative",
    width: "100%",
    height: 200,
    borderRadius: 12,
    overflow: "hidden",
  },
  selectedImage: {
    width: "100%",
    height: "100%",
  },
  selectedImageOverlay: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "rgba(0, 0, 0, 0.7)",
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
  },
  selectedImageText: {
    color: "#FFFFFF",
    fontSize: 14,
    fontWeight: "500",
    marginLeft: 8,
    flex: 1,
  },
  processButton: {
    backgroundColor: "#6B46C1",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    padding: 16,
    borderRadius: 12,
    gap: 8,
  },
  processButtonDisabled: {
    backgroundColor: "#94A3B8",
  },
  processButtonText: {
    color: "#FFFFFF",
    fontSize: 16,
    fontWeight: "600",
  },
  ocrResultContainer: {
    backgroundColor: "#FFFFFF",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#E2E8F0",
    overflow: "hidden",
  },
  ocrResultScroll: {
    maxHeight: 300,
    padding: 16,
  },
  ocrResultText: {
    fontSize: 14,
    color: "#1E293B",
    lineHeight: 20,
  },
  ocrResultActions: {
    borderTopWidth: 1,
    borderTopColor: "#F1F5F9",
    padding: 12,
    backgroundColor: "#F8FAFC",
  },
  copyTextButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#F1F5F9",
    borderWidth: 1,
    borderColor: "#6B46C1",
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  copyTextButtonText: {
    color: "#6B46C1",
    fontSize: 14,
    fontWeight: "600",
  },
});

export default function OllamaChatTanstack(): React.ReactElement {
  return (
    <QueryClientProvider client={queryClient}>
      <ChatBot />
    </QueryClientProvider>
  );
}