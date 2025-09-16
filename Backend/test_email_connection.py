#!/usr/bin/env python
"""
Email connection test script for Togetha backend.
This script helps diagnose email connectivity issues and ISP blocking.
"""

import os
import sys
import django
from django.conf import settings

# Add the Backend directory to the Python path
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

# Setup Django
os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'server.settings')
django.setup()

from django.core.mail import send_mail
from server.email_backend import test_email_connection
import socket

def test_port_connectivity():
    """Test if SMTP ports are accessible"""
    print("🔍 Testing SMTP port connectivity...")
    
    ports_to_test = [25, 587, 465]
    host = 'smtp.gmail.com'
    
    for port in ports_to_test:
        try:
            print(f"Testing {host}:{port}...", end=" ")
            sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            sock.settimeout(10)
            result = sock.connect_ex((host, port))
            sock.close()
            
            if result == 0:
                print("✅ OPEN")
            else:
                print("❌ BLOCKED")
        except Exception as e:
            print(f"❌ ERROR: {e}")

def test_email_sending():
    """Test actual email sending"""
    print("\n📧 Testing email sending with fallback backend...")
    
    try:
        send_mail(
            subject='Test Email from Togetha',
            message='This is a test email to verify the email configuration is working.',
            from_email=settings.DEFAULT_FROM_EMAIL,
            recipient_list=[settings.EMAIL_HOST_USER],  # Send to yourself
            fail_silently=False,
        )
        print("✅ Email sent successfully!")
        return True
    except Exception as e:
        print(f"❌ Email sending failed: {str(e)}")
        return False

def main():
    print("🚀 Togetha Email Configuration Test")
    print("=" * 50)
    
    # Test 1: Port connectivity
    test_port_connectivity()
    
    # Test 2: Email backend configurations
    print("\n🔧 Testing SMTP configurations...")
    working_config = test_email_connection()
    
    # Test 3: Actual email sending
    email_success = test_email_sending()
    
    print("\n" + "=" * 50)
    print("📋 SUMMARY & RECOMMENDATIONS")
    print("=" * 50)
    
    if email_success:
        print("✅ Email system is working correctly!")
    else:
        print("❌ Email system needs attention.")
        print("\n🔧 SOLUTIONS:")
        print("1. 🏠 Use from your home network (if it works there)")
        print("2. 🌐 Switch to SendGrid/Mailgun (ISP-independent):")
        print("   • Sign up for SendGrid (free tier available)")
        print("   • Update EMAIL_HOST to 'smtp.sendgrid.net'")
        print("   • Use SendGrid API key as password")
        print("3. 📱 Use mobile hotspot temporarily")
        print("4. 🏢 Check with your network admin about SMTP restrictions")
        print("5. ☁️  Deploy to cloud service (AWS, Heroku, DigitalOcean)")
        
        print("\n📝 Quick SendGrid setup:")
        print("   1. Sign up at sendgrid.com")
        print("   2. Generate API key")
        print("   3. Uncomment SendGrid config in settings.py")
        print("   4. Replace 'your-sendgrid-api-key' with actual key")

if __name__ == "__main__":
    main()