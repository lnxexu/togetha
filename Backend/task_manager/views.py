from rest_framework.decorators import api_view, authentication_classes, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from rest_framework.response import Response
from rest_framework import status
from django.db.models import Q
from datetime import datetime, timedelta
from .models import Task, TaskCategory, Subtask
from .serializers import TaskSerializer, TaskCategorySerializer, SubtaskSerializer

@api_view(['GET', 'POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def task_list(request):
    if request.method == 'GET':
        filter_type = request.query_params.get('filter', 'all')
        category_id = request.query_params.get('category')
        search_query = request.query_params.get('search', '')
        
        tasks = Task.objects.filter(user=request.user)
        
        # Apply filters
        if filter_type == 'active':
            tasks = tasks.filter(completed=False)
        elif filter_type == 'completed':
            tasks = tasks.filter(completed=True)
        elif filter_type == 'today':
            today = datetime.now().date()
            tasks = tasks.filter(due_date=today)
        elif filter_type == 'upcoming':
            today = datetime.now().date()
            next_week = today + timedelta(days=7)
            tasks = tasks.filter(due_date__gt=today, due_date__lte=next_week)
        elif filter_type == 'overdue':
            today = datetime.now().date()
            tasks = tasks.filter(due_date__lt=today, completed=False)
        
        # Filter by category if provided
        if category_id:
            tasks = tasks.filter(category_id=category_id)
        
        # Apply search query if provided
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
            serializer.save(user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def task_detail(request, pk):
    try:
        task = Task.objects.get(pk=pk, user=request.user)
    except Task.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    
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

@api_view(['GET', 'POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def category_list(request):
    if request.method == 'GET':
        categories = TaskCategory.objects.filter(user=request.user)
        serializer = TaskCategorySerializer(categories, many=True)
        return Response(serializer.data)
    
    elif request.method == 'POST':
        serializer = TaskCategorySerializer(data=request.data, context={'request': request})
        if serializer.is_valid():
            serializer.save(user=request.user)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)

@api_view(['GET', 'PUT', 'PATCH', 'DELETE'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def category_detail(request, pk):
    try:
        category = TaskCategory.objects.get(pk=pk, user=request.user)
    except TaskCategory.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'GET':
        serializer = TaskCategorySerializer(category)
        return Response(serializer.data)
    
    elif request.method in ['PUT', 'PATCH']:
        serializer = TaskCategorySerializer(category, data=request.data, partial=request.method=='PATCH', context={'request': request})
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        category.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['POST', 'PUT', 'DELETE'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def subtask_operations(request, task_id):
    try:
        task = Task.objects.get(pk=task_id, user=request.user)
    except Task.DoesNotExist:
        return Response(status=status.HTTP_404_NOT_FOUND)
    
    if request.method == 'POST':
        # Create a subtask
        serializer = SubtaskSerializer(data=request.data)
        if serializer.is_valid():
            serializer.save(task=task)
            return Response(serializer.data, status=status.HTTP_201_CREATED)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'PUT':
        # Update a subtask
        subtask_id = request.data.get('id')
        try:
            subtask = Subtask.objects.get(pk=subtask_id, task=task)
        except Subtask.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        
        serializer = SubtaskSerializer(subtask, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    
    elif request.method == 'DELETE':
        # Delete a subtask
        subtask_id = request.data.get('id')
        try:
            subtask = Subtask.objects.get(pk=subtask_id, task=task)
        except Subtask.DoesNotExist:
            return Response(status=status.HTTP_404_NOT_FOUND)
        
        subtask.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

@api_view(['GET'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def task_statistics(request):
    user_tasks = Task.objects.filter(user=request.user)
    
    # Get counts for various task states
    total_tasks = user_tasks.count()
    completed_tasks = user_tasks.filter(completed=True).count()
    active_tasks = user_tasks.filter(completed=False).count()
    
    # Get overdue tasks
    today = datetime.now().date()
    overdue_tasks = user_tasks.filter(due_date__lt=today, completed=False).count()
    
    # Get due today
    due_today = user_tasks.filter(due_date=today, completed=False).count()
    
    # Get tasks by priority
    high_priority = user_tasks.filter(priority='high', completed=False).count()
    medium_priority = user_tasks.filter(priority='medium', completed=False).count()
    low_priority = user_tasks.filter(priority='low', completed=False).count()
    
    # Recent activity - tasks updated in the last 7 days
    seven_days_ago = datetime.now() - timedelta(days=7)
    recent_activity = user_tasks.filter(updated_at__gte=seven_days_ago).count()
    
    stats = {
        'total_tasks': total_tasks,
        'completed_tasks': completed_tasks,
        'active_tasks': active_tasks,
        'completion_rate': (completed_tasks / total_tasks * 100) if total_tasks > 0 else 0,
        'overdue_tasks': overdue_tasks,
        'due_today': due_today,
        'high_priority': high_priority,
        'medium_priority': medium_priority,
        'low_priority': low_priority,
        'recent_activity': recent_activity
    }
    
    return Response(stats)