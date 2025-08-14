from django.contrib import admin
from .models import Log

@admin.register(Log)
class LogAdmin(admin.ModelAdmin):
    list_display = ('level', 'action', 'message', 'user', 'timestamp', 'read')
    list_filter = ('level', 'read', 'timestamp')
    search_fields = ('message', 'action', 'user__username')
    date_hierarchy = 'timestamp'