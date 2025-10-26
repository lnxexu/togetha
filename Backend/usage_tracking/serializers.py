from rest_framework import serializers
from .models import UserSession, UserActivity, DailyUsageSummary, WeeklyUsageSummary

class UserSessionSerializer(serializers.ModelSerializer):
    active_time_minutes = serializers.SerializerMethodField()
    
    class Meta:
        model = UserSession
        fields = [
            'id', 'session_id', 'device_type', 'start_time', 'end_time',
            'last_activity', 'is_active', 'total_time_seconds',
            'active_time_minutes', 'screen_changes', 'interactions'
        ]
        read_only_fields = ['id', 'start_time', 'last_activity']
    
    def get_active_time_minutes(self, obj):
        return obj.total_time_seconds // 60


class UserActivitySerializer(serializers.ModelSerializer):
    class Meta:
        model = UserActivity
        fields = [
            'id', 'activity_type', 'screen_name', 'details',
            'timestamp', 'duration_ms'
        ]
        read_only_fields = ['id', 'timestamp']


class DailyUsageSummarySerializer(serializers.ModelSerializer):
    total_time_minutes = serializers.SerializerMethodField()
    engagement_score = serializers.SerializerMethodField()
    
    class Meta:
        model = DailyUsageSummary
        fields = [
            'date', 'total_active_time_seconds', 'total_time_minutes',
            'session_count', 'longest_session_seconds', 'tasks_completed',
            'notes_created', 'notes_edited', 'chat_messages', 'file_uploads',
            'screen_changes', 'total_interactions', 'first_activity',
            'last_activity', 'peak_hour', 'engagement_score'
        ]
    
    def get_total_time_minutes(self, obj):
        return obj.total_time_minutes
    
    def get_engagement_score(self, obj):
        return obj.engagement_score


class WeeklyUsageSummarySerializer(serializers.ModelSerializer):
    daily_average_minutes = serializers.SerializerMethodField()
    
    class Meta:
        model = WeeklyUsageSummary
        fields = [
            'week_start', 'week_end', 'total_active_time_seconds',
            'daily_average_seconds', 'daily_average_minutes', 'days_active',
            'total_sessions', 'total_tasks_completed', 'total_notes_created',
            'total_chat_messages', 'total_interactions', 'productivity_score',
            'consistency_score'
        ]
    
    def get_daily_average_minutes(self, obj):
        return obj.daily_average_seconds // 60


class UsageStatsSerializer(serializers.Serializer):
    """Comprehensive usage statistics serializer"""
    today = DailyUsageSummarySerializer()
    this_week = WeeklyUsageSummarySerializer()
    current_session = UserSessionSerializer()
    recent_activities = UserActivitySerializer(many=True)
    
    # Summary statistics
    total_time_today_minutes = serializers.IntegerField()
    total_time_this_week_minutes = serializers.IntegerField()
    streak_days = serializers.IntegerField()
    average_daily_time_minutes = serializers.IntegerField()
    most_used_features = serializers.ListField(child=serializers.DictField())
    productivity_trend = serializers.CharField()  # 'up', 'down', 'stable'