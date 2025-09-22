import React, { useState } from 'react';
import { ChatHead } from './ChatHead';
import { ChatOverlay } from './ChatOverlay';
import { useChatHead } from '../contexts/ChatHeadContext';

export const GlobalChatHead: React.FC = () => {
  const [chatOverlayVisible, setChatOverlayVisible] = useState(false);
  const { visible, unreadCount, hideChatHead, isEnabled } = useChatHead();

  const handleChatHeadPress = () => {
    setChatOverlayVisible(true);
  };

  const handleChatOverlayClose = () => {
    setChatOverlayVisible(false);
  };

  const handleChatHeadClose = () => {
    hideChatHead();
  };

  // Don't render anything if chat head is disabled
  if (!isEnabled) {
    return null;
  }

  return (
    <>
      <ChatHead
        visible={visible}
        onPress={handleChatHeadPress}
        onClose={handleChatHeadClose}
        unreadCount={unreadCount}
      />
      <ChatOverlay
        visible={chatOverlayVisible}
        onClose={handleChatOverlayClose}
      />
    </>
  );
};