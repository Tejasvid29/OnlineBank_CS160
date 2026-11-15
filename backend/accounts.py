import secrets
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict
from supabase import Client

import audit
import notifications
from api_docs import SIGNED_IN, errors
from audit import record_event
from auth import get_current_user
from db import get_supabase
from notifications import account_label, notify

router = APIRouter(prefix="/accounts", tags=["accounts"])

ACCOUNT_COLUMNS = "id, account_number, account_type, balance, status, created_at, closed_at"
ACCOUNT_NUMBER_ATTEMPTS = 5
SCHEDULED_PAYMENTS_BLOCK = "Cancel this account's scheduled bill payments before closing it."


class OpenAccountRequest(BaseModel):
    account_type: Literal["checking", "savings"]

    model_config = ConfigDict(json_schema_extra={"examples": [{"account_type": "savings"}]})


def _new_account_number() -> str:
    return "".join(secrets.choice("0123456789") for _ in range(12))


def _get_own_account(db: Client, user_id: str, account_id: str) -> dict:
    # Always filter by user_id: the backend uses the secret key, which bypasses RLS.
    rows = (
        db.table("accounts")
        .select(ACCOUNT_COLUMNS)
        .eq("id", account_id)
        .eq("user_id", user_id)
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        # Same response for "doesn't exist" and "belongs to someone else".
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Account not found.")
    return rows[0]


def _has_pending_activity(db: Client, account_id: str) -> bool:
    # Callers check ownership first (_get_own_account), so filtering by account is enough here.
    for table in ("check_deposits", "transactions"):
        rows = (
            db.table(table)
            .select("id")
            .eq("account_id", account_id)
            .eq("status", "pending")
            .limit(1)
            .execute()
            .data
        )
        if rows:
            return True
    return False


def _has_scheduled_payments(db: Client, account_id: str) -> bool:
    # Recurring payments still due from this account. Left in place they would fail at their next run, once the
    # account is closed. Failed, completed and canceled payments don't block closing.
    rows = (
        db.table("scheduled_payments")
        .select("id")
        .eq("account_id", account_id)
        .eq("status", "scheduled")
        .limit(1)
        .execute()
        .data
    )
    return bool(rows)


@router.get("", summary="List your accounts", responses=errors(*SIGNED_IN))
def list_accounts(user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    rows = (
        db.table("accounts")
        .select(ACCOUNT_COLUMNS)
        .eq("user_id", user["id"])
        .order("created_at")
        .execute()
        .data
    )
    return {"accounts": rows}


@router.post("", status_code=status.HTTP_201_CREATED, summary="Open a checking or savings account", responses=errors(*SIGNED_IN, 500))
def open_account(
    body: OpenAccountRequest,
    user: dict = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    # Balance, status and owner are never taken from the client.
    for _ in range(ACCOUNT_NUMBER_ATTEMPTS):
        try:
            rows = (
                db.table("accounts")
                .insert({
                    "user_id": user["id"],
                    "account_number": _new_account_number(),
                    "account_type": body.account_type,
                    "balance": 0,
                    "status": "activated",
                })
                .execute()
                .data
            )
        except Exception:
            continue  # Most likely an account_number collision; try a new number.
        record_event(
            db, user["id"], audit.BANK_ACCOUNT_OPENED,
            {"account_id": rows[0]["id"], "account_number": rows[0]["account_number"], "account_type": body.account_type},
        )
        notify(db, user["id"], notifications.ACCOUNT, "Account opened", f"Your new {account_label(rows[0])} is open.")
        return {"account": {k: rows[0][k] for k in ACCOUNT_COLUMNS.split(", ")}}
    raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not open the account.")


@router.get("/{account_id}", summary="Get one of your accounts", responses=errors(*SIGNED_IN, 404))
def get_account(account_id: str, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    return {"account": _get_own_account(db, user["id"], account_id)}


@router.post(
    "/{account_id}/close", summary="Close one of your accounts",
    responses=errors(*SIGNED_IN, 404, (409, "Already closed, the balance isn't $0, something is still pending, or bill payments are still scheduled from it.")),
)
def close_account(account_id: str, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    account = _get_own_account(db, user["id"], account_id)
    if account["status"] != "activated":
        raise HTTPException(status.HTTP_409_CONFLICT, "This account is already closed.")
    if account["balance"] != 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "Withdraw or transfer the remaining balance before closing.")
    if _has_pending_activity(db, account_id):
        raise HTTPException(
            status.HTTP_409_CONFLICT,
            "This account has pending deposits or transactions. Wait for them to finish before closing it.",
        )
    if _has_scheduled_payments(db, account_id):
        raise HTTPException(status.HTTP_409_CONFLICT, SCHEDULED_PAYMENTS_BLOCK)

    rows = (
        db.table("accounts")
        .update({"status": "deactivated", "closed_at": datetime.now(timezone.utc).isoformat()})
        .eq("id", account_id)
        .eq("user_id", user["id"])
        .eq("status", "activated")
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status.HTTP_409_CONFLICT, "This account is already closed.")
    record_event(
        db, user["id"], audit.BANK_ACCOUNT_CLOSED,
        {"account_id": account_id, "account_number": rows[0]["account_number"], "account_type": rows[0]["account_type"]},
    )
    notify(db, user["id"], notifications.ACCOUNT, "Account closed",
           f"Your {account_label(rows[0])} is closed. Its history is still available.")
    return {"account": {k: rows[0][k] for k in ACCOUNT_COLUMNS.split(", ")}}
