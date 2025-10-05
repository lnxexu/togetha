from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.permissions import IsAuthenticated
from django.shortcuts import get_object_or_404
from .models import Notification
from .serializers import NotificationSerializer
from logs.views import create_log

class NotificationViewSet(viewsets.ModelViewSet):
    serializer_class = NotificationSerializer
    permission_classes = [IsAuthenticated]
    
    def get_queryset(self):
        return Notification.objects.filter(user=self.request.user).order_by('-scheduled_time', '-timestamp')
    
    def retrieve(self, request, *args, **kwargs):
        """Override retrieve to automatically mark notification as read when viewed"""
        notification = self.get_object()
        
        # Mark as read when notification details are viewed
        if not notification.read:
            notification.read = True
            notification.save()
            # Log that this notification was read via detail view
            try:
                create_log(
                    user=request.user,
                    action='read',
                    entity_type='notification',
                    entity_id=notification.id,
                    message=f'Notification "{notification.title}" marked as read on view.',
                    request=request,
                )
            except Exception:
                pass
        
        serializer = self.get_serializer(notification)
        return Response(serializer.data)
    
    @action(detail=False, methods=['post'])
    def mark_all_read(self, request):
        queryset = self.get_queryset()
        count = queryset.filter(read=False).count()
        queryset.update(read=True)
        # Log bulk mark all read
        try:
            create_log(
                user=request.user,
                action='read_all',
                entity_type='notification',
                entity_id=None,
                message=f'Marked {count} notifications as read.',
                request=request,
            )
        except Exception:
            pass
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
            # Log single notification marked read
            try:
                create_log(
                    user=request.user,
                    action='read',
                    entity_type='notification',
                    entity_id=notification.id,
                    message=f'Notification "{notification.title}" marked as read.',
                    request=request,
                )
            except Exception:
                pass
            return Response({
                'status': 'success',
                'message': 'Notification marked as read',
                'notification': NotificationSerializer(notification).data
            })
        return Response({
            'status': 'info',
            'message': 'Notification was already read',
            'notification': NotificationSerializer(notification).data
        })
    
    @action(detail=False, methods=['get'])
    def unread_count(self, request):
        """Get count of unread notifications"""
        count = self.get_queryset().filter(read=False).count()
        return Response({'unread_count': count})
    
    @action(detail=False, methods=['get'])
    def recent(self, request):
        """Get recent notifications (last 20)"""
        recent_notifications = self.get_queryset()[:20]
        serializer = self.get_serializer(recent_notifications, many=True)
        return Response(serializer.data)

def create_notification(user, notification_type, title, message, related_task=None, action_id=None, priority='medium', specific_type=None, request=None):
    """
    Utility function to create notifications from anywhere in the codebase
    """
    notification = Notification.objects.create(
        user=user,
        type=notification_type,
        title=title,
        message=message,
        related_task=related_task,
        action_id=action_id,
        priority=priority,
        notification_type=specific_type or 'general'
    )
    # Optionally log notification creation
    try:
        create_log(
            user=user,
            action='create',
            entity_type='notification',
            entity_id=notification.id,
            message=f'Notification "{title}" created (type: {specific_type or "general"}).',
            request=request,
        )
    except Exception:
        pass
    return notification