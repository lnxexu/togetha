from django.contrib import admin
from .models import Task, TaskCategory, Subtask

@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('text', 'user', 'priority', 'status', 'completed', 'due_date', 'category', 'created_at')
    list_filter = ('completed', 'priority', 'status', 'due_date', 'category')
    search_fields = ('text', 'description', 'user__username')
    date_hierarchy = 'created_at'

@admin.register(TaskCategory)
class TaskCategoryAdmin(admin.ModelAdmin):
    list_display = ('name', 'user', 'color', 'created_at')
    list_filter = ('created_at',)
    search_fields = ('name', 'user__username')

@admin.register(Subtask)
class SubtaskAdmin(admin.ModelAdmin):
    list_display = ('text', 'task', 'completed', 'created_at')
    list_filter = ('completed', 'created_at')
    search_fields = ('text', 'task__text')