"""Seed a LOCAL Supabase stack with demo data: one admin, one customer.

Run from the backend folder, with the venv active and backend/.env pointing at the local stack:

    python seed_local.py

Safe to re-run: existing demo users are reused and the customer's data is only created once.
It refuses to run unless SUPABASE_URL is a local address, so it can never touch a cloud project.
"""
import secrets
import sys
from datetime import date, timedelta
from urllib.parse import urlparse

import audit
from audit import record_event
from config import settings
from db import get_supabase

LOCAL_HOSTS = {"127.0.0.1", "localhost", "host.docker.internal"}

# Demo credentials. Local only - never reuse these anywhere real.
# The registration form only accepts @gmail.com, but accounts created here bypass that check.
ADMIN = {
    "email": "admin@bankdemo.dev", "password": "AdminDemo#2026",
    "first_name": "Ada", "last_name": "Admin", "phone_number": "+14155550100",
    "zip_code": "95192", "role": "admin",
}
CUSTOMER = {
    "email": "customer@bankdemo.dev", "password": "CustomerDemo#2026",
    "first_name": "Casey", "last_name": "Customer", "phone_number": "+14155550101",
    "zip_code": "95112", "role": "customer",
}


def require_local() -> None:
    host = urlparse(settings.supabase_url).hostname
    if host not in LOCAL_HOSTS:
        sys.exit(f"Refusing to seed: SUPABASE_URL host '{host}' is not local. "
                 "Point backend/.env at the local stack (supabase status) and try again.")


def find_auth_user(db, email: str):
    # The local stack has only a handful of users, so one page is enough.
    for user in db.auth.admin.list_users(page=1, per_page=200):
        if (user.email or "").lower() == email:
            return user
    return None


def ensure_user(db, spec: dict) -> str:
    email = spec["email"].lower()
    auth_user = find_auth_user(db, email)
    if auth_user is None:
        auth_user = db.auth.admin.create_user(
            {"email": email, "password": spec["password"], "email_confirm": True}
        ).user
        print(f"  created auth user {email}")
    else:
        print(f"  auth user {email} already exists")

    user_id = auth_user.id
    exists = db.table("users").select("id").eq("id", user_id).limit(1).execute().data
    if not exists:
        db.table("users").insert({
            "id": user_id,
            "first_name": spec["first_name"], "last_name": spec["last_name"], "email": email,
            "phone_number": spec["phone_number"], "zip_code": spec["zip_code"],
            "role": spec["role"], "status": "active",
        }).execute()
        record_event(db, user_id, audit.ACCOUNT_REGISTERED)
        print(f"  created profile ({spec['role']})")
    return user_id


def open_account(db, user_id: str, account_type: str) -> str:
    # Same shape the API inserts: random 12-digit number, zero balance, activated.
    for _ in range(5):
        try:
            row = db.table("accounts").insert({
                "user_id": user_id,
                "account_number": "".join(secrets.choice("0123456789") for _ in range(12)),
                "account_type": account_type, "balance": 0, "status": "activated",
            }).execute().data[0]
        except Exception:
            continue
        record_event(db, user_id, audit.BANK_ACCOUNT_OPENED,
                     {"account_id": row["id"], "account_number": row["account_number"], "account_type": account_type})
        return row["id"]
    sys.exit(f"Could not open a {account_type} account.")


def post(db, user_id: str, account_id: str, amount: float, kind: str, description: str) -> None:
    # Same database function the API uses, so balances and transactions stay consistent.
    db.rpc("post_account_transaction", {
        "p_user_id": user_id, "p_account_id": account_id, "p_amount": str(amount),
        "p_type": kind, "p_description": description,
    }).execute()


def seed_customer_data(db, user_id: str) -> None:
    if db.table("accounts").select("id").eq("user_id", user_id).limit(1).execute().data:
        print("  customer already has accounts - skipping sample data")
        return

    checking = open_account(db, user_id, "checking")
    savings = open_account(db, user_id, "savings")

    post(db, user_id, checking, 2500.00, "deposit", "Paycheck")
    post(db, user_id, savings, 5000.00, "deposit", "Opening deposit")
    post(db, user_id, checking, -64.30, "withdrawal", "Groceries")
    post(db, user_id, checking, -120.00, "withdrawal", "ATM withdrawal")
    db.rpc("post_transfer", {
        "p_user_id": user_id, "p_source_id": checking, "p_dest_id": savings,
        "p_amount": "300.00", "p_description": "Monthly savings",
    }).execute()

    db.table("scheduled_payments").insert({
        "account_id": checking, "customer_id": user_id, "recipient": "City Power & Water",
        "amount": 85.00, "frequency": "monthly",
        "next_payment_date": (date.today() + timedelta(days=14)).isoformat(),
    }).execute()
    print("  created checking + savings, 5 transactions, 1 scheduled payment")


def main() -> None:
    require_local()
    db = get_supabase()

    print("Admin:")
    ensure_user(db, ADMIN)
    print("Customer:")
    customer_id = ensure_user(db, CUSTOMER)
    seed_customer_data(db, customer_id)

    print("\nDone. Demo logins (local only):")
    for spec in (ADMIN, CUSTOMER):
        print(f"  {spec['role']:<9} {spec['email']}  /  {spec['password']}")


if __name__ == "__main__":
    main()
