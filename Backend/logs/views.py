from rest_framework import viewsets, permissions, status
from rest_framework.response import Response
from rest_framework.decorators import action
from .models import Log
from .serializers import LogSerializer
from django.contrib.auth import get_user_model

User = get_user_model()

class LogViewSet(viewsets.ModelViewSet):
    queryset = Log.objects.all()
    serializer_class = LogSerializer
    permission_classes = [permissions.IsAuthenticated]

    def get_queryset(self):
        return Log.objects.filter(user=self.request.user).order_by('-timestamp')

    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        """Mark all logs as read for the requesting user"""
        logs = self.get_queryset().filter(read=False)
        count = logs.update(read=True)
        return Response({'status': 'all logs marked as read', 'count': count}, status=status.HTTP_200_OK)

    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        """Mark a specific log as read"""
        log = self.get_object()
        log.read = True
        log.save()
        return Response({'status': 'log marked as read'}, status=status.HTTP_200_OK)
        
    @action(detail=False, methods=['get'])
    def unread(self, request):
        """Get only unread logs for the user"""
        logs = self.get_queryset().filter(read=False)
        serializer = self.get_serializer(logs, many=True)
        return Response(serializer.data)


def create_log(user=None, level="INFO", message="", action="", entity_type=None, entity_id=None):
    """
    Helper function to create logs programmatically from anywhere in the app
    """
    from .models import Log
    
    log = Log.objects.create(
        user=user,
        level=level,
        message=message,
        action=action,
        entity_type=entity_type,
        entity_id=entity_id
    )
    return log

