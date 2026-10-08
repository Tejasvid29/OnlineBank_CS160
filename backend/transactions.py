from datetime import date
from decimal import Decimal
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from supabase import Client

from accounts import _get_own_account
from auth import get_current_user
from db import get_supabase

router = APIRouter(tags=["transactions"])

TRANSACTION_COLUMNS = "id, account_id, customer_id, transaction_type, amount, status, description, created_at"

Money = Annotated[Decimal, Field(gt=0, max_digits=12, decimal_places=2)]

# Raised by the SQL functions in sql/transactions.sql.
DB_ERRORS = {
    "account_not_found": (status.HTTP_404_NOT_FOUND, "Account not found."),
    "account_closed": (status.HTTP_409_CONFLICT, "This account is closed."),
    "insufficient_funds": (status.HTTP_409_CONFLICT, "Insufficient funds."),
    "same_account": (status.HTTP_400_BAD_REQUEST, "Choose two different accounts."),
    "invalid_amount": (status.HTTP_400_BAD_REQUEST, "Enter an amount greater than $0."),
    "recipient_not_found": (status.HTTP_404_NOT_FOUND, "No active account matches that account number."),
    "own_account": (status.HTTP_400_BAD_REQUEST, "That is your own account. Use Pay & transfer to move money between your accounts."),
}


class AccountTransactionRequest(BaseModel):
    amount: Money
    description: str = Field(default="", max_length=255)


class TransferRequest(BaseModel):
    source_account_id: str
    destination_account_id: str
    amount: Money
    transfer_type: str = "internal"
    description: str = Field(default="", max_length=255)


class SendMoneyRequest(BaseModel):
    source_account_id: str
    recipient_account_number: str = Field(pattern=r"^[0-9]{12}$")
    amount: Money
    description: str = Field(default="", max_length=255)


def _out(row: dict) -> dict:
    # The UI shows these as labels and expects a numeric amount.
    return {
        **row,
        "amount": float(row["amount"]),
        "transaction_type": row["transaction_type"].capitalize(),
        "status": row["status"].capitalize(),
    }


def _rpc(db: Client, fn: str, params: dict):
    try:
        return db.rpc(fn, params).execute().data
    except Exception as exc:
        for code, (http_status, message) in DB_ERRORS.items():
            if code in str(exc):
                raise HTTPException(http_status, message)
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "The transaction could not be completed.")


@router.get("/accounts/{account_id}/transactions")
def list_transactions(
    account_id: str,
    transaction_type: str | None = Query(default=None, pattern="^(deposit|withdrawal|transfer)$"),
    start: date | None = None,
    end: date | None = None,
    limit: int = Query(default=100, ge=1, le=500),
    offset: int = Query(default=0, ge=0),
    user: dict = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    _get_own_account(db, user["id"], account_id)  # 404s for other people's accounts
    query = (
        db.table("transactions")
        .select(TRANSACTION_COLUMNS)
        .eq("account_id", account_id)
        .eq("customer_id", user["id"])
    )
    if transaction_type:
        query = query.eq("transaction_type", transaction_type)
    if start:
        query = query.gte("created_at", start.isoformat())
    if end:
        query = query.lt("created_at", date.fromordinal(end.toordinal() + 1).isoformat())
    rows = query.order("created_at", desc=True).range(offset, offset + limit - 1).execute().data
    return {"transactions": [_out(r) for r in rows]}


def _post(db: Client, user: dict, account_id: str, amount: Decimal, kind: str, description: str):
    _get_own_account(db, user["id"], account_id)
    txn = _rpc(db, "post_account_transaction", {
        "p_user_id": user["id"], "p_account_id": account_id, "p_amount": str(amount),
        "p_type": kind, "p_description": description or kind.capitalize(),
    })
    return {"transaction": _out(txn)}


@router.post("/accounts/{account_id}/deposits", status_code=status.HTTP_201_CREATED)
def deposit(account_id: str, body: AccountTransactionRequest, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    return _post(db, user, account_id, body.amount, "deposit", body.description)


@router.post("/accounts/{account_id}/withdrawals", status_code=status.HTTP_201_CREATED)
def withdraw(account_id: str, body: AccountTransactionRequest, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    return _post(db, user, account_id, -body.amount, "withdrawal", body.description)


@router.post("/transfers", status_code=status.HTTP_201_CREATED)
def transfer(body: TransferRequest, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    if body.transfer_type != "internal":
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Only transfers between your own accounts are supported.")
    rows = _rpc(db, "post_transfer", {
        "p_user_id": user["id"], "p_source_id": body.source_account_id,
        "p_dest_id": body.destination_account_id, "p_amount": str(body.amount),
        "p_description": body.description,
    })
    return {"transactions": [_out(r) for r in rows]}


@router.post("/transfers/send", status_code=status.HTTP_201_CREATED)
def send_money(body: SendMoneyRequest, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    # Only the caller's own transaction row is returned; nothing about the recipient is revealed.
    txn = _rpc(db, "post_customer_transfer", {
        "p_user_id": user["id"], "p_source_id": body.source_account_id,
        "p_recipient_number": body.recipient_account_number, "p_amount": str(body.amount),
        "p_description": body.description,
    })
    return {"transaction": _out(txn)}
