from django.db import models
from django.conf import settings
import uuid

class Conversation(models.Model):
    """A conversation between a user and the chatbot system"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='conversations')
    title = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_archived = models.BooleanField(default=False)

    def __str__(self):
        return f"{self.title or 'Untitled'} - {self.user.username}"
    
    class Meta:
        ordering = ['-updated_at']


class Message(models.Model):
    """Individual message within a conversation"""
    MESSAGE_TYPE_CHOICES = [
        ('user', 'User Message'),
        ('assistant', 'Assistant Message'),
        ('system', 'System Message'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='messages')
    content = models.TextField()
    message_type = models.CharField(max_length=10, choices=MESSAGE_TYPE_CHOICES)
    created_at = models.DateTimeField(auto_now_add=True)
    
    # For tracking AI model details
    model_used = models.CharField(max_length=100, blank=True, null=True)
    tokens_used = models.IntegerField(default=0)
    
    # For feedback and improvement
    was_helpful = models.BooleanField(null=True, blank=True)
    feedback = models.TextField(blank=True, null=True)

    def __str__(self):
        return f"{self.message_type}: {self.content[:50]}..."

    class Meta:
        ordering = ['created_at']


class ChatbotSetting(models.Model):
    """User-specific settings for the chatbot"""
    user = models.OneToOneField(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='chatbot_settings')
    preferred_model = models.CharField(max_length=100, default='gpt-3.5-turbo')
    temperature = models.FloatField(default=0.7)
    max_tokens = models.IntegerField(default=1000)
    
    # Customization options
    avatar_color = models.CharField(max_length=20, default='#4285F4')
    bot_nickname = models.CharField(max_length=50, default='Togetha AI')
    
    # Notification preferences
    notifications_enabled = models.BooleanField(default=True)
    
    def __str__(self):
        return f"Settings for {self.user.username}"