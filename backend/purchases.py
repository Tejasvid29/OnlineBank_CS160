"""Purchases: an app charges a checking account by its 12-digit account number, like a debit card number.
Balance rules live in sql/purchases.sql."""

from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from supabase import Client

import audit
import notifications
from accounts import ACCOUNT_COLUMNS
from api_docs import errors
from db import get_supabase
from notifications import account_label, money, notify
from transactions import _out, _rpc

router = APIRouter(prefix="/purchases", tags=["purchases"])

MAX_PURCHASE = Decimal(2500)

Money = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]


class PurchaseRequest(BaseModel):
    account_number: str = Field(pattern=r"^\d{12}$", description="The checking account's 12-digit number, like a card number.")
    merchant: str = Field(min_length=1, max_length=100)
    amount: Money
    reference: str | None = Field(default=None, max_length=60)

    model_config = ConfigDict(json_schema_extra={"examples": [
        {"account_number": "123456789012", "merchant": "Coffee Shop", "amount": 4.50, "reference": "order-1001"},
    ]})

    @field_validator("merchant")
    @classmethod
    def merchant_not_blank(cls, value: str) -> str:
        if not value.strip():
            raise ValueError("Enter the merchant's name.")
        return value.strip()

    @field_validator("amount")
    @classmethod
    def within_limit(cls, value: Decimal) -> Decimal:
        if value > MAX_PURCHASE:
            raise ValueError(f"The most you can spend in one purchase is ${MAX_PURCHASE:,}.")
        return value


@router.post(
    "", status_code=status.HTTP_201_CREATED, summary="Purchase with a checking account number",
    responses=errors(
        (404, "No open checking account has that number."),
        (409, "Insufficient funds."),
    ),
)
def purchase(body: PurchaseRequest, db: Client = Depends(get_supabase)):
    """Charges the checking account with this number and records a completed withdrawal described
    `Purchase: <merchant>`. No sign-in: the account number stands in for a debit card number (demo only).

    Up to $2,500 per purchase, and the balance can't go below zero. `reference` is the calling app's order or
    invoice number, kept in the transaction description.
    """
    rows = (
        db.table("accounts")
        .select(f"{ACCOUNT_COLUMNS}, user_id")
        .eq("account_number", body.account_number)
        .eq("account_type", "checking")
        .eq("status", "activated")
        .limit(1)
        .execute()
        .data
    )
    if not rows:
        # Same answer for "no such number", "savings" and "closed", so numbers can't be probed.
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No open checking account has that number.")
    account = rows[0]
    owner_id = account["user_id"]

    description = f"Purchase: {body.merchant}" + (f" - {body.reference.strip()}" if body.reference and body.reference.strip() else "")
    txn = _rpc(db, "post_purchase", {
        "p_user_id": owner_id, "p_account_id": account["id"], "p_amount": str(body.amount), "p_description": description,
    })
    notify(
        db, owner_id, notifications.WITHDRAWAL, "Purchase",
        f"{money(body.amount)} was spent at {body.merchant} from your {account_label(account)}.",
        transaction_id=txn.get("id"),
    )
    audit.record_event(db, owner_id, audit.PURCHASE, {
        "merchant": body.merchant, "amount": str(body.amount), "account_id": account["id"], "reference": body.reference,
    })
    return {"transaction": _out(txn)}
