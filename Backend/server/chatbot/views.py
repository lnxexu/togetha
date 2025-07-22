from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from rest_framework.response import Response
from rest_framework import status
from rest_framework.views import APIView
from .models import Conversation, Message, ChatbotSetting
from .serializers import ConversationSerializer, MessageSerializer, ChatbotSettingSerializer
from django.shortcuts import render
from django.contrib.auth.decorators import login_required


class ConversationListView(APIView):
    authentication_classes = [TokenAuthentication, SessionAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Get all conversations for the authenticated user"""
        conversations = Conversation.objects.filter(user=request.user)
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
        
        serializer = ConversationSerializer(conversation, data=request.data)
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

@api_view(['POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def send_message(request, conversation_id):
    """Send a message and get AI response"""
    try:
        conversation = Conversation.objects.get(pk=conversation_id, user=request.user)
    except Conversation.DoesNotExist:
        return Response({"error": "Conversation not found"}, status=status.HTTP_404_NOT_FOUND)
    
    # Create user message
    user_message = Message.objects.create(
        conversation=conversation,
        content=request.data.get("message", ""),
        message_type="user"
    )
    
    # Generate AI response (this would be replaced with actual AI integration)
    ai_response = generate_ai_response(user_message.content, conversation)
    
    # Update conversation's updated_at timestamp
    conversation.save()
    
    return Response({
        "user_message": MessageSerializer(user_message).data,
        "ai_response": MessageSerializer(ai_response).data
    })

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
        serializer = ChatbotSettingSerializer(setting, data=request.data)
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
        message = Message.objects.get(pk=message_id, conversation__user=request.user)
    except Message.DoesNotExist:
        return Response({"error": "Message not found"}, status=status.HTTP_404_NOT_FOUND)
    
    message.was_helpful = request.data.get("was_helpful")
    message.feedback = request.data.get("feedback")
    message.save()
    
    return Response(MessageSerializer(message).data)

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



@login_required
def chat_interface(request):
    """Render the chatbot interface"""
    return render(request, 'chatbot/templates/chatbot.html')