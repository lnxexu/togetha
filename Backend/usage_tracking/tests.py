from django.test import TestCase
from django.contrib.auth.models import User
from django.utils import timezone
from .models import UserSession, UserActivity
from .services import UsageTrackingService

class UsageTrackingTestCase(TestCase):
    def setUp(self):
        self.user = User.objects.create_user(
            username='testuser',
            email='test@example.com',
            password='testpass123'
        )
    
    def test_session_creation(self):
        session = UserSession.objects.create(
            user=self.user,
            session_id='test-session-123',
            device_type='mobile'
        )
        
        self.assertEqual(session.user, self.user)
        self.assertTrue(session.is_active)
        self.assertEqual(session.total_time_seconds, 0)
    
    def test_activity_logging(self):
        session = UserSession.objects.create(
            user=self.user,
            session_id='test-session-123'
        )
        
        activity = UserActivity.objects.create(
            user=self.user,
            session=session,
            activity_type='navigation',
            screen_name='dashboard'
        )
        
        self.assertEqual(activity.user, self.user)
        self.assertEqual(activity.session, session)
        self.assertEqual(activity.activity_type, 'navigation')
    
    def test_daily_summary_creation(self):
        # Create a session with some activity
        session = UserSession.objects.create(
            user=self.user,
            session_id='test-session-123',
            total_time_seconds=3600
        )
        
        # Create some activities
        UserActivity.objects.create(
            user=self.user,
            session=session,
            activity_type='task_complete'
        )
        
        # Update daily summary
        today = timezone.now().date()
        summary = UsageTrackingService.update_daily_summary(self.user, today)
        
        self.assertEqual(summary.user, self.user)
        self.assertEqual(summary.date, today)
        self.assertEqual(summary.tasks_completed, 1)