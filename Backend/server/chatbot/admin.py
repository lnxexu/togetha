from django.contrib import admin
from .models import Conversation, Message, ChatbotSetting

@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'created_at', 'updated_at', 'is_archived')
    list_filter = ('is_archived', 'created_at')
    search_fields = ('title', 'user__username')

@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ('message_type', 'conversation', 'short_content', 'created_at')
    list_filter = ('message_type', 'created_at')
    search_fields = ('content', 'conversation__title')
    
    def short_content(self, obj):
        return obj.content[:50] + '...' if len(obj.content) > 50 else obj.content
    short_content.short_description = 'Content'

@admin.register(ChatbotSetting)
class ChatbotSettingAdmin(admin.ModelAdmin):
    list_display = ('user', 'preferred_model', 'temperature', 'bot_nickname')
    search_fields = ('user__username', 'bot_nickname')