from rest_framework import serializers
from .models import Notification

class NotificationSerializer(serializers.ModelSerializer):
    class Meta:
        model = Notification
        fields = ['id', 'type', 'title', 'message', 'timestamp', 'read', 'action_id', 'priority']
        read_only_fields = ['id', 'timestamp']