from django.db import models
from django.contrib.auth.models import User
from django.conf import settings


class UserProfile(models.Model):
    GENDER_CHOICES = (
        ('Male', 'Male'),
        ('Female', 'Female'),
        ('Other', 'Other'),
    )
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    username = models.CharField(max_length=150, blank=True)
    profile_picture = models.ImageField(upload_to='profile_pics/', blank=True, null=True)
    full_name = models.CharField(max_length=100, blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=255, blank=True)
    bio = models.TextField(blank=True)
    gender = models.CharField(choices=GENDER_CHOICES, blank=True)
    birthdate = models.DateField(blank=True, null=True)

    def __str__(self):
        return self.user.username
    
class UserSession(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    session_id = models.CharField(max_length=100, unique=True)
    device_id = models.CharField(max_length=100)
    device_name = models.CharField(max_length=255, blank=True)
    device_type = models.CharField(max_length=50, blank=True)
    os_name = models.CharField(max_length=50, blank=True)
    os_version = models.CharField(max_length=50, blank=True)
    app_version = models.CharField(max_length=50, blank=True)
    login_timestamp = models.DateTimeField(auto_now_add=True)
    last_active = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        ordering = ['-login_timestamp']

class UserProgress(models.Model):
    """Model to track user progress across the platform"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='progress')
    last_login = models.DateTimeField(auto_now=True)
    tasks_completed = models.IntegerField(default=0)
    notes_created = models.IntegerField(default=0)
    chatbot_interactions = models.IntegerField(default=0)
    
    class Meta:
        verbose_name = 'User Progress'
        verbose_name_plural = 'User Progress'
    
    def __str__(self):
        return f"{self.user.username}'s Progress"