#!/usr/bin/env python
"""
Email connection test script for Togetha backend
Run this to test SMTP connectivity before using in Django
"""

import smtplib
import ssl
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

def test_smtp_connection():
    """Test SMTP connection to Gmail"""
    
    # Email configuration (update with your credentials)
    EMAIL_HOST = 'smtp.gmail.com'
    EMAIL_PORT = 587
    EMAIL_HOST_USER = 'kcorpuz_220000002183@uic.edu.ph'
    EMAIL_HOST_PASSWORD = 'tjsw zzdo piwn zjea'  # Your app password
    
    try:
        print("Testing SMTP connection...")
        
        # Create SMTP session
        server = smtplib.SMTP(EMAIL_HOST, EMAIL_PORT)
        server.starttls()  # Enable TLS encryption
        
        print("TLS connection established successfully")
        
        # Login to the server
        server.login(EMAIL_HOST_USER, EMAIL_HOST_PASSWORD)
        print("Login successful!")
        
        # Create a test message
        msg = MIMEMultipart()
        msg['From'] = EMAIL_HOST_USER
        msg['To'] = EMAIL_HOST_USER  # Send to yourself for testing
        msg['Subject'] = "Togetha SMTP Test"
        
        body = "This is a test email from Togetha backend. SMTP is working correctly!"
        msg.attach(MIMEText(body, 'plain'))
        
        # Send the test email
        text = msg.as_string()
        server.sendmail(EMAIL_HOST_USER, EMAIL_HOST_USER, text)
        print("Test email sent successfully!")
        
        server.quit()
        print("SMTP test completed successfully ✓")
        return True
        
    except smtplib.SMTPAuthenticationError as e:
        print(f"❌ Authentication failed: {e}")
        print("Please check your email and app password")
        return False
        
    except smtplib.SMTPConnectError as e:
        print(f"❌ Connection failed: {e}")
        print("Please check your internet connection and firewall settings")
        return False
        
    except Exception as e:
        print(f"❌ SMTP test failed: {e}")
        return False

if __name__ == "__main__":
    success = test_smtp_connection()
    
    if success:
        print("\n✅ SMTP is working! You can now enable SMTP in Django settings.")
    else:
        print("\n❌ SMTP test failed. Please fix the issues before enabling SMTP in Django.")
        print("\nTroubleshooting steps:")
        print("1. Verify your Gmail app password is correct")
        print("2. Ensure 2FA is enabled on your Gmail account")
        print("3. Check if your firewall is blocking port 587")
        print("4. Try using console backend for development testing")