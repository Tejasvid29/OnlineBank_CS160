import logging

import httpx

from config import settings

logger = logging.getLogger(__name__)

RESEND_URL = "https://api.resend.com/emails"
SEND_TIMEOUT_SECONDS = 10


def send_email(to: str, subject: str, text: str) -> None:
    """Send a plain-text email through Resend. Best effort: a mail failure must not break the request."""
    if not settings.resend_api_key:
        logger.warning("RESEND_API_KEY is not set; skipping email %r to %s", subject, to)
        return
    try:
        response = httpx.post(
            RESEND_URL,
            headers={"Authorization": f"Bearer {settings.resend_api_key}"},
            json={"from": settings.mail_from, "to": [to], "subject": subject, "text": text},
            timeout=SEND_TIMEOUT_SECONDS,
        )
        response.raise_for_status()
    except httpx.HTTPError:
        logger.exception("Could not send email %r to %s", subject, to)
