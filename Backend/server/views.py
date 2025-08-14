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


@api_view(['POST'])
@permission_classes([AllowAny])
def login_api(request):
    """API endpoint for user login"""
    username = request.data.get('username')
    password = request.data.get('password')
    device_info = request.data.get('device_info', {})
    force_login = request.data.get('force_login', False)
    
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
    
    # Handle session creation (if using device management)
    # Similar to your current implementation
    try:
        # Create session if you're using the UserSession model
        from users.models import UserSession
        import uuid
        
        # Check for existing sessions if force_login is false
        if not force_login:
            existing_sessions = UserSession.objects.filter(user=user, is_active=True)
            if existing_sessions.exists():
                latest_session = existing_sessions.first()
                return Response({
                    'message': f'Account is already in use on {latest_session.device_name}',
                    'device': latest_session.device_name,
                    'login_time': latest_session.login_timestamp
                }, status=status.HTTP_409_CONFLICT)
        else:
            # Deactivate existing sessions if forcing login
            UserSession.objects.filter(user=user, is_active=True).update(is_active=False)
        
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
    except Exception as e:
        print(f"Session creation error: {str(e)}")
        # Continue even if session creation fails
    
    return Response({
        'token': token.key,
        'user_id': user.id,
        'username': user.username,
        'email': user.email,
        'message': 'Login successful'
    }, status=status.HTTP_200_OK)

@api_view(['POST'])
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
@permission_classes([IsAuthenticated])
def user_logout(request):
    # Delete the token to logout
    try:
        request.user.auth_token.delete()
    except Exception:
        pass
    
    # Logout from session
    logout(request)
    
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