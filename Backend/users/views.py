
from tokenize import Token
from contextvars import Token
from rest_framework.decorators import api_view, authentication_classes, permission_classes, parser_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import TokenAuthentication, SessionAuthentication
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from rest_framework import status
from .serializers import UserSerializer, UserProgressSerializer
from rest_framework import status
from rest_framework.response import Response
from .models import UserSession, UserProgress
import uuid
from django.contrib.auth import authenticate
from task_manager.models import Task
from notes.models import Note
from chatbot.models import Message
from rest_framework.views import APIView

@api_view(['GET', 'PUT', 'PATCH'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
@parser_classes([MultiPartParser, FormParser])                                                                                                              
def user_profile(request):
    """
    View to handle user profile retrieval and update.
    """
    user = request.user
    if request.method == 'GET':
        serializer = UserSerializer(user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    elif request.method in ['PUT', 'PATCH']:
        serializer = UserSerializer(user, data=request.data, partial=True)
        if serializer.is_valid():
            serializer.save()
            return Response(serializer.data, status=status.HTTP_200_OK)
        return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
    

@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def validate_token(request):
    session_id = request.headers.get('X-Session-ID')
    
    # Check if this is still the active session
    if session_id:
        try:
            session = UserSession.objects.get(
                user=request.user,
                session_id=session_id
            )
            # Update last active timestamp
            session.save()  # This triggers auto_now update
            
            return Response({
                'is_valid': True,
                'is_active_session': session.is_active,
                'username': request.user.username
            })
        except UserSession.DoesNotExist:
            return Response({
                'is_valid': True,
                'is_active_session': False,
                'message': 'Session not found'
            })
    else:
        return Response({
            'is_valid': True,
            'is_active_session': True,  # Default to true if no session ID
            'username': request.user.username
        })
    

@api_view(['POST'])
def login_view(request):
    username = request.data.get('username')
    password = request.data.get('password')
    device_info = request.data.get('device_info', {})
    force_login = request.data.get('force_login', False)
    
    # Authenticate user
    user = authenticate(username=username, password=password)
    if not user:
        return Response({'error': 'Invalid credentials'}, status=status.HTTP_401_UNAUTHORIZED)
    
    # Check for existing active sessions
    existing_sessions = UserSession.objects.filter(user=user, is_active=True)
    
    if existing_sessions.exists() and not force_login:
        # User already has an active session
        latest_session = existing_sessions.first()
        return Response({
            'message': f'Account is already in use on {latest_session.device_name}',
            'device': latest_session.device_name,
            'login_time': latest_session.login_timestamp
        }, status=status.HTTP_409_CONFLICT)
    
    # If force login, invalidate all existing sessions
    if force_login:
        existing_sessions.update(is_active=False)
    
    # Create new session
    session_id = str(uuid.uuid4())
    UserSession.objects.create(
        user=user,
        session_id=session_id,
        device_id=device_info.get('device_id', 'unknown'),
        device_name=device_info.get('device_name', 'Unknown Device'),
        device_type=device_info.get('device_type', 'unknown'),
        os_name=device_info.get('os_name', 'unknown'),
        os_version=device_info.get('os_version', 'unknown'),
        app_version=device_info.get('app_version', 'unknown'),
        is_active=True
    )
    
    # Create and return token
    token, created = Token.objects.get_or_create(user=user)
    return Response({
        'token': token.key,
        'session_id': session_id,
        'user': {
            'id': user.id,
            'username': user.username,
            # Add other user fields as needed
        }
    })

class UserProgressView(APIView):
    """
    View to retrieve and update user progress statistics
    """
    authentication_classes = [TokenAuthentication, SessionAuthentication]
    permission_classes = [IsAuthenticated]
    
    def get(self, request):
        """Get the user's progress statistics"""
        user = request.user
        
        # Get or create user progress record
        progress, created = UserProgress.objects.get_or_create(user=user)
        
        # Update statistics if needed
        if created or request.query_params.get('refresh', 'false').lower() == 'true':
            # Count completed tasks
            tasks_completed = Task.objects.filter(user=user, completed=True).count()
            
            # Count notes created
            notes_created = Note.objects.filter(user=user).count()
            
            # Count chatbot interactions
            chatbot_interactions = Message.objects.filter(
                conversation__user=user, 
                message_type='user'
            ).count()
            
            # Update progress record
            progress.tasks_completed = tasks_completed
            progress.notes_created = notes_created
            progress.chatbot_interactions = chatbot_interactions
            progress.save()
        
        # Serialize and return data
        serializer = UserProgressSerializer(progress)
        return Response(serializer.data)
    
@api_view(['POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def upload_profile_picture(request):
    """
    View to handle profile picture upload.
    """
    user = request.user
    if request.method == 'POST':
        if 'profile_picture' not in request.FILES:
            return Response({'error': 'No profile picture provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        profile_picture = request.FILES['profile_picture']
        
        # Save the profile picture to the user's profile
        user.profile_picture.save(profile_picture.name, profile_picture)
        user.save()
        
        return Response({'message': 'Profile picture uploaded successfully'}, status=status.HTTP_200_OK)
    
    return Response({'error': 'Invalid request method'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)

@api_view(['POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def update_profile_picture(request):
    """
    View to handle profile picture update.
    """
    user = request.user
    if request.method == 'POST':
        if 'profile_picture' not in request.FILES:
            return Response({'error': 'No profile picture provided'}, status=status.HTTP_400_BAD_REQUEST)
        
        profile_picture = request.FILES['profile_picture']
        
        # Update the profile picture
        user.profile_picture.save(profile_picture.name, profile_picture)
        user.save()
        
        return Response({'message': 'Profile picture updated successfully'}, status=status.HTTP_200_OK)
    
    return Response({'error': 'Invalid request method'}, status=status.HTTP_405_METHOD_NOT_ALLOWED)