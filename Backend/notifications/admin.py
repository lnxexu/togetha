from django.contrib import admin
from .models import Notification

@admin.register(Notification)
class NotificationAdmin(admin.ModelAdmin):
    list_display = ('user', 'title', 'type', 'read', 'timestamp')
    list_filter = ('read', 'type', 'priority')
    search_fields = ('title', 'message', 'user__username')