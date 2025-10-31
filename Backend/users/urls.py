from .password_change_views import send_password_change_verification, verify_password_change
from .email_verification_views import send_email_verification, verify_email_and_signup
from .mfa_views import (
    login_with_mfa, setup_2fa, verify_2fa_setup, disable_2fa, 
    get_2fa_status, regenerate_backup_codes
)
from django.conf.urls.static import static
from django.urls import path
from django.conf import settings
from . import views

urlpatterns = [
    # User profile and progress
    path('profile/', views.user_profile, name='user_profile'),
    path('<int:user_id>/profile-picture/', views.serve_profile_picture, name='serve_profile_picture'),
    path('progress/', views.user_progress, name='user_progress'),
    path('session/', views.manage_session, name='manage_session'),
    path('csrf-token/', views.get_csrf_token, name='get_csrf_token'), 
    
    # Password management
    path('forgot-password/', views.forgot_password, name='forgot_password'),
    path('verify-reset-code/', views.verify_reset_code, name='verify_reset_code'),
    path('send-password-change-verification/', send_password_change_verification, name='send_password_change_verification'),
    path('verify-password-change/', verify_password_change, name='verify_password_change'),
    
    # Email verification for signup
    path('send-email-verification/', send_email_verification, name='send_email_verification'),
    # SendGrid Event Webhook endpoint
    path('sendgrid/webhook/', views.sendgrid_event_webhook, name='sendgrid_event_webhook'),
    path('verify-email-and-signup/', verify_email_and_signup, name='verify_email_and_signup'),
    
    # Multi-factor authentication
    path('login-mfa/', login_with_mfa, name='login_with_mfa'),
    path('setup-2fa/', setup_2fa, name='setup_2fa'),
    path('verify-2fa-setup/', verify_2fa_setup, name='verify_2fa_setup'),
    path('disable-2fa/', disable_2fa, name='disable_2fa'),
    path('2fa-status/', get_2fa_status, name='get_2fa_status'),
    path('regenerate-backup-codes/', regenerate_backup_codes, name='regenerate_backup_codes'),
]

if settings.DEBUG:
    urlpatterns += static(settings.MEDIA_URL, document_root=settings.MEDIA_ROOT)
