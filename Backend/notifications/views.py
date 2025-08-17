from rest_framework import viewsets
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from .models import Notification
from .serializers import NotificationSerializer

class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).order_by('-timestamp')
    
    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        queryset = self.get_queryset()
        count = queryset.filter(read=False).count()
        queryset.update(read=True)
        return Response({
            'status': 'success',
            'message': f'{count} notifications marked as read'
        })
    
    @action(detail=True, methods=['post'])
    def mark_read(self, request, pk=None):
        notification = self.get_object()
        if not notification.read:
            notification.read = True
            notification.save()
            return Response({
                'status': 'success',
                'message': 'Notification marked as read'
            })
        return Response({
            'status': 'info',
            'message': 'Notification was already read'
        })

def create_notification(user, notification_type, title, message, action_id=None, priority='medium'):
    """
    Utility function to create notifications from anywhere in the codebase
    """
    notification = Notification.objects.create(
        user=user,
        type=notification_type,
        title=title,
        message=message,
        action_id=action_id,
        priority=priority
    )
    return notification