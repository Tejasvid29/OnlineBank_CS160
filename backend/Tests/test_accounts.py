"""Close-account tests use a fake database; no live banking service is touched."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from auth import get_current_user
from db import get_supabase
from main import app

USER_ID = "11111111-1111-1111-1111-111111111111"
ACCOUNT_ID = "33333333-3333-3333-3333-333333333333"
OTHER_ACCOUNT_ID = "44444444-4444-4444-4444-444444444444"
PENDING = "This account has pending deposits or transactions. Wait for them to finish before closing it."


class Query:
    def __init__(self, db, table):
        self.db, self.table, self.filters, self.changes = db, table, [], None

    def select(self, *_): return self
    def eq(self, key, value): self.filters.append((key, value)); return self
    def order(self, *_args, **_kwargs): return self
    def limit(self, *_): return self
    def update(self, changes): self.changes = changes; return self

    def execute(self):
        rows = [row for row in self.db.tables[self.table] if all(row.get(key) == value for key, value in self.filters)]
        if self.changes is not None:
            for row in rows:
                row.update(self.changes)
        return SimpleNamespace(data=[dict(row) for row in rows])


class Database:
    def __init__(self):
        self.tables = {
            "accounts": [{
                "id": ACCOUNT_ID, "user_id": USER_ID, "account_number": "123456789012", "account_type": "checking",
                "balance": 0, "status": "activated", "created_at": "2026-10-01T12:00:00+00:00", "closed_at": None,
            }],
            "check_deposits": [],
            "transactions": [],
        }

    def table(self, name): return Query(self, name)

    @property
    def account(self): return self.tables["accounts"][0]


@pytest.fixture
def db(): return Database()


@pytest.fixture
def client(db):
    app.dependency_overrides[get_supabase] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: {"id": USER_ID, "role": "customer"}
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


def close(client, account_id=ACCOUNT_ID):
    return client.post(f"/accounts/{account_id}/close")


def test_close_fails_with_pending_check_deposit(client, db):
    db.tables["check_deposits"].append({"id": "d1", "account_id": ACCOUNT_ID, "status": "pending"})
    response = close(client)
    assert response.status_code == 409
    assert response.json()["detail"] == PENDING
    assert db.account["status"] == "activated"


def test_close_fails_with_pending_transaction(client, db):
    db.tables["transactions"].append({"id": "t1", "account_id": ACCOUNT_ID, "status": "pending"})
    response = close(client)
    assert response.status_code == 409
    assert response.json()["detail"] == PENDING
    assert db.account["status"] == "activated"


def test_close_succeeds_without_pending_activity(client, db):
    # Finished items and pending items on other accounts do not block closing.
    db.tables["check_deposits"].append({"id": "d1", "account_id": ACCOUNT_ID, "status": "rejected"})
    db.tables["transactions"] += [
        {"id": "t1", "account_id": ACCOUNT_ID, "status": "completed"},
        {"id": "t2", "account_id": OTHER_ACCOUNT_ID, "status": "pending"},
    ]
    response = close(client)
    assert response.status_code == 200
    assert response.json()["account"]["status"] == "deactivated"
    assert response.json()["account"]["closed_at"]
    assert db.account["status"] == "deactivated"


def test_close_still_requires_zero_balance(client, db):
    db.account["balance"] = 5
    response = close(client)
    assert response.status_code == 409
    assert response.json()["detail"] == "Withdraw or transfer the remaining balance before closing."
