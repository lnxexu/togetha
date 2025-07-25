from django.test import TestCase
from django.urls import reverse
from rest_framework.test import APIClient
from django.contrib.auth.models import User
from rest_framework import status
from .models import Conversation, Message, ChatbotSetting
import uuid

class ChatbotModelsTest(TestCase):
    """Test cases for the chatbot models"""
    
    def setUp(self):
        # Create a test user
        self.user = User.objects.create_user(
            username='TestUser',
            password='TestPassword123'
        )
        
        # Create a conversation
        self.conversation = Conversation.objects.create(
            user=self.user,
            title='Test Conversation'
        )
        
        # Create some messages
        self.user_message = Message.objects.create(
            conversation=self.conversation,
            content='Hello, AI!',
            message_type='user'
        )
        
        self.ai_message = Message.objects.create(
            conversation=self.conversation,
            content='Hello! How can I assist you today?',
            message_type='assistant',
            model_used='test-model',
            tokens_used=10
        )
        
        # Create chatbot settings
        self.settings = ChatbotSetting.objects.create(
            user=self.user,
            preferred_model='test-model',
            temperature=0.8,
            max_tokens=800,
            bot_nickname='Test Bot'
        )
    
    def test_conversation_model(self):
        """Test the Conversation model"""
        self.assertEqual(str(self.conversation), "Test Conversation - TestUser")
        self.assertEqual(self.conversation.user, self.user)
        self.assertFalse(self.conversation.is_archived)
    
    def test_message_model(self):
        """Test the Message model"""
        self.assertIn("Hello, AI!", str(self.user_message))
        self.assertEqual(self.user_message.conversation, self.conversation)
        self.assertEqual(self.user_message.message_type, 'user')
        
        self.assertEqual(self.ai_message.model_used, 'test-model')
        self.assertEqual(self.ai_message.tokens_used, 10)
        self.assertEqual(self.ai_message.message_type, 'assistant')
    
    def test_settings_model(self):
        """Test the ChatbotSetting model"""
        self.assertEqual(str(self.settings), "Settings for TestUser")
        self.assertEqual(self.settings.preferred_model, 'test-model')
        self.assertEqual(self.settings.temperature, 0.8)
        self.assertEqual(self.settings.max_tokens, 800)
        self.assertEqual(self.settings.bot_nickname, 'Test Bot')
        self.assertTrue(self.settings.notifications_enabled)


class ChatbotAPITest(TestCase):
    """Test cases for the chatbot API endpoints"""
    
    def setUp(self):
        # Create a test user
        self.user = User.objects.create_user(
            username='TestUser',
            password='TestPassword123'
        )
        
        # Set up the API client
        self.client = APIClient()
        self.client.force_authenticate(user=self.user)
        
        # Create a conversation
        self.conversation = Conversation.objects.create(
            user=self.user,
            title='Test Conversation'
        )
        
        # Create a message
        self.message = Message.objects.create(
            conversation=self.conversation,
            content='Hello, AI!',
            message_type='user'
        )
    
    def test_get_conversations(self):
        """Test getting the list of conversations"""
        url = reverse('conversation-list')
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(len(response.data), 1)
        self.assertEqual(response.data[0]['title'], 'Test Conversation')
        
    def test_create_conversation(self):
        """Test creating a new conversation"""
        url = reverse('conversation-list')
        data = {'title': 'New Conversation'}
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_201_CREATED)
        self.assertEqual(response.data['title'], 'New Conversation')
        self.assertEqual(Conversation.objects.count(), 2)
        
    def test_get_conversation_detail(self):
        """Test getting details of a specific conversation"""
        url = reverse('conversation-detail', kwargs={'pk': self.conversation.id})
        response = self.client.get(url)
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Test Conversation')
        self.assertEqual(len(response.data['messages']), 1)
        
    def test_update_conversation(self):
        """Test updating a conversation"""
        url = reverse('conversation-detail', kwargs={'pk': self.conversation.id})
        data = {'title': 'Updated Title', 'is_archived': True}
        
        response = self.client.put(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['title'], 'Updated Title')
        self.assertTrue(response.data['is_archived'])
        
        # Verify in database
        self.conversation.refresh_from_db()
        self.assertEqual(self.conversation.title, 'Updated Title')
        self.assertTrue(self.conversation.is_archived)
        
    def test_delete_conversation(self):
        """Test deleting a conversation"""
        url = reverse('conversation-detail', kwargs={'pk': self.conversation.id})
        response = self.client.delete(url)
        
        self.assertEqual(response.status_code, status.HTTP_204_NO_CONTENT)
        self.assertEqual(Conversation.objects.count(), 0)
        
    def test_send_message(self):
        """Test sending a message to a conversation"""
        url = reverse('send-message', kwargs={'conversation_id': self.conversation.id})
        data = {'message': 'How are you doing?'}
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertIn('user_message', response.data)
        self.assertIn('ai_response', response.data)
        self.assertEqual(response.data['user_message']['content'], 'How are you doing?')
        self.assertIn('This is a simulated response', response.data['ai_response']['content'])
        
        # Check that two new messages were added to the database
        self.assertEqual(Message.objects.count(), 3)  # Initial + user message + AI response
        
    def test_chatbot_settings(self):
        """Test getting and updating chatbot settings"""
        # Create settings first
        ChatbotSetting.objects.create(user=self.user)
        
        url = reverse('chatbot-settings')
        
        # Test GET
        response = self.client.get(url)
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['preferred_model'], 'gpt-3.5-turbo')  # Default value
        
        # Test PUT
        data = {
            'preferred_model': 'gpt-4',
            'temperature': 0.5,
            'max_tokens': 2000,
            'bot_nickname': 'My Assistant'
        }
        response = self.client.put(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertEqual(response.data['preferred_model'], 'gpt-4')
        self.assertEqual(response.data['temperature'], 0.5)
        self.assertEqual(response.data['max_tokens'], 2000)
        self.assertEqual(response.data['bot_nickname'], 'My Assistant')
        
    def test_message_feedback(self):
        """Test providing feedback on a message"""
        url = reverse('message-feedback', kwargs={'message_id': self.message.id})
        data = {
            'was_helpful': True,
            'feedback': 'This was very useful!'
        }
        
        response = self.client.post(url, data, format='json')
        
        self.assertEqual(response.status_code, status.HTTP_200_OK)
        self.assertTrue(response.data['was_helpful'])
        self.assertEqual(response.data['feedback'], 'This was very useful!')
        
        # Check database
        self.message.refresh_from_db()
        self.assertTrue(self.message.was_helpful)
        self.assertEqual(self.message.feedback, 'This was very useful!')
        
    def test_unauthorized_access(self):
        """Test that unauthenticated users cannot access endpoints"""
        # Create a new client without authentication
        client = APIClient()
        
        # Try to get conversations
        url = reverse('conversation-list')
        response = client.get(url)
        self.assertEqual(response.status_code, status.HTTP_401_UNAUTHORIZED)
        
    def test_conversation_isolation(self):
        """Test that users can only access their own conversations"""
        # Create another user
        other_user = User.objects.create_user(
            username='OtherUser',
            password='OtherPassword'
        )
        
        # Create a conversation for the other user
        other_conversation = Conversation.objects.create(
            user=other_user,
            title='Other Conversation'
        )
        
        # Try to access the other user's conversation
        url = reverse('conversation-detail', kwargs={'pk': other_conversation.id})
        response = self.client.get(url)
        
        # Should get 404 because we can't see other users' conversations
        self.assertEqual(response.status_code, status.HTTP_404_NOT_FOUND)