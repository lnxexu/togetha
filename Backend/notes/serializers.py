from rest_framework import serializers
from .models import Folder, Note

class NoteSerializer(serializers.ModelSerializer):
    drawing_strokes = serializers.JSONField(source='drawing_data', required=False)
    folder_name = serializers.CharField(source='folder.name', read_only=True)
    folder_color = serializers.CharField(source='folder.color', read_only=True)
    document_content = serializers.CharField(required=False, write_only=True)  # For base64 encoded content
    document_url = serializers.SerializerMethodField()
    document_annotations = serializers.JSONField(required=False)
    title = serializers.CharField(required=False, allow_blank=True, default='Untitled Note')

    class Meta:
        model = Note
        fields = [
            'id', 'title', 'content', 'created_at', 'updated_at', 
            'drawing_strokes', 'drawing_thumbnail', 
            'last_drawing_update','formatted_content',
            'type', 'folder', 'folder_name', 'folder_color', 'has_drawing', 'drawing_data',
            'document_content', 'document_filename', 'document_content_type', 'document_url', 'document_annotations', 'document_metadata',
            'version', 'last_modified_by', 'content_hash', 'auto_save_enabled',
            'last_auto_save', 'manual_save_count', 'auto_save_count', 'last_accessed'
        ]
        read_only_fields = ['id', 'created_at', 'updated_at', 'last_drawing_update', 'folder_name', 'folder_color', 'last_modified_by', 'content_hash', 'last_auto_save', 'manual_save_count', 'auto_save_count', 'last_accessed']
    
    def validate_title(self, value):
        """Ensure title is never completely empty"""
        if not value or not value.strip():
            return 'Untitled Note'
        return value
    
    def get_document_url(self, obj):
        """Generate the full URL for the document file.

        Prefer the stored `document_file` (served by Django's media files). If
        not present, fall back to the binary `document_content` served by the
        `serve_document` endpoint.
        """
        request = self.context.get('request')
        # Prefer file field URL when available
        if getattr(obj, 'document_file', None):
            try:
                file_url = obj.document_file.url
                if request:
                    return request.build_absolute_uri(file_url)
                return file_url
            except Exception:
                # If storage doesn't provide a URL, fall back
                pass

        # Fallback to serve endpoint when binary content is used
        if obj.document_content and obj.document_filename:
            if request:
                return request.build_absolute_uri(f'/note_taking/documents/{obj.id}/serve/')
            else:
                return f'/note_taking/documents/{obj.id}/serve/'

        return None
    
    
    def create(self, validated_data):
        from django.utils import timezone
        note = Note.objects.create(**validated_data)
        note.user = self.context['request'].user
        # Set last_accessed to current time for newly created notes
        note.last_accessed = timezone.now()
        note.save()
        return note
        
    def update(self, instance, validated_data):
         # Handle drawing data specially
        if 'drawing_data' in validated_data:
            instance.save_drawing_strokes(validated_data.pop('drawing_data'))
            return super().update(instance, validated_data)
        
        # Handle document content if provided as base64 string
        if 'document_content' in validated_data:
            import base64
            content_b64 = validated_data.pop('document_content')
            if content_b64:
                try:
                    instance.document_content = base64.b64decode(content_b64)
                except Exception:
                    raise serializers.ValidationError("Invalid base64 document content")
            else:
                instance.document_content = None
                instance.document_filename = None
                instance.document_content_type = None
        
        # Update the instance
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
                
        return instance

class FolderSerializer(serializers.ModelSerializer):
    notes_count = serializers.SerializerMethodField()
    
    class Meta:
        model = Folder
        fields = ['id', 'name', 'description', 'color', 'created_at', 'updated_at', 'notes_count']
    
    def get_notes_count(self, obj):
        return obj.notes.count()
    
    def create(self, validated_data):
        # Associate user with the folder
        validated_data['user'] = self.context['request'].user
        return super().create(validated_data)