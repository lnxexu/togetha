from django.db import models
from django.contrib.auth.models import User
from django.utils import timezone 

class UserSession(models.Model):
    """Track user app sessions with idle detection"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='app_sessions')
    session_id = models.CharField(max_length=255, unique=True)
    device_id = models.CharField(max_length=255, blank=True)
    device_type = models.CharField(max_length=50, blank=True)  # 'mobile', 'tablet', 'desktop'
    app_version = models.CharField(max_length=50, blank=True)
    
    # Session tracking
    start_time = models.DateTimeField(auto_now_add=True)
    end_time = models.DateTimeField(null=True, blank=True)
    last_activity = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    
    # Usage metrics
    total_time_seconds = models.IntegerField(default=0)  # Total active time in seconds
    idle_time_seconds = models.IntegerField(default=0)   # Time spent idle
    
    # Activity counters
    screen_changes = models.IntegerField(default=0)
    interactions = models.IntegerField(default=0)  # Taps, swipes, etc.
    
    class Meta:
        ordering = ['-start_time']
        indexes = [
            models.Index(fields=['user', 'start_time']),
            models.Index(fields=['session_id']),
            models.Index(fields=['is_active']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.start_time.strftime('%Y-%m-%d %H:%M')}"
    
    def calculate_active_time(self):
        """Calculate total active time (excluding idle periods)"""
        if self.end_time:
            total_session = (self.end_time - self.start_time).total_seconds()
        else:
            total_session = (timezone.now() - self.start_time).total_seconds()
        
        return max(0, total_session - self.idle_time_seconds)
    
    def end_session(self):
        """End the current session"""
        if self.is_active:
            self.end_time = timezone.now()
            self.is_active = False
            self.total_time_seconds = int(self.calculate_active_time())
            self.save()


class UserActivity(models.Model):
    """Track detailed user activities"""
    ACTIVITY_TYPES = [
        ('navigation', 'Navigation'),
        ('interaction', 'Interaction'),
        ('chat', 'Chat Message'),
        ('task_create', 'Task Created'),
        ('task_complete', 'Task Completed'),
        ('note_create', 'Note Created'),
        ('note_edit', 'Note Edited'),
        ('file_upload', 'File Upload'),
        ('profile_update', 'Profile Update'),
        ('login', 'Login'),
        ('logout', 'Logout'),
        ('idle_start', 'Idle Started'),
        ('idle_end', 'Idle Ended'),
    ]
    
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='activities')
    session = models.ForeignKey(UserSession, on_delete=models.CASCADE, related_name='activities')
    activity_type = models.CharField(max_length=50, choices=ACTIVITY_TYPES)
    screen_name = models.CharField(max_length=100, blank=True) 
    details = models.JSONField(default=dict, blank=True)  
    timestamp = models.DateTimeField(auto_now_add=True)
    duration_ms = models.IntegerField(null=True, blank=True) 
    
    class Meta:
        ordering = ['-timestamp']
        indexes = [
            models.Index(fields=['user', 'timestamp']),
            models.Index(fields=['session', 'timestamp']),
            models.Index(fields=['activity_type']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.activity_type} at {self.timestamp}"


class DailyUsageSummary(models.Model):
    """Daily aggregated usage statistics"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='daily_usage')
    date = models.DateField()
    
    # Time tracking
    total_active_time_seconds = models.IntegerField(default=0)
    total_idle_time_seconds = models.IntegerField(default=0)
    session_count = models.IntegerField(default=0)
    longest_session_seconds = models.IntegerField(default=0)
    
    # Activity counters
    tasks_completed = models.IntegerField(default=0)
    notes_created = models.IntegerField(default=0)
    notes_edited = models.IntegerField(default=0)
    chat_messages = models.IntegerField(default=0)
    file_uploads = models.IntegerField(default=0)
    screen_changes = models.IntegerField(default=0)
    total_interactions = models.IntegerField(default=0)
    
    # Engagement metrics
    first_activity = models.DateTimeField(null=True, blank=True)
    last_activity = models.DateTimeField(null=True, blank=True)
    peak_hour = models.IntegerField(null=True, blank=True)  # Hour of day with most activity
    
    # Performance metrics
    average_response_time_ms = models.FloatField(null=True, blank=True)
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-date']
        unique_together = ['user', 'date']
        indexes = [
            models.Index(fields=['user', 'date']),
            models.Index(fields=['date']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - {self.date}"
    
    @property
    def total_time_minutes(self):
        return self.total_active_time_seconds // 60
    
    @property
    def engagement_score(self):
        """Calculate a simple engagement score based on activity"""
        base_score = min(self.total_active_time_seconds / 3600, 1) * 40  # Max 40 points for time
        interaction_score = min(self.total_interactions / 100, 1) * 30  # Max 30 points for interactions
        feature_score = min((self.tasks_completed + self.notes_created + self.chat_messages) / 10, 1) * 30
        return int(base_score + interaction_score + feature_score)


class WeeklyUsageSummary(models.Model):
    """Weekly aggregated usage statistics"""
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name='weekly_usage')
    week_start = models.DateField()  # Monday of the week
    week_end = models.DateField()    # Sunday of the week
    
    # Aggregated metrics
    total_active_time_seconds = models.IntegerField(default=0)
    daily_average_seconds = models.IntegerField(default=0)
    days_active = models.IntegerField(default=0)
    total_sessions = models.IntegerField(default=0)
    
    # Activity totals
    total_tasks_completed = models.IntegerField(default=0)
    total_notes_created = models.IntegerField(default=0)
    total_chat_messages = models.IntegerField(default=0)
    total_interactions = models.IntegerField(default=0)
    
    # Productivity metrics
    productivity_score = models.IntegerField(default=0)  # 0-100 scale
    consistency_score = models.IntegerField(default=0)   # Based on daily usage consistency
    
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        ordering = ['-week_start']
        unique_together = ['user', 'week_start']
        indexes = [
            models.Index(fields=['user', 'week_start']),
            models.Index(fields=['week_start']),
        ]
    
    def __str__(self):
        return f"{self.user.username} - Week of {self.week_start}"