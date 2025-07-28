from django.db import models
import uuid
from django.conf import settings

class Folder(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    description = models.TextField(blank=True, null=True)
    color = models.CharField(max_length=20, blank=True, null=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='folders')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.name

    class Meta:
        ordering = ['-updated_at']
        unique_together = ['name', 'user']  # Prevent duplicate folder names per user

class Note(models.Model):
    TYPE_CHOICES = [
        ('text', 'Text Note'),
        ('voice', 'Voice Note'),
        ('image', 'Image Note'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=200)
    content = models.TextField(blank=True)
    formatted_content = models.TextField(blank=True, null=True)  # For rich text or HTML content
    folder = models.ForeignKey(Folder, on_delete=models.CASCADE, related_name='notes', null=True, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notes')
    type = models.CharField(max_length=10, choices=TYPE_CHOICES, default='text')
    is_archived = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.title

    class Meta:
        ordering = ['-updated_at']

class Tag(models.Model):
    name = models.CharField(max_length=100)
    notes = models.ManyToManyField(Note, related_name='tags')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tags')

    def __str__(self):
        return self.name

class AudioRecording(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    note = models.ForeignKey(Note, on_delete=models.CASCADE, related_name='audio_recordings')
    audio_file = models.FileField(upload_to='audio_recordings/')
    duration = models.IntegerField(default=0)  # Duration in seconds
    transcribed = models.BooleanField(default=False)
    transcription = models.TextField(blank=True, null=True)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return f"Audio for {self.note.title}"