from rest_framework.decorators import api_view, permission_classes, parser_classes
from django.contrib.auth.hashers import make_password
from server.decorators import api_auth_required
from django.middleware.csrf import get_token
from django.core.mail import send_mail
from rest_framework.parsers import MultiPartParser, FormParser
from rest_framework.response import Response
from .models import UserSession, UserProgress
from rest_framework.authtoken.models import Token
from rest_framework.permissions import AllowAny
from django.contrib.auth.models import User
from .serializers import UserSerializer
from datetime import timedelta
from django.utils import timezone
from django.conf import settings
from rest_framework import status
from task_manager.models import Task
from notes.models import Note
from chatbot.models import Message
from django.http import JsonResponse
from .email_service import send_verification_email
import uuid
import random
import string
import logging

logger = logging.getLogger(__name__)
from django.utils.dateparse import parse_datetime
from .models import SendGridEvent
from rest_framework.permissions import AllowAny
from rest_framework.decorators import permission_classes
from django.views.decorators.csrf import csrf_exempt

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
        serializer = UserSerializer(user, context={'request': request})
        return Response(serializer.data, status=status.HTTP_200_OK)

    elif request.method in ['PUT', 'PATCH']:
        try:
            # Log the request data for debugging (debug-level to avoid noise)
            logger.debug(f"Request data: {request.data}")
            logger.debug(f"Request FILES: {request.FILES}")

            profile_picture = None
            if 'profile_picture' in request.FILES:
                profile_picture = request.FILES['profile_picture']

            serializer = UserSerializer(user, data=request.data, partial=True, context={'request': request})
            if serializer.is_valid():
                user_instance = serializer.save()

                # Handle profile picture if provided (prefer file-backed storage)
                if profile_picture:
                    try:
                        profile = user_instance.profile
                        # Save to ImageField using Django storage
                        profile.profile_picture_file.save(profile_picture.name, profile_picture, save=True)
                        # Clear legacy binary fields to prefer file-backed URL
                        profile.profile_picture_content = None
                        profile.profile_picture_filename = profile_picture.name
                        profile.profile_picture_content_type = profile_picture.content_type
                        profile.save()
                    except Exception as e:
                        logger.error(f"Profile picture upload error: {e}")
                        return Response({"detail": f"Profile picture upload failed: {str(e)}"},
                                        status=status.HTTP_400_BAD_REQUEST)


                return Response(UserSerializer(user_instance, context={'request': request}).data, status=status.HTTP_200_OK)
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        except Exception as e:
            import traceback
            logger.exception(f"ERROR in user_profile: {str(e)}")
            return Response({"detail": f"Server error: {str(e)}"}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        

@api_auth_required(['GET'])
def user_progress(request):
    """Get the user's progress statistics with time-based filtering"""
    from django.db.models import Count, Q
    from datetime import datetime, timedelta
    from django.utils import timezone
    
    user = request.user
    
    # Get time period parameter (default to 'month')
    period = request.query_params.get('period', 'month')
    refresh = request.query_params.get('refresh', 'false').lower() == 'true'
    
    # Calculate date ranges
    now = timezone.now()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    
    if period == 'week':
        start_date = today_start - timedelta(days=7)
        period_name = 'This Week'
    elif period == 'month':
        start_date = today_start - timedelta(days=30)
        period_name = 'This Month'
    elif period == 'year':
        start_date = today_start - timedelta(days=365)
        period_name = 'This Year'
    else:  # overall
        start_date = user.date_joined
        period_name = 'All Time'
    
    # Get or create user progress record
    progress, created = UserProgress.objects.get_or_create(user=user)
    
    # Calculate time-based statistics
    tasks_completed = Task.objects.filter(
        user=user, 
        completed=True,
        updated_at__gte=start_date
    ).count()
    
    notes_created = Note.objects.filter(
        user=user,
        created_at__gte=start_date
    ).count()
    
    chatbot_interactions = Message.objects.filter(
        conversation__user=user,
        message_type='user',
        created_at__gte=start_date
    ).count()
    
    # Calculate daily progress for the last 7 days for charts
    daily_data = []
    for i in range(6, -1, -1):
        day_start = today_start - timedelta(days=i)
        day_end = day_start + timedelta(days=1)
        
        day_tasks = Task.objects.filter(
            user=user,
            completed=True,
            updated_at__gte=day_start,
            updated_at__lt=day_end
        ).count()
        
        day_notes = Note.objects.filter(
            user=user,
            created_at__gte=day_start,
            created_at__lt=day_end
        ).count()
        
        daily_data.append({
            'date': day_start.strftime('%Y-%m-%d'),
            'day_name': day_start.strftime('%a'),
            'tasks': day_tasks,
            'notes': day_notes
        })
    
    # Calculate weekly progress for the last 4 weeks for monthly view
    weekly_data = []
    for i in range(3, -1, -1):
        week_start = today_start - timedelta(weeks=i+1)
        week_end = week_start + timedelta(weeks=1)
        
        week_tasks = Task.objects.filter(
            user=user,
            completed=True,
            updated_at__gte=week_start,
            updated_at__lt=week_end
        ).count()
        
        week_notes = Note.objects.filter(
            user=user,
            created_at__gte=week_start,
            created_at__lt=week_end
        ).count()
        
        weekly_data.append({
            'week_start': week_start.strftime('%Y-%m-%d'),
            'week_label': f'Week {4-i}',
            'tasks': week_tasks,
            'notes': week_notes
        })
    
    # Update overall progress if needed
    if created or refresh:
        progress.tasks_completed = Task.objects.filter(user=user, completed=True).count()
        progress.notes_created = Note.objects.filter(user=user).count()
        progress.chatbot_interactions = Message.objects.filter(
            conversation__user=user, 
            message_type='user'
        ).count()
        progress.save()
    
    # Prepare response data
    response_data = {
        'period': period,
        'period_name': period_name,
        'start_date': start_date.isoformat(),
        'end_date': now.isoformat(),
        
        # Period-specific stats
        'tasks_completed': tasks_completed,
        'notes_created': notes_created,
        'chatbot_interactions': chatbot_interactions,
        
        # Overall stats
        'overall_tasks_completed': progress.tasks_completed,
        'overall_notes_created': progress.notes_created,
        'overall_chatbot_interactions': progress.chatbot_interactions,
        
        # Chart data
        'daily_progress': daily_data,
        'weekly_progress': weekly_data,
        
        # User info
        'username': user.username,
        'email': user.email,
        'date_joined': user.date_joined.isoformat() if user.date_joined else None,
        'last_login': progress.last_login.isoformat() if progress.last_login else None,
    }
    
    return Response(response_data)

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
            
            send_verification_email(
                email,
                subject,
                message
            )
            
        except Exception as e:
            # Log the error but don't expose it to the user
            logger.error(f"Error sending password reset email: {e}")
            return Response(
                {'error': 'Failed to send reset code. Please try again later.'}, 
                status=status.HTTP_500_INTERNAL_SERVER_ERROR
            )
        
        return Response(
            {'message': 'Password reset code sent to your email.'}, 
            status=status.HTTP_200_OK
        )
        
    except Exception as e:
        logger.error(f"Forgot password error: {e}")
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
        logger.error(f"Verify reset code error: {e}")
        return Response(
            {'error': 'An error occurred. Please try again later.'}, 
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )


@api_auth_required(['GET'])
def serve_profile_picture(request, user_id):
    """Serve profile picture from database with proper headers"""
    from django.http import HttpResponse, JsonResponse
    
    try:
        # Get the user profile
        from .models import UserProfile
        profile = UserProfile.objects.get(user_id=user_id)
        
        # If a file-backed profile picture exists, serve it directly via FileResponse.
        # This avoids relying on static/media URL routing which may not be available
        # in all environments (or may be misconfigured).
        if getattr(profile, 'profile_picture_file', None) and profile.profile_picture_file:
            try:
                from django.http import FileResponse
                import os

                file_path = profile.profile_picture_file.path
                if os.path.exists(file_path):
                    resp = FileResponse(open(file_path, 'rb'), content_type=profile.profile_picture_content_type or 'image/jpeg')
                    resp['Access-Control-Allow-Origin'] = '*'
                    resp['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
                    resp['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
                    resp['Cache-Control'] = 'public, max-age=3600'
                    filename = profile.profile_picture_filename or os.path.basename(file_path)
                    resp['Content-Disposition'] = f'inline; filename="{filename}"'
                    return resp
                # If file doesn't exist on disk, fall back to redirect to URL (may return 404)
            except Exception as e:
                logger.error(f"Error serving profile picture file directly: {e}")
                # Fall through to legacy handling

        if not profile.profile_picture_content:
            # Return a default SVG placeholder instead of 404
            default_svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
                <rect width="200" height="200" fill="#E5E7EB"/>
                <circle cx="100" cy="80" r="35" fill="#9CA3AF"/>
                <path d="M60 160 Q60 120 100 120 Q140 120 140 160" fill="#9CA3AF"/>
            </svg>'''
            
            response = HttpResponse(default_svg, content_type='image/svg+xml')
            response['Access-Control-Allow-Origin'] = '*'
            response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
            response['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
            response['Cache-Control'] = 'public, max-age=300'  # Cache for 5 minutes
            return response

        # Create response with profile picture content from database
        response = HttpResponse(
            profile.profile_picture_content, 
            content_type=profile.profile_picture_content_type or 'image/jpeg'
        )
        
        # Add CORS headers
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        
        # Add cache headers for better performance
        response['Cache-Control'] = 'public, max-age=3600'  # Cache for 1 hour
        
        # Add content disposition for proper handling
        filename = profile.profile_picture_filename or 'profile_picture.jpg'
        response['Content-Disposition'] = f'inline; filename="{filename}"'
        
        return response
        
    except UserProfile.DoesNotExist:
        # Return default placeholder for non-existent profiles too
        default_svg = '''<svg xmlns="http://www.w3.org/2000/svg" width="200" height="200" viewBox="0 0 200 200">
            <rect width="200" height="200" fill="#E5E7EB"/>
            <circle cx="100" cy="80" r="35" fill="#9CA3AF"/>
            <path d="M60 160 Q60 120 100 120 Q140 120 140 160" fill="#9CA3AF"/>
        </svg>'''
        
        response = HttpResponse(default_svg, content_type='image/svg+xml')
        response['Access-Control-Allow-Origin'] = '*'
        response['Access-Control-Allow-Methods'] = 'GET, OPTIONS'
        response['Access-Control-Allow-Headers'] = 'Content-Type, Authorization'
        response['Cache-Control'] = 'public, max-age=300'
        return response
        
    except Exception as e:
        logger.exception(f"Error serving profile picture: {e}")
        return JsonResponse({
            'error': 'Failed to serve profile picture',
            'detail': str(e)
        }, status=400)


@api_view(['POST'])
@permission_classes([AllowAny])
@csrf_exempt
def sendgrid_event_webhook(request):
    """
    Endpoint to receive SendGrid Event Webhook POSTs.

    SendGrid posts an array of event JSON objects. We store each event in
    the SendGridEvent model for later inspection.
    """
    # Optional: verify signature if public key is configured
    pub_key = getattr(settings, 'SENDGRID_EVENT_WEBHOOK_PUBLIC_KEY', None)
    if pub_key:
        try:
            signature = request.META.get('HTTP_X_TWILIO_EMAIL_EVENT_WEBHOOK_SIGNATURE')
            timestamp = request.META.get('HTTP_X_TWILIO_EMAIL_EVENT_WEBHOOK_TIMESTAMP')
            if not signature or not timestamp:
                logger.warning('Missing SendGrid webhook signature/timestamp headers')
            else:
                try:
                    import base64
                    try:
                        import importlib
                        nacl_signing = importlib.import_module('nacl.signing')
                        VerifyKey = getattr(nacl_signing, 'VerifyKey', None)
                        nacl_exceptions = importlib.import_module('nacl.exceptions')
                        BadSignatureError = getattr(nacl_exceptions, 'BadSignatureError', Exception)
                    except Exception:
                        VerifyKey = None
                        BadSignatureError = Exception

                    payload = timestamp.encode('utf-8') + request.body

                    sig = base64.b64decode(signature)

                    # Try interpreting pub_key as base64-encoded raw key, then as raw bytes
                    verified = False
                    if VerifyKey is not None:
                        try:
                            try:
                                key_bytes = base64.b64decode(pub_key)
                            except Exception:
                                key_bytes = pub_key.encode('utf-8')
                            vk = VerifyKey(key_bytes)
                            vk.verify(payload, sig)
                            verified = True
                        except BadSignatureError:
                            verified = False
                        except Exception:
                            logger.exception('Error while verifying SendGrid webhook signature')

                    if not verified:
                        logger.error('Failed to verify SendGrid webhook signature')
                        # Reject the request explicitly
                        return Response({'error': 'invalid webhook signature'}, status=status.HTTP_403_FORBIDDEN)
                except Exception:
                    logger.exception('Exception during webhook signature verification')
                    return Response({'error': 'signature verification failure'}, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            logger.exception('Failed to perform webhook verification')

    try:
        payload = request.data

        # Accept either a list of events or a single event object
        if isinstance(payload, dict):
            events = [payload]
        else:
            events = payload

        created = []
        for ev in events:
            try:
                email = ev.get('email') or ev.get('recipient') or ev.get('to')
                event_type = ev.get('event') or ev.get('type')
                sg_message_id = ev.get('sg_message_id') or ev.get('message_id') or ev.get('smtp-id')
                app_message_id = None
                # Try to pull our app_message_id from SendGrid's custom_args if present
                try:
                    ca = ev.get('custom_args') or ev.get('custom_args', {})
                    if isinstance(ca, dict):
                        app_message_id = ca.get('app_message_id')
                except Exception:
                    app_message_id = None

                # Use event timestamp if available, else now()
                ts = ev.get('timestamp')
                if ts:
                    try:
                        # SendGrid timestamp is often an int (epoch seconds)
                        if isinstance(ts, (int, float)):
                            import datetime
                            timestamp = datetime.datetime.fromtimestamp(int(ts), tz=datetime.timezone.utc)
                        else:
                            timestamp = parse_datetime(str(ts))
                    except Exception:
                        from django.utils import timezone
                        timestamp = timezone.now()
                else:
                    from django.utils import timezone
                    timestamp = timezone.now()

                sg_ev = SendGridEvent.objects.create(
                    email=email or '',
                    event=event_type or 'unknown',
                    sg_message_id=sg_message_id,
                    app_message_id=app_message_id,
                    raw=ev,
                    timestamp=timestamp
                )
                created.append(sg_ev.id)
            except Exception as e:
                # Don't fail the whole webhook on single-bad payload
                logger.exception(f"Failed to store SendGrid event: {e} - payload: {ev}")

        return Response({'received': len(created)}, status=status.HTTP_200_OK)

    except Exception as e:
        logger.exception(f"Error in SendGrid webhook endpoint: {e}")
        return Response({'error': 'failed to process events'}, status=status.HTTP_400_BAD_REQUEST)