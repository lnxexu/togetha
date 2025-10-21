from django.db import models
from django.conf import settings
import uuid
from django.contrib.auth.models import User

class Conversation(models.Model):
    """A conversation between a user and the chatbot system"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='conversations')
    title = models.CharField(max_length=255, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    is_archived = models.BooleanField(default=False)
    is_pinned = models.BooleanField(default=False)  # Allow users to pin important conversations
    
    # New fields for session management
    icon = models.CharField(max_length=50, blank=True, default="chat")  # Icon identifier for the conversation
    summary = models.TextField(blank=True)  # Auto-generated summary of the conversation

    def __str__(self):
        return f"{self.title or 'Untitled'} - {self.user.username}"
    
    def get_short_title(self):
        """Get a short title for display in the session list"""
        if self.title and len(self.title) > 30:
            return f"{self.title[:30]}..."
        return self.title or "New conversation"
    
    def get_message_preview(self):
        """Get a preview of the last message"""
        last_message = self.messages.order_by('created_at').last()
        if last_message:
            content = last_message.content[:50]
            return f"{content}..." if len(last_message.content) > 50 else content
        return ""
    
    def generate_title(self):
        """Generate a title based on the first user message"""
        first_message = self.messages.filter(message_type='user').order_by('created_at').first()
        if first_message:
            # Generate a title from the first message
            title_text = first_message.content[:40]
            self.title = title_text + ("..." if len(first_message.content) > 40 else "")
            self.save(update_fields=['title'])
        return self.title
    
    class Meta:
        ordering = ['-is_pinned', '-updated_at']


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
    
    # Default session view (collapsed or expanded)
    show_collapsed_sessions = models.BooleanField(default=False)
    
    def __str__(self):
        return f"Settings for {self.user.username}"

class DocumentChunk(models.Model):
    user = models.ForeignKey(User, on_delete=models.CASCADE)   # link per-user
    doc_id = models.UUIDField(default=uuid.uuid4, editable=False)   # unique doc identifier
    note_id = models.CharField(max_length=255, null=True, blank=True)  # optional link to a note entity
    document_name = models.CharField(max_length=255)
    chunk_text = models.TextField()
    embedding = models.JSONField()   # store embedding as list of floats
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"{self.document_name} [{self.doc_id}]"


class ConversationFile(models.Model):
    """Files attached to conversations"""
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    conversation = models.ForeignKey(Conversation, on_delete=models.CASCADE, related_name='attached_files')
    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='attached_files', null=True, blank=True)
    
    file_name = models.CharField(max_length=255)
    file_path = models.CharField(max_length=500)
    file_type = models.CharField(max_length=50)  # pdf, image, doc, etc.
    file_size = models.IntegerField()  # in bytes
    
    # For tracking processing status
    is_processed = models.BooleanField(default=False)
    processing_status = models.CharField(max_length=50, default='pending')  # pending, processing, completed, failed
    extracted_text = models.TextField(blank=True, null=True)
    # Link to the document identifier used by DocumentChunk (if processed into embeddings)
    doc_id = models.UUIDField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return f"{self.file_name} - {self.conversation.title}"
    
    class Meta:
        ordering = ['-created_at']

# models.py
# Note: DocumentChunk defined above with doc_id and note_id fields
