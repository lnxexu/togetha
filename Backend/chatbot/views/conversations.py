# chatbot/views/conversations.py
from rest_framework import viewsets
from rest_framework.permissions import IsAuthenticated
from ..models import Conversation
from ..serializers import ConversationSerializer

class ConversationViewSet(viewsets.ModelViewSet):
    """
    Handles listing, retrieving, creating, updating, and deleting conversations.
    """
    queryset = Conversation.objects.all().prefetch_related("messages", "attached_files")
    serializer_class = ConversationSerializer
    permission_classes = [IsAuthenticated]

# Optional: a helper view for fetching messages in a conversation
from rest_framework.decorators import api_view
from rest_framework.response import Response
from ..serializers import MessageSerializer

@api_view(["GET"])
def get_messages(request, conversation_id=None):
    """
    Return messages for a given conversation.
    """
    try:
        conversation = Conversation.objects.get(pk=conversation_id)
    except Conversation.DoesNotExist:
        return Response({"error": "Conversation not found"}, status=404)

    messages = conversation.messages.all().order_by("created_at")
    serializer = MessageSerializer(messages, many=True)
    return Response(serializer.data)
