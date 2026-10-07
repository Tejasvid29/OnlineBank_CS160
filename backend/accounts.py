import secrets
from datetime import datetime, timezone
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from supabase import Client

from auth import get_current_user
from db import get_supabase

router = APIRouter(prefix="/accounts", tags=["accounts"])

ACCOUNT_COLUMNS = "id, account_number, account_type, balance, status, created_at, closed_at"
ACCOUNT_NUMBER_ATTEMPTS = 5


class OpenAccountRequest(BaseModel):
    account_type: Literal["checking", "savings"]


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


@router.get("")
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


@router.post("", status_code=status.HTTP_201_CREATED)
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
        return {"account": {k: rows[0][k] for k in ACCOUNT_COLUMNS.split(", ")}}
    raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Could not open the account.")


@router.get("/{account_id}")
def get_account(account_id: str, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    return {"account": _get_own_account(db, user["id"], account_id)}


@router.post("/{account_id}/close")
def close_account(account_id: str, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    account = _get_own_account(db, user["id"], account_id)
    if account["status"] != "activated":
        raise HTTPException(status.HTTP_409_CONFLICT, "This account is already closed.")
    if account["balance"] != 0:
        raise HTTPException(status.HTTP_409_CONFLICT, "Withdraw or transfer the remaining balance before closing.")

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
    return {"account": {k: rows[0][k] for k in ACCOUNT_COLUMNS.split(", ")}}
