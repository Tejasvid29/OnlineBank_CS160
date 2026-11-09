import logging

from supabase import Client

logger = logging.getLogger(__name__)

ACCOUNT_REGISTERED = "account_registered"
PASSWORD_RESET = "password_reset"
ACCOUNT_LOCKED = "account_locked"
PROFILE_UPDATED = "profile_updated"
BANK_ACCOUNT_OPENED = "bank_account_opened"
BANK_ACCOUNT_CLOSED = "bank_account_closed"


def record_event(
    db: Client,
    customer_id: str,
    action: str,
    details: dict | None = None,
    actor_id: str | None = None,
) -> None:
    """Append an audit entry. Best effort: a logging failure must not undo the change it describes."""
    try:
        db.table("audit_log").insert({
            "customer_id": customer_id,
            "actor_id": actor_id or customer_id,
            "action": action,
            "details": details or {},
        }).execute()
    except Exception:
        logger.exception("Could not record audit event %s for %s", action, customer_id)
