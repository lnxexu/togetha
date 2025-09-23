from rest_framework import serializers
from .models import Notification

class NotificationSerializer(serializers.ModelSerializer):
    task_details = serializers.SerializerMethodField()
    
    class Meta:
        model = Notification
        fields = [
            'id', 'type', 'title', 'message', 'timestamp', 'read', 
            'action_id', 'priority', 'notification_type', 'scheduled_time',
            'related_task', 'task_details'
        ]
        read_only_fields = ['id', 'timestamp', 'task_details']
        
    def get_task_details(self, obj):
        """Return task details if related_task exists"""
        return obj.get_task_details()