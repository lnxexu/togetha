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
    tag_names = serializers.ListField(child=serializers.CharField(), write_only=True, required=False)
    
    class Meta:
        model = Note
        fields = ['id', 'title', 'content', 'formatted_content', 'folder', 'type', 'is_archived', 
                  'created_at', 'updated_at', 'tags', 'audio_recordings', 'tag_names']
    
    def create(self, validated_data):
        # Extract tags data if provided in the request
        tag_names = validated_data.pop('tag_names', [])
        
        note = Note.objects.create(**validated_data)
        
        # Associate user with the note
        note.user = self.context['request'].user
        note.save()
        
        # Handle tags
        if tag_names:
            for tag_name in tag_names:
                tag, _ = Tag.objects.get_or_create(
                    name=tag_name,
                    user=note.user
                )
                note.tags.add(tag)
                
        return note
        
    def update(self, instance, validated_data):
        tag_names = validated_data.pop('tag_names', None)
        
        # Update the instance
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        
        # Update tags if provided
        if tag_names is not None:
            # Clear existing tags
            instance.tags.clear()
            
            # Add new tags
            for tag_name in tag_names:
                tag, _ = Tag.objects.get_or_create(
                    name=tag_name,
                    user=instance.user
                )
                instance.tags.add(tag)
                
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