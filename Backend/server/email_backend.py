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
        # Build a prioritized list of SMTP configs.
        # 1) First try exactly what's in Django settings (could be SendGrid or custom host)
        # 2) Then try SendGrid standard ports
        # 3) Finally, try Gmail as a last resort for dev/prototyping
        self.smtp_configs = []

        # Settings-provided host (if present)
        if getattr(settings, 'EMAIL_HOST', None):
            self.smtp_configs.append({
                'host': settings.EMAIL_HOST,
                'port': getattr(settings, 'EMAIL_PORT', 587),
                'use_ssl': getattr(settings, 'EMAIL_USE_SSL', False),
                'use_tls': getattr(settings, 'EMAIL_USE_TLS', True),
                'description': f"Settings SMTP ({settings.EMAIL_HOST}:{getattr(settings,'EMAIL_PORT',587)})"
            })

        # SendGrid standard SMTP endpoints
        self.smtp_configs.extend([
            {
                'host': 'smtp.sendgrid.net',
                'port': 587,
                'use_ssl': False,
                'use_tls': True,
                'description': 'SendGrid TLS (Port 587)'
            },
            {
                'host': 'smtp.sendgrid.net',
                'port': 465,
                'use_ssl': True,
                'use_tls': False,
                'description': 'SendGrid SSL (Port 465)'
            },
        ])

        # Gmail as final fallback (useful only in development contexts)
        self.smtp_configs.extend([
            {
                'host': 'smtp.gmail.com',
                'port': 587,
                'use_ssl': False,
                'use_tls': True,
                'description': 'Gmail TLS (Port 587)'
            },
            {
                'host': 'smtp.gmail.com',
                'port': 465,
                'use_ssl': True,
                'use_tls': False,
                'description': 'Gmail SSL (Port 465)'
            },
        ])
    
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
                
                # Ensure the credentials from settings are applied
                self.username = getattr(settings, 'EMAIL_HOST_USER', None)
                self.password = getattr(settings, 'EMAIL_HOST_PASSWORD', None)

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

    configs = backend.smtp_configs

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
            
    print("\n❌ All configurations failed. SMTP connectivity blocked or credentials invalid.")
    print("Verify EMAIL_HOST/PORT/TLS settings and credentials. For SendGrid SMTP, username='apikey' and password=SENDGRID_API_KEY.")
    return None