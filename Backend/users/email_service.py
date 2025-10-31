import sendgrid
import uuid
from sendgrid.helpers.mail import Mail, Personalization, CustomArg
from django.conf import settings
import logging

logger = logging.getLogger(__name__)

def send_verification_email(to_email, subject, content):
    """
    Send verification email using SendGrid.

    Requires these settings to be configured:
      - SENDGRID_API_KEY
      - EMAIL_FROM

    Returns True if SendGrid accepted the message (2xx). Returns False on
    configuration problems, SendGrid non-2xx responses or exceptions.
    """
    try:
        # Ensure configuration is present
        if not getattr(settings, 'SENDGRID_API_KEY', None):
            logger.error("SENDGRID_API_KEY is not configured. Cannot send email.")
            return False

        if not getattr(settings, 'EMAIL_FROM', None):
            logger.error("EMAIL_FROM is not configured. Cannot send email.")
            return False

        # Basic validation of API key format
        if not settings.SENDGRID_API_KEY.startswith('SG.'):
            logger.error("SENDGRID_API_KEY does not appear to be a valid SendGrid key. Check configuration.")
            return False

        logger.info(f"Attempting to send email to {to_email} from {settings.EMAIL_FROM}")

        sg = sendgrid.SendGridAPIClient(api_key=settings.SENDGRID_API_KEY)

        # Add a unique app-specific id so we can correlate messages with SendGrid events
        # Use SendGrid's custom_args (supported by the API) instead of headers to avoid
        # compatibility issues across client library versions.
        app_message_id = str(uuid.uuid4())
        # Build both plain-text and HTML versions to improve formatting and deliverability.
        def _to_html(text):
            # If the content already looks like HTML, return as-is.
            if '<' in text and '>' in text:
                return text
            # Simple paragraph wrapping for plaintext content
            lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
            return ''.join(f"<p>{ln}</p>" for ln in lines)

        plain = content if content else ''
        html = _to_html(content or '')

        email = Mail(
            from_email=settings.EMAIL_FROM,
            to_emails=to_email,
            subject=subject,
            plain_text_content=plain,
            html_content=html,
        )

        try:
            # Attach custom_args on the personalization object so SendGrid echoes it in events.
            # The Mail object may not allow setting custom_args directly, but each
            # Personalization supports custom_args.
            if getattr(email, 'personalizations', None):
                p = email.personalizations[0]
            else:
                p = Personalization()
                p.add_to(to_email)
                email.add_personalization(p)

            try:
                # Use a CustomArg object where supported; fall back to other
                # forms for compatibility with older/newer helper versions.
                try:
                    p.add_custom_arg(CustomArg('app_message_id', app_message_id))
                except TypeError:
                    # Some versions accept (key, value)
                    try:
                        p.add_custom_arg('app_message_id', app_message_id)
                    except TypeError:
                        # Some versions expect a dict-like or other form; try dict
                        try:
                            p.add_custom_arg({'app_message_id': app_message_id})
                        except Exception:
                            logger.exception('Failed to add custom_arg (dict-form) to Personalization')
                except Exception:
                    logger.exception('Failed to add CustomArg to Personalization')
            except Exception:
                logger.exception('Failed to add custom_arg to Personalization')
        except Exception:
            # Best-effort only; sending should proceed even if we can't attach custom args
            logger.exception('Failed to attach custom_args to Mail personalizations')

        response = sg.send(email)

        status = getattr(response, 'status_code', None)
        logger.info(f"SendGrid response status: {status}")

        # SendGrid typically returns 202 Accepted for queued messages
        if status and 200 <= int(status) < 300:
            # Log response headers and the application message id so you can search in SendGrid
            try:
                resp_headers = getattr(response, 'headers', None)
                if resp_headers:
                    logger.info(f"SendGrid response headers: {resp_headers}")
            except Exception:
                logger.exception("Failed to read SendGrid response headers")

            logger.info(f"Email sent successfully to {to_email} (app_message_id={app_message_id})")
            return True
        else:
            logger.error(f"SendGrid returned non-success status: {status}")
            try:
                if hasattr(response, 'body') and response.body:
                    logger.error(f"SendGrid response body: {response.body}")
            except Exception:
                logger.exception("Failed to read SendGrid response body")
            return False

    except Exception as e:
        # Log full traceback
        logger.exception(f"SendGrid exception when sending email to {to_email}: {e}")

        # Try to extract HTTP details from SendGrid / python_http_client exceptions
        try:
            body = getattr(e, 'body', None)
            status_code = getattr(e, 'status_code', None)

            # Sometimes the error payload is present in args[0]
            if not body and getattr(e, 'args', None):
                body = e.args[0]

            if status_code:
                logger.error(f"SendGrid HTTP status code: {status_code}")

            if body:
                logger.error(f"SendGrid response body: {body}")

            # Actionable hint for 403 Forbidden
            if (status_code == 403) or (status_code and str(status_code).startswith('403')) or ('Forbidden' in str(e)):
                logger.error(
                    "SendGrid returned 403 Forbidden. Common causes: API key missing 'Mail Send' permission, "
                    "API key is invalid/revoked, EMAIL_FROM is not a verified sender, or the account is restricted. "
                    "Check your SendGrid API key permissions, verify the sender identity, and check the SendGrid dashboard suppression list."
                )
        except Exception:
            logger.exception("Failed to extract SendGrid error details")

        return False


def _log_email_to_console(to_email, subject, content):
    """Log email content to console for development/debugging"""
    logger.info("=" * 50)
    logger.info("EMAIL WOULD BE SENT (Console Mode)")
    logger.info("=" * 50)
    logger.info(f"To: {to_email}")
    logger.info(f"Subject: {subject}")
    logger.info("Content:")
    logger.info("-" * 30)
    # Convert HTML to plain text for console
    import re
    plain_content = re.sub(r'<[^>]+>', '', content)  # Remove HTML tags
    plain_content = re.sub(r'\n\s*\n', '\n', plain_content)  # Remove extra newlines
    logger.info(plain_content)
    logger.info("=" * 50)
