from django.db import models
from django.conf import settings

class Notification(models.Model):
    TYPE_CHOICES = (
        ('task', 'Task'),
        ('note', 'Note'),
        ('reminder', 'Reminder'),
        ('system', 'System'),
    )
    
    PRIORITY_CHOICES = (
        ('high', 'High'),
        ('medium', 'Medium'),
        ('low', 'Low'),
    )

    NOTIFICATION_TYPES = [
        ('task_due_today', 'Task Due Today'),
        ('task_due_tomorrow', 'Task Due Tomorrow'),
        ('task_reminder', 'Task Reminder'),
        ('task_created', 'Task Created'),
        ('task_completed', 'Task Completed'),
        ('task_updated', 'Task Updated'),
        ('task_deleted', 'Task Deleted'),
        ('general', 'General'),
    ]

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='notifications')
    type = models.CharField(max_length=20, choices=TYPE_CHOICES)
    title = models.CharField(max_length=100)
    message = models.TextField()
    timestamp = models.DateTimeField(auto_now_add=True)
    notification_type = models.CharField(max_length=20, choices=NOTIFICATION_TYPES, default='general')
    read = models.BooleanField(default=False)
    action_id = models.CharField(max_length=50, null=True, blank=True)
    priority = models.CharField(max_length=10, choices=PRIORITY_CHOICES, default='medium')
    
    # Add relation to task and use task's due_datetime for notification timing
    related_task = models.ForeignKey('task_manager.Task', on_delete=models.CASCADE, null=True, blank=True, related_name='notifications')
    scheduled_time = models.DateTimeField(null=True, blank=True, help_text="When this notification should be shown, based on task due_datetime")
    
    class Meta:
        ordering = ['-scheduled_time', '-timestamp']
        verbose_name = 'Notification'
        verbose_name_plural = 'Notifications'

    def save(self, *args, **kwargs):
        # If related_task exists and scheduled_time is not set, use task's due_datetime
        if self.related_task and not self.scheduled_time:
            self.scheduled_time = self.related_task.due_datetime
        super().save(*args, **kwargs)

    def get_task_details(self):
        """Return task details for notification preview"""
        if self.related_task:
            return {
                'id': str(self.related_task.id),
                'title': self.related_task.title,
                'description': self.related_task.description,
                'due_datetime': self.related_task.due_datetime,
                'priority': self.related_task.priority,
                'category': self.related_task.category,
                'completed': self.related_task.completed,
            }
        return None