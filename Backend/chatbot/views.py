from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from django.utils import timezone
from django.db.models import Q
from .models import Conversation, Message, ChatbotSetting
from .serializers import ConversationSerializer, MessageSerializer, ChatbotSettingSerializer
from django.shortcuts import render, get_object_or_404
from django.contrib.auth.decorators import login_required


class ConversationListView(APIView):
    authentication_classes = [TokenAuthentication, SessionAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Get all conversations for the authenticated user"""
        # Support filtering
        filter_type = request.query_params.get('filter', 'all')
        search_query = request.query_params.get('search', '')
        
        conversations = Conversation.objects.filter(user=request.user)
        
        # Apply filters
        if filter_type == 'archived':
            conversations = conversations.filter(is_archived=True)
        elif filter_type == 'pinned':
            conversations = conversations.filter(is_pinned=True)
        elif filter_type == 'active':
            conversations = conversations.filter(is_archived=False)
        elif filter_type == 'recent':
            today = timezone.now().date()
            conversations = conversations.filter(updated_at__date=today)
        
        # Apply search if provided
        if search_query:
            conversations = conversations.filter(
                Q(title__icontains=search_query) | 
                Q(messages__content__icontains=search_query)
            ).distinct()
            
        serializer = ConversationSerializer(conversations, many=True)
        return Response(serializer.data)
    
    def post(self, request):
        """Create a new conversation"""
        serializer = ConversationSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


class ConversationDetailView(APIView):
    authentication_classes = [TokenAuthentication, SessionAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get_object(self, pk, user):
        try:
            return Conversation.objects.get(pk=pk, user=user)
        except Conversation.DoesNotExist:
            return None
    
    def get(self, request, pk):
        """Get a specific conversation with all its messages"""
        conversation = self.get_object(pk, request.user)
        if not conversation:
            return Response(status=status.HTTP_404_NOT_FOUND)
        
        serializer = ConversationSerializer(conversation)
        return Response(serializer.data)
    
    def put(self, request, pk):
        """Update conversation details"""
        conversation = self.get_object(pk, request.user)
        if not conversation:
            return Response(status=status.HTTP_404_NOT_FOUND)
        
        serializer = ConversationSerializer(conversation, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def patch(self, request, pk):
        """Partially update conversation (e.g., to toggle archive or pin status)"""
        conversation = self.get_object(pk, request.user)
        if not conversation:
            return Response(status=status.HTTP_404_NOT_FOUND)
        
        serializer = ConversationSerializer(conversation, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    def delete(self, request, pk):
        """Delete a conversation"""
        conversation = self.get_object(pk, request.user)
        if not conversation:
            return Response(status=status.HTTP_404_NOT_FOUND)
        
        conversation.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


from rest_framework import serializers
from .models import Conversation, Message, ChatbotSetting

class MessageSerializer(serializers.ModelSerializer):
    class Meta:
        model = Message
        fields = ['id', 'content', 'message_type', 'created_at', 'model_used', 
                  'tokens_used', 'was_helpful', 'feedback']
        read_only_fields = ['id', 'created_at']

class ConversationSerializer(serializers.ModelSerializer):
    messages = MessageSerializer(many=True, read_only=True)
    message_count = serializers.SerializerMethodField()
    last_message = serializers.SerializerMethodField()
    
    class Meta:
        model = Conversation
        fields = ['id', 'title', 'created_at', 'updated_at', 
                  'is_archived', 'is_pinned', 'icon', 'summary',
                  'messages', 'message_count', 'last_message']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_message_count(self, obj):
        return obj.messages.count()
    
    def get_last_message(self, obj):
        last_message = obj.messages.order_by('created_at').last()
        if last_message:
            return {
                'content': last_message.content[:100] + ('...' if len(last_message.content) > 100 else ''),
                'created_at': last_message.created_at,
                'message_type': last_message.message_type
            }
        return None

class ChatbotSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatbotSetting
        fields = ['preferred_model', 'temperature', 'max_tokens', 
                  'avatar_color', 'bot_nickname', 'notifications_enabled',
                  'show_collapsed_sessions']
                  

@api_view(['GET', 'PUT'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def chatbot_settings(request):
    """Get or update the user's chatbot settings"""
    setting, created = ChatbotSetting.objects.get_or_create(user=request.user)
    
    if request.method == 'GET':
        serializer = ChatbotSettingSerializer(setting)
        return Response(serializer.data)
    
    elif request.method == 'PUT':
        serializer = ChatbotSettingSerializer(setting, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)


@api_view(['POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def provide_message_feedback(request, message_id):
    """Provide feedback on a specific message"""
    try:
        # Make sure the message belongs to the current user's conversations
        message = Message.objects.get(
            pk=message_id,
            conversation__user=request.user
        )
    except Message.DoesNotExist:
        return Response({"error": "Message not found"}, status=status.HTTP_404_NOT_FOUND)
    
    was_helpful = request.data.get('was_helpful')
    feedback = request.data.get('feedback', '')
    
    message.was_helpful = was_helpful
    message.feedback = feedback
    message.save()
    
    serializer = MessageSerializer(message)
    return Response(serializer.data)


@api_view(['POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def clear_conversations(request):
    """Clear all conversations for the current user"""
    Conversation.objects.filter(user=request.user).delete()
    return Response({"message": "All conversations cleared"})


@api_view(['POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def generate_conversation_title(request, conversation_id):
    """Generate or update the title of a conversation"""
    try:
        conversation = Conversation.objects.get(pk=conversation_id, user=request.user)
    except Conversation.DoesNotExist:
        return Response({"error": "Conversation not found"}, status=status.HTTP_404_NOT_FOUND)
    
    title = conversation.generate_title()
    return Response({"title": title})


# Helper function to simulate AI response
def generate_ai_response(user_message, conversation):
    """
    Generate AI response (placeholder function)
    In a real implementation, this would call an AI service
    """
    # Placeholder for AI integration
    response_text = f"This is a simulated response to: {user_message}"
    
    # Create and save the AI response message
    ai_message = Message.objects.create(
        conversation=conversation,
        content=response_text,
        message_type="assistant",
        model_used="simulation",
        tokens_used=len(response_text.split())
    )
    
    return ai_message


@api_view(['GET'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def get_messages(request):
    """Get all messages for the user's current or specified conversation"""
    user = request.user
    conversation_id = request.query_params.get('conversation_id', None)
    
    try:
        if conversation_id:
            # Get messages for specific conversation
            conversation = get_object_or_404(Conversation, pk=conversation_id, user=user)
        else:
            # Get or create default conversation
            conversation, created = Conversation.objects.get_or_create(
                user=user,
                defaults={'title': 'New conversation'}
            )
        
        # Get messages
        messages = Message.objects.filter(conversation=conversation).order_by('created_at')
        serializer = MessageSerializer(messages, many=True)
        return Response(serializer.data)
        
    except Exception as e:
        import logging
        logging.error(f"Error fetching messages: {str(e)}")
        return Response({
            'error': 'Failed to fetch messages'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@login_required
def chat_interface(request):
    """Render the chatbot interface"""
    # Get user settings or create default settings
    settings, created = ChatbotSetting.objects.get_or_create(user=request.user)
    
    # Get conversation count for the user
    conversation_count = Conversation.objects.filter(user=request.user).count()
    
    context = {
        'bot_name': settings.bot_nickname,
        'user_has_conversations': conversation_count > 0,
        'show_collapsed_sessions': settings.show_collapsed_sessions
    }
    
    return render(request, 'chatbot.html', context)

# Update just the generate_ai_response function to make it more realistic

def generate_ai_response(user_message, conversation=None):
    """
    Generate AI response (placeholder function)
    In a real implementation, this would call an external AI service like OpenAI API
    """
    import logging
    # This is a more sophisticated simulated response
    # A real implementation would call an LLM API
    
    try:
        user_message_lower = user_message.lower()
        
        # Simple response patterns based on user message content
        if 'hello' in user_message_lower or 'hi' in user_message_lower or 'hey' in user_message_lower:
            response_text = "Hello! How can I assist you today?"
        
        elif 'how are you' in user_message_lower:
            response_text = "I'm doing well, thank you for asking! How can I help you?"
        
        elif any(word in user_message_lower for word in ['help', 'assist', 'support']):
            response_text = "I'm here to help! You can ask me questions, request information, or use me for brainstorming ideas. What would you like assistance with?"
        
        elif any(word in user_message_lower for word in ['thanks', 'thank you', 'appreciate']):
            response_text = "You're welcome! Is there anything else I can help you with?"
        
        elif '?' in user_message:
            response_text = "That's an interesting question. While I'm just a simulated response in this demo, a real AI would provide a detailed answer here. In a production environment, this would connect to an LLM API like OpenAI's GPT or another model."
        
        elif len(user_message) < 10:
            response_text = "Could you please elaborate a bit more? That will help me provide a better response."
        
        else:
            response_text = f"I understand you're interested in '{user_message[:30]}...' This is a simulated response in the demo version. In production, this would connect to an AI service to generate helpful, relevant responses to your queries."
        
        # If conversation is provided, create and save the message
        if conversation:
            ai_message = Message.objects.create(
                conversation=conversation,
                content=response_text,
                message_type="assistant",
                model_used="simulation",
                tokens_used=len(response_text.split())
            )
            return ai_message
        else:
            return response_text
            
    except Exception as e:
        logging.error(f"Error generating AI response: {str(e)}")
        return "I'm sorry, I encountered an error processing your request. Please try again."


@api_view(['POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def send_message_api(request):
    """Send a message to the chatbot and get a response (for API calls)"""
    try:
        user = request.user
        message_content = request.data.get('message', '').strip()
        
        if not message_content:
            return Response({
                'error': 'Message content cannot be empty'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Get or create a default conversation for the user
        conversation, created = Conversation.objects.get_or_create(
            user=user,
            defaults={'title': 'New conversation'}
        )
        
        # Create user message
        Message.objects.create(
            conversation=conversation,
            content=message_content,
            message_type='user'
        )
        
        # Generate AI response
        ai_response = generate_ai_response(message_content, conversation)
        
        return Response({
            'response': ai_response.content,
            'conversation_id': str(conversation.id)
        }, status=status.HTTP_201_CREATED)
        
    except Exception as e:
        import logging
        logging.error(f"Error in send_message_api: {str(e)}")
        return Response({
            'error': 'An error occurred while processing your message'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)