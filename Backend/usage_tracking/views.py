from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status
from rest_framework.permissions import IsAuthenticated
from django.utils import timezone
from django.db.models import Sum, Avg, Count, Q
from datetime import datetime, timedelta, date
import uuid
import json

from .models import UserSession, UserActivity, DailyUsageSummary, WeeklyUsageSummary
from .serializers import (
    UserSessionSerializer, UserActivitySerializer, 
    DailyUsageSummarySerializer, WeeklyUsageSummarySerializer,
    UsageStatsSerializer
)
from .services import UsageTrackingService


class SessionTrackingView(APIView):
    """Handle session start/end and activity tracking"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        action = request.data.get('action')
        
        if action == 'start_session':
            return self.start_session(request)
        elif action == 'end_session':
            return self.end_session(request)
        elif action == 'heartbeat':
            return self.update_activity(request)
        elif action == 'log_activity':
            return self.log_activity(request)
        else:
            return Response({'error': 'Invalid action'}, status=status.HTTP_400_BAD_REQUEST)
    
    def start_session(self, request):
        """Start a new user session"""
        device_id = request.data.get('device_id', '')
        device_type = request.data.get('device_type', 'mobile')
        app_version = request.data.get('app_version', '')
        
        # End any existing active sessions for this user
        UserSession.objects.filter(
            user=request.user, 
            is_active=True
        ).update(
            is_active=False,
            end_time=timezone.now()
        )
        
        # Create new session
        session = UserSession.objects.create(
            user=request.user,
            session_id=str(uuid.uuid4()),
            device_id=device_id,
            device_type=device_type,
            app_version=app_version
        )
        
        # Log login activity
        UserActivity.objects.create(
            user=request.user,
            session=session,
            activity_type='login',
            details={'device_type': device_type, 'app_version': app_version}
        )
        
        return Response({
            'session_id': session.session_id,
            'message': 'Session started successfully'
        })
    
    def end_session(self, request):
        """End the current user session"""
        session_id = request.data.get('session_id')
        
        try:
            session = UserSession.objects.get(
                session_id=session_id,
                user=request.user,
                is_active=True
            )
            
            session.end_session()
            
            # Log logout activity
            UserActivity.objects.create(
                user=request.user,
                session=session,
                activity_type='logout'
            )
            
            # Update daily summary
            UsageTrackingService.update_daily_summary(request.user, session.start_time.date())
            
            return Response({'message': 'Session ended successfully'})
            
        except UserSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def update_activity(self, request):
        """Update last activity timestamp (heartbeat)"""
        session_id = request.data.get('session_id')
        
        try:
            session = UserSession.objects.get(
                session_id=session_id,
                user=request.user,
                is_active=True
            )
            
            session.last_activity = timezone.now()
            session.interactions = session.interactions + 1
            session.save()
            
            return Response({'message': 'Activity updated'})
            
        except UserSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)
    
    def log_activity(self, request):
        """Log a specific user activity"""
        session_id = request.data.get('session_id')
        activity_type = request.data.get('activity_type')
        screen_name = request.data.get('screen_name', '')
        details = request.data.get('details', {})
        duration_ms = request.data.get('duration_ms')
        
        try:
            session = UserSession.objects.get(
                session_id=session_id,
                user=request.user,
                is_active=True
            )
            
            activity = UserActivity.objects.create(
                user=request.user,
                session=session,
                activity_type=activity_type,
                screen_name=screen_name,
                details=details,
                duration_ms=duration_ms
            )
            
            # Update session counters
            if activity_type == 'navigation':
                session.screen_changes += 1
                session.save()
            
            return Response({
                'activity_id': activity.id,
                'message': 'Activity logged successfully'
            })
            
        except UserSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)


class UsageStatsView(APIView):
    """Get comprehensive usage statistics"""
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        period = request.query_params.get('period', 'today')
        
        if period == 'today':
            return self.get_today_stats(request)
        elif period == 'week':
            return self.get_week_stats(request)
        elif period == 'month':
            return self.get_month_stats(request)
        elif period == 'year':
            return self.get_year_stats(request)
        elif period == 'comprehensive':
            return self.get_comprehensive_stats(request)
        else:
            return Response({'error': 'Invalid period'}, status=status.HTTP_400_BAD_REQUEST)
    
    def get_today_stats(self, request):
        """Get today's usage statistics"""
        today = timezone.now().date()
        
        try:
            daily_summary = DailyUsageSummary.objects.get(
                user=request.user,
                date=today
            )
        except DailyUsageSummary.DoesNotExist:
            # Create empty summary for today
            daily_summary = DailyUsageSummary.objects.create(
                user=request.user,
                date=today
            )
        
        serializer = DailyUsageSummarySerializer(daily_summary)
        return Response(serializer.data)
    
    def get_week_stats(self, request):
        """Get this week's usage statistics"""
        today = timezone.now().date()
        week_start = today - timedelta(days=today.weekday())
        
        try:
            weekly_summary = WeeklyUsageSummary.objects.get(
                user=request.user,
                week_start=week_start
            )
        except WeeklyUsageSummary.DoesNotExist:
            # Generate weekly summary
            weekly_summary = UsageTrackingService.generate_weekly_summary(
                request.user, week_start
            )
        
        serializer = WeeklyUsageSummarySerializer(weekly_summary)
        return Response(serializer.data)
    
    def get_comprehensive_stats(self, request):
        """Get comprehensive usage statistics for dashboard"""
        user = request.user
        today = timezone.now().date()
        week_start = today - timedelta(days=today.weekday())
        
        # Get or create today's summary
        today_summary, _ = DailyUsageSummary.objects.get_or_create(
            user=user, date=today
        )
        
        # Get or create this week's summary
        week_summary = UsageTrackingService.generate_weekly_summary(user, week_start)
        
        # Get current session
        current_session = UserSession.objects.filter(
            user=user, is_active=True
        ).first()
        
        # Get recent activities
        recent_activities = UserActivity.objects.filter(
            user=user
        ).order_by('-timestamp')[:10]
        
        # Calculate additional metrics
        total_time_today = today_summary.total_active_time_seconds // 60
        total_time_week = week_summary.total_active_time_seconds // 60
        
        # Calculate streak
        streak_days = self.calculate_streak(user)
        
        # Calculate average daily time (last 30 days)
        thirty_days_ago = today - timedelta(days=30)
        avg_daily = DailyUsageSummary.objects.filter(
            user=user,
            date__gte=thirty_days_ago
        ).aggregate(
            avg_time=Avg('total_active_time_seconds')
        )['avg_time'] or 0
        
        # Most used features
        most_used_features = self.get_most_used_features(user, today)
        
        # Productivity trend
        productivity_trend = self.get_productivity_trend(user)
        
        data = {
            'today': DailyUsageSummarySerializer(today_summary).data,
            'this_week': WeeklyUsageSummarySerializer(week_summary).data,
            'current_session': UserSessionSerializer(current_session).data if current_session else None,
            'recent_activities': UserActivitySerializer(recent_activities, many=True).data,
            'total_time_today_minutes': total_time_today,
            'total_time_this_week_minutes': total_time_week,
            'streak_days': streak_days,
            'average_daily_time_minutes': int(avg_daily // 60),
            'most_used_features': most_used_features,
            'productivity_trend': productivity_trend,
        }
        
        return Response(data)
    
    def calculate_streak(self, user):
        """Calculate current usage streak in days"""
        today = timezone.now().date()
        streak = 0
        current_date = today
        
        while True:
            if DailyUsageSummary.objects.filter(
                user=user,
                date=current_date,
                total_active_time_seconds__gt=300  # At least 5 minutes
            ).exists():
                streak += 1
                current_date -= timedelta(days=1)
            else:
                break
        
        return streak
    
    def get_most_used_features(self, user, date):
        """Get most used features for a specific date"""
        activities = UserActivity.objects.filter(
            user=user,
            timestamp__date=date
        ).values('activity_type').annotate(
            count=Count('id')
        ).order_by('-count')[:5]
        
        feature_names = {
            'chat': 'AI Chat',
            'task_create': 'Task Management',
            'note_create': 'Note Taking',
            'navigation': 'Navigation',
            'file_upload': 'File Upload'
        }
        
        return [
            {
                'feature': feature_names.get(activity['activity_type'], activity['activity_type']),
                'count': activity['count']
            }
            for activity in activities
        ]
    
    def get_productivity_trend(self, user):
        """Determine productivity trend based on recent days"""
        today = timezone.now().date()
        last_7_days = today - timedelta(days=7)
        prev_7_days = last_7_days - timedelta(days=7)
        
        recent_avg = DailyUsageSummary.objects.filter(
            user=user,
            date__gte=last_7_days,
            date__lt=today
        ).aggregate(
            avg_score=Avg('engagement_score')
        )['avg_score'] or 0
        
        previous_avg = DailyUsageSummary.objects.filter(
            user=user,
            date__gte=prev_7_days,
            date__lt=last_7_days
        ).aggregate(
            avg_score=Avg('engagement_score')
        )['avg_score'] or 0
        
        if recent_avg > previous_avg * 1.1:
            return 'up'
        elif recent_avg < previous_avg * 0.9:
            return 'down'
        else:
            return 'stable'


class IdleDetectionView(APIView):
    """Handle idle detection events"""
    permission_classes = [IsAuthenticated]
    
    def post(self, request):
        session_id = request.data.get('session_id')
        action = request.data.get('action')  # 'idle_start' or 'idle_end'
        idle_duration = request.data.get('idle_duration', 0)  # in seconds
        
        try:
            session = UserSession.objects.get(
                session_id=session_id,
                user=request.user,
                is_active=True
            )
            
            if action == 'idle_start':
                UserActivity.objects.create(
                    user=request.user,
                    session=session,
                    activity_type='idle_start',
                    details={'timestamp': timezone.now().isoformat()}
                )
            elif action == 'idle_end':
                # Log idle end and update session idle time
                UserActivity.objects.create(
                    user=request.user,
                    session=session,
                    activity_type='idle_end',
                    details={
                        'idle_duration_seconds': idle_duration,
                        'timestamp': timezone.now().isoformat()
                    }
                )
                
                session.idle_time_seconds += idle_duration
                session.save()
            
            return Response({'message': f'Idle {action} logged successfully'})
            
        except UserSession.DoesNotExist:
            return Response({'error': 'Session not found'}, status=status.HTTP_404_NOT_FOUND)