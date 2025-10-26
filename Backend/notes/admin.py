from django.contrib import admin
from .models import Folder, Note

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
