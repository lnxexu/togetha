from django.db import models
from django.conf import settings
from django.utils import timezone

class Log(models.Model):
    LOG_LEVELS = (
        ('INFO', 'Information'),
        ('WARNING', 'Warning'),
        ('ERROR', 'Error'),
        ('SUCCESS', 'Success'),
    )

    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE, related_name='logs', null=True, blank=True)
    level = models.CharField(max_length=10, choices=LOG_LEVELS, default='INFO')
    message = models.TextField()
    action = models.CharField(max_length=255)
    entity_type = models.CharField(max_length=100, blank=True, null=True) 
    entity_id = models.CharField(max_length=64, blank=True, null=True) 
    timestamp = models.DateTimeField(default=timezone.now)
    read = models.BooleanField(default=False)

    class Meta:
        ordering = ['-timestamp']
        verbose_name = 'Log'
        verbose_name_plural = 'Logs'

    def __str__(self):
        return f"{self.level} - {self.action} - {self.timestamp.strftime('%Y-%m-%d %H:%M')}"