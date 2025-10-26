from django.core.mail.backends.smtp import EmailBackend
from django.conf import settings
import socket
import logging

logger = logging.getLogger(__name__)

class FallbackSMTPBackend(EmailBackend):
    """
    Custom SMTP backend that tries multiple configurations to bypass ISP restrictions.
    Falls back through different ports and configurations if one fails.
    """
    
    def __init__(self, *args, **kwargs):
        super().__init__(*args, **kwargs)
        self.smtp_configs = [
            {
                'host': 'smtp.gmail.com',
                'port': 465,
                'use_ssl': True,
                'use_tls': False,
                'description': 'Gmail SSL (Port 465)'
            },
            {
                'host': 'smtp.gmail.com',
                'port': 587,
                'use_ssl': False,
                'use_tls': True,
                'description': 'Gmail TLS (Port 587)'
            },
            {
                'host': 'smtp.gmail.com',
                'port': 25,
                'use_ssl': False,
                'use_tls': True,
                'description': 'Gmail Standard SMTP (Port 25)'
            }
        ]
    
    def open(self):
        """
        Try to open a connection using different SMTP configurations.
        """
        if self.connection:
            return False
            
        for config in self.smtp_configs:
            try:
                logger.info(f"Attempting email connection: {config['description']}")
                
                # Update configuration for this attempt
                self.host = config['host']
                self.port = config['port']
                self.use_ssl = config['use_ssl']
                self.use_tls = config['use_tls']
                
                # Try to establish connection
                connection_opened = super().open()
                if connection_opened:
                    logger.info(f"Successfully connected using: {config['description']}")
                    return True
                    
            except (socket.error, OSError) as e:
                logger.warning(f"Failed to connect using {config['description']}: {str(e)}")
                if self.connection:
                    try:
                        self.connection.quit()
                    except:
                        pass
                    self.connection = None
                continue
                
        logger.error("All SMTP configurations failed. Email sending not available.")
        return False

    def send_messages(self, email_messages):
        """
        Send email messages with automatic fallback.
        """
        if not email_messages:
            return 0
            
        # Try to open connection with fallback
        if not self.open():
            logger.error("Could not establish email connection with any configuration")
            # For development, you might want to fallback to console backend
            if settings.DEBUG:
                from django.core.mail.backends.console import EmailBackend as ConsoleBackend
                console_backend = ConsoleBackend()
                logger.info("Falling back to console output for development")
                return console_backend.send_messages(email_messages)
            return 0
            
        # Send messages using parent class method
        try:
            return super().send_messages(email_messages)
        except Exception as e:
            logger.error(f"Error sending emails: {str(e)}")
            return 0
        finally:
            self.close()


def test_email_connection():
    """
    Test function to check which email configuration works.
    Can be called from Django shell or management command.
    """
    backend = FallbackSMTPBackend()
    
    configs = [
        {'host': 'smtp.gmail.com', 'port': 465, 'use_ssl': True, 'use_tls': False},
        {'host': 'smtp.gmail.com', 'port': 587, 'use_ssl': False, 'use_tls': True},
        {'host': 'smtp.gmail.com', 'port': 25, 'use_ssl': False, 'use_tls': True}
    ]
    
    for i, config in enumerate(configs):
        print(f"\nTesting configuration {i+1}: {config}")
        
        backend.host = config['host']
        backend.port = config['port']
        backend.use_ssl = config['use_ssl']
        backend.use_tls = config['use_tls']
        backend.username = settings.EMAIL_HOST_USER
        backend.password = settings.EMAIL_HOST_PASSWORD
        
        try:
            if backend.open():
                print(f"✅ SUCCESS: Configuration {i+1} works!")
                backend.close()
                return config
            else:
                print(f"❌ FAILED: Configuration {i+1} did not work")
        except Exception as e:
            print(f"❌ ERROR: Configuration {i+1} failed with: {str(e)}")
            
    print("\n❌ All configurations failed. ISP likely blocking SMTP ports.")
    print("Consider using a service like SendGrid, Mailgun, or AWS SES.")
    return None