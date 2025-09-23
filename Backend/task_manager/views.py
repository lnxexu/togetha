from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q
from datetime import datetime, timedelta
from .models import Task
from .serializers import TaskSerializer
from server.decorators import api_auth_required
from logs.views import create_log
from notifications.views import create_notification

@api_auth_required(['GET', 'POST'])
def task_list(request):
    user = request.user
        
    if request.method == 'GET':
        # Get filter parameters
        filter_type = request.query_params.get('filter', 'all')
        category_id = request.query_params.get('category')
        search_query = request.query_params.get('search', '')
        
        tasks = Task.objects.filter(user=user)
        
        # Apply filters
        if filter_type == 'active':
            tasks = tasks.filter(completed=False)
        elif filter_type == 'completed':
            tasks = tasks.filter(completed=True)
        elif filter_type == 'today':
            today = datetime.now().date()
            tasks = tasks.filter(due_date__date=today)
        elif filter_type == 'upcoming':
            today = datetime.now().date()
            next_week = today + timedelta(days=7)
            tasks = tasks.filter(due_date__gt=today, due_date__lte=next_week)
        elif filter_type == 'overdue':
            today = datetime.now().date()
            tasks = tasks.filter(due_date__lt=today, completed=False)
        
        # Apply other filters
        if category_id:
            tasks = tasks.filter(category_id=category_id)
        
        if search_query:
            tasks = tasks.filter(
                Q(title__icontains=search_query) | 
                Q(description__icontains=search_query)
            )
            
        serializer = TaskSerializer(tasks, many=True)
        return Response(serializer.data)
    
    elif request.method == 'POST':
        data = request.data.copy()
        if 'category' in data and not data['category']:
            data['category'] = None
        serializer = TaskSerializer(data=data, context={'request': request})
        if serializer.is_valid():
            task = serializer.save(user=user)
            
            # Create log entry for task creation
            try:
                # Get the title/name field safely
                task_title = getattr(task, 'title', getattr(task, 'name', str(task.id)))
                
                create_log(
                    user=user,
                    message=f"Task '{task_title}' created",
                    action="Create",
                    entity_type="Task",
                    entity_id=task.id
                )
            except Exception as e:
                # Log the error but don't fail the task creation
                print(f"Error creating log: {str(e)}")
            
            # Create notification for task creation
            try:
                # Determine notification message based on due date
                if task.due_datetime:
                    due_date_str = task.due_datetime.strftime('%B %d, %Y at %I:%M %p')
                    notification_message = f"You've successfully created a new task '{task.title}' due on {due_date_str}. We'll remind you when it's approaching!"
                else:
                    notification_message = f"You've successfully created a new task '{task.title}'. You can set a due date to get reminders!"
                
                create_notification(
                    user=user,
                    notification_type='task',
                    title='New Task Created',
                    message=notification_message,
                    related_task=task,
                    action_id=str(task.id),
                    priority='medium',
                    specific_type='task_created'
                )
            except Exception as e:
                # Log the error but don't fail the task creation
                print(f"Error creating notification: {str(e)}")
            
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        

@api_auth_required(['GET', 'PUT', 'PATCH', 'DELETE'])
def task_detail(request, pk):
    user = request.user
    try:
        task = Task.objects.get(pk=pk, user=user)
    except Task.DoesNotExist:
        return Response({"error": "Task not found"}, status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'GET':
        serializer = TaskSerializer(task)
        return Response(serializer.data)
    
    elif request.method in ['PUT', 'PATCH']:
        # Get the appropriate field name (title or name) for the task
        task_title = getattr(task, 'title', getattr(task, 'name', str(task.id)))
        original_completed = task.completed
        
        serializer = TaskSerializer(task, data=request.data, partial=request.method=='PATCH', context={'request': request})
        if serializer.is_valid():
            updated_task = serializer.save()
            
            # Create log entry for task update
            # Build a change message that captures the significant changes
            changes = []
            updated_task_title = getattr(updated_task, 'title', getattr(updated_task, 'name', str(updated_task.id)))
            
            if updated_task_title != task_title:
                changes.append(f"title changed from '{task_title}' to '{updated_task_title}'")
            
            if updated_task.completed != original_completed:
                status_change = "completed" if updated_task.completed else "reopened"
                changes.append(f"task {status_change}")
            
            # If no specific changes detected, use a generic message
            if not changes:
                log_message = f"Task '{updated_task_title}' updated"
            else:
                log_message = f"Task '{updated_task_title}' updated: {', '.join(changes)}"
            
            try:    
                create_log(
                    user=user,
                    message=log_message,
                    action="Update",
                    entity_type="Task",
                    entity_id=task.id
                )
            except Exception as e:
                # Log the error but don't fail the task update
                print(f"Error creating log: {str(e)}")
            
            # Create notification for important task updates
            try:
                notification_created = False
                
                # Notification for task completion
                if updated_task.completed and not original_completed:
                    create_notification(
                        user=user,
                        notification_type='task',
                        title='Task Completed! 🎉',
                        message=f"Congratulations! You've successfully completed the task '{updated_task.title}'. Great job staying productive!",
                        related_task=updated_task,
                        action_id=str(updated_task.id),
                        priority='medium',
                        specific_type='task_completed'
                    )
                    notification_created = True
                
                # Notification for task reopening
                elif not updated_task.completed and original_completed:
                    create_notification(
                        user=user,
                        notification_type='task',
                        title='Task Reopened',
                        message=f"Task '{updated_task.title}' has been reopened. Don't forget to complete it!",
                        related_task=updated_task,
                        action_id=str(updated_task.id),
                        priority='medium',
                        specific_type='task_updated'
                    )
                    notification_created = True
                
                # Notification for title change (if significant)
                elif updated_task_title != task_title:
                    create_notification(
                        user=user,
                        notification_type='task',
                        title='Task Updated',
                        message=f"Task title has been updated from '{task_title}' to '{updated_task_title}'.",
                        related_task=updated_task,
                        action_id=str(updated_task.id),
                        priority='low',
                        specific_type='task_updated'
                    )
                    notification_created = True
                    
            except Exception as e:
                # Log the error but don't fail the task update
                print(f"Error creating notification: {str(e)}")
            
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        task_id = task.id
        # Get the appropriate field name (title or name) for the task
        task_title = getattr(task, 'title', getattr(task, 'name', str(task.id)))
        
        # Create notification before deleting the task
        try:
            create_notification(
                user=user,
                notification_type='task',
                title='Task Deleted',
                message=f"Task '{task_title}' has been permanently deleted from your task list.",
                action_id=str(task_id),
                priority='low',
                specific_type='task_deleted'
            )
        except Exception as e:
            # Log the error but don't fail the task deletion
            print(f"Error creating notification: {str(e)}")
        
        task.delete()
        
        # Create log entry for task deletion
        try:
            create_log(
                user=user,
                message=f"Task '{task_title}' deleted",
                action="Delete",
                entity_type="Task",
                entity_id=task_id
            )
        except Exception as e:
            # Log the error but don't fail the task deletion
            print(f"Error creating log: {str(e)}")
        
        return Response(status=status.HTTP_204_NO_CONTENT)

@api_auth_required(['GET'])
def task_statistics(request):
    user = request.user
    user_tasks = Task.objects.filter(user=user)
    
    # Get current date for calculations
    today = datetime.now().date()
    
    try:
        # Calculate statistics
        stats = {
            'total_tasks': user_tasks.count(),
            'completed_tasks': user_tasks.filter(completed=True).count(),
            'active_tasks': user_tasks.filter(completed=False).count(),
            'overdue_tasks': user_tasks.filter(due_date__lt=today, completed=False).count(),
            'due_today': user_tasks.filter(due_date__date=today, completed=False).count(),
            'high_priority': user_tasks.filter(priority='high', completed=False).count(),
            'medium_priority': user_tasks.filter(priority='medium', completed=False).count(),
            'low_priority': user_tasks.filter(priority='low', completed=False).count(),
            'recent_activity': user_tasks.filter(updated_at__gte=today-timedelta(days=7)).count()
        }
        
        # Calculate completion rate
        if stats['total_tasks'] > 0:
            stats['completion_rate'] = (stats['completed_tasks'] / stats['total_tasks']) * 100
        else:
            stats['completion_rate'] = 0
        
        return Response(stats, status=status.HTTP_200_OK)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)