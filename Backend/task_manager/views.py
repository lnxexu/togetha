from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q
from datetime import datetime, timedelta
from .models import Task
from .serializers import TaskSerializer
from server.decorators import api_auth_required

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
            tasks = tasks.filter(due_datetime__date=today)
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
                Q(text__icontains=search_query) | 
                Q(description__icontains=search_query)
            )
            
        serializer = TaskSerializer(tasks, many=True)
        return Response(serializer.data)
    
    elif request.method == 'POST':
        serializer = TaskSerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save(user=user)
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
        serializer = TaskSerializer(task, data=request.data, partial=request.method=='PATCH', context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        task.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

@api_auth_required(['GET'])
def task_statistics(request):
    user = request.user
    user_tasks = Task.objects.filter(user=user)
    
    # Get current date for calculations
    today = datetime.now().date()
    
    # Calculate statistics
    stats = {
        'total_tasks': user_tasks.count(),
        'completed_tasks': user_tasks.filter(completed=True).count(),
        'active_tasks': user_tasks.filter(completed=False).count(),
        'overdue_tasks': user_tasks.filter(due_date__lt=today, completed=False).count(),
        'due_today': user_tasks.filter(due_datetime__date=today, completed=False).count(),
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