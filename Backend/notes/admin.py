from django.contrib import admin
from .models import Folder, Note, Tag, AudioRecording

@admin.register(Folder)
class FolderAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'created_at', 'updated_at')
    search_fields = ('name', 'user__username')
    list_filter = ('created_at',)
    ordering = ('-created_at',)

@admin.register(Note)
class NoteAdmin(admin.ModelAdmin):
    list_display = ('title', 'type', 'folder', 'user', 'is_archived', 'created_at', 'updated_at')
    search_fields = ('title', 'content', 'user__username')
    list_filter = ('type', 'is_archived', 'created_at')

@admin.register(Tag)
class TagAdmin(admin.ModelAdmin):
    list_display = ('name', 'user')
    search_fields = ('name',)

@admin.register(AudioRecording)
class AudioRecordingAdmin(admin.ModelAdmin):
    list_display = ('note', 'duration', 'transcribed', 'created_at')
    list_filter = ('transcribed', 'created_at')