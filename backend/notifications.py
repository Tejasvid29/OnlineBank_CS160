"""In-app notifications: the bell in the web header and the phone's Notifications sheet.

The backend writes a notification wherever money moves or an account changes, through notify(). Work that runs inside
the database on a schedule (scheduled bill payments, month-end statements) writes its own notifications with
public.add_notification() in sql/notifications.sql.
"""

import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from supabase import Client

from auth import get_current_user
from db import get_supabase

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/notifications", tags=["notifications"])

NOTIFICATION_COLUMNS = "id, type, title, message, transaction_id, deposit_id, read_at, created_at"

# Allowed values of notifications.type (checked by the table too).
DEPOSIT = "deposit"
WITHDRAWAL = "withdrawal"
TRANSFER = "transfer"
BILL_PAYMENT = "bill_payment"
CHECK_DEPOSIT = "check_deposit"
ACCOUNT = "account"
STATEMENT = "statement"


def money(value) -> str:
    return f"${abs(float(value)):,.2f}"


def account_label(account: dict | None) -> str:
    """'checking account ending 1234', or just 'account' if the details are missing. Callers write "your {label}"."""
    if not account or not account.get("account_number"):
        return "account"
    return f"{account.get('account_type') or 'bank'} account ending {str(account['account_number'])[-4:]}"


def notify(
    db: Client,
    user_id: str,
    kind: str,
    title: str,
    message: str,
    transaction_id: str | None = None,
    deposit_id: str | None = None,
) -> None:
    """Add a notification for user_id. Best effort, like audit.record_event: a failure is logged, never raised,
    so it can't undo or fail the change it describes."""
    try:
        db.table("notifications").insert({
            "user_id": user_id,
            "type": kind,
            "title": title,
            "message": message,
            "transaction_id": transaction_id,
            "deposit_id": deposit_id,
        }).execute()
    except Exception:
        logger.exception("Could not add %s notification for %s", kind, user_id)


def _out(row: dict) -> dict:
    # The app shows notification_type as the heading and reads `read` as a flag.
    return {**row, "notification_type": row["title"], "read": row.get("read_at") is not None}


@router.get("")
def list_notifications(
    limit: int = Query(default=50, ge=1, le=200),
    user: dict = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    rows = (
        db.table("notifications").select(NOTIFICATION_COLUMNS)
        .eq("user_id", user["id"]).order("created_at", desc=True).limit(limit).execute().data
    )
    return {"notifications": [_out(row) for row in rows]}


@router.patch("/{notification_id}/read")
def mark_read(notification_id: uuid.UUID, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    # Always filter by user_id: the backend uses the secret key, which bypasses RLS.
    rows = (
        db.table("notifications").select(NOTIFICATION_COLUMNS)
        .eq("id", str(notification_id)).eq("user_id", user["id"]).limit(1).execute().data
    )
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Notification not found.")
    row = rows[0]
    if row.get("read_at") is None:
        updated = (
            db.table("notifications").update({"read_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", row["id"]).eq("user_id", user["id"]).execute().data
        )
        row = updated[0] if updated else row
    return {"notification": _out(row)}


@router.post("/read-all")
def mark_all_read(user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    rows = (
        db.table("notifications").update({"read_at": datetime.now(timezone.utc).isoformat()})
        .eq("user_id", user["id"]).is_("read_at", "null").execute().data
    )
    return {"updated": len(rows or [])}
