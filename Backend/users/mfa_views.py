import pyotp
import qrcode
from io import BytesIO
import base64
from django.contrib.auth.models import User
from django.contrib.auth import authenticate
from django.core.mail import send_mail
from django.conf import settings
from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework.response import Response
from rest_framework.authtoken.models import Token
from django.utils import timezone
from datetime import timedelta
from .models import TwoFactorAuth, LoginAttempt, SecuritySettings
from .serializers import UserSerializer
import secrets
import json
from django.http import JsonResponse

def get_client_ip(request):
    """Get client IP address from request"""
    x_forwarded_for = request.META.get('HTTP_X_FORWARDED_FOR')
    if x_forwarded_for:
        ip = x_forwarded_for.split(',')[0]
    else:
        ip = request.META.get('REMOTE_ADDR')
    return ip

def log_login_attempt(email, ip_address, user_agent, success, failure_reason=""):
    """Log login attempt for security monitoring"""
    LoginAttempt.objects.create(
        email=email,
        ip_address=ip_address,
        user_agent=user_agent[:1000],  # Limit length
        success=success,
        failure_reason=failure_reason
    )

def check_rate_limiting(email, ip_address):
    """Check if user/IP is rate limited"""
    # Check failed attempts in last 15 minutes
    recent_attempts = LoginAttempt.objects.filter(
        email=email,
        success=False,
        timestamp__gte=timezone.now() - timedelta(minutes=15)
    ).count()
    
    if recent_attempts >= 5:
        return True, "Too many failed attempts. Please try again in 15 minutes."
    
    # Check IP-based rate limiting
    ip_attempts = LoginAttempt.objects.filter(
        ip_address=ip_address,
        success=False,
        timestamp__gte=timezone.now() - timedelta(minutes=15)
    ).count()
    
    if ip_attempts >= 10:
        return True, "Too many failed attempts from this IP. Please try again later."
    
    return False, ""

@api_view(['POST'])
@permission_classes([AllowAny])
def login_with_mfa(request):
    """Enhanced login with MFA support"""
    try:
        email = request.data.get('email', '').strip().lower()
        password = request.data.get('password', '').strip()
        totp_code = request.data.get('totp_code', '').strip()
        backup_code = request.data.get('backup_code', '').strip()
        
        ip_address = get_client_ip(request)
        user_agent = request.META.get('HTTP_USER_AGENT', '')
        
        if not email or not password:
            return Response({
                'error': 'Email and password are required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Check rate limiting
        is_limited, limit_message = check_rate_limiting(email, ip_address)
        if is_limited:
            return Response({
                'error': limit_message
            }, status=status.HTTP_429_TOO_MANY_REQUESTS)
        
        # Find user by email
        try:
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            log_login_attempt(email, ip_address, user_agent, False, "User not found")
            return Response({
                'error': 'Invalid credentials'
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        # Authenticate user
        authenticated_user = authenticate(username=user.username, password=password)
        if not authenticated_user:
            log_login_attempt(email, ip_address, user_agent, False, "Invalid password")
            return Response({
                'error': 'Invalid credentials'
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        # Check if user is active
        if not user.is_active:
            log_login_attempt(email, ip_address, user_agent, False, "Account disabled")
            return Response({
                'error': 'Account is disabled'
            }, status=status.HTTP_401_UNAUTHORIZED)
        
        # Check if 2FA is enabled
        two_factor, created = TwoFactorAuth.objects.get_or_create(user=user)
        
        if two_factor.is_enabled:
            # 2FA is enabled, verify TOTP or backup code
            if totp_code:
                if not two_factor.verify_token(totp_code):
                    log_login_attempt(email, ip_address, user_agent, False, "Invalid TOTP code")
                    return Response({
                        'error': 'Invalid verification code'
                    }, status=status.HTTP_401_UNAUTHORIZED)
                
                two_factor.last_used = timezone.now()
                two_factor.save()
                
            elif backup_code:
                if not two_factor.verify_backup_code(backup_code):
                    log_login_attempt(email, ip_address, user_agent, False, "Invalid backup code")
                    return Response({
                        'error': 'Invalid backup code'
                    }, status=status.HTTP_401_UNAUTHORIZED)
            else:
                # Need 2FA verification
                return Response({
                    'requires_2fa': True,
                    'message': 'Two-factor authentication required'
                }, status=status.HTTP_200_OK)
        
        # Successful login
        log_login_attempt(email, ip_address, user_agent, True)
        
        # Create or get token
        token, created = Token.objects.get_or_create(user=user)
        
        # Get or create security settings
        security_settings, created = SecuritySettings.objects.get_or_create(user=user)
        
        return Response({
            'success': True,
            'token': token.key,
            'user': UserSerializer(user).data,
            'has_2fa': two_factor.is_enabled,
            'security_settings': {
                'email_notifications': security_settings.email_notifications,
                'login_notifications': security_settings.login_notifications,
                'session_timeout': security_settings.session_timeout,
            }
        })
        
    except Exception as e:
        log_login_attempt(email, ip_address, user_agent, False, f"Server error: {str(e)}")
        return Response({
            'error': 'An error occurred during login'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def setup_2fa(request):
    """Setup two-factor authentication"""
    try:
        user = request.user
        two_factor, created = TwoFactorAuth.objects.get_or_create(user=user)
        
        if two_factor.is_enabled:
            return Response({
                'error': 'Two-factor authentication is already enabled'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Generate secret if not exists
        secret = two_factor.generate_secret()
        
        # Create QR code
        totp_uri = two_factor.get_qr_code_url()
        
        # Generate QR code image
        qr = qrcode.QRCode(version=1, box_size=10, border=5)
        qr.add_data(totp_uri)
        qr.make(fit=True)
        
        img = qr.make_image(fill_color="black", back_color="white")
        buffer = BytesIO()
        img.save(buffer, format='PNG')
        qr_code_base64 = base64.b64encode(buffer.getvalue()).decode()
        
        return Response({
            'secret': secret,
            'qr_code': f"data:image/png;base64,{qr_code_base64}",
            'manual_entry_key': secret,
            'account_name': f"Togetha:{user.email}"
        })
        
    except Exception as e:
        return Response({
            'error': f'Failed to setup 2FA: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def verify_2fa_setup(request):
    """Verify and enable 2FA"""
    try:
        user = request.user
        verification_code = request.data.get('verification_code', '').strip()
        
        if not verification_code:
            return Response({
                'error': 'Verification code is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        two_factor = TwoFactorAuth.objects.get(user=user)
        
        if two_factor.verify_token(verification_code):
            two_factor.is_enabled = True
            two_factor.last_used = timezone.now()
            
            # Generate backup codes
            backup_codes = two_factor.generate_backup_codes()
            two_factor.save()
            
            # Send confirmation email
            try:
                send_mail(
                    subject='Two-Factor Authentication Enabled - Togetha',
                    message=f'''Hi {user.first_name or user.username},

Two-factor authentication has been successfully enabled for your Togetha account.

Your account is now more secure. You'll need to enter a verification code from your authenticator app when logging in.

Save these backup codes in a safe place:
{chr(10).join(backup_codes)}

Use these codes if you lose access to your authenticator app.

If you didn't enable 2FA, please contact support immediately.

Best regards,
Togetha Security Team''',
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[user.email],
                    fail_silently=True,
                )
            except:
                pass
            
            return Response({
                'success': True,
                'message': '2FA enabled successfully',
                'backup_codes': backup_codes
            })
        else:
            return Response({
                'error': 'Invalid verification code'
            }, status=status.HTTP_400_BAD_REQUEST)
        
    except TwoFactorAuth.DoesNotExist:
        return Response({
            'error': '2FA setup not found. Please start setup process again.'
        }, status=status.HTTP_400_BAD_REQUEST)
    except Exception as e:
        return Response({
            'error': f'Failed to verify 2FA: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def disable_2fa(request):
    """Disable two-factor authentication"""
    try:
        user = request.user
        current_password = request.data.get('current_password', '').strip()
        verification_code = request.data.get('verification_code', '').strip()
        
        if not current_password:
            return Response({
                'error': 'Current password is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Verify current password
        if not authenticate(username=user.username, password=current_password):
            return Response({
                'error': 'Current password is incorrect'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            two_factor = TwoFactorAuth.objects.get(user=user)
            
            if not two_factor.is_enabled:
                return Response({
                    'error': 'Two-factor authentication is not enabled'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Verify TOTP code if provided
            if verification_code and not two_factor.verify_token(verification_code):
                return Response({
                    'error': 'Invalid verification code'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Disable 2FA
            two_factor.is_enabled = False
            two_factor.secret = None
            two_factor.backup_codes = []
            two_factor.save()
            
            # Send notification email
            try:
                send_mail(
                    subject='Two-Factor Authentication Disabled - Togetha',
                    message=f'''Hi {user.first_name or user.username},

Two-factor authentication has been disabled for your Togetha account.

If you didn't disable 2FA, please:
1. Change your password immediately
2. Re-enable 2FA
3. Contact our support team

Best regards,
Togetha Security Team''',
                    from_email=settings.DEFAULT_FROM_EMAIL,
                    recipient_list=[user.email],
                    fail_silently=True,
                )
            except:
                pass
            
            return Response({
                'success': True,
                'message': '2FA disabled successfully'
            })
            
        except TwoFactorAuth.DoesNotExist:
            return Response({
                'error': 'Two-factor authentication is not enabled'
            }, status=status.HTTP_400_BAD_REQUEST)
        
    except Exception as e:
        return Response({
            'error': f'Failed to disable 2FA: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_2fa_status(request):
    """Get 2FA status for user"""
    try:
        user = request.user
        two_factor, created = TwoFactorAuth.objects.get_or_create(user=user)
        
        return Response({
            'is_enabled': two_factor.is_enabled,
            'last_used': two_factor.last_used,
            'backup_codes_count': len(two_factor.backup_codes) if two_factor.backup_codes else 0
        })
        
    except Exception as e:
        return Response({
            'error': f'Failed to get 2FA status: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['POST'])
@permission_classes([IsAuthenticated])
def regenerate_backup_codes(request):
    """Regenerate backup codes"""
    try:
        user = request.user
        current_password = request.data.get('current_password', '').strip()
        
        if not current_password:
            return Response({
                'error': 'Current password is required'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        # Verify current password
        if not authenticate(username=user.username, password=current_password):
            return Response({
                'error': 'Current password is incorrect'
            }, status=status.HTTP_400_BAD_REQUEST)
        
        try:
            two_factor = TwoFactorAuth.objects.get(user=user)
            
            if not two_factor.is_enabled:
                return Response({
                    'error': 'Two-factor authentication is not enabled'
                }, status=status.HTTP_400_BAD_REQUEST)
            
            # Generate new backup codes
            backup_codes = two_factor.generate_backup_codes()
            
            return Response({
                'success': True,
                'backup_codes': backup_codes,
                'message': 'New backup codes generated successfully'
            })
            
        except TwoFactorAuth.DoesNotExist:
            return Response({
                'error': 'Two-factor authentication is not enabled'
            }, status=status.HTTP_400_BAD_REQUEST)
        
    except Exception as e:
        return Response({
            'error': f'Failed to regenerate backup codes: {str(e)}'
        }, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
