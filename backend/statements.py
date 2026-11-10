import logging
from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel
from supabase import Client

from accounts import _get_own_account
from auth import get_current_user
from db import get_supabase
from mailer import send_email
from transactions import _rpc

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/statements", tags=["statements"])

SUMMARY_COLUMNS = (
    "id, account_id, customer_id, kind, period_start, period_end, opening_balance, closing_balance, "
    "total_deposits, total_withdrawals, transaction_count, generated_at, emailed_at"
)
STATEMENT_COLUMNS = SUMMARY_COLUMNS + ", transactions"
NUMERIC_FIELDS = ("opening_balance", "closing_balance", "total_deposits", "total_withdrawals")


class GenerateStatementRequest(BaseModel):
    account_id: str


def _out(row: dict) -> dict:
    return {**row, **{key: float(row[key]) for key in NUMERIC_FIELDS if key in row}}


def _money(value) -> str:
    value = float(value)
    return f"-${abs(value):,.2f}" if value < 0 else f"${value:,.2f}"


@router.get("")
def list_statements(
    account_id: str | None = None,
    limit: int = Query(default=60, ge=1, le=200),
    user: dict = Depends(get_current_user),
    db: Client = Depends(get_supabase),
):
    query = db.table("statements").select(SUMMARY_COLUMNS).eq("customer_id", user["id"])
    if account_id:
        query = query.eq("account_id", account_id)
    rows = query.order("period_end", desc=True).order("generated_at", desc=True).limit(limit).execute().data
    return {"statements": [_out(row) for row in rows]}


@router.get("/{statement_id}")
def get_statement(statement_id: str, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    rows = (
        db.table("statements").select(STATEMENT_COLUMNS)
        .eq("id", statement_id).eq("customer_id", user["id"]).limit(1).execute().data
    )
    if not rows:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Statement not found.")
    return {"statement": _out(rows[0])}


@router.post("", status_code=status.HTTP_201_CREATED)
def generate_statement(body: GenerateStatementRequest, user: dict = Depends(get_current_user), db: Client = Depends(get_supabase)):
    """Month-to-date statement: the first of this month (UTC) through today."""
    _get_own_account(db, user["id"], body.account_id)  # 404s for other people's accounts
    today = datetime.now(timezone.utc).date()
    row = _rpc(db, "generate_statement", {
        "p_user_id": user["id"], "p_account_id": body.account_id,
        "p_start": today.replace(day=1).isoformat(), "p_end": today.isoformat(), "p_kind": "month_to_date",
    })
    return {"statement": _out(row)}


def statement_text(statement: dict, account_number: str) -> str:
    """The plain-text version of a statement, used for the month-end email."""
    start = date.fromisoformat(statement["period_start"])
    end = date.fromisoformat(statement["period_end"])
    lines = [
        f"Statement for account {account_number}",
        f"{start:%B %d, %Y} to {end:%B %d, %Y}",
        "",
        f"Opening balance:   {_money(statement['opening_balance'])}",
        f"Deposits:          {_money(statement['total_deposits'])}",
        f"Withdrawals:       {_money(statement['total_withdrawals'])}",
        f"Closing balance:   {_money(statement['closing_balance'])}",
        f"Transactions:      {statement['transaction_count']}",
        "",
    ]
    for item in statement["transactions"]:
        day = datetime.fromisoformat(item["date"]).strftime("%b %d")
        lines.append(f"{day}  {item['description'][:40]:<40}  {_money(item['amount']):>12}  {_money(item['balance']):>12}")
    if not statement["transactions"]:
        lines.append("No transactions this period.")
    lines += ["", "You can view this and earlier statements any time under Statements in OnlineBank."]
    return "\n".join(lines)


def send_pending_statement_emails(db: Client) -> int:
    """Email every month-end statement that has not been sent yet. Returns how many were sent."""
    pending = (
        db.table("statements").select(STATEMENT_COLUMNS)
        .eq("kind", "monthly").is_("emailed_at", "null").order("generated_at").limit(50).execute().data
    )
    sent = 0
    for statement in pending:
        # Claim it first so two backend processes cannot send the same statement twice.
        claimed = (
            db.table("statements").update({"emailed_at": datetime.now(timezone.utc).isoformat()})
            .eq("id", statement["id"]).is_("emailed_at", "null").execute().data
        )
        if not claimed:
            continue
        try:
            account = db.table("accounts").select("account_number").eq("id", statement["account_id"]).limit(1).execute().data
            customer = db.table("users").select("email").eq("id", statement["customer_id"]).limit(1).execute().data
            if not account or not customer:
                raise LookupError("account or customer missing")
            period = date.fromisoformat(statement["period_end"])
            delivered = send_email(
                customer[0]["email"], f"Your {period:%B %Y} statement",
                statement_text(_out(statement), account[0]["account_number"]),
            )
        except Exception:
            logger.exception("Could not email statement %s", statement["id"])
            delivered = False
        if delivered:
            sent += 1
        else:
            # Release the claim so the next check retries.
            db.table("statements").update({"emailed_at": None}).eq("id", statement["id"]).execute()
    return sent
