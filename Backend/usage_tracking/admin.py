from django.contrib import admin
from .models import UserSession, UserActivity, DailyUsageSummary, WeeklyUsageSummary


@admin.register(UserSession)
class UserSessionAdmin(admin.ModelAdmin):
    list_display = ['user', 'start_time', 'end_time', 'is_active', 'total_time_seconds', 'device_type']
    list_filter = ['is_active', 'device_type', 'start_time']
    search_fields = ['user__username', 'session_id', 'device_id']
    readonly_fields = ['session_id', 'start_time', 'last_activity']
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user')


@admin.register(UserActivity)
class UserActivityAdmin(admin.ModelAdmin):
    list_display = ['user', 'activity_type', 'screen_name', 'timestamp', 'duration_ms']
    list_filter = ['activity_type', 'screen_name', 'timestamp']
    search_fields = ['user__username', 'activity_type', 'screen_name']
    readonly_fields = ['timestamp']
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user', 'session')


@admin.register(DailyUsageSummary)
class DailyUsageSummaryAdmin(admin.ModelAdmin):
    list_display = ['user', 'date', 'total_active_time_seconds', 'session_count', 'engagement_score']
    list_filter = ['date', 'session_count']
    search_fields = ['user__username']
    readonly_fields = ['created_at', 'updated_at']
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user')


@admin.register(WeeklyUsageSummary)
class WeeklyUsageSummaryAdmin(admin.ModelAdmin):
    list_display = ['user', 'week_start', 'week_end', 'days_active', 'productivity_score', 'consistency_score']
    list_filter = ['week_start', 'days_active']
    search_fields = ['user__username']
    readonly_fields = ['created_at', 'updated_at']
    
    def get_queryset(self, request):
        return super().get_queryset(request).select_related('user')