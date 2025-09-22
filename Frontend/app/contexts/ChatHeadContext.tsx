import React, { createContext, useContext, useState, ReactNode } from 'react';

interface ChatHeadContextType {
  visible: boolean;
  unreadCount: number;
  hasActiveConversation: boolean;
  currentConversationId: string | null;
  isEnabled: boolean;
  showChatHead: () => void;
  hideChatHead: () => void;
  toggleChatHead: () => void;
  setUnreadCount: (count: number) => void;
  incrementUnreadCount: () => void;
  resetUnreadCount: () => void;
  setActiveConversation: (conversationId: string | null) => void;
  setHasActiveConversation: (hasConversation: boolean) => void;
  disableChatHead: () => void;
  enableChatHead: () => void;
}

const ChatHeadContext = createContext<ChatHeadContextType | undefined>(undefined);

export const useChatHead = (): ChatHeadContextType => {
  const context = useContext(ChatHeadContext);
  if (!context) {
    throw new Error('useChatHead must be used within a ChatHeadProvider');
  }
  return context;
};

interface ChatHeadProviderProps {
  children: ReactNode;
}

export const ChatHeadProvider: React.FC<ChatHeadProviderProps> = ({ children }) => {
  const [visible, setVisible] = useState(false); // Start hidden by default
  const [unreadCount, setUnreadCount] = useState(0);
  const [hasActiveConversation, setHasActiveConversationState] = useState(false);
  const [currentConversationId, setCurrentConversationId] = useState<string | null>(null);
  const [isEnabled, setIsEnabled] = useState(true); // Chat head can be disabled on specific pages

  const showChatHead = () => {
    // Only show if there's an active conversation, chat head is enabled, and we're not in a blocking context
    if (hasActiveConversation && isEnabled) {
      setVisible(true);
    }
  };
  
  const hideChatHead = () => {
    setVisible(false);
  };
  
  const toggleChatHead = () => {
    if (hasActiveConversation && isEnabled) {
      setVisible(!visible);
    }
  };

  const disableChatHead = () => {
    setIsEnabled(false);
    setVisible(false); // Hide if currently visible
  };

  const enableChatHead = () => {
    setIsEnabled(true);
  };

  const setUnreadCountValue = (count: number) => {
    setUnreadCount(Math.max(0, count));
  };

  const incrementUnreadCount = () => {
    setUnreadCount(prev => prev + 1);
  };

  const resetUnreadCount = () => {
    setUnreadCount(0);
  };

  const setActiveConversation = (conversationId: string | null) => {
    setCurrentConversationId(conversationId);
    setHasActiveConversationState(!!conversationId);
    
    // Show chat head when conversation becomes active, but ensure it's non-blocking and enabled
    if (conversationId && isEnabled) {
      // Small delay to ensure the calling component has finished its work
      setTimeout(() => setVisible(true), 100);
    } else {
      setVisible(false);
    }
  };

  const setHasActiveConversation = (hasConversation: boolean) => {
    setHasActiveConversationState(hasConversation);
    
    // Hide chat head when no active conversation
    if (!hasConversation) {
      setVisible(false);
      setCurrentConversationId(null);
    }
  };

  return (
    <ChatHeadContext.Provider
      value={{
        visible,
        unreadCount,
        hasActiveConversation,
        currentConversationId,
        isEnabled,
        showChatHead,
        hideChatHead,
        toggleChatHead,
        setUnreadCount: setUnreadCountValue,
        incrementUnreadCount,
        resetUnreadCount,
        setActiveConversation,
        setHasActiveConversation,
        disableChatHead,
        enableChatHead,
      }}
    >
      {children}
    </ChatHeadContext.Provider>
  );
};