from django.db import models
import uuid
import hashlib
import json
from django.conf import settings
from django.utils import timezone

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
        ('document', 'Document Note'),  # Add document type
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
    
    # Document fields
    document_file = models.FileField(upload_to='documents/', null=True, blank=True)
    document_annotations = models.JSONField(null=True, blank=True)  # Store annotations as JSON
    document_metadata = models.JSONField(null=True, blank=True)  # Store document metadata (page count, size, etc.)
    
    # Version tracking for conflict resolution
    version = models.PositiveIntegerField(default=1)
    last_modified_by = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.SET_NULL, null=True, blank=True, related_name='last_modified_notes')
    content_hash = models.CharField(max_length=64, blank=True, null=True)  # For change detection
    
    # Auto-save tracking
    auto_save_enabled = models.BooleanField(default=True)
    last_auto_save = models.DateTimeField(null=True, blank=True)
    manual_save_count = models.PositiveIntegerField(default=0)
    auto_save_count = models.PositiveIntegerField(default=0)
    
    # Track the last time this note was accessed (viewed/opened)
    last_accessed = models.DateTimeField(null=True, blank=True)
    
    def save(self, *args, **kwargs):
        # Determine if this is an auto-save or manual save
        is_auto_save = kwargs.pop('is_auto_save', False)
        
        # Calculate content hash for change detection
        content_for_hash = json.dumps({
            'title': self.title,
            'content': self.content,
            'formatted_content': self.formatted_content,
            'drawing_data': self.drawing_data,
            'document_annotations': self.document_annotations,
        }, sort_keys=True)
        new_hash = hashlib.sha256(content_for_hash.encode()).hexdigest()
        
        # Check if content actually changed
        content_changed = self.content_hash != new_hash
        
        if content_changed:
            self.content_hash = new_hash
            
            # Increment version on each content change (except initial creation)
            if self.pk:
                self.version += 1
            
            # Update save counters
            if is_auto_save:
                self.auto_save_count += 1
                self.last_auto_save = timezone.now()
            else:
                self.manual_save_count += 1
        
        super().save(*args, **kwargs)
    
    def has_unsaved_changes(self, current_data):
        """Check if current data differs from saved data"""
        current_hash = hashlib.sha256(json.dumps(current_data, sort_keys=True).encode()).hexdigest()
        return self.content_hash != current_hash
    
    def save_drawing_strokes(self, strokes_data):
        """Helper method to save drawing strokes as JSON string in TextField"""
        # Normalize to JSON string for consistent storage
        try:
            if isinstance(strokes_data, (list, dict)):
                json_str = json.dumps(strokes_data)
            elif isinstance(strokes_data, str):
                # If it's a valid JSON string, keep as-is; else try to coerce
                try:
                    json.loads(strokes_data)
                    json_str = strokes_data
                except Exception:
                    # Fallback: best-effort to coerce to JSON string
                    try:
                        import ast
                        parsed = ast.literal_eval(strokes_data)
                        json_str = json.dumps(parsed)
                    except Exception:
                        json_str = json.dumps([])
            else:
                # Last resort: serialize arbitrary type
                json_str = json.dumps(strokes_data)
        except Exception:
            json_str = json.dumps([])

        self.drawing_data = json_str
        # has_drawing true only if non-empty array/object
        try:
            parsed = json.loads(json_str)
            self.has_drawing = bool(parsed) and (isinstance(parsed, (list, dict))) and (len(parsed) > 0 if isinstance(parsed, list) else True)
        except Exception:
            self.has_drawing = bool(json_str and json_str.strip())

        # Automatically set note type to drawing when saving drawing data
        if self.has_drawing:
            self.type = 'drawing'

        self.save()
    
    def get_drawing_strokes(self):
        """Helper method to retrieve drawing strokes as Python object"""
        if not self.drawing_data:
            return []
        try:
            return json.loads(self.drawing_data)
        except Exception:
            return []

    def __str__(self):
        return self.title

    class Meta:
        # Prefer recently accessed notes first, then recently updated
        ordering = ['-last_accessed', '-updated_at']

class Tag(models.Model):
    name = models.CharField(max_length=100)
    notes = models.ManyToManyField(Note, related_name='tags')
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tags')
    color = models.CharField(max_length=7, default='#667eea')  # Hex color for tag
    created_at = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        unique_together = ['name', 'user']  # Prevent duplicate tag names per user
        ordering = ['name']

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