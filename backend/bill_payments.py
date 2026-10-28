from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field, field_validator
from supabase import Client

from accounts import _get_own_account
from auth import get_current_user, require_role
from db import get_supabase

router = APIRouter(prefix="/bill-payments", tags=["bill-payments"])

PAYMENT_COLUMNS = "id, account_id, customer_id, recipient, amount, frequency, next_payment_date, status, created_at"

Money = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]


class SchedulePaymentRequest(BaseModel):
    account_id: str
    recipient: str = Field(min_length=1, max_length=100)
    amount: Money
    frequency: Literal["once", "daily", "weekly", "monthly"] = "once"
    next_payment_date: date

    @field_validator("frequency", mode="before")
    @classmethod
    def _lower(cls, value):
        return value.lower() if isinstance(value, str) else value

    @field_validator("recipient")
    @classmethod
    def _strip(cls, value: str):
        value = value.strip()
        if not value:
            raise ValueError("Recipient is required.")
        return value

    @field_validator("next_payment_date")
    @classmethod
    def _not_past(cls, value: date):
        # One day of slack: the app validates against the customer's local date, the server runs on UTC.
        if value < date.today() - timedelta(days=1):
            raise ValueError("Payment date cannot be in the past.")
        return value


def _out(row: dict) -> dict:
    # The UI shows these as labels and expects a numeric amount.
    return {**row, "amount": float(row["amount"]), "frequency": row["frequency"].capitalize(), "status": row["status"].capitalize()}


@router.get("")
def list_payments(user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    rows = (
        db.table("scheduled_payments")
        .select(PAYMENT_COLUMNS)
        .eq("customer_id", user["id"])
        .in_("status", ["scheduled", "failed"])
        .order("next_payment_date")
        .execute()
        .data
    )
    return {"payments": [_out(r) for r in rows]}


@router.post("", status_code=status.HTTP_201_CREATED)
def schedule_payment(body: SchedulePaymentRequest, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    account = _get_own_account(db, user["id"], body.account_id)
    if account["status"] != "activated":
        raise HTTPException(status.HTTP_409_CONFLICT, "This account is closed.")
    row = db.table("scheduled_payments").insert({
        "account_id": body.account_id, "customer_id": user["id"], "recipient": body.recipient,
        "amount": str(body.amount), "frequency": body.frequency, "next_payment_date": body.next_payment_date.isoformat(),
    }).execute().data[0]
    return {"payment": _out(row)}


@router.delete("/{payment_id}")
def cancel_payment(payment_id: str, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    # Keep the row (status 'canceled') so there is a record of what was scheduled.
    rows = (
        db.table("scheduled_payments")
        .update({"status": "canceled"})
        .eq("id", payment_id)
        .eq("customer_id", user["id"])
        .in_("status", ["scheduled", "failed"])
        .execute()
        .data
    )
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Scheduled payment not found.")
    return {"payment": _out(rows[0])}


@router.post("/run-due", dependencies=[Depends(require_role("admin"))])
def run_due(db: Client = Depends(get_supabase)):
    return {"processed": db.rpc("process_due_payments", {}).execute().data}
