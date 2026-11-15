"""Manager check review tests use a fake database and bucket; no live banking service is touched.

The fake review_check_deposit RPC follows sql/check_deposit_review.sql (lock, must be pending, credit once),
so these tests cover the routes, permissions and error mapping. The SQL itself runs only in Supabase.
"""

import uuid
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from auth import get_current_user
from db import get_supabase
from main import app

ADMIN_ID = "99999999-9999-9999-9999-999999999999"
CUSTOMER_ID = "11111111-1111-1111-1111-111111111111"
ACCOUNT_ID = "33333333-3333-3333-3333-333333333333"
DEPOSIT_ID = "44444444-4444-4444-4444-444444444444"
TXN_ID = "55555555-5555-5555-5555-555555555555"
ADMIN = {"id": ADMIN_ID, "role": "admin"}
CUSTOMER = {"id": CUSTOMER_ID, "role": "customer"}


class Query:
    def __init__(self, db, table):
        self.db, self.table, self.filters = db, table, []

    def select(self, *_): return self
    def eq(self, key, value): self.filters.append((key, value)); return self
    def order(self, *_args, **_kwargs): return self
    def limit(self, *_): return self

    def execute(self):
        rows = [row for row in self.db.tables[self.table] if all(row.get(key) == value for key, value in self.filters)]
        if self.table == "check_deposits":
            rows = [{**row, "customer": {"first_name": "Ada", "last_name": "Lopez", "email": "ada@example.com"},
                     "account": {k: self.db.account[k] for k in ("account_type", "account_number", "status")}} for row in rows]
        return SimpleNamespace(data=rows)


class Bucket:
    def __init__(self):
        self.signed = []

    def create_signed_url(self, path, expires_in):
        self.signed.append((path, expires_in))
        return {"signedURL": f"https://storage.test/{path}?token=t&expires={expires_in}"}


class Database:
    def __init__(self):
        self.account = {"id": ACCOUNT_ID, "user_id": CUSTOMER_ID, "account_type": "checking",
                        "account_number": "123456789012", "status": "activated", "balance": 100.0}
        self.transaction = {"id": TXN_ID, "account_id": ACCOUNT_ID, "status": "pending", "amount": 25.5}
        self.tables = {
            "check_deposits": [{
                "id": DEPOSIT_ID, "account_id": ACCOUNT_ID, "customer_id": CUSTOMER_ID, "amount": 25.5,
                "status": "pending", "transaction_id": TXN_ID, "created_at": "2026-11-01T12:00:00+00:00",
                "review_notes": None, "reviewed_at": None, "reviewed_by": None,
                "front_image_path": f"{CUSTOMER_ID}/{DEPOSIT_ID}/front.jpg", "back_image_path": f"{CUSTOMER_ID}/{DEPOSIT_ID}/back.jpg",
                "front_sha256": "a" * 64, "back_sha256": "b" * 64,
            }],
            "audit_log": [],
        }
        self.bucket = Bucket()
        self.storage = SimpleNamespace(from_=lambda name: self.bucket)

    @property
    def deposit(self): return self.tables["check_deposits"][0]

    def table(self, name):
        if name == "audit_log":
            return SimpleNamespace(insert=lambda row: SimpleNamespace(execute=lambda: self.tables["audit_log"].append(row)))
        return Query(self, name)

    def rpc(self, name, params):
        assert name == "review_check_deposit"

        def execute():
            deposit = next((d for d in self.tables["check_deposits"] if d["id"] == params["p_deposit_id"]), None)
            notes = (params["p_notes"] or "").strip() or None
            if params["p_decision"] == "reject" and not notes:
                raise RuntimeError("notes_required")
            if deposit is None:
                raise RuntimeError("deposit_not_found")
            if deposit["customer_id"] == params["p_reviewer_id"]:
                raise RuntimeError("own_deposit")
            if deposit["status"] != "pending":
                raise RuntimeError("already_reviewed")
            if params["p_decision"] == "approve":
                if self.account["status"] != "activated":
                    raise RuntimeError("account_closed")
                self.account["balance"] += deposit["amount"]
                self.transaction["status"] = "completed"
                deposit["status"] = "approved"
            else:
                self.transaction["status"] = "failed"
                deposit["status"] = "rejected"
            deposit.update(review_notes=notes, reviewed_by=params["p_reviewer_id"], reviewed_at="2026-11-02T09:00:00+00:00")
            return SimpleNamespace(data=dict(deposit))

        return SimpleNamespace(execute=execute)


@pytest.fixture
def db(): return Database()


def make_client(db, user):
    app.dependency_overrides[get_supabase] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


@pytest.fixture
def admin(db):
    try:
        with make_client(db, ADMIN) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def customer(db):
    try:
        with make_client(db, CUSTOMER) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


def url(suffix=""):
    return f"/manager/check-deposits{suffix}"


def test_customers_cannot_use_review_routes(customer, db):
    assert customer.get(url()).status_code == 403
    assert customer.get(url(f"/{DEPOSIT_ID}")).status_code == 403
    assert customer.post(url(f"/{DEPOSIT_ID}/approve")).status_code == 403
    assert customer.post(url(f"/{DEPOSIT_ID}/reject"), json={"notes": "No"}).status_code == 403
    assert db.account["balance"] == 100.0 and db.deposit["status"] == "pending"
    assert db.bucket.signed == []


def test_list_shows_pending_queue_without_private_fields(admin):
    response = admin.get(url())
    assert response.status_code == 200
    [item] = response.json()["deposits"]
    assert item["status"] == "pending" and item["amount"] == 25.5
    assert item["customer"]["last_name"] == "Lopez" and item["account"]["account_number"] == "123456789012"
    for private in ("front_image_path", "back_image_path", "front_sha256", "back_sha256"):
        assert private not in item


def test_list_filters_by_status(admin):
    assert admin.get(url("?status=approved")).json()["deposits"] == []
    assert len(admin.get(url("?status=all")).json()["deposits"]) == 1
    assert admin.get(url("?status=everything")).status_code == 422


def test_detail_has_short_lived_signed_urls_and_no_paths(admin, db):
    response = admin.get(url(f"/{DEPOSIT_ID}"))
    assert response.status_code == 200
    deposit = response.json()["deposit"]
    assert deposit["front_image_url"].startswith("https://storage.test/") and deposit["back_image_url"]
    assert deposit["image_url_expires_in"] == 300
    assert all(expires == 300 for _, expires in db.bucket.signed)
    for private in ("front_image_path", "back_image_path", "front_sha256", "back_sha256"):
        assert private not in deposit


def test_unknown_deposit_is_404(admin):
    assert admin.get(url(f"/{uuid.uuid4()}")).status_code == 404
    response = admin.post(url(f"/{uuid.uuid4()}/approve"))
    assert response.status_code == 404
    assert response.json()["detail"] == "Check deposit not found."


def test_approve_credits_once_and_completes_transaction(admin, db):
    response = admin.post(url(f"/{DEPOSIT_ID}/approve"))
    assert response.status_code == 200
    assert response.json()["deposit"]["status"] == "approved"
    assert response.json()["deposit"]["reviewed_by"] == ADMIN_ID
    assert db.account["balance"] == 125.5
    assert db.transaction["status"] == "completed"
    [event] = db.tables["audit_log"]
    assert event["action"] == "check_deposit_approved" and event["actor_id"] == ADMIN_ID and event["customer_id"] == CUSTOMER_ID


def test_approving_twice_fails_and_does_not_credit_again(admin, db):
    assert admin.post(url(f"/{DEPOSIT_ID}/approve")).status_code == 200
    response = admin.post(url(f"/{DEPOSIT_ID}/approve"))
    assert response.status_code == 409
    assert response.json()["detail"] == "This check deposit has already been reviewed."
    assert db.account["balance"] == 125.5
    assert len(db.tables["audit_log"]) == 1


def test_approve_refuses_closed_account(admin, db):
    db.account["status"] = "deactivated"
    response = admin.post(url(f"/{DEPOSIT_ID}/approve"))
    assert response.status_code == 409
    assert "closed" in response.json()["detail"]
    assert db.account["balance"] == 100.0 and db.deposit["status"] == "pending"


def test_reject_requires_notes(admin, db):
    assert admin.post(url(f"/{DEPOSIT_ID}/reject"), json={"notes": "   "}).status_code == 422
    assert admin.post(url(f"/{DEPOSIT_ID}/reject"), json={}).status_code == 422
    assert db.deposit["status"] == "pending"


def test_reject_keeps_balance_and_fails_transaction(admin, db):
    response = admin.post(url(f"/{DEPOSIT_ID}/reject"), json={"notes": "  Signature missing  "})
    assert response.status_code == 200
    assert response.json()["deposit"]["status"] == "rejected"
    assert response.json()["deposit"]["review_notes"] == "Signature missing"
    assert db.account["balance"] == 100.0
    assert db.transaction["status"] == "failed"
    assert db.tables["audit_log"][0]["action"] == "check_deposit_rejected"
    assert db.tables["audit_log"][0]["details"]["notes"] == "Signature missing"
    assert admin.post(url(f"/{DEPOSIT_ID}/approve")).status_code == 409


def test_manager_cannot_review_own_deposit(db):
    db.deposit["customer_id"] = ADMIN_ID
    try:
        with make_client(db, ADMIN) as own:
            for action, body in (("approve", None), ("reject", {"notes": "No"})):
                response = own.post(url(f"/{DEPOSIT_ID}/{action}"), json=body)
                assert response.status_code == 403
                assert "your own" in response.json()["detail"]
    finally:
        app.dependency_overrides.clear()
    assert db.account["balance"] == 100.0 and db.deposit["status"] == "pending"
    assert db.transaction["status"] == "pending" and db.tables["audit_log"] == []
