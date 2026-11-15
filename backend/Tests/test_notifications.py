"""In-app notifications: the routes use an in-memory table; the action tests check which notifications a route writes."""

import uuid
from types import SimpleNamespace
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from auth import get_current_user
from db import get_supabase
from main import app
from notifications import notify

USER_ID = "11111111-1111-1111-1111-111111111111"
OTHER_ID = "22222222-2222-2222-2222-222222222222"
ACCOUNT_ID = "33333333-3333-3333-3333-333333333333"
SAVINGS_ID = "44444444-4444-4444-4444-444444444444"
USER = {"id": USER_ID, "role": "customer", "first_name": "Ada", "last_name": "Lopez"}


class Table:
    """Just enough of the PostgREST query builder for the notification routes."""

    def __init__(self, rows):
        self.rows, self.filters, self.changes, self.max = rows, [], None, None

    def select(self, *_): return self
    def eq(self, key, value): self.filters.append(lambda row: row.get(key) == value); return self
    def is_(self, key, _null): self.filters.append(lambda row: row.get(key) is None); return self
    def order(self, key, desc=False): self.rows = sorted(self.rows, key=lambda row: row[key], reverse=desc); return self
    def limit(self, count): self.max = count; return self
    def update(self, changes): self.changes = changes; return self

    def execute(self):
        matched = [row for row in self.rows if all(check(row) for check in self.filters)]
        if self.changes is not None:
            for row in matched:
                row.update(self.changes)
        return SimpleNamespace(data=[dict(row) for row in matched[:self.max]])


def _row(n, user_id=USER_ID, read=False):
    return {
        "id": str(uuid.UUID(int=n)), "user_id": user_id, "type": "deposit", "title": f"Deposit {n}", "message": "m",
        "transaction_id": None, "deposit_id": None, "read_at": "2026-11-02T00:00:00+00:00" if read else None,
        "created_at": f"2026-11-{n:02d}T12:00:00+00:00",
    }


@pytest.fixture
def store():
    return [_row(1), _row(2, read=True), _row(3), _row(4, user_id=OTHER_ID)]


@pytest.fixture
def client(store):
    db = SimpleNamespace(table=lambda name: Table(store))
    app.dependency_overrides[get_supabase] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: USER
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


def test_list_shows_only_own_newest_first_in_app_shape(client):
    items = client.get("/notifications").json()["notifications"]
    assert [item["title"] for item in items] == ["Deposit 3", "Deposit 2", "Deposit 1"]
    assert all(item["user_id"] == USER_ID for item in items)
    assert items[0]["notification_type"] == "Deposit 3"
    assert [item["read"] for item in items] == [False, True, False]


def test_list_limit_is_bounded(client):
    assert len(client.get("/notifications?limit=1").json()["notifications"]) == 1
    assert client.get("/notifications?limit=0").status_code == 422
    assert client.get("/notifications?limit=500").status_code == 422


def test_mark_read_marks_own_notification(client, store):
    response = client.patch(f"/notifications/{store[0]['id']}/read")
    assert response.status_code == 200
    assert response.json()["notification"]["read"] is True
    assert store[0]["read_at"] is not None


def test_mark_read_keeps_first_read_time(client, store):
    assert client.patch(f"/notifications/{store[1]['id']}/read").status_code == 200
    assert store[1]["read_at"] == "2026-11-02T00:00:00+00:00"


def test_cannot_mark_someone_elses_notification(client, store):
    response = client.patch(f"/notifications/{store[3]['id']}/read")
    assert response.status_code == 404
    assert store[3]["read_at"] is None
    assert client.patch("/notifications/not-a-uuid/read").status_code == 422


def test_mark_all_read_only_touches_own_unread(client, store):
    response = client.post("/notifications/read-all")
    assert response.json() == {"updated": 2}
    assert store[0]["read_at"] and store[2]["read_at"]
    assert store[1]["read_at"] == "2026-11-02T00:00:00+00:00"
    assert store[3]["read_at"] is None


def test_notify_swallows_failures():
    db = MagicMock()
    db.table.return_value.insert.return_value.execute.side_effect = RuntimeError("db down")
    notify(db, USER_ID, "deposit", "Deposit", "m")  # must not raise


# Actions that move money write a notification. Each table gets its own mock so the inserts can be told apart.

@pytest.fixture
def tables():
    tables = {}
    db = MagicMock()
    db.table.side_effect = lambda name: tables.setdefault(name, MagicMock())
    own = tables.setdefault("accounts", MagicMock())
    own.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"id": ACCOUNT_ID, "account_type": "checking", "account_number": "123456781234", "status": "activated", "balance": 500}
    ]
    tables["db"] = db
    app.dependency_overrides[get_supabase] = lambda: db
    app.dependency_overrides[get_current_user] = lambda: USER
    yield tables
    app.dependency_overrides.clear()


@pytest.fixture
def actions(tables):
    with TestClient(app) as test_client:
        yield test_client


def _sent(tables):
    return [call.args[0] for call in tables["notifications"].insert.call_args_list] if "notifications" in tables else []


def _txn(amount, kind="deposit", account_id=ACCOUNT_ID):
    return {"id": "t1", "account_id": account_id, "customer_id": USER_ID, "transaction_type": kind, "amount": amount,
            "status": "completed", "description": "x", "created_at": "2026-11-09T12:00:00+00:00"}


def test_atm_deposit_notifies(actions, tables):
    tables["db"].rpc.return_value.execute.return_value.data = _txn(200)
    assert actions.post("/atm/deposits", json={"account_id": ACCOUNT_ID, "amount": 200, "atm_name": "Main St"}).status_code == 201
    [sent] = _sent(tables)
    assert sent["user_id"] == USER_ID and sent["type"] == "deposit" and sent["transaction_id"] == "t1"
    assert "$200.00" in sent["message"] and "ending 1234" in sent["message"] and "Main St" in sent["message"]


def test_failed_atm_withdrawal_does_not_notify(actions, tables):
    tables["db"].rpc.return_value.execute.side_effect = Exception("insufficient_funds")
    assert actions.post("/atm/withdrawals", json={"account_id": ACCOUNT_ID, "amount": 900}).status_code == 409
    assert _sent(tables) == []


def test_transfer_notifies_once(actions, tables):
    tables["db"].rpc.return_value.execute.return_value.data = [_txn(-50, "transfer"), _txn(50, "transfer", SAVINGS_ID)]
    tables["accounts"].select.return_value.eq.return_value.in_.return_value.execute.return_value.data = [
        {"id": ACCOUNT_ID, "account_type": "checking", "account_number": "123456781234"},
        {"id": SAVINGS_ID, "account_type": "savings", "account_number": "987654325678"},
    ]
    body = {"source_account_id": ACCOUNT_ID, "destination_account_id": SAVINGS_ID, "amount": 50}
    assert actions.post("/transfers", json=body).status_code == 201
    [sent] = _sent(tables)
    assert sent["type"] == "transfer" and "checking account ending 1234" in sent["message"] and "savings account ending 5678" in sent["message"]


def test_send_money_notifies_sender_and_recipient(actions, tables):
    tables["db"].rpc.return_value.execute.return_value.data = _txn(-25, "transfer")
    tables["accounts"].select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"id": "dest", "user_id": OTHER_ID, "account_type": "savings", "account_number": "555566667777"}
    ]
    body = {"source_account_id": ACCOUNT_ID, "recipient_account_number": "555566667777", "amount": 25}
    assert actions.post("/transfers/send", json=body).status_code == 201
    sender, recipient = _sent(tables)
    assert sender["user_id"] == USER_ID and sender["title"] == "Money sent" and "ending 7777" in sender["message"]
    assert recipient["user_id"] == OTHER_ID and recipient["title"] == "Money received"
    assert "Ada L." in recipient["message"] and "Lopez" not in recipient["message"]


def test_opening_an_account_notifies(actions, tables):
    tables["accounts"].insert.return_value.execute.return_value.data = [
        {"id": SAVINGS_ID, "account_number": "987654325678", "account_type": "savings", "balance": 0,
         "status": "activated", "created_at": "2026-11-09T12:00:00+00:00", "closed_at": None}
    ]
    assert actions.post("/accounts", json={"account_type": "savings"}).status_code == 201
    [sent] = _sent(tables)
    assert sent["type"] == "account" and sent["title"] == "Account opened" and "ending 5678" in sent["message"]


def test_notification_failure_does_not_fail_the_action(actions, tables):
    tables["db"].rpc.return_value.execute.return_value.data = _txn(200)
    tables.setdefault("notifications", MagicMock()).insert.return_value.execute.side_effect = RuntimeError("db down")
    assert actions.post("/atm/deposits", json={"account_id": ACCOUNT_ID, "amount": 200}).status_code == 201
