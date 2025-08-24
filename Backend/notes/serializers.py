from rest_framework import serializers
from .models import Folder, Note, Tag, AudioRecording

class TagSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tag
        fields = ['id', 'name']

class NoteSerializer(serializers.ModelSerializer):
    tags = TagSerializer(many=True, read_only=True)
    tag_names = serializers.ListField(child=serializers.CharField(), write_only=True, required=False)
    drawing_strokes = serializers.JSONField(source='drawing_data', required=False)
    folder_name = serializers.CharField(source='folder.name', read_only=True)
    folder_color = serializers.CharField(source='folder.color', read_only=True)

    class Meta:
        model = Note
        fields = [
            'id', 'title', 'content', 'created_at', 'updated_at', 
            'drawing_strokes', 'drawing_thumbnail', 
            'last_drawing_update', 'tag_names', 'formatted_content', 'tags',
            'type', 'folder', 'folder_name', 'folder_color', 'has_drawing', 'drawing_data'
        ]
        read_only_fields = ['created_at', 'updated_at', 'last_drawing_update', 'folder_name', 'folder_color']
    
    
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

         # Handle drawing data specially
        if 'drawing_data' in validated_data:
            instance.save_drawing_strokes(validated_data.pop('drawing_data'))
            return super().update(instance, validated_data)
        
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