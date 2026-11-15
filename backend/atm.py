from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, ConfigDict, Field, field_validator
from supabase import Client

import notifications
from accounts import _get_own_account
from api_docs import SIGNED_IN, errors
from auth import get_current_user
from db import get_supabase
from notifications import account_label, money, notify
from transactions import _out, _rpc

router = APIRouter(prefix="/atm", tags=["atm"])

MAX_WITHDRAWAL = Decimal(5000)
DAILY_WITHDRAWAL_LIMIT = Decimal(5000)  # rolling 24 hours, per account (enforced in sql/atm.sql)
MAX_DEPOSIT = Decimal(5000)

Money = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]


class AtmRequest(BaseModel):
    account_id: str
    amount: Money
    atm_name: str = Field(default="ATM", min_length=1, max_length=100)

    model_config = ConfigDict(json_schema_extra={"examples": [
        {"account_id": "6f1c2e9a-0b7d-4c55-9f0e-2a4b8d3c1e70", "amount": 100, "atm_name": "Chase ATM · 1 Market St"},
    ]})


class AtmWithdrawalRequest(AtmRequest):
    @field_validator("amount")
    @classmethod
    def valid_withdrawal(cls, value: Decimal) -> Decimal:
        if value > MAX_WITHDRAWAL:
            raise ValueError(f"The most you can withdraw at once is ${MAX_WITHDRAWAL:,}.")
        return value


class AtmDepositRequest(AtmRequest):
    @field_validator("amount")
    @classmethod
    def valid_deposit(cls, value: Decimal) -> Decimal:
        if value % 1 != 0:
            raise ValueError("ATM cash deposits must be whole dollar amounts.")
        if value > MAX_DEPOSIT:
            raise ValueError(f"The most you can deposit at once is ${MAX_DEPOSIT:,}.")
        return value


def _post(db: Client, user: dict, body: AtmRequest, amount: Decimal, kind: str, label: str):
    account = _get_own_account(db, user["id"], body.account_id)  # 404s for other people's accounts
    txn = _rpc(db, "post_atm_transaction", {
        "p_user_id": user["id"], "p_account_id": body.account_id, "p_amount": str(amount),
        "p_type": kind, "p_description": f"{label} · {body.atm_name.strip()}",
        "p_daily_limit": str(DAILY_WITHDRAWAL_LIMIT),
    })
    deposit = kind == "deposit"
    notify(
        db, user["id"], notifications.DEPOSIT if deposit else notifications.WITHDRAWAL, label,
        f"{money(amount)} was {'deposited to' if deposit else 'withdrawn from'} your {account_label(account)} "
        f"at {body.atm_name.strip()}.",
        transaction_id=txn.get("id"),
    )
    return {"transaction": _out(txn)}


@router.post(
    "/withdrawals", status_code=status.HTTP_201_CREATED, summary="Withdraw cash at an ATM",
    responses=errors(*SIGNED_IN, 404, (409, "Insufficient funds, closed or not a checking account, or over the $5,000 daily limit.")),
)
def atm_withdraw(body: AtmWithdrawalRequest, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    """Checking accounts only. Up to $5,000 at once and $5,000 per account in any 24 hours."""
    return _post(db, user, body, -body.amount, "withdrawal", "ATM withdrawal")


@router.post(
    "/deposits", status_code=status.HTTP_201_CREATED, summary="Deposit cash at an ATM",
    responses=errors(*SIGNED_IN, 404, (409, "The account is closed or not a checking account.")),
)
def atm_deposit(body: AtmDepositRequest, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    """Checking accounts only. Whole dollars, up to $5,000 at once."""
    return _post(db, user, body, body.amount, "deposit", "ATM deposit")
