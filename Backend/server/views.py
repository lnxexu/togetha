from rest_framework.decorators import api_view
from rest_framework.response import Response
from users.models import UserSession
from .serializers import UserSerializer
from rest_framework import status
from rest_framework.authtoken.models import Token
from django.contrib.auth.models import User 
from django.shortcuts import get_object_or_404, render
from rest_framework.decorators import permission_classes, authentication_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.authentication import TokenAuthentication,SessionAuthentication
from django.contrib.auth.password_validation import validate_password
from django.core.exceptions import ValidationError


@api_view(['POST'])
def login(request):
    user = get_object_or_404(User, username=request.data['username'])
    if not user.check_password(request.data['password']):
        return Response({"error": "Invalid credentials"}, status=status.HTTP_401_UNAUTHORIZED)
    token, created = Token.objects.get_or_create(user=user)
    serializer = UserSerializer(instance = user)
    return Response({'token': token.key, "user": serializer.data}, status=status.HTTP_200_OK)

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
@authentication_classes([TokenAuthentication])
@permission_classes([IsAuthenticated])
def logout_view(request):
    session_id = request.data.get('session_id')
    if session_id:
        # End specific session
        UserSession.objects.filter(
            user=request.user, 
            session_id=session_id
        ).update(is_active=False)
    else:
        # End all sessions for this user
        UserSession.objects.filter(user=request.user).update(is_active=False)
    
    # Delete token
    request.user.auth_token.delete()
    return Response({'success': 'Successfully logged out'})

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