from rest_framework.decorators import api_view, permission_classes
from rest_framework.response import Response
from .serializers import UserSerializer
from rest_framework import status
from rest_framework.authtoken.models import Token
from django.contrib.auth.models import User 
from django.shortcuts import render
from rest_framework.decorators import permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import TokenAuthentication,SessionAuthentication
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.views.decorators.csrf import csrf_exempt
from django.contrib.auth import authenticate, login as django_login, logout
from logs.views import create_log


@api_view(['POST'])
@permission_classes([AllowAny])
def login_api(request):
    """API endpoint for user login"""
    username = request.data.get('username')
    password = request.data.get('password')
    device_info = request.data.get('device_info', {})
    
    if not username or not password:
        return Response({'error': 'Please provide both username and password'}, 
                        status=status.HTTP_400_BAD_REQUEST)
    
    user = authenticate(username=username, password=password)
    
    if not user:
        return Response({'detail': 'Invalid credentials'}, 
                        status=status.HTTP_401_UNAUTHORIZED)

    # Use Django's login function to create a session
    django_login(request, user)

    # Create or get token for API authentication
    token, created = Token.objects.get_or_create(user=user)
    
    # Handle session creation with automatic logout from other devices
    try:
        from users.models import UserSession
        import uuid
        
        # Check for existing active sessions
        existing_sessions = UserSession.objects.filter(user=user, is_active=True)
        
        # If there are existing sessions, log them out and log the action
        if existing_sessions.exists():
            # Get device names for logging
            device_names = list(existing_sessions.values_list('device_name', flat=True))
            
            # Deactivate all existing sessions (automatic logout from other devices)
            existing_sessions.update(is_active=False)
            
            # Log the automatic logout
            try:
                devices_str = ', '.join(device_names) if device_names else 'Unknown Devices'
                create_log(
                    user=user,
                    level='WARNING',
                    message=f"User automatically logged out from other devices: {devices_str}",
                    action="Auto Logout Other Devices",
                    entity_type="User",
                    entity_id=user.id
                )
            except Exception as e:
                print(f"Auto logout log creation error: {str(e)}")
        
        # Create new session for current device
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

        # Log successful login
        try:
            create_log(
                user=user,
                level='INFO',
                message=f"User logged in from {device_info.get('device_name', 'Unknown Device')}",
                action="Login",
                entity_type="User",
                entity_id=user.id
            )
        except Exception as e:
            print(f"Log creation error: {str(e)}")

    except Exception as e:
        print(f"Session creation error: {str(e)}")
        return Response({
            'error': 'Session creation failed',
            'detail': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
    
    # Prepare response message
    message = 'Login successful'
    if existing_sessions.exists():
        device_count = len(device_names) if 'device_names' in locals() else existing_sessions.count()
        message = f'Login successful. You have been automatically logged out from {device_count} other device(s).'
    
    return Response({
        'token': token.key,
        'user_id': user.id,
        'username': user.username,
        'email': user.email,
        'message': message
    }, status=status.HTTP_200_OK)

@api_view(['POST'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def force_logout_all_sessions(request):
    """Force logout from all devices"""
    user = request.user
    
    try:
        from users.models import UserSession
        # Deactivate all sessions for this user
        UserSession.objects.filter(user=user, is_active=True).update(is_active=False)
        
        # Log the action
        create_log(
            user=user,
            level='WARNING',
            message="User forced logout from all devices",
            action="Force Logout All",
            entity_type="User",
            entity_id=user.id
        )
        
        return Response({
            'message': 'Successfully logged out from all devices'
        }, status=status.HTTP_200_OK)
        
    except Exception as e:
        return Response({
            'error': 'Failed to logout from all devices',
            'detail': str(e)
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)


@api_view(['POST'])
@permission_classes([AllowAny]) 
def signup(request):
    # Extract data from request
    username = request.data.get('username', '')
    email = request.data.get('email', '')
    password = request.data.get('password', '')
    timezone = request.data.get('timezone', '')  # <-- Accept timezone from request

    # Validate data
    errors = {}

    if not username:
        errors['username'] = ['Username is required']
    elif User.objects.filter(username=username).exists():
        errors['username'] = ['Username already exists']

    if not email:
        errors['email'] = ['Email is required']
    elif User.objects.filter(email=email).exists():
        errors['email'] = ['Email already exists']

    if not password:
        errors['password'] = ['Password is required']
    else:
        try:
            # Use Django's password validation
            validate_password(password)
        except ValidationError as e:
            errors['password'] = list(e.messages)

    if not timezone:
        errors['timezone'] = ['Timezone is required']

    if errors:
        return Response(errors, status=status.HTTP_400_BAD_REQUEST)

    # Create user
    user = User.objects.create_user(
        username=username,
        email=email,
        password=password
    )

    # Set timezone in user profile
    if hasattr(user, 'userprofile'):
        user.userprofile.timezone = timezone
        user.userprofile.save()

    # Generate auth token
    token = Token.objects.create(user=user)

    # Serialize user data for response
    serializer = UserSerializer(instance=user)

    return Response({
        'token': token.key,
        'user': serializer.data
    }, status=status.HTTP_201_CREATED)
    
pass

@api_view(['GET'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def test_token(request):
    user = request.user
    if not user.is_authenticated:
        return Response({"error": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)
    return Response({"message": f"Hello, {user.username}!"}, status=status.HTTP_200_OK)


@api_view(['GET'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def get_user_info(request):
    user = request.user
    if not user.is_authenticated:
        return Response({"error": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)
    return Response({
        "username": user.username,
        "email": user.email,
        "date_joined": user.date_joined
    }, status=status.HTTP_200_OK)

# logout user
@api_view(['POST'])
@authentication_classes([TokenAuthentication, SessionAuthentication])
@permission_classes([IsAuthenticated])
def user_logout(request):
    """API endpoint for user logout"""
    user = request.user
    device_info = request.data.get('device_info', {}) if hasattr(request, 'data') else {}
    
    # Deactivate specific session if device info is provided, otherwise all sessions
    try:
        from users.models import UserSession
        if device_info.get('device_id'):
            # Deactivate specific device session
            UserSession.objects.filter(
                user=user, 
                device_id=device_info.get('device_id'),
                is_active=True
            ).update(is_active=False)
        else:
            # Deactivate all sessions if no specific device info
            UserSession.objects.filter(user=user, is_active=True).update(is_active=False)
    except Exception as e:
        print(f"Session deactivation error: {str(e)}")
    
    # Delete the token to logout
    try:
        user.auth_token.delete()
    except Exception as e:
        print(f"Token deletion error: {str(e)}")
    
    # Logout from Django session
    logout(request)

    # Log user logout
    try:
        create_log(
            user=user,
            level='INFO',
            message=f"User logged out from {device_info.get('device_name', 'Unknown Device')}",
            action="Logout",
            entity_type="User",
            entity_id=user.id
        )
    except Exception as e:
        print(f"Log creation error: {str(e)}")

    return Response({'message': 'Successfully logged out'}, 
                    status=status.HTTP_200_OK)


def login_page(request):
    return render(request, 'login.html')

def signup_page(request):
    return render(request, 'signup.html')  

def test_token_page(request):
    return render(request, 'test_token.html')

def home_page(request):
    return render(request, 'home.html')

def chatbot_page(request):
    return render(request, 'chatbot.html')

def notes_page(request):
    return render(request, 'notes.html')

def task_manager_page(request):
    return render(request, 'tasks.html')

def my_profile(request):
    return render(request, 'myProfile.html')

def forgot_password(request):
    from django.contrib.auth.forms import PasswordResetForm
    from django.contrib import messages
    from django.shortcuts import redirect
    if request.method == 'POST':
        form = PasswordResetForm(request.POST)
        if form.is_valid():
            form.save(
                request=request,
                use_https=request.is_secure(),
                email_template_name='forgotPassword.html',
            )
            messages.success(request, 'A password reset link has been sent to your email.')
            return redirect('forgot_password')
        else:
            messages.error(request, 'Please enter a valid email address.')
    else:
        form = PasswordResetForm()
    return render(request, 'forgotPassword.html', {'form': form})

@api_view(['GET'])
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def validate_token(request):
    """
    Validate if the token is active and return user info
    """
    return Response({
        'valid': True,
        'user': {
            'id': request.user.id,
            'username': request.user.username,
            'email': request.user.email
        }
    })