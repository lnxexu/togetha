import os
from celery import Celery
from celery.schedules import crontab

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'server.settings')

app = Celery('server')

app.config_from_object('django.conf:settings', namespace='CELERY')

app.autodiscover_tasks()

app.autodiscover_tasks(['task_manager', 'scheduler', 'notifications'])

# Add this to your existing celery.py
app.conf.beat_schedule = {
    'check-due-tasks-every-hour': {
        'task': 'scheduler.tasks.check_due_tasks',
        'schedule': crontab(minute=0),  # Run every hour at minute 0
    },
    'check-due-tasks-midnight': {
        'task': 'scheduler.tasks.check_due_tasks',
        'schedule': crontab(hour=0, minute=0),  # Run daily at 12 AM
    },
    'check-due-tasks-morning': {
        'task': 'scheduler.tasks.check_due_tasks',
        'schedule': crontab(hour=8, minute=0),  # Run daily at 8 AM
    },
    'check-due-tasks-noon': {
        'task': 'scheduler.tasks.check_due_tasks',
        'schedule': crontab(hour=12, minute=0),  # Run daily at 12 PM
    },
    'check-due-tasks-evening': {
        'task': 'scheduler.tasks.check_due_tasks',
        'schedule': crontab(hour=18, minute=0),  # Run daily at 6 PM
    },
    'check-upcoming-task-reminders': {
        'task': 'scheduler.tasks.check_upcoming_task_reminders',
        'schedule': crontab(minute='*/15'),  # Run every 15 minutes
    },
}

app.conf.timezone = 'Asia/Manila'