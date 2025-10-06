from rest_framework import viewsets, status
from rest_framework.permissions import IsAuthenticated
from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from ..models import Conversation
from ..serializers import ConversationSerializer, MessageSerializer


class ConversationViewSet(viewsets.ModelViewSet):
    """
    Handles listing, retrieving, creating, updating, and deleting conversations.
    Automatically attaches the authenticated user to new conversations
    and restricts access to their own data only.
    """
    serializer_class = ConversationSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
   
        return (
            Conversation.objects.filter(user=self.request.user)
            .prefetch_related("messages", "attached_files")
            .order_by("-updated_at")
        )

    def perform_create(self, serializer):
      
        serializer.save(user=self.request.user)

@api_view(["GET"])
@permission_classes([IsAuthenticated])
def get_messages(request, conversation_id=None):
    """
    Return messages for a given conversation belonging to the authenticated user.
    """
    try:
        conversation = Conversation.objects.get(pk=conversation_id, user=request.user)
    except Conversation.DoesNotExist:
        return Response(
            {"error": "Conversation not found or access denied."},
            status=status.HTTP_404_NOT_FOUND,
        )

    messages = conversation.messages.all().order_by("created_at")
    serializer = MessageSerializer(messages, many=True)
    return Response(serializer.data, status=status.HTTP_200_OK)
