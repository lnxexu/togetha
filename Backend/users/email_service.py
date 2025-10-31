from django.conf import settings
from django.core.mail import EmailMultiAlternatives
import logging
from typing import Optional

logger = logging.getLogger(__name__)

def _to_html(text: str) -> str:
    """Convert plain text to a basic HTML body if not already HTML."""
    if not text:
        return ""
    if '<' in text and '>' in text:
        return text
    lines = [ln.strip() for ln in text.splitlines() if ln.strip()]
    return ''.join(f"<p>{ln}</p>" for ln in lines)


def _send_via_sendgrid_api(to_email: str, subject: str, text_body: str, html_body: str) -> bool:
    """Fallback sender using SendGrid Web API over HTTPS.

    This avoids SMTP egress/port restrictions that some hosts enforce.
    Requires SENDGRID_API_KEY in Django settings and a valid DEFAULT_FROM_EMAIL.
    """
    api_key: Optional[str] = getattr(settings, 'SENDGRID_API_KEY', None)
    from_email: Optional[str] = getattr(settings, 'DEFAULT_FROM_EMAIL', None)
    if not api_key or not from_email:
        return False
    try:
        # Import locally to avoid hard errors when SDK is not installed in some environments
        from sendgrid import SendGridAPIClient  # type: ignore
        from sendgrid.helpers.mail import Mail  # type: ignore
        message = Mail(
            from_email=from_email,
            to_emails=to_email,
            subject=subject,
            html_content=html_body or text_body or ''
        )
        # Prefer text as well when available
        if text_body and html_body and hasattr(message, 'add_content'):
            # add plain text as an additional content part
            message.add_content('text/plain', text_body)

        sg = SendGridAPIClient(api_key)
        response = sg.send(message)
        if 200 <= getattr(response, 'status_code', 0) < 300:
            logger.info("Email sent via SendGrid Web API to %s", to_email)
            return True
        logger.error("SendGrid API send failed with status %s", getattr(response, 'status_code', 'unknown'))
        return False
    except Exception as e:  # pragma: no cover - network side effects
        logger.exception("Failed to send email via SendGrid API: %s", e)
        return False


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

        # If configured to prefer API, try API first (avoids SMTP egress issues)
        if getattr(settings, 'EMAIL_PREFER_SENDGRID_API', False):
            if _send_via_sendgrid_api(to_email, subject, text_body, html_body):
                return True
            # Fall back to SMTP if API failed

        msg = EmailMultiAlternatives(subject=subject, body=text_body, from_email=from_email, to=[to_email])
        if html_body:
            msg.attach_alternative(html_body, "text/html")

        sent = msg.send(fail_silently=False)
        if sent:
            logger.info(f"Email sent via SMTP to {to_email} using backend {settings.EMAIL_BACKEND}")
            return True
        logger.error(f"SMTP backend returned 0 for recipient {to_email}")
        # Try SendGrid Web API fallback if SMTP indicates failure
        return _send_via_sendgrid_api(to_email, subject, text_body, html_body)
    except Exception as e:
        logger.exception(f"Failed to send email to {to_email} via SMTP: {e}")
        # On any SMTP exception, try API fallback (more reliable on some hosts)
        text_body = content or ''
        html_body = _to_html(content or '')
        if _send_via_sendgrid_api(to_email, subject, text_body, html_body):
            return True
        return False
