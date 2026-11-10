import logging
import smtplib
import ssl
from email.message import EmailMessage

import httpx

from config import settings

logger = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"
SEND_TIMEOUT_SECONDS = 10


def _send_smtp(to: str, subject: str, text: str) -> None:
    message = EmailMessage()
    message["From"] = settings.mail_from
    message["To"] = to
    message["Subject"] = subject
    message.set_content(text)
    with smtplib.SMTP_SSL(settings.smtp_host, settings.smtp_port, timeout=SEND_TIMEOUT_SECONDS, context=ssl.create_default_context()) as server:
        server.login(settings.smtp_user, settings.smtp_password)
        server.send_message(message)


def _send_resend(to: str, subject: str, text: str) -> None:
    response = httpx.post(
        RESEND_URL,
        headers={"Authorization": f"Bearer {settings.resend_api_key}"},
        json={"from": settings.mail_from, "to": [to], "subject": subject, "text": text},
        timeout=SEND_TIMEOUT_SECONDS,
    )
    response.raise_for_status()


def send_email(to: str, subject: str, text: str) -> bool:
    """Send a plain-text email through SMTP if SMTP_HOST is set, otherwise through Resend. Best effort: a mail
    failure must not break the request. Returns whether the message was handed to the mail server."""
    if not settings.smtp_host and not settings.resend_api_key:
        logger.warning("Neither SMTP_HOST nor RESEND_API_KEY is set; skipping email %r to %s", subject, to)
        return False
    try:
        (_send_smtp if settings.smtp_host else _send_resend)(to, subject, text)
    except (httpx.HTTPError, OSError, smtplib.SMTPException):
        logger.exception("Could not send email %r to %s", subject, to)
        return False
    return True
