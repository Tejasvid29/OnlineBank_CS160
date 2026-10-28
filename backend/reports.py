from datetime import date
from decimal import Decimal
from typing import Literal

from fastapi import APIRouter, Depends, Query
from supabase import Client

from auth import require_role
from db import get_supabase

router = APIRouter(prefix="/manager", tags=["manager"], dependencies=[Depends(require_role("admin"))])

MANAGER_ACCOUNT_COLUMNS = (
    "id, account_number, account_type, balance, status, created_at, closed_at, "
    "users(id, first_name, last_name, zip_code)"
)
UNKNOWN = "Unknown"

GroupBy = Literal["none", "zip_code", "account_type", "account_status", "customer"]


def _owner(row: dict) -> dict:
    return row.get("users") or {}


def _group_key(row: dict, group_by: str) -> tuple[str, str]:
    """Return (sort/identity key, display label) for the group this account belongs to."""
    owner = _owner(row)
    if group_by == "zip_code":
        zip_code = owner.get("zip_code") or UNKNOWN
        return zip_code, zip_code
    if group_by == "account_type":
        return row["account_type"], row["account_type"].title()
    if group_by == "account_status":
        return row["status"], row["status"].title()
    if group_by == "customer":
        name = f"{owner.get('first_name', '')} {owner.get('last_name', '')}".strip() or UNKNOWN
        return owner.get("id") or name, name
    return "all", "All accounts"


def _summarize(rows: list[dict]) -> dict:
    balances = [Decimal(str(r["balance"])) for r in rows]
    total = sum(balances, Decimal(0))
    return {
        "customer_count": len({_owner(r).get("id") for r in rows}),
        "account_count": len(rows),
        "total_balance": float(total),
        "average_balance": float(total / len(rows)) if rows else 0.0,
        "min_balance": float(min(balances)) if balances else 0.0,
        "max_balance": float(max(balances)) if balances else 0.0,
    }


@router.get("/accounts")
def manager_accounts(db: Client = Depends(get_supabase)):
    rows = db.table("accounts").select(MANAGER_ACCOUNT_COLUMNS).execute().data
    return {"accounts": rows}


@router.get("/reports/summary")
def report_summary(
    group_by: GroupBy = "none",
    zip_code: str | None = Query(default=None, pattern=r"^[0-9]{5}$"),
    account_type: Literal["checking", "savings"] | None = None,
    account_status: Literal["activated", "deactivated"] | None = None,
    min_balance: Decimal | None = Query(default=None, ge=0),
    max_balance: Decimal | None = Query(default=None, ge=0),
    created_from: date | None = None,
    created_to: date | None = None,
    db: Client = Depends(get_supabase),
):
    # `users!inner` lets the zip filter on the joined table drop non-matching accounts.
    select = MANAGER_ACCOUNT_COLUMNS.replace("users(", "users!inner(")
    query = db.table("accounts").select(select)
    if zip_code:
        query = query.eq("users.zip_code", zip_code)
    if account_type:
        query = query.eq("account_type", account_type)
    if account_status:
        query = query.eq("status", account_status)
    if min_balance is not None:
        query = query.gte("balance", str(min_balance))
    if max_balance is not None:
        query = query.lte("balance", str(max_balance))
    if created_from:
        query = query.gte("created_at", created_from.isoformat())
    if created_to:
        query = query.lt("created_at", f"{created_to.isoformat()}T23:59:59.999999+00:00")
    rows = query.execute().data

    groups: dict[str, dict] = {}
    for row in rows:
        key, label = _group_key(row, group_by)
        groups.setdefault(key, {"label": label, "rows": []})["rows"].append(row)

    result = [{"group": g["label"], **_summarize(g["rows"])} for g in groups.values()]
    result.sort(key=lambda g: g["total_balance"], reverse=True)
    return {"group_by": group_by, "totals": _summarize(rows), "groups": result}
