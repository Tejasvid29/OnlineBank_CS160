"""Bill payments: a one-time payment is paid immediately; recurring ones are scheduled for the nightly/5-minute job."""

from datetime import date, timedelta
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from auth import get_current_user
from db import get_supabase
from main import app

USER_ID = "11111111-1111-1111-1111-111111111111"
ACCOUNT_ID = "33333333-3333-3333-3333-333333333333"
ROW = {
    "id": "p1", "account_id": ACCOUNT_ID, "customer_id": USER_ID, "recipient": "Electric Co", "amount": 40,
    "frequency": "once", "next_payment_date": date.today().isoformat(), "status": "completed", "created_at": "2026-11-09T12:00:00+00:00",
}


@pytest.fixture
def db():
    mock = MagicMock()
    mock.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"id": ACCOUNT_ID, "account_type": "checking", "status": "activated", "balance": 500}
    ]
    app.dependency_overrides[get_supabase] = lambda: mock
    app.dependency_overrides[get_current_user] = lambda: {"id": USER_ID, "role": "customer"}
    yield mock
    app.dependency_overrides.clear()


@pytest.fixture
def client(db):
    with TestClient(app) as test_client:
        yield test_client


def _body(**overrides):
    return {"account_id": ACCOUNT_ID, "recipient": "Electric Co", "amount": 40, "frequency": "once", **overrides}


def test_once_payment_is_paid_immediately_without_a_date(client, db):
    db.rpc.return_value.execute.return_value.data = ROW
    response = client.post("/bill-payments", json=_body())
    assert response.status_code == 201
    assert response.json()["payment"]["status"] == "Completed"
    name, params = db.rpc.call_args.args
    assert name == "pay_bill_now"
    assert params["p_amount"] == "40" and params["p_recipient"] == "Electric Co" and params["p_user_id"] == USER_ID
    db.table.return_value.insert.assert_not_called()


def test_once_payment_with_insufficient_funds_records_nothing(client, db):
    db.rpc.return_value.execute.side_effect = Exception('{"message": "insufficient_funds"}')
    response = client.post("/bill-payments", json=_body(amount=900))
    assert response.status_code == 409
    assert "Insufficient funds" in response.json()["detail"]
    db.table.return_value.insert.assert_not_called()


def test_recurring_payment_is_scheduled_not_paid(client, db):
    start = (date.today() + timedelta(days=7)).isoformat()
    db.table.return_value.insert.return_value.execute.return_value.data = [
        {**ROW, "frequency": "weekly", "status": "scheduled", "next_payment_date": start}
    ]
    response = client.post("/bill-payments", json=_body(frequency="weekly", next_payment_date=start))
    assert response.status_code == 201
    assert response.json()["payment"]["status"] == "Scheduled"
    db.rpc.assert_not_called()


def test_recurring_payment_needs_a_date(client, db):
    assert client.post("/bill-payments", json=_body(frequency="monthly")).status_code == 422
    db.table.return_value.insert.assert_not_called()
