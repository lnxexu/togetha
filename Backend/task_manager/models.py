import uuid
from django.db import models
from django.conf import settings

class TaskCategory(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=100)
    color = models.CharField(max_length=20, blank=True, null=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='task_categories')
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return self.name
    
    class Meta:
        verbose_name_plural = 'Task Categories'
        ordering = ['name']
        unique_together = ['name', 'user']  # Prevent duplicate category names per user

class Task(models.Model):
    # Eisenhower Matrix priorities:
    # - urgent_important: Do First (urgent and important)
    # - not_urgent_important: Schedule (not urgent but important)
    # - urgent_not_important: Delegate (urgent but not important)
    # - not_urgent_not_important: Eliminate (neither urgent nor important)
    PRIORITY_CHOICES = (
        ('urgent_important', 'Do First (Urgent & Important)'),
        ('not_urgent_important', 'Schedule (Important, Not Urgent)'),
        ('urgent_not_important', 'Delegate (Urgent, Not Important)'),
        ('not_urgent_not_important', 'Eliminate (Not Urgent or Important)'),
    )
    
    STATUS_CHOICES = (
        ('not_started', 'Not Started'),
        ('in_progress', 'In Progress'),
        ('completed', 'Completed'),
    )
    
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    text = models.CharField(max_length=255)
    description = models.TextField(blank=True, null=True)
    completed = models.BooleanField(default=False)
    priority = models.CharField(max_length=25, choices=PRIORITY_CHOICES, default='not_urgent_important')
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='not_started')
    due_date = models.DateField(blank=True, null=True)
    category = models.ForeignKey(TaskCategory, on_delete=models.SET_NULL, related_name='tasks', null=True, blank=True)
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='tasks')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    def __str__(self):
        return self.text
    
    class Meta:
        ordering = ['due_date', 'priority']

class Subtask(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    task = models.ForeignKey(Task, on_delete=models.CASCADE, related_name='subtasks')
    text = models.CharField(max_length=255)
    completed = models.BooleanField(default=False)
    created_at = models.DateTimeField(auto_now_add=True)
    
    def __str__(self):
        return self.text
    
    class Meta:
        ordering = ['created_at']