"""Demo data for the local Docker stack: an admin, the e2e test users, and funded accounts.

Run it with:  docker compose run --rm seed

Safe to re-run: existing users and accounts are reused and only topped up when low. It talks to the local Supabase with
the service key, so it never touches a hosted project unless SUPABASE_URL points at one (it should not).
"""

import os
import secrets
import sys

from supabase import create_client

URL = os.environ["SUPABASE_URL"]
KEY = os.environ["SUPABASE_SERVICE_KEY"]
PASSWORD = os.environ["SEED_PASSWORD"]
TOP_UP_BELOW = 1000
FUND_TO = 5000

# (email, password, first name, last name, role, accounts to open)
USERS = [
    (os.environ["SEED_ADMIN_EMAIL"], PASSWORD, "Ada", "Admin", "admin", ["checking"]),
    (os.environ["E2E_TEST_EMAIL"], os.environ["E2E_TEST_PASSWORD"], "Eve", "Tester", "customer", ["checking", "savings"]),
    (os.environ["E2E_RECIPIENT_EMAIL"], os.environ["E2E_RECIPIENT_PASSWORD"], "Rae", "Recipient", "customer", ["checking"]),
    # deposit.spec.js logs in as these two with this fixed password.
    ("deposit-test-2@example.com", "DepositTest2026", "test", "2", "customer", ["checking"]),
    ("deposit-test-3@example.com", "DepositTest2026", "test", "3", "customer", ["checking"]),
]

db = create_client(URL, KEY)


def ensure_user(email: str, password: str, first: str, last: str, role: str) -> str:
    rows = db.table("users").select("id").eq("email", email.lower()).limit(1).execute().data
    if rows:
        user_id = rows[0]["id"]
    else:
        created = db.auth.admin.create_user({"email": email, "password": password, "email_confirm": True})
        user_id = created.user.id
        db.table("users").insert({
            "id": user_id, "first_name": first, "last_name": last, "email": email.lower(),
            "zip_code": "94105", "role": "customer", "status": "active",
        }).execute()
    if role == "admin":
        db.table("users").update({"role": "admin"}).eq("id", user_id).execute()
    return user_id


def ensure_account(user_id: str, account_type: str) -> dict:
    rows = (db.table("accounts").select("id, account_number, balance").eq("user_id", user_id)
            .eq("account_type", account_type).eq("status", "activated").limit(1).execute().data)
    if rows:
        return rows[0]
    for _ in range(5):
        try:
            number = "".join(secrets.choice("0123456789") for _ in range(12))
            return db.table("accounts").insert({
                "user_id": user_id, "account_number": number, "account_type": account_type, "balance": 0, "status": "activated",
            }).execute().data[0]
        except Exception:
            continue  # account_number collision: try another
    raise RuntimeError(f"Could not open a {account_type} account")


def fund(user_id: str, account: dict) -> None:
    if float(account["balance"]) >= TOP_UP_BELOW:
        return
    db.rpc("post_account_transaction", {
        "p_user_id": user_id, "p_account_id": account["id"], "p_amount": FUND_TO - float(account["balance"]),
        "p_type": "deposit", "p_description": "Seed deposit",
    }).execute()


def main() -> int:
    for email, password, first, last, role, kinds in USERS:
        user_id = ensure_user(email, password, first, last, role)
        for kind in kinds:
            account = ensure_account(user_id, kind)
            if kind == "checking":
                fund(user_id, account)
        print(f"ok  {role:<8} {email}")

    print("\nFor the Playwright e2e specs:")
    print(f"  E2E_TEST_EMAIL={os.environ['E2E_TEST_EMAIL']}")
    print(f"  E2E_TEST_PASSWORD={os.environ['E2E_TEST_PASSWORD']}")
    print(f"  E2E_RECIPIENT_EMAIL={os.environ['E2E_RECIPIENT_EMAIL']}")
    print(f"  E2E_RECIPIENT_PASSWORD={os.environ['E2E_RECIPIENT_PASSWORD']}")
    print("  E2E_MISSING_ACCOUNT_NUMBER=999999999999")
    print(f"\nAdmin (manager screens): {os.environ['SEED_ADMIN_EMAIL']} / {PASSWORD}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
