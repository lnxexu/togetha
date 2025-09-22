from django.utils import timezone
from django.db.models import Sum, Count, Avg, Max
from datetime import datetime, timedelta, date
from .models import UserSession, UserActivity, DailyUsageSummary, WeeklyUsageSummary


class UsageTrackingService:
    """Service class for usage tracking operations"""
    
    @staticmethod
    def update_daily_summary(user, target_date):
        """Update or create daily usage summary for a specific date"""
        
        # Get all sessions for the target date
        sessions = UserSession.objects.filter(
            user=user,
            start_time__date=target_date
        )
        
        # Get all activities for the target date
        activities = UserActivity.objects.filter(
            user=user,
            timestamp__date=target_date
        )
        
        # Calculate metrics
        total_active_time = sessions.aggregate(
            total=Sum('total_time_seconds')
        )['total'] or 0
        
        total_idle_time = sessions.aggregate(
            total=Sum('idle_time_seconds')
        )['total'] or 0
        
        session_count = sessions.count()
        longest_session = sessions.aggregate(
            longest=Max('total_time_seconds')
        )['longest'] or 0
        
        # Activity counts
        activity_counts = activities.values('activity_type').annotate(
            count=Count('id')
        )
        
        activity_dict = {item['activity_type']: item['count'] for item in activity_counts}
        
        # Calculate additional metrics
        total_interactions = sessions.aggregate(
            total=Sum('interactions')
        )['total'] or 0
        
        screen_changes = sessions.aggregate(
            total=Sum('screen_changes')
        )['total'] or 0
        
        # Time-based metrics
        first_activity = activities.order_by('timestamp').first()
        last_activity = activities.order_by('-timestamp').first()
        
        # Calculate peak hour
        peak_hour = None
        if activities.exists():
            hourly_activity = activities.extra(
                select={'hour': 'EXTRACT(hour FROM timestamp)'}
            ).values('hour').annotate(
                count=Count('id')
            ).order_by('-count').first()
            
            if hourly_activity:
                peak_hour = int(hourly_activity['hour'])
        
        # Calculate average response time
        timed_activities = activities.filter(duration_ms__isnull=False)
        avg_response_time = timed_activities.aggregate(
            avg=Avg('duration_ms')
        )['avg']
        
        # Create or update daily summary
        summary, created = DailyUsageSummary.objects.update_or_create(
            user=user,
            date=target_date,
            defaults={
                'total_active_time_seconds': total_active_time,
                'total_idle_time_seconds': total_idle_time,
                'session_count': session_count,
                'longest_session_seconds': longest_session,
                'tasks_completed': activity_dict.get('task_complete', 0),
                'notes_created': activity_dict.get('note_create', 0),
                'notes_edited': activity_dict.get('note_edit', 0),
                'chat_messages': activity_dict.get('chat', 0),
                'file_uploads': activity_dict.get('file_upload', 0),
                'screen_changes': screen_changes,
                'total_interactions': total_interactions,
                'first_activity': first_activity.timestamp if first_activity else None,
                'last_activity': last_activity.timestamp if last_activity else None,
                'peak_hour': peak_hour,
                'average_response_time_ms': avg_response_time,
            }
        )
        
        return summary
    
    @staticmethod
    def generate_weekly_summary(user, week_start):
        """Generate or update weekly usage summary"""
        week_end = week_start + timedelta(days=6)
        
        # Get daily summaries for the week
        daily_summaries = DailyUsageSummary.objects.filter(
            user=user,
            date__gte=week_start,
            date__lte=week_end
        )
        
        # Calculate weekly metrics
        total_active_time = daily_summaries.aggregate(
            total=Sum('total_active_time_seconds')
        )['total'] or 0
        
        total_sessions = daily_summaries.aggregate(
            total=Sum('session_count')
        )['total'] or 0
        
        days_active = daily_summaries.filter(
            total_active_time_seconds__gt=300  # At least 5 minutes
        ).count()
        
        daily_average = total_active_time // 7 if total_active_time > 0 else 0
        
        # Activity totals
        total_tasks = daily_summaries.aggregate(
            total=Sum('tasks_completed')
        )['total'] or 0
        
        total_notes = daily_summaries.aggregate(
            total=Sum('notes_created')
        )['total'] or 0
        
        total_chat = daily_summaries.aggregate(
            total=Sum('chat_messages')
        )['total'] or 0
        
        total_interactions = daily_summaries.aggregate(
            total=Sum('total_interactions')
        )['total'] or 0
        
        # Calculate scores
        productivity_score = UsageTrackingService.calculate_productivity_score(
            total_active_time, total_tasks, total_notes, total_chat, days_active
        )
        
        consistency_score = UsageTrackingService.calculate_consistency_score(
            daily_summaries, days_active
        )
        
        # Create or update weekly summary
        summary, created = WeeklyUsageSummary.objects.update_or_create(
            user=user,
            week_start=week_start,
            defaults={
                'week_end': week_end,
                'total_active_time_seconds': total_active_time,
                'daily_average_seconds': daily_average,
                'days_active': days_active,
                'total_sessions': total_sessions,
                'total_tasks_completed': total_tasks,
                'total_notes_created': total_notes,
                'total_chat_messages': total_chat,
                'total_interactions': total_interactions,
                'productivity_score': productivity_score,
                'consistency_score': consistency_score,
            }
        )
        
        return summary
    
    @staticmethod
    def calculate_productivity_score(active_time, tasks, notes, chat_messages, days_active):
        """Calculate productivity score (0-100)"""
        # Base score from time spent (max 30 points)
        time_score = min((active_time / 3600) / 7, 1) * 30  # 1 hour per day target
        
        # Task completion score (max 25 points)
        task_score = min(tasks / 10, 1) * 25  # 10 tasks per week target
        
        # Content creation score (max 25 points)
        content_score = min((notes + chat_messages) / 20, 1) * 25  # 20 items per week target
        
        # Consistency score (max 20 points)
        consistency_score = (days_active / 7) * 20
        
        return int(time_score + task_score + content_score + consistency_score)
    
    @staticmethod
    def calculate_consistency_score(daily_summaries, days_active):
        """Calculate consistency score based on daily usage patterns"""
        if days_active == 0:
            return 0
        
        # Get daily active times
        daily_times = [
            summary.total_active_time_seconds 
            for summary in daily_summaries 
            if summary.total_active_time_seconds > 300
        ]
        
        if len(daily_times) < 2:
            return days_active * 15  # Base score for active days
        
        # Calculate variance in daily usage
        avg_time = sum(daily_times) / len(daily_times)
        variance = sum((time - avg_time) ** 2 for time in daily_times) / len(daily_times)
        std_dev = variance ** 0.5
        
        # Lower variance = higher consistency
        consistency_ratio = 1 - min(std_dev / avg_time, 1) if avg_time > 0 else 0
        
        return int((days_active / 7) * 50 + consistency_ratio * 50)
    
    @staticmethod
    def cleanup_old_sessions():
        """Clean up old inactive sessions (older than 30 days)"""
        cutoff_date = timezone.now() - timedelta(days=30)
        
        old_sessions = UserSession.objects.filter(
            start_time__lt=cutoff_date,
            is_active=False
        )
        
        count = old_sessions.count()
        old_sessions.delete()
        
        return count
    
    @staticmethod
    def generate_user_insights(user, days=30):
        """Generate insights about user behavior"""
        end_date = timezone.now().date()
        start_date = end_date - timedelta(days=days)
        
        daily_summaries = DailyUsageSummary.objects.filter(
            user=user,
            date__gte=start_date,
            date__lte=end_date
        ).order_by('date')
        
        if not daily_summaries.exists():
            return {}
        
        insights = {}
        
        # Usage patterns
        daily_times = [s.total_active_time_seconds for s in daily_summaries]
        insights['average_daily_time'] = sum(daily_times) / len(daily_times)
        insights['most_active_day'] = max(daily_summaries, key=lambda s: s.total_active_time_seconds).date
        insights['total_time_period'] = sum(daily_times)
        
        # Feature usage
        insights['most_used_feature'] = 'chat'  # Placeholder - could be calculated from activities
        insights['productivity_trend'] = 'stable'  # Could be calculated from engagement scores
        
        # Engagement
        engagement_scores = [s.engagement_score for s in daily_summaries]
        insights['average_engagement'] = sum(engagement_scores) / len(engagement_scores)
        insights['engagement_trend'] = 'improving' if engagement_scores[-1] > engagement_scores[0] else 'declining'
        
        return insights