/**
 * Togetha Chatbot JavaScript
 * Handles chatbot interactions and UI functionality
 */

document.addEventListener('DOMContentLoaded', function() {
    // DOM elements
    const chatMessages = document.getElementById('chat-messages');
    const chatInput = document.getElementById('chat-input');
    const sendButton = document.getElementById('send-button');
    const loadingIndicator = document.getElementById('loading-indicator');
    const clearChatButton = document.getElementById('clear-chat');
    
    // Current conversation state
    let currentConversationId = null;
    
    /**
     * Get CSRF token for POST requests
     * @returns {string} CSRF token from cookies
     */
    function getCSRFToken() {
        const cookieValue = document.cookie
            .split('; ')
            .find(row => row.startsWith('csrftoken='))
            ?.split('=')[1];
        return cookieValue || '';
    }
    
    /**
     * Load conversation history
     * @param {string|null} conversationId - Optional ID of conversation to load
     */
    function loadConversation(conversationId = null) {
        // Show a temporary loading message
        showSystemMessage("Loading conversation history...");
        
        // Build URL with optional conversation ID
        let url = '/chatbot/api/messages/';
        if (conversationId) {
            url += `?conversation_id=${conversationId}`;
            currentConversationId = conversationId;
        }
        
        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Network response was not ok: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // Clear the loading message
                chatMessages.innerHTML = '';
                
                if (data.length === 0) {
                    // Show welcome message if no history
                    addMessage("Hello! I'm your Togetha AI assistant. How can I help you today?", 'assistant');
                } else {
                    // Add all messages from history
                    data.forEach(message => {
                        addMessage(message.content, message.message_type);
                    });
                }
                
                // Scroll to the bottom
                scrollToBottom();
            })
            .catch(error => {
                console.error('Error loading conversation:', error);
                showErrorMessage("Failed to load conversation history. Please refresh the page.");
            });
    }
    
    /**
     * Add a message to the chat
     * @param {string} text - Message content
     * @param {string} type - Message type ('user', 'assistant', 'system')
     */
    function addMessage(text, type) {
        // Hide loading indicator if it's visible
        loadingIndicator.style.display = 'none';
        
        const message = document.createElement('div');
        message.className = `message ${type}-message`;
        message.textContent = text;
        
        // Insert before the loading indicator if it exists
        if (loadingIndicator.parentNode === chatMessages) {
            chatMessages.insertBefore(message, loadingIndicator);
        } else {
            chatMessages.appendChild(message);
        }
        
        scrollToBottom();
    }
    
    /**
     * Show system message (notifications, errors, etc.)
     * @param {string} text - Message content
     * @param {boolean} isError - Whether this is an error message
     */
    function showSystemMessage(text, isError = false) {
        const message = document.createElement('div');
        message.className = `message system-message${isError ? ' error-message' : ''}`;
        message.textContent = text;
        chatMessages.appendChild(message);
        scrollToBottom();
        
        // Auto-remove after 5 seconds if it's an error
        if (isError) {
            setTimeout(() => {
                message.style.opacity = '0';
                setTimeout(() => message.remove(), 500);
            }, 5000);
        }
    }
    
    /**
     * Show error message
     * @param {string} text - Error message content
     */
    function showErrorMessage(text) {
        showSystemMessage(text, true);
    }
    
    /**
     * Scroll chat to bottom
     */
    function scrollToBottom() {
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }
    
    /**
     * Send a message to the chatbot
     */
    function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;
        
        // Add user message to chat
        addMessage(text, 'user');
        
        // Clear input and disable
        chatInput.value = '';
        chatInput.disabled = true;
        sendButton.disabled = true;
        
        // Show loading indicator
        loadingIndicator.style.display = 'flex';
        scrollToBottom();
        
        // Prepare request body
        const requestBody = { message: text };
        if (currentConversationId) {
            requestBody.conversation_id = currentConversationId;
        }
        
        // Send message to backend
        fetch('/chatbot/api/send/', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRFToken': getCSRFToken()
            },
            body: JSON.stringify(requestBody),
            credentials: 'same-origin'
        })
        .then(response => {
            if (!response.ok) {
                throw new Error(`Network response was not ok: ${response.status}`);
            }
            return response.json();
        })
        .then(data => {
            // Add assistant response
            addMessage(data.response, 'assistant');
            
            // Update conversation ID if this is a new conversation
            if (data.conversation_id && !currentConversationId) {
                currentConversationId = data.conversation_id;
                
                // If we have a conversation sidebar, update it
                if (typeof updateConversationSidebar === 'function') {
                    updateConversationSidebar();
                }
            }
        })
        .catch(error => {
            console.error('Error sending message:', error);
            showErrorMessage("Sorry, I'm having trouble connecting. Please try again later.");
        })
        .finally(() => {
            // Re-enable input
            chatInput.disabled = false;
            sendButton.disabled = false;
            chatInput.focus();
            
            // Hide loading indicator if it's still visible
            loadingIndicator.style.display = 'none';
            
            // Auto-resize the input
            autoResizeTextarea();
        });
    }
    
    /**
     * Clear chat history
     */
    function clearChat() {
        if (confirm('Are you sure you want to clear the chat history?')) {
            fetch('/chatbot/clear-conversations/', {
                method: 'POST',
                headers: {
                    'X-CSRFToken': getCSRFToken()
                },
                credentials: 'same-origin'
            })
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Network response was not ok: ${response.status}`);
                }
                return response.json();
            })
            .then(data => {
                // Clear chat messages
                chatMessages.innerHTML = '';
                
                // Add welcome message
                addMessage("Chat history cleared. How can I help you today?", 'assistant');
                
                // Reset conversation ID
                currentConversationId = null;
                
                // If we have a conversation sidebar, update it
                if (typeof updateConversationSidebar === 'function') {
                    updateConversationSidebar();
                }
            })
            .catch(error => {
                console.error('Error clearing chat:', error);
                showErrorMessage("Failed to clear chat history. Please try again.");
            });
        }
    }
    
    /**
     * Auto-resize textarea based on content
     */
    function autoResizeTextarea() {
        // Reset height first to get the correct scrollHeight
        chatInput.style.height = 'auto';
        // Set new height (clamped to max 120px)
        chatInput.style.height = Math.min(chatInput.scrollHeight, 120) + 'px';
    }
    
    // Event listeners
    if (sendButton) {
        sendButton.addEventListener('click', sendMessage);
    }
    
    if (chatInput) {
        chatInput.addEventListener('keydown', function(e) {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
            }
        });
        
        chatInput.addEventListener('input', autoResizeTextarea);
    }
    
    if (clearChatButton) {
        clearChatButton.addEventListener('click', clearChat);
    }
    
    // Load conversation history on page load
    loadConversation();
    
    // Focus input on page load
    if (chatInput) {
        chatInput.focus();
    }
    
    // Make functions available globally for use in other scripts
    window.chatbotFunctions = {
        loadConversation,
        addMessage,
        showSystemMessage,
        showErrorMessage,
        sendMessage,
        clearChat
    };
});
