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