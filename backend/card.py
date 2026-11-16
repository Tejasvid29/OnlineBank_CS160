"""Debit card withdrawals and deposits for external apps, by checking account number (like a card number).
No sign-in. Balance rules live in sql/card_transactions.sql."""

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from supabase import Client

import notifications
from api_docs import errors
from audit import record_event
from db import get_supabase
from notifications import account_label, money, notify
from transactions import DB_ERRORS, _out

router = APIRouter(prefix="/card", tags=["debit-card"])

CARD_WITHDRAWAL = "card_withdrawal"
CARD_DEPOSIT = "card_deposit"

DAILY_WITHDRAWAL_LIMIT = Decimal(1000)  # rolling 24 hours, per account (enforced in sql/card_transactions.sql)

Money = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]


class CardRequest(BaseModel):
    account_number: str = Field(pattern=r"^\d{12}$", description="The checking account's 12-digit number, like a card number.")
    amount: Money
    location: str = Field(default="External app", min_length=1, max_length=100, description="Where it happened: the app, terminal or store.")
    reference: str | None = Field(default=None, max_length=60)

    model_config = ConfigDict(json_schema_extra={"examples": [
        {"account_number": "123456789012", "amount": 40, "location": "Corner Store", "reference": "txn-77"},
    ]})

    @field_validator("location")
    @classmethod
    def location_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Enter where this happened.")
        return value.strip()


def _checking_account(db: Client, account_number: str) -> dict:
    rows = (
        db.table("accounts")
        .select("id, user_id, account_number, account_type, status, balance")
        .eq("account_number", account_number)
        .eq("account_type", "checking")
        .eq("status", "activated")
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        # Same answer for "no such number", "savings" and "closed", so numbers can't be probed.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No open checking account has that number.")
    return rows[0]


def _post(db: Client, body: CardRequest, sign: int, label: str, audit_action: str):
    account = _checking_account(db, body.account_number)
    owner_id = account["user_id"]
    description = f"{label}: {body.location}" + (f" - {body.reference.strip()}" if body.reference and body.reference.strip() else "")
    params = {
        "p_user_id": owner_id, "p_account_id": account["id"], "p_amount": str(sign * body.amount), "p_description": description,
        "p_daily_limit": str(DAILY_WITHDRAWAL_LIMIT),
    }
    try:
        txn = db.rpc("post_card_transaction_v2", params).execute().data
    except Exception as exc:
        if "card_limit_exceeded" in str(exc):
            raise HTTPException(status.HTTP_409_CONFLICT, f"This would exceed the ${DAILY_WITHDRAWAL_LIMIT:,} daily card withdrawal limit.")
        for code, (http_status, message) in DB_ERRORS.items():
            if code in str(exc):
                raise HTTPException(http_status, message)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "The transaction could not be completed.")
    deposit = sign > 0
    notify(
        db, owner_id, notifications.DEPOSIT if deposit else notifications.WITHDRAWAL, label,
        f"{money(body.amount)} was {'deposited to' if deposit else 'withdrawn from'} your {account_label(account)} "
        f"at {body.location}.",
        transaction_id=txn.get("id"),
    )
    record_event(db, owner_id, audit_action, {
        "location": body.location, "amount": str(body.amount), "account_id": account["id"], "reference": body.reference,
    })
    return {"transaction": _out(txn)}


@router.post(
    "/withdrawals", status_code=status.HTTP_201_CREATED, summary="Withdraw with a debit card",
    responses=errors(
        (404, "No open checking account has that number."),
        (409, "More than the account's balance, or over the $1,000 daily card withdrawal limit."),
    ),
)
def card_withdraw(body: CardRequest, db: Client = Depends(get_supabase)):
    """Withdraws from the checking account with this number. No sign-in: the account number stands in for a debit
    card number (demo only). You can't withdraw more than the balance, so the account never goes negative, and
    card withdrawals are limited to $1,000 per account in any rolling 24 hours."""
    return _post(db, body, -1, "Card withdrawal", CARD_WITHDRAWAL)


@router.post(
    "/deposits", status_code=status.HTTP_201_CREATED, summary="Deposit with a debit card",
    responses=errors((404, "No open checking account has that number.")),
)
def card_deposit(body: CardRequest, db: Client = Depends(get_supabase)):
    """Deposits into the checking account with this number. No sign-in: the account number stands in for a debit
    card number (demo only)."""
    return _post(db, body, 1, "Card deposit", CARD_DEPOSIT)
