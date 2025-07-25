import { Ionicons } from '@expo/vector-icons';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import * as DocumentPicker from 'expo-document-picker';
import React, { useState } from 'react';
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
} from 'react-native';
import { RootStackParamList } from '../navigation/AppNavigator';

type ChatBotNavigationProp = NativeStackNavigationProp<RootStackParamList, 'RINA'>;

interface Message {
  id: string;
  text: string;
  isUser: boolean;
  timestamp: Date;
}

interface ChatBotProps {
  navigation: ChatBotNavigationProp;
}

const ChatBot: React.FC<ChatBotProps> = ({ navigation }) => {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      text: 'Hello! How can I assist you today?',
      isUser: false,
      timestamp: new Date(),
    },
  ]);
  const [inputText, setInputText] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const suggestedPrompts = [
    {
      id: '1',
      text: 'Remembers what user said earlier in the conversation',
      icon: '💬',
    },
    {
      id: '2',
      text: 'Allows user to provide follow-up corrections with AI',
      icon: '✏️',
    },
    {
      id: '3',
      text: 'Limited knowledge of world and events after 2023',
      icon: '📅',
    },
    {
      id: '4',
      text: 'May occasionally generate incorrect information',
      icon: '⚠️',
    },
    {
      id: '5',
      text: 'May occasionally produce harmful instructions or biased content',
      icon: '🚫',
    },
  ];

  const handleSendMessage = async () => {
    if (inputText.trim() === '') return;

    const userMessage: Message = {
      id: Date.now().toString(),
      text: inputText,
      isUser: true,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInputText('');
    setIsLoading(true);

    // Simulate AI response using LLama 3.0 (replace with actual API call)
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        text: 'I received your message. This is where LLama 3.0 would process your request and provide a response.',
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiResponse]);
      setIsLoading(false);
    }, 1000);
  };

  const handleFileImport = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
      });

      if (result.assets && result.assets.length > 0) {
        const file = result.assets[0];
        Alert.alert(
          'File Imported',
          `File "${file.name}" has been imported and is ready for processing.`,
          [
            {
              text: 'Summarize',
              onPress: () => handlePromptSelection(`Please summarize the content of ${file.name}`),
            },
            {
              text: 'Explain',
              onPress: () => handlePromptSelection(`Please explain the content of ${file.name}`),
            },
            {
              text: 'Generate Quiz',
              onPress: () => handlePromptSelection(`Please generate a quiz based on ${file.name}`),
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
      }
    } catch (error: unknown) {
      // Check if the error is because user cancelled the document picker
      const isCancelled = error instanceof Error &&
        (error.name === 'canceled' ||
          error.message?.includes('canceled') ||
          error.message?.includes('cancelled'));

      if (isCancelled) {
        // User cancelled the picker
      } else {
        Alert.alert('Error', 'Failed to import file');
        console.log('Document picker error:', error);
      }
    }
  };

  const handleGoBack = () => {
    navigation.goBack(); // Use navigation.goBack() instead of useRouter()
  };

  const handlePromptSelection = (prompt: string) => {
    setInputText(prompt);
  };

  const handleSummarize = () => {
    handlePromptSelection('Please summarize the uploaded document');
  };

  const handleExplain = () => {
    handlePromptSelection('Please explain the key concepts in the uploaded document');
  };

  const handleGenerateQuiz = () => {
    handlePromptSelection('Please generate a quiz based on the uploaded document');
  };

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="dark-content" backgroundColor="#f8f9fa" />

      {/* Header */}
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={handleGoBack}>
          <Ionicons name="chevron-back" size={24} color="#333" />
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
        <TouchableOpacity style={styles.menuButton}>
          <Ionicons name="menu" size={24} color="#333" />
        </TouchableOpacity>
      </View>

      {/* Messages */}
      <ScrollView style={styles.messagesContainer}>
        {messages.map((message) => (
          <View
            key={message.id}
            style={[
              styles.messageBubble,
              message.isUser ? styles.userMessage : styles.aiMessage,
            ]}
          >
            <Text
              style={[
                styles.messageText,
                message.isUser ? styles.userMessageText : styles.aiMessageText,
              ]}
            >
              {message.text}
            </Text>
          </View>
        ))}

        {/* Suggested Prompts */}
        {messages.length === 1 && (
          <View style={styles.suggestedPromptsContainer}>
            {suggestedPrompts.map((prompt) => (
              <TouchableOpacity
                key={prompt.id}
                style={styles.promptCard}
                onPress={() => handlePromptSelection(prompt.text)}
              >
                <Text style={styles.promptText}>{prompt.text}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {isLoading && (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Rina is thinking...</Text>
          </View>
        )}
      </ScrollView>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        <TouchableOpacity style={styles.actionButton} onPress={handleSummarize}>
          <Ionicons name="document-text" size={16} color="#6B46C1" />
          <Text style={styles.actionButtonText}>Summarize</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleExplain}>
          <Ionicons name="bulb" size={16} color="#6B46C1" />
          <Text style={styles.actionButtonText}>Explain</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.actionButton} onPress={handleGenerateQuiz}>
          <Ionicons name="help-circle" size={16} color="#6B46C1" />
          <Text style={styles.actionButtonText}>Generate Quiz</Text>
        </TouchableOpacity>
      </View>

      {/* Input Area */}
      <View style={styles.inputContainer}>
        <TextInput
          style={styles.textInput}
          value={inputText}
          onChangeText={setInputText}
          placeholder="Enter your prompt"
          multiline
        />
        <TouchableOpacity style={styles.attachButton} onPress={handleFileImport}>
          <Ionicons name="attach" size={20} color="#666" />
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.sendButton, inputText.trim() === '' && styles.sendButtonDisabled]}
          onPress={handleSendMessage}
          disabled={inputText.trim() === ''}
        >
          <Ionicons name="send" size={20} color="#fff" />
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f8f9fa',
  },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    paddingTop: Platform.OS === 'ios' ? 50 : 35,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#e9ecef',
    borderBottomLeftRadius: 25,
    borderBottomRightRadius: 25,
    shadowColor: "#1E293B",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
    zIndex: 1000,
  },
  backButton: {
    marginRight: 12,
  },
  headerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  avatar: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#6A009C',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  avatarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  botName: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#333',
  },
  botDescription: {
    fontSize: 12,
    color: '#666',
  },
  menuButton: {
    marginLeft: 12,
  },
  messagesContainer: {
    flex: 1,
    padding: 16,
    paddingTop: 90, // Space for the overlay header
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  userMessage: {
    backgroundColor: '#6B46C1',
    alignSelf: 'flex-end',
  },
  aiMessage: {
    backgroundColor: '#fff',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  messageText: {
    fontSize: 14,
    lineHeight: 20,
  },
  userMessageText: {
    color: '#fff',
  },
  aiMessageText: {
    color: '#333',
  },
  suggestedPromptsContainer: {
    marginTop: 16,
  },
  promptCard: {
    backgroundColor: '#fff',
    padding: 16,
    borderRadius: 12,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  promptText: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
  },
  loadingContainer: {
    alignItems: 'center',
    padding: 16,
  },
  loadingText: {
    color: '#666',
    fontStyle: 'italic',
  },
  actionsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingVertical: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#e9ecef',
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#6A009C',
  },
  actionButtonText: {
    color: '#6A009C',
    fontSize: 12,
    marginLeft: 4,
    fontWeight: '500',
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 16,
    backgroundColor: '#fff',
    alignItems: 'flex-end',
  },
  textInput: {
    flex: 1,
    borderWidth: 1,
    borderColor: '#e9ecef',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    maxHeight: 100,
    fontSize: 14,
  },
  attachButton: {
    marginLeft: 8,
    padding: 8,
  },
  sendButton: {
    backgroundColor: '#6B46C1',
    borderRadius: 20,
    padding: 10,
    marginLeft: 8,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
});

export default ChatBot;