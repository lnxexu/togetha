from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils import timezone
from datetime import datetime, timedelta
from .tasks import check_due_tasks, send_individual_task_reminder
from task_manager.models import Task
from notifications.models import Notification
from django_celery_beat.models import PeriodicTask, CrontabSchedule
import json

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def schedule_task_reminder(request):
    """Schedule a reminder for a specific task"""
    task_id = request.data.get('task_id')
    reminder_datetime = request.data.get('reminder_datetime')
    
    if not task_id or not reminder_datetime:
        return Response(
            {'error': 'task_id and reminder_datetime are required'}, 
            status=status.HTTP_400_BAD_REQUEST
        )
    
    try:
        task = Task.objects.get(id=task_id, user=request.user)
        reminder_time = datetime.fromisoformat(reminder_datetime.replace('Z', '+00:00'))
        
        # Schedule the task
        send_individual_task_reminder.apply_async(
            args=[task_id],
            eta=reminder_time
        )
        
        return Response({
            'message': f'Reminder scheduled for task: {task.title}',
            'scheduled_time': reminder_time
        })
        
    except Task.DoesNotExist:
        return Response(
            {'error': 'Task not found'}, 
            status=status.HTTP_404_NOT_FOUND
        )
    except ValueError:
        return Response(
            {'error': 'Invalid datetime format'}, 
            status=status.HTTP_400_BAD_REQUEST
        )

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def trigger_due_tasks_check(request):
    """Manually trigger check for due tasks"""
    if request.user.is_staff:  # Only allow admin users
        result = check_due_tasks.delay()
        return Response({
            'message': 'Due tasks check triggered',
            'task_id': result.id
        })
    else:
        return Response(
            {'error': 'Permission denied'}, 
            status=status.HTTP_403_FORBIDDEN
        )

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_user_upcoming_tasks(request):
    """Get user's upcoming tasks that need reminders"""
    now = timezone.now()
    upcoming_tasks = Task.objects.filter(
        user=request.user,
        completed=False,  # Changed from is_completed
        due_date__gte=now,  # Changed from due_datetime
        due_date__lte=now + timedelta(days=7)  # Changed from due_datetime
    ).order_by('due_date')  # Changed from due_datetime
    
    task_data = []
    for task in upcoming_tasks:
        task_data.append({
            'id': task.id,
            'title': task.title,
            'due_date': task.due_date,  # Changed from due_datetime
            'priority': task.priority
        })
    
    return Response({
        'upcoming_tasks': task_data,
        'count': len(task_data)
    })

# Add this new debug endpoint
@api_view(['POST'])
@permission_classes([IsAuthenticated])
def test_scheduler(request):
    """Test the scheduler functionality immediately"""
    try:
        # Run the task immediately for testing
        result = check_due_tasks.apply()
        
        # Get recent notifications for this user
        recent_notifications = Notification.objects.filter(
            user=request.user,
            timestamp__gte=timezone.now() - timedelta(minutes=5)
        ).values('title', 'message', 'notification_type', 'timestamp')
        
        return Response({
            'message': 'Scheduler test completed',
            'result': result,
            'recent_notifications': list(recent_notifications)
        })
    except Exception as e:
        return Response(
            {'error': str(e)}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )