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
    
    class Meta:
        model = Conversation
        fields = ['id', 'title', 'created_at', 'updated_at', 
                  'is_archived', 'messages', 'message_count']
        read_only_fields = ['id', 'created_at', 'updated_at']
    
    def get_message_count(self, obj):
        return obj.messages.count()

class ChatbotSettingSerializer(serializers.ModelSerializer):
    class Meta:
        model = ChatbotSetting
        fields = ['preferred_model', 'temperature', 'max_tokens', 
                  'avatar_color', 'bot_nickname', 'notifications_enabled']
        
        