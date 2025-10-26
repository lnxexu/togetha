import uuid
from django.db import models
from django.conf import settings

class Task(models.Model):
    PRIORITY_CHOICES = [
        ('urgent-important', 'Urgent and Important'),
        ('not-urgent-important', 'Not Urgent but Important'),
        ('urgent-not-important', 'Urgent but Not Important'),
        ('not-urgent-not-important', 'Not Urgent and Not Important'),
    ]
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200, default="Untitled Task")  # Add default here
    description = models.TextField(blank=True, null=True)
    due_datetime = models.DateTimeField(blank=True, null=True)
    priority = models.CharField(
        max_length=30, 
        choices=PRIORITY_CHOICES,
        default='not-urgent-not-important'
    )
    category = models.CharField(max_length=100, blank=True, null=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tasks')
    completed = models.BooleanField(default=False)
    completed_at = models.DateTimeField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

    class Meta:
        ordering = ['-due_datetime', '-priority', '-created_at']

