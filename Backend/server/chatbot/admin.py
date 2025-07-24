from django.contrib import admin
from .models import Conversation, Message, ChatbotSetting

class MessageInline(admin.TabularInline):
    model = Message
    extra = 0

@admin.register(Conversation)
class ConversationAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'created_at', 'updated_at', 'is_pinned', 'is_archived')
    list_filter = ('is_pinned', 'is_archived', 'created_at')
    search_fields = ('title', 'user__username')
    inlines = [MessageInline]

@admin.register(Message)
class MessageAdmin(admin.ModelAdmin):
    list_display = ('short_content', 'message_type', 'conversation', 'created_at')
    list_filter = ('message_type', 'created_at')
    search_fields = ('content', 'conversation__title')
    
    def short_content(self, obj):
        if len(obj.content) > 50:
            return obj.content[:50] + '...'
        return obj.content
    
    short_content.short_description = 'Content'

@admin.register(ChatbotSetting)
class ChatbotSettingAdmin(admin.ModelAdmin):
    list_display = ('user', 'preferred_model', 'bot_nickname')
    search_fields = ('user__username', 'bot_nickname')