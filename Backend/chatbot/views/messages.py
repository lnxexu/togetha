from rest_framework import viewsets, status
from rest_framework.response import Response
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from ..models import Message
from ..serializers import MessageSerializer
from rest_framework import status
from rest_framework.response import Response


class MessageViewSet(viewsets.ModelViewSet):
    queryset = Message.objects.all()
    serializer_class = MessageSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return Message.objects.filter(conversation__user=self.request.user).order_by("created_at")

    @action(detail=True, methods=["post"])
    def message_actions(self, request, pk=None):
        try:
            message = Message.objects.get(pk=pk, conversation__user=request.user)
        except Message.DoesNotExist:
            return Response({"error": "Message not found"}, status=status.HTTP_404_NOT_FOUND)

        action_type = request.data.get("action")
        if action_type == "delete":
            message.delete()
            return Response({"message": "Message deleted"}, status=status.HTTP_200_OK)

        return Response({"error": "Unsupported action"}, status=status.HTTP_400_BAD_REQUEST)



@api_view(["POST"])
@permission_classes([IsAuthenticated])
def message_actions(request):
    """Module-level view used by urls.py. Expects 'pk' in POST body (or 'message_id').

    This mirrors the MessageViewSet.message_actions behavior for simple routing.
    """
    pk = request.data.get("pk") or request.data.get("message_id")
    if not pk:
        return Response({"error": "Missing message id (pk)"}, status=status.HTTP_400_BAD_REQUEST)

    try:
        message = Message.objects.get(pk=pk, conversation__user=request.user)
    except Message.DoesNotExist:
        return Response({"error": "Message not found"}, status=status.HTTP_404_NOT_FOUND)

    action_type = request.data.get("action")
    if action_type == "delete":
        message.delete()
        return Response({"message": "Message deleted"}, status=status.HTTP_200_OK)

    return Response({"error": "Unsupported action"}, status=status.HTTP_400_BAD_REQUEST)
