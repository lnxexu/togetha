from django.contrib.auth import authenticate
from django.contrib.auth.models import User
from django.core.mail import send_mail
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response
from django.utils.crypto import get_random_string
from django.utils import timezone
from datetime import timedelta
from .models import PasswordChangeVerification
import re
import logging

# Configure logging
logger = logging.getLogger(__name__)

def send_password_change_verification_email(user, verification_code):
    """Send password change verification email securely"""
    try:
        subject = 'Password Change Verification - Togetha'
        message = f'''Hi {user.first_name or user.username},

You requested to change your password for your Togetha account.

Please use the verification code below to proceed:

Verification Code: {verification_code}

This code will expire in 10 minutes.

For your security:
- Do not share this code with anyone
- This code can only be used once
- If you didn't request this change, please:
  1. Ignore this email
  2. Change your password immediately
  3. Contact our security team at security@togetha.com

Best regards,
Togetha Security Team

---
Account: {user.email}
Time: {timezone.now().strftime('%Y-%m-%d %H:%M:%S UTC')}
'''
        
        send_mail(
            subject=subject,
            message=message,
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[user.email],
            fail_silently=False,
        )
        
        # Log only non-sensitive information
        logger.info(f"Password change verification sent to {user.email[:3]}***@{user.email.split('@')[1]}")
        return True
        
    except Exception as e:
        logger.error(f"Failed to send password change verification: {str(e)}")
        return False

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def send_password_change_verification(request):
    """Send verification code for password change with enhanced security"""
    try:
        user = request.user
        
        # Rate limiting: Check recent attempts
        recent_attempts = PasswordChangeVerification.objects.filter(
            user=user,
            created_at__gte=timezone.now() - timedelta(minutes=5)
        ).count()
        
        if recent_attempts >= 3:
            return Response({
                'success': False,
                'message': 'Too many verification requests. Please wait 5 minutes before trying again.'
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)
        
        # Generate 6-digit verification code
        verification_code = get_random_string(6, allowed_chars='0123456789')
        
        # Delete any existing verification codes for this user
        PasswordChangeVerification.objects.filter(user=user).delete()
        
        # Create new verification record
        verification = PasswordChangeVerification.objects.create(
            user=user,
            verification_code=verification_code,
            expires_at=timezone.now() + timedelta(minutes=10)
        )
        
        # Send email
        if send_password_change_verification_email(user, verification_code):
            return Response({
                'success': True,
                'message': 'Verification code sent to your email',
                'expires_in_minutes': 10
            })
        else:
            # Clean up if email failed
            verification.delete()
            return Response({
                'success': False,
                'message': 'Failed to send verification email. Please try again.'
            }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
        
    except Exception as e:
        logger.error(f"Error in send_password_change_verification: {str(e)}")
        return Response({
            'success': False,
            'message': 'An error occurred. Please try again later.'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_password_change(request):
    """Verify code and change password"""
    try:
        user = request.user
        verification_code = request.data.get('verification_code')
        current_password = request.data.get('current_password')
        new_password = request.data.get('new_password')
        confirm_password = request.data.get('confirm_password')
        
        # Validate inputs
        if not all([verification_code, current_password, new_password, confirm_password]):
            return Response({
                'success': False,
                'message': 'All fields are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if passwords match
        if new_password != confirm_password:
            return Response({
                'success': False,
                'message': 'New passwords do not match'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Verify current password
        if not authenticate(username=user.username, password=current_password):
            return Response({
                'success': False,
                'message': 'Current password is incorrect'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Find verification record
        try:
            verification = PasswordChangeVerification.objects.get(
                user=user,
                verification_code=verification_code
            )
        except PasswordChangeVerification.DoesNotExist:
            return Response({
                'success': False,
                'message': 'Invalid verification code'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if code has expired
        if verification.expires_at < timezone.now():
            verification.delete()
            return Response({
                'success': False,
                'message': 'Verification code has expired'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Validate password strength
        if len(new_password) < 8:
            return Response({
                'success': False,
                'message': 'Password must be at least 8 characters long'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if not re.search(r'[A-Z]', new_password):
            return Response({
                'success': False,
                'message': 'Password must contain at least one uppercase letter'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if not re.search(r'[a-z]', new_password):
            return Response({
                'success': False,
                'message': 'Password must contain at least one lowercase letter'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if not re.search(r'[0-9]', new_password):
            return Response({
                'success': False,
                'message': 'Password must contain at least one number'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        if not re.search(r'[!@#$%^&*(),.?":{}|<>]', new_password):
            return Response({
                'success': False,
                'message': 'Password must contain at least one special character'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check if new password is different from current
        if authenticate(username=user.username, password=new_password):
            return Response({
                'success': False,
                'message': 'New password must be different from current password'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Change password
        user.set_password(new_password)
        user.save()
        
        # Delete verification record
        verification.delete()
        
        # Send confirmation email
        try:
            subject = 'Password Changed Successfully - Togetha'
            message = f'''
            Hi {user.first_name or user.username},
            
            Your password has been successfully changed.
            
            If you didn't make this change, please contact our support team immediately.
            
            Best regards,
            Togetha Team
            '''
            
            send_mail(
                subject,
                message,
                settings.EMAIL_HOST_USER,
                [user.email],
                fail_silently=True,
            )
        except:
            pass  # Don't fail the password change if email fails
        
        return Response({
            'success': True,
            'message': 'Password changed successfully'
        })
        
    except Exception as e:
        return Response({
            'success': False,
            'message': f'Failed to change password: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
