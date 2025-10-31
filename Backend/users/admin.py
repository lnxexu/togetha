from django.contrib import admin
from .models import PasswordResetCode
from .models import SendGridEvent

@admin.register(PasswordResetCode)
class PasswordResetCodeAdmin(admin.ModelAdmin):
    list_display = ('email', 'code', 'created_at', 'expires_at', 'is_used')
    list_filter = ('is_used', 'created_at', 'expires_at')
    search_fields = ('email',)
    readonly_fields = ('created_at',)
    ordering = ('-created_at',)


@admin.register(SendGridEvent)
class SendGridEventAdmin(admin.ModelAdmin):
    list_display = ('email', 'event', 'app_message_id', 'sg_message_id', 'timestamp', 'created_at')
    search_fields = ('email', 'app_message_id', 'sg_message_id')
    list_filter = ('event',)
    readonly_fields = ('raw', 'created_at')
    ordering = ('-timestamp',)

