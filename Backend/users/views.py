import uuid
from rest_framework.response import Response
from rest_framework import status
from rest_framework.parsers import MultiPartParser, FormParser
from .serializers import UserSerializer, UserProgressSerializer
from .models import UserSession, UserProgress
from task_manager.models import Task
from notes.models import Note
from chatbot.models import Message
from server.decorators import api_auth_required
from rest_framework.authtoken.models import Token
from django.http import JsonResponse
from django.middleware.csrf import get_token
from rest_framework.decorators import api_view, permission_classes, parser_classes
from rest_framework.permissions import AllowAny
from notifications.views import create_notification

@api_view(['GET'])
@permission_classes([AllowAny])
def get_csrf_token(request):
    """
    Returns a CSRF token for use in forms
    """
    csrf_token = get_token(request)
    return JsonResponse({'csrfToken': csrf_token})

@api_auth_required(['GET', 'PUT', 'PATCH'])
@parser_classes([MultiPartParser, FormParser])
def user_profile(request):
    """Handle user profile retrieval and update"""
    user = request.user

    if request.method == 'GET':
        serializer = UserSerializer(user)
        return Response(serializer.data, status=status.HTTP_200_OK)

    elif request.method in ['PUT', 'PATCH']:
        try:
            # Log the request data for debugging
            print(f"Request data: {request.data}")
            print(f"Request FILES: {request.FILES}")

            profile_picture = None
            if 'profile_picture' in request.FILES:
                profile_picture = request.FILES['profile_picture']

            serializer = UserSerializer(user, data=request.data, partial=True)
            if serializer.is_valid():
                user_instance = serializer.save()

                # Handle profile picture if provided
                if profile_picture:
                    try:
                        user_instance.profile.profile_picture.save(profile_picture.name, profile_picture)
                        user_instance.profile.save()
                        # Notification for profile picture update
                        create_notification(
                            user=user,
                            notification_type='system',
                            title='Profile Picture Updated',
                            message='Your profile picture has been updated successfully.',
                            priority='low'
                        )
                    except Exception as e:
                        print(f"Profile picture upload error: {e}")
                        return Response({"detail": f"Profile picture upload failed: {str(e)}"},
                                        status=status.HTTP_400_BAD_REQUEST)

                # Notification for profile update (general info)
                create_notification(
                    user=user,
                    notification_type='system',
                    title='Profile Updated',
                    message='Your profile information has been updated successfully.',
                    priority='low'
                )

                return Response(UserSerializer(user_instance).data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            print(f"ERROR in user_profile: {str(e)}")
            print(traceback.format_exc())
            return Response({"detail": f"Server error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        

def update(self, request, *args, **kwargs):
    partial = kwargs.pop('partial', False)
    instance = self.get_object()
    serializer = self.get_serializer(instance, data=request.data, partial=partial)
    serializer.is_valid(raise_exception=True)
    self.perform_update(serializer)

    # Create notification for profile update
    create_notification(
        user=request.user,
        notification_type='system',
        title='Profile Updated',
        message='Your profile information has been updated successfully',
        priority='low'
    )
    
    return Response(serializer.data)

@api_auth_required(['GET'])
def user_progress(request):
    """Get the user's progress statistics"""
    user = request.user
    
    # Check if refresh is requested
    refresh = request.query_params.get('refresh', 'false').lower() == 'true'
    
    # Get or create user progress record
    progress, created = UserProgress.objects.get_or_create(user=user)
    
    # Update statistics if needed
    if created or refresh:
        progress.tasks_completed = Task.objects.filter(user=user, completed=True).count()
        progress.notes_created = Note.objects.filter(user=user).count()
        progress.chatbot_interactions = Message.objects.filter(
            conversation__user=user, 
            message_type='user'
        ).count()
        progress.save()
    
    # Serialize and return data
    serializer = UserProgressSerializer(progress)
    return Response(serializer.data)

@api_auth_required(['POST'])
def manage_session(request):
    """
    Combined view for session management:
    - Validate token and session
    - Create new session
    - End session
    """
    user = request.user
    action = request.data.get('action', '')
    
    # Validate token and session
    if action == 'validate':
        session_id = request.headers.get('X-Session-ID')
        
        if session_id:
            try:
                session = UserSession.objects.get(user=user, session_id=session_id)
                # Update last active timestamp
                session.save()
                
                return Response({
                    'is_valid': True,
                    'is_active_session': session.is_active,
                    'username': user.username
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
                'username': user.username
            })
    
    # Create new session
    elif action == 'create':
        device_info = request.data.get('device_info', {})
        force_login = request.data.get('force_login', False)
        
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
        
        # Return session data
        token, _ = Token.objects.get_or_create(user=user)
        return Response({
            'token': token.key,
            'session_id': session_id,
            'user': {
                'id': user.id,
                'username': user.username
            }
        })
    
    # End session
    elif action == 'end':
        session_id = request.data.get('session_id')
        if session_id:
            UserSession.objects.filter(user=user, session_id=session_id).update(is_active=False)
        else:
            # End all user sessions
            UserSession.objects.filter(user=user).update(is_active=False)
            
        return Response({'message': 'Session(s) ended successfully'})
        
    return Response({"error": "Invalid action"}, status=status.HTTP_400_BAD_REQUEST)