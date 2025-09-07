import uuid
import random
import string
from datetime import datetime, timedelta
from django.utils import timezone
from django.core.mail import send_mail
from django.conf import settings
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
from django.contrib.auth.models import User
from django.contrib.auth.hashers import make_password
from django.db import models

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
                    except Exception as e:
                        print(f"Profile picture upload error: {e}")
                        return Response({"detail": f"Profile picture upload failed: {str(e)}"},
                                        status=status.HTTP_400_BAD_REQUEST)


                return Response(UserSerializer(user_instance).data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            print(f"ERROR in user_profile: {str(e)}")
            print(traceback.format_exc())
            return Response({"detail": f"Server error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        

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


@api_view(['POST'])
@permission_classes([AllowAny])
def forgot_password(request):
    """
    Send password reset code to user's email
    """
    from .models import PasswordResetCode
    
    try:
        email = request.data.get('email', '').strip().lower()
        
        if not email:
            return Response(
                {'error': 'Email is required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if user exists with this email
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            # For security, don't reveal if email exists or not
            return Response(
                {'message': 'If this email is registered, you will receive a reset code shortly.'}, 
                status=status.HTTP_200_OK
            )
        
        # Generate 6-digit code
        code = ''.join(random.choices(string.digits, k=6))
        
        # Set expiration time (15 minutes from now)
        expires_at = timezone.now() + timedelta(minutes=15)
        
        # Delete any existing codes for this email
        PasswordResetCode.objects.filter(email=email).delete()
        
        # Create new reset code
        reset_code = PasswordResetCode.objects.create(
            email=email,
            code=code,
            expires_at=expires_at
        )
        
        # Send email with the code
        try:
            subject = 'Password Reset Code - Togetha'
            message = f"""Hi there,

You requested a password reset for your Togetha account.

Your verification code is: {code}

This code will expire in 15 minutes.

For your security:
- Do not share this code with anyone
- This code can only be used once
- If you didn't request this password reset, please ignore this email

If you continue to receive these emails without requesting them, please contact our security team immediately at security@togetha.com.

Best regards,
Togetha Security Team

---
Account: {email}
Time: {timezone.now().strftime('%Y-%m-%d %H:%M:%S UTC')}
            """
            
            send_mail(
                subject,
                message,
                settings.DEFAULT_FROM_EMAIL,
                [email],
                fail_silently=False,
            )
            
        except Exception as e:
            # Log the error but don't expose it to the user
            print(f"Error sending password reset email: {e}")
            return Response(
                {'error': 'Failed to send reset code. Please try again later.'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        return Response(
            {'message': 'Password reset code sent to your email.'}, 
            status=status.HTTP_200_OK
        )
        
    except Exception as e:
        print(f"Forgot password error: {e}")
        return Response(
            {'error': 'An error occurred. Please try again later.'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_view(['POST'])
@permission_classes([AllowAny])
def verify_reset_code(request):
    """
    Verify reset code and update password
    """
    from .models import PasswordResetCode
    
    try:
        email = request.data.get('email', '').strip().lower()
        verification_code = request.data.get('verification_code', '').strip()
        new_password = request.data.get('new_password', '').strip()
        
        if not email or not verification_code or not new_password:
            return Response(
                {'error': 'Email, verification code, and new password are required'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        if len(new_password) < 8:
            return Response(
                {'error': 'Password must be at least 8 characters long'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Find the reset code
        try:
            reset_code = PasswordResetCode.objects.get(
                email=email,
                code=verification_code
            )
        except PasswordResetCode.DoesNotExist:
            return Response(
                {'error': 'Invalid verification code'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Check if code is valid (not used and not expired)
        if not reset_code.is_valid():
            return Response(
                {'error': 'Verification code has expired or already been used'}, 
                status=status.HTTP_400_BAD_REQUEST
            )
        
        # Get the user
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response(
                {'error': 'User not found'}, 
                status=status.HTTP_404_NOT_FOUND
            )
        
        # Update the password
        user.password = make_password(new_password)
        user.save()
        
        # Mark the reset code as used
        reset_code.is_used = True
        reset_code.save()
        
        # Delete any other reset codes for this email
        PasswordResetCode.objects.filter(email=email).exclude(id=reset_code.id).delete()
        
        # Invalidate all existing tokens/sessions for security
        Token.objects.filter(user=user).delete()
        UserSession.objects.filter(user=user).update(is_active=False)
        
        return Response(
            {'message': 'Password reset successful. Please login with your new password.'}, 
            status=status.HTTP_200_OK
        )
        
    except Exception as e:
        print(f"Verify reset code error: {e}")
        return Response(
            {'error': 'An error occurred. Please try again later.'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )