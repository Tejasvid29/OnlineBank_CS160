"""Purchases by account number (no sign-in): request rules are checked here; balance rules live in sql/purchases.sql."""

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from db import get_supabase
from main import app

USER_ID = "11111111-1111-1111-1111-111111111111"
ACCOUNT_ID = "33333333-3333-3333-3333-333333333333"
NUMBER = "123456789012"
ACCOUNT = {
    "id": ACCOUNT_ID, "account_number": NUMBER, "account_type": "checking", "status": "activated", "balance": 500,
    "user_id": USER_ID,
}
BODY = {"account_number": NUMBER, "merchant": "Coffee Shop", "amount": 4.5}


def _txn(amount: float) -> dict:
    return {  # as stored: a withdrawal described "Purchase: ..."
        "id": "t1", "account_id": ACCOUNT_ID, "customer_id": USER_ID, "transaction_type": "withdrawal",
        "amount": amount, "status": "completed", "description": "Purchase: Coffee Shop", "created_at": "2026-11-09T12:00:00+00:00",
    }


@pytest.fixture
def db():
    mock = MagicMock()
    lookup = mock.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value
    lookup.limit.return_value.execute.return_value.data = [ACCOUNT]
    mock.rpc.return_value.execute.return_value.data = _txn(-4.5)
    app.dependency_overrides[get_supabase] = lambda: mock
    yield mock
    app.dependency_overrides.clear()


@pytest.fixture
def client(db):
    with TestClient(app) as test_client:
        yield test_client


def test_purchase_charges_the_account_with_that_number(client, db):
    response = client.post("/purchases", json=BODY)  # no Authorization header
    assert response.status_code == 201
    assert response.json()["transaction"]["amount"] == -4.5
    assert response.json()["transaction"]["transaction_type"] == "Card purchase"
    name, params = db.rpc.call_args.args
    assert name == "post_purchase"
    assert params == {
        "p_user_id": USER_ID, "p_account_id": ACCOUNT_ID, "p_amount": "4.5", "p_description": "Purchase: Coffee Shop",
    }
    lookup = db.table.return_value.select.return_value.eq
    assert lookup.call_args.args == ("account_number", NUMBER)


def test_reference_is_added_to_the_description(client, db):
    assert client.post("/purchases", json={**BODY, "merchant": " Coffee Shop ", "reference": "order-1001"}).status_code == 201
    assert db.rpc.call_args.args[1]["p_description"] == "Purchase: Coffee Shop - order-1001"


def test_unknown_savings_or_closed_number_is_not_found(client, db):
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
    response = client.post("/purchases", json=BODY)
    assert response.status_code == 404
    assert response.json()["detail"] == "No open checking account has that number."
    db.rpc.assert_not_called()


@pytest.mark.parametrize("body", [
    {**BODY, "amount": 0},
    {**BODY, "amount": -5},
    {**BODY, "amount": 2500.01},
    {**BODY, "amount": 1.234},
    {**BODY, "merchant": "   "},
    {**BODY, "account_number": "12345"},
    {**BODY, "account_number": "12345678901a"},
    {"merchant": "Shop", "amount": 5},
])
def test_bad_requests_are_rejected(client, db, body):
    assert client.post("/purchases", json=body).status_code == 422
    db.rpc.assert_not_called()


@pytest.mark.parametrize("error, expected_status, expected_text", [
    ("insufficient_funds", 409, "Insufficient funds"),
    ("account_closed", 409, "closed"),
])
def test_database_rules_become_readable_errors(client, db, error, expected_status, expected_text):
    db.rpc.return_value.execute.side_effect = Exception(f'{{"message": "{error}"}}')
    response = client.post("/purchases", json=BODY)
    assert response.status_code == expected_status
    assert expected_text in response.json()["detail"]
