from rest_framework.decorators import api_view, permission_classes
from django.views.decorators.csrf import csrf_exempt
from django.utils.crypto import get_random_string
from django.core.mail import send_mail
from django.conf import settings
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django.contrib.auth.models import User
from rest_framework import status
from django.utils import timezone
from datetime import timedelta
from .models import EmailVerification
from .email_service import send_verification_email as sendgrid_email
import logging
import re

# Configure logging
logger = logging.getLogger(__name__)

def validate_email_format(email):
    """Validate email format with more strict rules"""
    email_regex = r'^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$'
    if not re.match(email_regex, email):
        return False
    
    # Additional checks
    if '..' in email or email.startswith('.') or email.endswith('.'):
        return False
    
    # Check for valid TLD
    tld = email.split('.')[-1]
    if len(tld) < 2:
        return False
    
    return True

def send_verification_email_local(email, username, verification_code):
    """Send verification email securely without logging sensitive data"""
    try:
        subject = 'Email Verification - Welcome to Togetha!'
        message = f'''Welcome to Togetha!

Thank you for signing up, {username}. To complete your registration, please verify your email address using the code below:

Verification Code: {verification_code}

This code will expire in 15 minutes.

For your security:
- Do not share this code with anyone
- This code can only be used once
- If you didn't create an account with us, please ignore this email

Welcome aboard!
The Togetha Team

---
Need help? Contact us at support@togetha.com
'''
        
        return sendgrid_email(email, subject, message)
        
    except Exception as e:
        logger.error(f"Failed to send verification email: {str(e)}")
        # For console backend, this is expected and okay
        if 'console' in str(settings.EMAIL_BACKEND).lower():
            logger.info("Using console backend - verification code will appear in console")
            return True
        return False

@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def send_email_verification(request):
    """Send email verification code during signup with enhanced security"""
    try:
        email = request.data.get('email', '').strip().lower()
        username = request.data.get('username', '').strip()
        
        # Input validation
        if not email or not username:
            return Response({
                'success': False,
                'message': 'Email and username are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate email format
        if not validate_email_format(email):
            return Response({
                'success': False,
                'message': 'Invalid email format'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate username
        if len(username) < 3 or len(username) > 30:
            return Response({
                'success': False,
                'message': 'Username must be 3-30 characters long'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if not re.match(r'^[a-zA-Z0-9_]+$', username):
            return Response({
                'success': False,
                'message': 'Username can only contain letters, numbers, and underscores'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if email already exists
        if User.objects.filter(email=email).exists():
            return Response({
                'success': False,
                'message': 'An account with this email already exists'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if username already exists
        if User.objects.filter(username=username).exists():
            return Response({
                'success': False,
                'message': 'This username is already taken'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Rate limiting: Check if too many attempts from this email
        recent_attempts = EmailVerification.objects.filter(
            email=email,
            created_at__gte=timezone.now() - timedelta(minutes=5)
        ).count()
        
        if recent_attempts >= 3:
            return Response({
                'success': False,
                'message': 'Too many verification attempts. Please wait 5 minutes before trying again.'
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)
        
        # Generate 6-digit verification code
        verification_code = get_random_string(6, allowed_chars='0123456789')

        # Log the verification code to backend logs when allowed
        try:
            if settings.DEBUG or getattr(settings, 'LOG_VERIFICATION_CODES', False):
                masked = f"{email[:3]}***@{email.split('@')[1]}" if '@' in email else email
                logger.warning(
                    "Email verification code generated | email=%s | username=%s | code=%s | expires_in=%s min",
                    masked,
                    username,
                    verification_code,
                    15,
                )
        except Exception:
            # Never break signup flow due to logging issues
            pass
        
        # Delete any existing verification codes for this email
        EmailVerification.objects.filter(email=email).delete()
        
        # Create new verification record
        verification = EmailVerification.objects.create(
            email=email,
            username=username,
            verification_code=verification_code,
            expires_at=timezone.now() + timedelta(minutes=15)
        )
        
        # Send email
        if send_verification_email_local(email, username, verification_code):
            return Response({
                'success': True,
                'message': 'Verification code sent to your email',
                'expires_in_minutes': 15
            })
        else:
            # Clean up if email failed
            verification.delete()
            return Response({
                'success': False,
                'message': 'Failed to send verification email. Please try again.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
    except Exception as e:
        logger.error(f"Error in send_email_verification: {str(e)}")
        return Response({
            'success': False,
            'message': 'An error occurred. Please try again later.'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@csrf_exempt
@api_view(['POST'])
@permission_classes([AllowAny])
def verify_email_and_signup(request):
    """Verify email code and complete user registration with enhanced security"""
    try:
        email = request.data.get('email', '').strip().lower()
        verification_code = request.data.get('verification_code', '').strip()
        username = request.data.get('username', '').strip()
        password = request.data.get('password', '').strip()
        
        # Validate inputs
        if not all([email, verification_code, username, password]):
            return Response({
                'success': False,
                'message': 'All fields are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Find verification record
        try:
            verification = EmailVerification.objects.get(
                email=email,
                username=username,
                verification_code=verification_code
            )
        except EmailVerification.DoesNotExist:
            return Response({
                'success': False,
                'message': 'Invalid verification code or email'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if verification is valid
        if not verification.is_valid():
            reason = "expired" if timezone.now() >= verification.expires_at else "too many attempts"
            verification.delete()
            return Response({
                'success': False,
                'message': f'Verification code has {reason}. Please request a new one.'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Increment attempts
        verification.increment_attempts()
        
        # Check if user already exists (double-check)
        if User.objects.filter(email=email).exists():
            verification.delete()
            return Response({
                'success': False,
                'message': 'An account with this email already exists'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if User.objects.filter(username=username).exists():
            verification.delete()
            return Response({
                'success': False,
                'message': 'This username is already taken'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Enhanced password validation
        if len(password) < 8:
            return Response({
                'success': False,
                'message': 'Password must be at least 8 characters long'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check password strength
        if not re.search(r'[A-Z]', password):
            return Response({
                'success': False,
                'message': 'Password must contain at least one uppercase letter'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if not re.search(r'[a-z]', password):
            return Response({
                'success': False,
                'message': 'Password must contain at least one lowercase letter'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if not re.search(r'[0-9]', password):
            return Response({
                'success': False,
                'message': 'Password must contain at least one number'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Create user account
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password
        )
        
        # Mark verification as completed
        verification.is_verified = True
        verification.save()
        
        # Clean up all verification records for this email
        EmailVerification.objects.filter(email=email).exclude(id=verification.id).delete()
        
        # Send welcome email without exposing sensitive data
        try:
            subject = 'Welcome to Togetha - Account Created Successfully!'
            message = f'''Welcome to Togetha, {username}!

Your account has been successfully created and verified. You can now log in and start using all our features:

• Task Management with smart scheduling
• Advanced Note Taking with AI assistance
• AI Assistant (RINA) for productivity
• Secure multi-factor authentication
• And much more!

For your security, we recommend:
1. Setting up two-factor authentication
2. Using a strong, unique password
3. Keeping your account information up to date

Thank you for joining our community.

Best regards,
The Togetha Team

---
Need help? Contact us at support@togetha.com
Security concerns? Email security@togetha.com'''
            
            sendgrid_email(email, subject, message)
        except Exception as e:
            logger.warning(f"Failed to send welcome email: {str(e)}")
        
        # Log successful account creation (without sensitive data)
        logger.info(f"New account created: {username} ({email[:3]}***@{email.split('@')[1]})")
        
        return Response({
            'success': True,
            'message': 'Account created successfully! You can now log in.',
            'user': {
                'id': user.id,
                'username': user.username,
                'email': user.email
            }
        })
        
    except Exception as e:
        logger.error(f"Error in verify_email_and_signup: {str(e)}")
        return Response({
            'success': False,
            'message': 'An error occurred while creating your account. Please try again.'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
