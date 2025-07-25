from rest_framework import serializers
from .models import Folder, Note, Tag, AudioRecording

class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ['id', 'name']

class AudioRecordingSerializer(serializers.ModelSerializer):
    class Meta:
        model = AudioRecording
        fields = ['id', 'audio_file', 'duration', 'transcribed', 'transcription', 'created_at']

class NoteSerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True, read_only=True)
    audio_recordings = AudioRecordingSerializer(many=True, read_only=True)
    
    class Meta:
        model = Note
        fields = ['id', 'title', 'content', 'folder', 'type', 'is_archived', 
                  'created_at', 'updated_at', 'tags', 'audio_recordings']
    
    def create(self, validated_data):
        # Extract tags data if provided in the request
        tags_data = self.context.get('request').data.get('tags', [])
        note = Note.objects.create(**validated_data)
        
        # Associate user with the note
        note.user = self.context['request'].user
        note.save()
        
        # Handle tags
        if tags_data:
            for tag_name in tags_data:
                tag, _ = Tag.objects.get_or_create(
                    name=tag_name,
                    user=note.user
                )
                note.tags.add(tag)
                
        return note

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