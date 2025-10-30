from django.contrib.auth.models import User
from django.db import models
from django.conf import settings
from django.utils import timezone
from datetime import timedelta
import secrets
import pyotp

class UserProfile(models.Model):
    GENDER_CHOICES = (
        ('Male', 'Male'),
        ('Female', 'Female'),
        ('Other', 'Other'),
    )
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='profile')
    username = models.CharField(max_length=150, blank=True)
    # Legacy binary storage (kept for backwards compatibility)
    profile_picture_content = models.BinaryField(null=True, blank=True)  # Store image content in database
    profile_picture_filename = models.CharField(max_length=255, null=True, blank=True)
    profile_picture_content_type = models.CharField(max_length=100, null=True, blank=True)
    # Preferred file-backed storage for profile pictures
    profile_picture_file = models.ImageField(upload_to='profiles/', null=True, blank=True)
    full_name = models.CharField(max_length=100, blank=True)
    phone_number = models.CharField(max_length=20, blank=True)
    address = models.CharField(max_length=255, blank=True)
    bio = models.TextField(blank=True)
    gender = models.CharField(choices=GENDER_CHOICES, blank=True)
    birthdate = models.DateField(blank=True, null=True)

    def __str__(self):
        return self.user.username
    
class UserSession(models.Model):
    user = models.ForeignKey(settings.AUTH_USER_MODEL, on_delete=models.CASCADE)
    session_id = models.CharField(max_length=100, unique=True)
    device_id = models.CharField(max_length=100)
    device_name = models.CharField(max_length=255, blank=True)
    device_type = models.CharField(max_length=50, blank=True)
    os_name = models.CharField(max_length=50, blank=True)
    os_version = models.CharField(max_length=50, blank=True)
    app_version = models.CharField(max_length=50, blank=True)
    login_timestamp = models.DateTimeField(auto_now_add=True)
    last_active = models.DateTimeField(auto_now=True)
    is_active = models.BooleanField(default=True)
    
    class Meta:
        ordering = ['-login_timestamp']

class UserProgress(models.Model):
    """Model to track user progress across the platform"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='progress')
    last_login = models.DateTimeField(auto_now=True)
    tasks_completed = models.IntegerField(default=0)
    notes_created = models.IntegerField(default=0)
    chatbot_interactions = models.IntegerField(default=0)
    
    class Meta:
        verbose_name = 'User Progress'
        verbose_name_plural = 'User Progress'
    
    def __str__(self):
        return f"{self.user.username}'s Progress"


class PasswordResetCode(models.Model):
    """Model to store password reset verification codes"""
    email = models.EmailField()
    code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_used = models.BooleanField(default=False)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Password Reset Code'
        verbose_name_plural = 'Password Reset Codes'
    
    def __str__(self):
        return f"Reset code for {self.email} - {self.code}"
    
    def is_valid(self):
        """Check if the code is still valid (not expired and not used)"""
        return not self.is_used and timezone.now() < self.expires_at
    
    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(minutes=15)
        super().save(*args, **kwargs)


class PasswordChangeVerification(models.Model):
    """Model to store password change verification codes"""
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    verification_code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Password Change Verification'
        verbose_name_plural = 'Password Change Verifications'
    
    def __str__(self):
        return f"Change code for {self.user.username} - {self.verification_code}"
    
    def is_valid(self):
        """Check if the code is still valid (not expired)"""
        return timezone.now() < self.expires_at


class TwoFactorAuth(models.Model):
    """Model to store TOTP secrets for two-factor authentication"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='two_factor')
    secret = models.CharField(max_length=64, null=True, blank=True)
    is_enabled = models.BooleanField(default=False)
    backup_codes = models.JSONField(default=list, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    last_used = models.DateTimeField(null=True, blank=True)
    
    class Meta:
        verbose_name = 'Two Factor Authentication'
        verbose_name_plural = 'Two Factor Authentications'
    
    def __str__(self):
        return f"2FA for {self.user.username} - {'Enabled' if self.is_enabled else 'Disabled'}"
    
    def generate_secret(self):
        """Generate a new TOTP secret"""
        if not self.secret:
            self.secret = secrets.token_urlsafe(32)
            self.save()
        return self.secret
    
    def get_qr_code_url(self):
        """Generate QR code URL for TOTP setup"""
        if not self.secret:
            self.generate_secret()
        
        # Create TOTP URI
        totp_uri = f"otpauth://totp/Togetha:{self.user.email}?secret={self.secret}&issuer=Togetha"
        return totp_uri
    
    def verify_token(self, token):
        """Verify TOTP token"""
        if not self.secret or not self.is_enabled:
            return False
        
        try:
            # Create TOTP object
            totp = pyotp.TOTP(self.secret)
            # Verify token with 30 second window
            return totp.verify(token, valid_window=1)
        except:
            return False
    
    def generate_backup_codes(self):
        """Generate backup codes for account recovery"""
        codes = [secrets.token_hex(4).upper() for _ in range(10)]
        self.backup_codes = codes
        self.save()
        return codes
    
    def verify_backup_code(self, code):
        """Verify and consume a backup code"""
        if code.upper() in self.backup_codes:
            self.backup_codes.remove(code.upper())
            self.save()
            return True
        return False


class LoginAttempt(models.Model):
    """Model to track login attempts for security"""
    email = models.EmailField()
    ip_address = models.GenericIPAddressField()
    user_agent = models.TextField(blank=True)
    success = models.BooleanField(default=False)
    failure_reason = models.CharField(max_length=100, blank=True)
    timestamp = models.DateTimeField(auto_now_add=True)
    
    class Meta:
        ordering = ['-timestamp']
        verbose_name = 'Login Attempt'
        verbose_name_plural = 'Login Attempts'
    
    def __str__(self):
        status = "Success" if self.success else f"Failed ({self.failure_reason})"
        return f"{self.email} - {status} at {self.timestamp}"


class SecuritySettings(models.Model):
    """Model to store user security preferences"""
    user = models.OneToOneField(User, on_delete=models.CASCADE, related_name='security_settings')
    email_notifications = models.BooleanField(default=True)
    login_notifications = models.BooleanField(default=True)
    require_email_verification = models.BooleanField(default=True)
    password_change_notifications = models.BooleanField(default=True)
    suspicious_activity_notifications = models.BooleanField(default=True)
    session_timeout = models.IntegerField(default=30)  # days
    max_concurrent_sessions = models.IntegerField(default=3)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)
    
    class Meta:
        verbose_name = 'Security Settings'
        verbose_name_plural = 'Security Settings'
    
    def __str__(self):
        return f"Security Settings for {self.user.username}"


class EmailVerification(models.Model):
    """Model to store email verification codes for signup"""
    email = models.EmailField()
    username = models.CharField(max_length=150)
    verification_code = models.CharField(max_length=6)
    created_at = models.DateTimeField(auto_now_add=True)
    expires_at = models.DateTimeField()
    is_verified = models.BooleanField(default=False)
    attempts = models.IntegerField(default=0)
    max_attempts = models.IntegerField(default=5)
    
    class Meta:
        ordering = ['-created_at']
        verbose_name = 'Email Verification'
        verbose_name_plural = 'Email Verifications'
    
    def __str__(self):
        return f"Verification for {self.email} - {'Verified' if self.is_verified else 'Pending'}"
    
    def is_valid(self):
        """Check if the code is still valid (not expired and not max attempts reached)"""
        return (not self.is_verified and 
                timezone.now() < self.expires_at and 
                self.attempts < self.max_attempts)
    
    def increment_attempts(self):
        """Increment verification attempts"""
        self.attempts += 1
        self.save()
    
    def save(self, *args, **kwargs):
        if not self.expires_at:
            self.expires_at = timezone.now() + timedelta(minutes=15)
        super().save(*args, **kwargs)


class SendGridEvent(models.Model):
    """Stores SendGrid Event Webhook payloads for message tracking and debugging."""
    # The recipient email (to)
    email = models.EmailField(db_index=True)

    # SendGrid event type: processed, delivered, bounce, dropped, deferred, spamreport, etc.
    event = models.CharField(max_length=50, db_index=True)

    # SendGrid message id/header (e.g., SG message-id or our X-App-Message-Id header)
    sg_message_id = models.CharField(max_length=255, blank=True, null=True, db_index=True)
    app_message_id = models.CharField(max_length=64, blank=True, null=True, db_index=True)

    # Full raw event payload for inspection
    raw = models.JSONField()

    # Timestamp when the event was received by SendGrid (if provided) or by our server
    timestamp = models.DateTimeField()

    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-timestamp', '-created_at']
        verbose_name = 'SendGrid Event'
        verbose_name_plural = 'SendGrid Events'

    def __str__(self):
        return f"{self.event} for {self.email} at {self.timestamp}"