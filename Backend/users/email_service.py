from django.conf import settings
from django.core.mail import EmailMultiAlternatives
import logging

logger = logging.getLogger(__name__)

def _to_html(text: str) -> str:
    """Convert plain text to a basic HTML body if not already HTML."""
    if not text:
        return ""
    if '<' in text and '>' in text:
        return text
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    return ''.join(f"<p>{ln}</p>" for ln in lines)


def send_verification_email(to_email: str, subject: str, content: str) -> bool:
    """
    Send verification emails via Django's email backend (SMTP).

    This will use the configured EMAIL_BACKEND and settings from server.settings
    which are already set up to prefer SendGrid SMTP when SENDGRID_API_KEY is provided.

    Returns True on success, False on failure.
    """
    try:
        from_email = getattr(settings, 'DEFAULT_FROM_EMAIL', None)
        if not from_email:
            logger.error('DEFAULT_FROM_EMAIL is not configured.')
            return False

        text_body = content or ''
        html_body = _to_html(content or '')

        msg = EmailMultiAlternatives(subject=subject, body=text_body, from_email=from_email, to=[to_email])
        if html_body:
            msg.attach_alternative(html_body, "text/html")

        sent = msg.send(fail_silently=False)
        if sent:
            logger.info(f"Email sent via SMTP to {to_email} using backend {settings.EMAIL_BACKEND}")
            return True
        logger.error(f"SMTP backend returned 0 for recipient {to_email}")
        return False
    except Exception as e:
        logger.exception(f"Failed to send email to {to_email} via SMTP: {e}")
        return False
