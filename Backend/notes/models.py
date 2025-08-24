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
        ('drawing', 'Drawing Note'),
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
    has_drawing = models.BooleanField(default=False)
    drawing_data = models.TextField(null=True, blank=True)  # Store as JSON string
    drawing_thumbnail = models.ImageField(upload_to='note_thumbnails/', null=True, blank=True)
    last_drawing_update = models.DateTimeField(auto_now=True)
    
    def save_drawing_strokes(self, strokes_data):
        """Helper method to save drawing strokes"""
        self.drawing_data = strokes_data
        self.has_drawing = True
        # Automatically set note type to drawing when saving drawing data
        if strokes_data and (isinstance(strokes_data, list) and len(strokes_data) > 0 or 
                           isinstance(strokes_data, str) and strokes_data.strip()):
            self.type = 'drawing'
        self.save()
    
    def get_drawing_strokes(self):
        """Helper method to retrieve drawing strokes"""
        return self.drawing_data if self.drawing_data else []

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