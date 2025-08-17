from django.urls import path
from . import views

urlpatterns = [
    path('schedule-reminder/', views.schedule_task_reminder, name='schedule_task_reminder'),
    path('check-due-tasks/', views.trigger_due_tasks_check, name='trigger_due_tasks_check'),
    path('upcoming-tasks/', views.get_user_upcoming_tasks, name='get_user_upcoming_tasks'),
    path('test-scheduler/', views.test_scheduler, name='test_scheduler'),  # New test endpoint
]