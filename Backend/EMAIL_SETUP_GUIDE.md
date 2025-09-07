# Email Configuration Guide for Togetha

## Quick Setup for Testing

For immediate testing, the console backend is now enabled. Verification codes will appear in the Django server console.

## Setting up Gmail SMTP for Production

### Step 1: Enable App Passwords in Gmail

1. Go to your Google Account settings
2. Navigate to Security
3. Enable 2-Factor Authentication if not already enabled
4. Generate an "App Password" for your application

### Step 2: Update Django Settings

In `Backend/server/settings.py`, update the email configuration:

```python
# Email Configuration for Production
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.gmail.com'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = 'your-actual-email@gmail.com'  # Your Gmail address
EMAIL_HOST_PASSWORD = 'your-16-char-app-password'  # App password from Gmail
DEFAULT_FROM_EMAIL = 'your-actual-email@gmail.com'
```

### Step 3: Test Email Sending

You can test the email configuration with this Django shell command:

```python
python manage.py shell

from django.core.mail import send_mail
send_mail(
    'Test Subject',
    'Test message',
    'your-email@gmail.com',
    ['recipient@email.com'],
    fail_silently=False,
)
```

## Alternative Email Services

### SendGrid
```python
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.sendgrid.net'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = 'apikey'
EMAIL_HOST_PASSWORD = 'your-sendgrid-api-key'
```

### Mailgun
```python
EMAIL_BACKEND = 'django.core.mail.backends.smtp.EmailBackend'
EMAIL_HOST = 'smtp.mailgun.org'
EMAIL_PORT = 587
EMAIL_USE_TLS = True
EMAIL_HOST_USER = 'your-mailgun-username'
EMAIL_HOST_PASSWORD = 'your-mailgun-password'
```

## Environment Variables (Recommended)

For security, use environment variables:

1. Create a `.env` file in your Backend directory:
```env
EMAIL_HOST_USER=your-email@gmail.com
EMAIL_HOST_PASSWORD=your-app-password
```

2. Update settings.py:
```python
import os
from dotenv import load_dotenv

load_dotenv()

EMAIL_HOST_USER = os.getenv('EMAIL_HOST_USER')
EMAIL_HOST_PASSWORD = os.getenv('EMAIL_HOST_PASSWORD')
```

3. Install python-dotenv:
```bash
pip install python-dotenv
```

## Current Status

- ✅ Console backend enabled for testing
- ✅ Verification codes will show in Django console
- ✅ No authentication errors during signup
- 🔧 SMTP configuration needed for production

## Testing the Signup Flow

1. Start the Django server: `python manage.py runserver`
2. Try the signup process
3. Check the Django console for the verification code
4. Use the code to complete signup

The signup should work now without authentication errors!
