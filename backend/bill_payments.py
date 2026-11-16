from datetime import date, timedelta
from decimal import Decimal
from typing import Annotated, Literal

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from supabase import Client

import notifications
from accounts import _get_own_account
from api_docs import ADMIN, SIGNED_IN, errors
from auth import get_current_user, require_role
from db import get_supabase
from notifications import account_label, money, notify
from transactions import _rpc

router = APIRouter(prefix="/bill-payments", tags=["bill-payments"])

PAYMENT_COLUMNS = "id, account_id, customer_id, recipient, amount, frequency, next_payment_date, status, created_at"

Money = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]


class SchedulePaymentRequest(BaseModel):
    account_id: str
    recipient: str = Field(min_length=1, max_length=100)
    amount: Money
    frequency: Literal["once", "daily", "weekly", "monthly"] = "once"
    next_payment_date: date | None = Field(
        default=None, description="First payment date, required unless `frequency` is `once` (paid immediately).")

    model_config = ConfigDict(json_schema_extra={"examples": [
        {"account_id": "6f1c2e9a-0b7d-4c55-9f0e-2a4b8d3c1e70", "recipient": "PG&E", "amount": 84.20, "frequency": "once"},
        {"account_id": "6f1c2e9a-0b7d-4c55-9f0e-2a4b8d3c1e70", "recipient": "Rent", "amount": 1450.00, "frequency": "monthly",
         "next_payment_date": "2026-12-01"},
    ]})

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
    def _not_past(cls, value: date | None):
        if value is None:
            return value
        # One day of slack: the app validates against the customer's local date, the server runs on UTC.
        if value < date.today() - timedelta(days=1):
            raise ValueError("Payment date cannot be in the past.")
        return value

    @model_validator(mode="after")
    def _date_for_recurring(self):
        if self.frequency != "once" and self.next_payment_date is None:
            raise ValueError("Choose the date of the first payment.")
        return self


def _out(row: dict) -> dict:
    # The UI shows these as labels and expects a numeric amount.
    return {**row, "amount": float(row["amount"]), "frequency": row["frequency"].capitalize(), "status": row["status"].capitalize()}


@router.get("", summary="List scheduled and failed payments", responses=errors(*SIGNED_IN))
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


@router.post(
    "", status_code=status.HTTP_201_CREATED, summary="Pay a bill now or schedule recurring payments",
    responses=errors(*SIGNED_IN, 404, (409, "The account is closed, or (paying now) insufficient funds.")),
)
def schedule_payment(body: SchedulePaymentRequest, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    """`once` pays immediately or fails with nothing recorded. Other frequencies are paid by a database job every 5 minutes."""
    account = _get_own_account(db, user["id"], body.account_id)
    if account["status"] != "activated":
        raise HTTPException(status.HTTP_409_CONFLICT, "This account is closed.")
    if body.frequency == "once":
        # Paid right now, atomically; an unaffordable payment fails and nothing is recorded.
        row = _rpc(db, "pay_bill_now", {
            "p_user_id": user["id"], "p_account_id": body.account_id, "p_recipient": body.recipient, "p_amount": str(body.amount),
        })
        notify(db, user["id"], notifications.BILL_PAYMENT, "Bill paid",
               f"You paid {money(body.amount)} to {body.recipient} from your {account_label(account)}.")
        return {"payment": _out(row)}
    row = db.table("scheduled_payments").insert({
        "account_id": body.account_id, "customer_id": user["id"], "recipient": body.recipient,
        "amount": str(body.amount), "frequency": body.frequency, "next_payment_date": body.next_payment_date.isoformat(),
    }).execute().data[0]
    notify(db, user["id"], notifications.BILL_PAYMENT, "Bill payment scheduled",
           f"{money(body.amount)} to {body.recipient} is scheduled {body.frequency} from your {account_label(account)}, "
           f"starting {body.next_payment_date:%B} {body.next_payment_date.day}.")
    return {"payment": _out(row)}


@router.delete("/{payment_id}", summary="Cancel a scheduled payment", responses=errors(*SIGNED_IN, (404, "No scheduled or failed payment of yours with this id.")))
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


@router.post("/run-due", dependencies=[Depends(require_role("admin"))], summary="Run due scheduled payments now (admin)", responses=errors(*ADMIN))
def run_due(db: Client = Depends(get_supabase)):
    """The same work the database job does every 5 minutes. Returns how many payments were processed."""
    return {"processed": db.rpc("process_due_payments", {}).execute().data}
