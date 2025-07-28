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
      text: 'Help me understand complex concepts',
      description: 'Break down difficult topics into simpler explanations',
      icon: '🧠',
    },
    {
      id: '2',
      text: 'Create practice questions',
      description: 'Generate quiz questions from your study materials',
      icon: '�',
    },
    {
      id: '3',
      text: 'Summarize documents',
      description: 'Get concise summaries of lengthy texts',
      icon: '📄',
    },
    {
      id: '4',
      text: 'Explain with examples',
      description: 'Provide real-world examples for better understanding',
      icon: '�',
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
        text: 'I understand your question and I\'m here to help! As your AI tutoring assistant, I can help you with explanations, summaries, practice questions, and more. What specific topic would you like to explore?',
        isUser: false,
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, aiResponse]);
      setIsLoading(false);
    }, 1500);
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
        {/* Welcome Message */}
        {messages.length === 1 && (
          <View style={styles.welcomeContainer}>
            <View style={styles.welcomeHeader}>
              <View style={styles.welcomeAvatar}>
                <Text style={styles.welcomeAvatarText}>✨</Text>
              </View>
              <Text style={styles.welcomeTitle}>Welcome to Rina!</Text>
              <Text style={styles.welcomeSubtitle}>Your intelligent AI tutoring assistant</Text>
            </View>
            
            <View style={styles.featuresContainer}>
              <Text style={styles.featuresTitle}>What I can help you with:</Text>
              <View style={styles.suggestedPromptsGrid}>
                {suggestedPrompts.map((prompt) => (
                  <TouchableOpacity
                    key={prompt.id}
                    style={styles.promptCard}
                    onPress={() => handlePromptSelection(prompt.text)}
                  >
                    <Text style={styles.promptIcon}>{prompt.icon}</Text>
                    <Text style={styles.promptTitle}>{prompt.text}</Text>
                    <Text style={styles.promptDescription}>{prompt.description}</Text>
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
              {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
            <Text style={styles.aiMessageText}>
              {messages[0].text}
            </Text>
            <Text style={styles.messageTime}>
              {messages[0].timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
          placeholder="Ask me anything about your studies..."
          placeholderTextColor="#999"
          multiline
          maxLength={1000}
        />
        <TouchableOpacity style={styles.attachButton} onPress={handleFileImport}>
          <Ionicons name="attach" size={24} color="#6B46C1" />
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
    backgroundColor: '#F5E1FD',
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
    fontSize: 18,
    fontWeight: 'bold',
    color: '#333',
  },
  botDescription: {
    fontSize: 13,
    color: '#666',
    marginTop: 2,
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
    padding: 16,
    marginVertical: 8,
    marginHorizontal: 20,
    borderRadius: 20,
    maxWidth: '85%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 1,
    },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  userMessage: {
    backgroundColor: '#6B46C1',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 8,
  },
  aiMessage: {
    backgroundColor: 'white',
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#f0f0f0',
    borderBottomLeftRadius: 8,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
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
    backgroundColor: 'white',
    padding: 20,
    marginBottom: 16,
    borderRadius: 16,
    width: '48%',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#f0f0f0',
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
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: -2,
    },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  textInput: {
    flex: 1,
    borderWidth: 2,
    borderColor: '#f0f0f0',
    borderRadius: 25,
    paddingHorizontal: 20,
    paddingVertical: 12,
    maxHeight: 120,
    fontSize: 16,
    backgroundColor: '#f8f9fa',
    minHeight: 48,
  },
  attachButton: {
    marginLeft: 12,
    padding: 12,
    borderRadius: 25,
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#f0f0f0',
  },
  sendButton: {
    backgroundColor: '#6B46C1',
    borderRadius: 25,
    padding: 12,
    marginLeft: 8,
    minWidth: 48,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#6B46C1',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 4,
  },
  sendButtonDisabled: {
    backgroundColor: '#ccc',
  },
  
  // Welcome section styles
  welcomeContainer: {
    paddingHorizontal: 20,
    paddingVertical: 30,
  },
  welcomeHeader: {
    alignItems: 'center',
    marginBottom: 30,
  },
  welcomeAvatar: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#6B46C1',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
  },
  welcomeAvatarText: {
    fontSize: 24,
    color: 'white',
  },
  welcomeTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    color: '#1a1a1a',
    marginBottom: 8,
    textAlign: 'center',
  },
  welcomeSubtitle: {
    fontSize: 16,
    color: '#666',
    textAlign: 'center',
  },
  featuresContainer: {
    marginTop: 20,
  },
  featuresTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: '#333',
    marginBottom: 20,
    textAlign: 'center',
  },
  suggestedPromptsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
  },
  promptIcon: {
    fontSize: 24,
    marginBottom: 8,
    textAlign: 'center',
  },
  promptTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: '#333',
    marginBottom: 4,
    textAlign: 'center',
  },
  promptDescription: {
    fontSize: 12,
    color: '#666',
    textAlign: 'center',
    lineHeight: 16,
  },
  
  // Enhanced message styles
  aiMessageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  aiAvatar: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#6B46C1',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  aiAvatarText: {
    fontSize: 12,
    fontWeight: 'bold',
    color: 'white',
  },
  messageTime: {
    fontSize: 12,
    color: '#999',
    marginTop: 4,
    alignSelf: 'flex-end',
  },
  
  // Legacy prompt styles for backward compatibility
  legacyPromptsContainer: {
    paddingHorizontal: 20,
    paddingVertical: 10,
  },
  legacyPromptCard: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    marginVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  legacyPromptText: {
    fontSize: 16,
    color: '#495057',
    textAlign: 'center',
  },
  
  // Typing indicator styles
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
  },
  typingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#6B46C1',
    marginHorizontal: 2,
    opacity: 0.4,
  },
  
  // File preview styles
  filePreview: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    padding: 12,
    margin: 16,
    borderRadius: 12,
    justifyContent: 'space-between',
  },
  filePreviewText: {
    fontSize: 14,
    color: '#333',
    flex: 1,
  },
});

export default ChatBot;