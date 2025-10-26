from rest_framework import serializers
from .models import Log
from users.serializers import UserSerializer

class LogSerializer(serializers.ModelSerializer):
    user_details = UserSerializer(source='user', read_only=True)

    class Meta:
        model = Log
        fields = '__all__'