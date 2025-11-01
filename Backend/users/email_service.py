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
        from sendgrid.helpers.mail import Mail, Content, MimeType  # type: ignore

        def _build_message(_from_email: str) -> Mail:
            msg = Mail(
                from_email=_from_email,
                to_emails=to_email,
                subject=subject,
            )
            text_part = (text_body or '').strip()
            html_part = (html_body or '').strip()
            if text_part and html_part:
                msg.add_content(Content(MimeType.text, text_part))
                msg.add_content(Content(MimeType.html, html_part))
            elif html_part:
                msg.add_content(Content(MimeType.html, html_part))
            else:
                msg.add_content(Content(MimeType.text, text_part))
            return msg

        sg = SendGridAPIClient(api_key)
        message = _build_message(from_email)
        response = sg.send(message)
        status_code = getattr(response, 'status_code', 0)
        body = getattr(response, 'body', b'')
        # body can be bytes or str depending on SDK; normalize to str for logging
        try:
            body_text = body.decode('utf-8') if isinstance(body, (bytes, bytearray)) else str(body)
        except Exception:
            body_text = str(body)

        if 200 <= status_code < 300:
            logger.info("Email sent via SendGrid Web API to %s", to_email)
            return True
        logger.error("SendGrid API send failed | status=%s | body=%s", status_code, body_text[:2000])
        # Provide a hint for common misconfigurations and attempt an optional fallback sender
        if 'Sender Identity' in body_text or 'from address' in body_text:
            logger.error("Hint: Verify that DEFAULT_FROM_EMAIL/EMAIL_FROM matches a verified sender in SendGrid.")
            fallback_from = getattr(settings, 'SENDGRID_FALLBACK_FROM', None) or getattr(settings, 'DEFAULT_FROM_EMAIL', None)
            # Only retry if an explicit separate fallback is provided and different from current
            if fallback_from and fallback_from != from_email and isinstance(fallback_from, str) and '@' in fallback_from:
                try:
                    logger.info("Retrying SendGrid API send with fallback from address: %s", fallback_from)
                    fallback_msg = _build_message(fallback_from)
                    response2 = sg.send(fallback_msg)
                    if 200 <= getattr(response2, 'status_code', 0) < 300:
                        logger.info("Email sent via SendGrid Web API using fallback from address")
                        return True
                except Exception as e2:  # pragma: no cover - network side effects
                    logger.error("Fallback send also failed: %s", e2)
        return False
    except Exception as e:  # pragma: no cover - network side effects
        # Try to surface more details from SendGrid client exceptions
        status_code = getattr(e, 'status_code', None) or getattr(e, 'code', None)
        raw_body = getattr(e, 'body', None)
        try:
            body_text = raw_body.decode('utf-8') if isinstance(raw_body, (bytes, bytearray)) else str(raw_body)
        except Exception:
            body_text = str(raw_body)
        logger.error("Failed to send email via SendGrid API: %s | status=%s | body=%s", e, status_code, (body_text or '')[:2000])
        if body_text and ('Sender Identity' in body_text or 'from address' in body_text):
            logger.error("Hint: Verify DEFAULT_FROM_EMAIL/EMAIL_FROM is a verified sender in SendGrid.")
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
        prefer_api = getattr(settings, 'EMAIL_PREFER_SENDGRID_API', False)
        disable_api = getattr(settings, 'EMAIL_DISABLE_SENDGRID_API', False)
        if prefer_api and not disable_api:
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
        # Try SendGrid Web API fallback if SMTP indicates failure (unless disabled)
        if not disable_api:
            return _send_via_sendgrid_api(to_email, subject, text_body, html_body)
        return False
    except Exception as e:
        logger.exception(f"Failed to send email to {to_email} via SMTP: {e}")
        # On any SMTP exception, try API fallback (more reliable on some hosts) unless disabled
        text_body = content or ''
        html_body = _to_html(content or '')
        if not getattr(settings, 'EMAIL_DISABLE_SENDGRID_API', False):
            if _send_via_sendgrid_api(to_email, subject, text_body, html_body):
                return True
        return False
