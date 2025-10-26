from rest_framework import serializers
from django.contrib.auth.models import User
from .models import UserProfile, UserProgress

class UserProfileSerializer(serializers.ModelSerializer):
    profile_picture_url = serializers.SerializerMethodField()
    
    class Meta:
        model = UserProfile
        fields = [
            'username','profile_picture_content', 'profile_picture_filename', 'profile_picture_content_type', 'profile_picture_url', 'full_name', 'phone_number', 'address',
            'bio', 'gender', 'birthdate'
        ]
        read_only_fields = ['profile_picture_url']
    
    def get_profile_picture_url(self, obj):
        """Generate the full URL for the profile picture"""
        request = self.context.get('request')
        # Prefer file-backed URL when available
        try:
            if getattr(obj, 'profile_picture_file', None):
                url = obj.profile_picture_file.url
                if request:
                    return request.build_absolute_uri(url)
                return url
        except Exception:
            # If storage backend raises or file missing, continue to legacy handling
            pass

        # Fallback to legacy binary serve endpoint when binary content exists
        if obj.profile_picture_content and obj.profile_picture_filename:
            if request:
                return request.build_absolute_uri(f'/api/users/{obj.user.id}/profile-picture/')
            else:
                return f'/api/users/{obj.user.id}/profile-picture/'

        return None

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
            # Handle profile picture content if provided as base64 string
            if 'profile_picture_content' in profile_data:
                import base64
                content_b64 = profile_data.pop('profile_picture_content')
                if content_b64:
                    try:
                        profile.profile_picture_content = base64.b64decode(content_b64)
                    except Exception:
                        raise serializers.ValidationError("Invalid base64 profile picture content")
                else:
                    profile.profile_picture_content = None
                    profile.profile_picture_filename = None
                    profile.profile_picture_content_type = None
            
            for attr, value in profile_data.items():
                setattr(profile, attr, value)
            profile.save()
        return instance

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