from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, status
from pydantic import BaseModel, Field, field_validator
from supabase import Client

from accounts import _get_own_account
from auth import get_current_user
from db import get_supabase
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
    _get_own_account(db, user["id"], body.account_id)  # 404s for other people's accounts
    txn = _rpc(db, "post_atm_transaction", {
        "p_user_id": user["id"], "p_account_id": body.account_id, "p_amount": str(amount),
        "p_type": kind, "p_description": f"{label} · {body.atm_name.strip()}",
        "p_daily_limit": str(DAILY_WITHDRAWAL_LIMIT),
    })
    return {"transaction": _out(txn)}


@router.post("/withdrawals", status_code=status.HTTP_201_CREATED)
def atm_withdraw(body: AtmWithdrawalRequest, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    return _post(db, user, body, -body.amount, "withdrawal", "ATM withdrawal")


@router.post("/deposits", status_code=status.HTTP_201_CREATED)
def atm_deposit(body: AtmDepositRequest, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    return _post(db, user, body, body.amount, "deposit", "ATM deposit")
