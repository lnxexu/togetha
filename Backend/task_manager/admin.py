from django.contrib import admin
from .models import Task

@admin.register(Task)
class TaskAdmin(admin.ModelAdmin):
    list_display = ('title', 'user', 'priority', 'completed', 'due_datetime', 'created_at')
    list_filter = ('completed', 'priority', 'due_datetime')
    search_fields = ('title', 'description', 'user__username')
    date_hierarchy = 'created_at'

