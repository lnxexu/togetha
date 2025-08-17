from __future__ import absolute_import, unicode_literals
from celery import shared_task
from django.utils import timezone
from datetime import datetime, timedelta
from django.db import transaction
import logging
import pytz

logger = logging.getLogger(__name__)

def get_local_timezone():
    """Get the local timezone from Django settings"""
    from django.conf import settings
    return pytz.timezone(settings.TIME_ZONE)

def has_recent_user_activity(hours=24):
    """Check if there has been any user activity in the last N hours"""
    from django.contrib.auth.models import User
    from logs.models import UserLog
    
    try:
        local_tz = get_local_timezone()
        now_local = timezone.now().astimezone(local_tz)
        cutoff_time = now_local - timedelta(hours=hours)
        
        # Check for recent user logs
        recent_activity = UserLog.objects.filter(
            timestamp__gte=cutoff_time
        ).exists()
        
        logger.info(f"Checking user activity since {cutoff_time}: {'Found' if recent_activity else 'None'}")
        return recent_activity
        
    except Exception as e:
        logger.error(f"Error checking user activity: {str(e)}")
        # If we can't check activity, assume there is activity to be safe
        return True

@shared_task(bind=True, autoretry_for=(Exception,), retry_kwargs={'max_retries': 3, 'countdown': 60})
def check_due_tasks(self):
    """Check for tasks due today or tomorrow and create notifications"""
    try:
        # Check for recent user activity first
        if not has_recent_user_activity(24):
            logger.info("No recent user activity in the last 24 hours. Skipping task execution.")
            return {
                'status': 'skipped',
                'reason': 'no_recent_user_activity',
                'local_time': timezone.now().astimezone(get_local_timezone()).isoformat()
            }
        
        # Import here to avoid circular imports
        from task_manager.models import Task
        from notifications.models import Notification
        
        print("Running check_due_tasks...")
        logger.info("Running check_due_tasks...")
        
        # Get current time in local timezone
        local_tz = get_local_timezone()
        now_local = timezone.now().astimezone(local_tz)
        today = now_local.date()
        tomorrow = today + timedelta(days=1)
        
        print(f"Local time: {now_local}, Today: {today}, Tomorrow: {tomorrow}")
        logger.info(f"Local time: {now_local}, Today: {today}, Tomorrow: {tomorrow}")
        
        # Use transaction to ensure data consistency
        with transaction.atomic():
            # Get tasks due today (convert task due_datetime to local timezone for comparison)
            tasks_due_today = Task.objects.filter(
                due_datetime__date=today,
                completed=False
            ).select_related('user')
            
            # Get tasks due tomorrow
            tasks_due_tomorrow = Task.objects.filter(
                due_datetime__date=tomorrow,
                completed=False
            ).select_related('user')
            
            notifications_created = 0
            
            # Create notifications for tasks due today
            for task in tasks_due_today:
                # Convert task due_datetime to local timezone for better logging
                task_due_local = task.due_datetime.astimezone(local_tz) if task.due_datetime.tzinfo else task.due_datetime
                
                existing_notification = Notification.objects.filter(
                    user=task.user,
                    message__contains=f"Task '{task.title}' is due today",
                    timestamp__date=today
                ).exists()
                
                if not existing_notification:
                    notification = Notification.objects.create(
                        user=task.user,
                        type='task',
                        title='Task Due Today',
                        message=f"Task '{task.title}' is due today at {task_due_local.strftime('%I:%M %p')}!",
                        notification_type='task_due_today',
                        read=False,
                        priority='high'
                    )
                    notifications_created += 1
                    logger.info(f"Created 'due today' notification for task: {task.title} (ID: {notification.id}) at {now_local}")
            
            # Create notifications for tasks due tomorrow
            for task in tasks_due_tomorrow:
                # Convert task due_datetime to local timezone for better logging
                task_due_local = task.due_datetime.astimezone(local_tz) if task.due_datetime.tzinfo else task.due_datetime
                
                existing_notification = Notification.objects.filter(
                    user=task.user,
                    message__contains=f"Task '{task.title}' is due tomorrow",
                    timestamp__date=today
                ).exists()
                
                if not existing_notification:
                    notification = Notification.objects.create(
                        user=task.user,
                        type='task',
                        title='Task Due Tomorrow',
                        message=f"Task '{task.title}' is due tomorrow at {task_due_local.strftime('%I:%M %p')}",
                        notification_type='task_due_tomorrow',
                        read=False,
                        priority='medium'
                    )
                    notifications_created += 1
                    logger.info(f"Created 'due tomorrow' notification for task: {task.title} (ID: {notification.id}) at {now_local}")
        
        result = {
            'tasks_due_today': tasks_due_today.count(),
            'tasks_due_tomorrow': tasks_due_tomorrow.count(),
            'notifications_created': notifications_created,
            'status': 'success',
            'local_time': now_local.isoformat(),
            'timezone': str(local_tz)
        }
        
        print(f"Task completed: {result}")
        logger.info(f"Task completed: {result}")
        return result
        
    except Exception as exc:
        logger.error(f"Error in check_due_tasks: {str(exc)}", exc_info=True)
        print(f"Error in check_due_tasks: {str(exc)}")
        raise self.retry(exc=exc)

@shared_task(bind=True, autoretry_for=(Exception,), retry_kwargs={'max_retries': 3, 'countdown': 60})
def check_upcoming_task_reminders(self):
    """Check for tasks that need reminders and send them"""
    try:
        # Check for recent user activity first
        if not has_recent_user_activity(24):
            logger.info("No recent user activity in the last 24 hours. Skipping reminder checks.")
            return {
                'status': 'skipped',
                'reason': 'no_recent_user_activity',
                'local_time': timezone.now().astimezone(get_local_timezone()).isoformat()
            }
        
        # Import here to avoid circular imports
        from task_manager.models import Task
        from notifications.models import Notification
        
        print("Running check_upcoming_task_reminders...")
        logger.info("Running check_upcoming_task_reminders...")
        
        # Get current time in local timezone
        local_tz = get_local_timezone()
        now_local = timezone.now().astimezone(local_tz)
        
        # Find tasks due in the next 2-4 hours that don't have recent reminders
        reminder_window_start = now_local + timedelta(hours=2)
        reminder_window_end = now_local + timedelta(hours=4)
        
        tasks_needing_reminders = Task.objects.filter(
            due_datetime__range=(reminder_window_start, reminder_window_end),
            completed=False
        ).select_related('user')
        
        reminders_sent = 0
        
        with transaction.atomic():
            for task in tasks_needing_reminders:
                # Check if we've already sent a reminder for this task recently
                recent_reminder = Notification.objects.filter(
                    user=task.user,
                    notification_type='task_reminder',
                    message__contains=f"Task '{task.title}'",
                    timestamp__gte=now_local - timedelta(hours=6)  # No reminder in last 6 hours
                ).exists()
                
                if not recent_reminder:
                    # Send reminder using the individual task reminder function
                    send_individual_task_reminder.delay(task.id)
                    reminders_sent += 1
                    logger.info(f"Scheduled reminder for task: {task.title} (ID: {task.id})")
        
        result = {
            'tasks_checked': tasks_needing_reminders.count(),
            'reminders_sent': reminders_sent,
            'status': 'success',
            'local_time': now_local.isoformat(),
            'timezone': str(local_tz)
        }
        
        print(f"Reminder check completed: {result}")
        logger.info(f"Reminder check completed: {result}")
        return result
        
    except Exception as exc:
        logger.error(f"Error in check_upcoming_task_reminders: {str(exc)}", exc_info=True)
        print(f"Error in check_upcoming_task_reminders: {str(exc)}")
        raise self.retry(exc=exc)

@shared_task(bind=True, autoretry_for=(Exception,), retry_kwargs={'max_retries': 3, 'countdown': 60})
def send_individual_task_reminder(self, task_id):
    """Send reminder for a specific task"""
    try:
        # Import here to avoid circular imports
        from task_manager.models import Task
        from notifications.models import Notification
        
        print(f"Sending reminder for task ID: {task_id}")
        logger.info(f"Sending reminder for task ID: {task_id}")
        
        # Get current time in local timezone
        local_tz = get_local_timezone()
        now_local = timezone.now().astimezone(local_tz)
        
        task = Task.objects.select_related('user').get(id=task_id, completed=False)
        task_due_local = task.due_datetime.astimezone(local_tz) if task.due_datetime.tzinfo else task.due_datetime
        
        with transaction.atomic():
            notification = Notification.objects.create(
                user=task.user,
                type='reminder',
                title='Task Reminder',
                message=f"Reminder: Task '{task.title}' is due at {task_due_local.strftime('%I:%M %p on %B %d, %Y')}",
                notification_type='task_reminder',
                read=False,
                priority='high'
            )
        
        result = f"Reminder sent for task: {task.title} (Notification ID: {notification.id}) at {now_local}"
        logger.info(result)
        print(result)
        return result
        
    except Task.DoesNotExist:
        error_msg = f"Task with ID {task_id} not found or already completed"
        logger.error(error_msg)
        print(error_msg)
        return error_msg
    except Exception as exc:
        logger.error(f"Error in send_individual_task_reminder: {str(exc)}", exc_info=True)
        print(f"Error in send_individual_task_reminder: {str(exc)}")
        raise self.retry(exc=exc)

@shared_task
def test_celery():
    """Simple test task to verify Celery is working"""
    local_tz = get_local_timezone()
    now_local = timezone.now().astimezone(local_tz)
    message = f"Test task executed successfully at {now_local} ({local_tz})!"
    print(message)
    logger.info(message)
    return {
        'message': 'Test completed',
        'local_time': now_local.isoformat(),
        'timezone': str(local_tz)
    }