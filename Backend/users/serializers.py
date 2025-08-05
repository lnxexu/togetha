from rest_framework import serializers
from django.contrib.auth.models import User
from .models import UserProfile, UserProgress
from django.db.models.signals import post_save
from django.dispatch import receiver    

class UserProfileSerializer(serializers.ModelSerializer):
    class Meta:
        model = UserProfile
        fields = [
            'profile_picture', 'full_name', 'phone_number', 'address',
            'bio', 'gender', 'birthdate', 'username'
        ]

class UserSerializer(serializers.ModelSerializer):
    profile = UserProfileSerializer()

    class Meta:
        model = User
        fields = ['username', 'email', 'profile']

    def update(self, instance, validated_data):
        # Handle nested profile data
        profile_data = validated_data.pop('profile', None)
        # Ensure the user has a profile
        try:
            profile = instance.profile
        except UserProfile.DoesNotExist:
            profile = UserProfile.objects.create(user=instance)
        # Update user fields
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        instance.save()
        # Update profile fields
        if profile_data:
            for attr, value in profile_data.items():
                setattr(profile, attr, value)
            profile.save()
        return instance
    
@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        UserProfile.objects.create(user=instance)

class UserProgressSerializer(serializers.ModelSerializer):
    username = serializers.CharField(source='user.username', read_only=True)
    email = serializers.EmailField(source='user.email', read_only=True)
    date_joined = serializers.DateTimeField(source='user.date_joined', read_only=True)
    
    class Meta:
        model = UserProgress
        fields = [
            'username', 'email', 'date_joined', 'last_login',
            'tasks_completed', 'notes_created', 'chatbot_interactions'
        ]
        read_only_fields = ['last_login']