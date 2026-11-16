"""Debit card withdrawals and deposits by account number (no sign-in); balance rules live in sql/card_transactions.sql."""

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from db import get_supabase
from main import app

USER_ID = "11111111-1111-1111-1111-111111111111"
ACCOUNT_ID = "33333333-3333-3333-3333-333333333333"
NUMBER = "123456789012"
ACCOUNT = {"id": ACCOUNT_ID, "user_id": USER_ID, "account_number": NUMBER, "account_type": "checking", "status": "activated", "balance": 500}
BODY = {"account_number": NUMBER, "amount": 40, "location": "Corner Store"}


def _txn(amount: float) -> dict:
    return {
        "id": "t1", "account_id": ACCOUNT_ID, "customer_id": USER_ID, "transaction_type": "deposit" if amount > 0 else "withdrawal",
        "amount": amount, "status": "completed", "description": "Card", "created_at": "2026-11-09T12:00:00+00:00",
    }


@pytest.fixture
def db():
    mock = MagicMock()
    lookup = mock.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value
    lookup.limit.return_value.execute.return_value.data = [ACCOUNT]
    app.dependency_overrides[get_supabase] = lambda: mock
    yield mock
    app.dependency_overrides.clear()


@pytest.fixture
def client(db):
    with TestClient(app) as test_client:
        yield test_client


def test_withdrawal_posts_a_negative_amount(client, db):
    db.rpc.return_value.execute.return_value.data = _txn(-40)
    response = client.post("/card/withdrawals", json={**BODY, "reference": "txn-77"})  # no Authorization header
    assert response.status_code == 201
    assert response.json()["transaction"]["amount"] == -40
    name, params = db.rpc.call_args.args
    assert name == "post_card_transaction_v2"
    assert params == {
        "p_user_id": USER_ID, "p_account_id": ACCOUNT_ID, "p_amount": "-40",
        "p_description": "Card withdrawal: Corner Store - txn-77", "p_daily_limit": "1000",
    }


def test_deposit_posts_a_positive_amount(client, db):
    db.rpc.return_value.execute.return_value.data = _txn(40)
    response = client.post("/card/deposits", json=BODY)
    assert response.status_code == 201
    assert response.json()["transaction"]["transaction_type"] == "Deposit"
    name, params = db.rpc.call_args.args
    assert name == "post_card_transaction_v2"
    assert params["p_amount"] == "40" and params["p_description"] == "Card deposit: Corner Store"


def test_location_defaults_when_left_out(client, db):
    db.rpc.return_value.execute.return_value.data = _txn(-5)
    assert client.post("/card/withdrawals", json={"account_number": NUMBER, "amount": 5}).status_code == 201
    assert db.rpc.call_args.args[1]["p_description"] == "Card withdrawal: External app"


@pytest.mark.parametrize("path", ["withdrawals", "deposits"])
def test_account_number_is_required_and_must_be_12_digits(client, db, path):
    for body in [{"amount": 5}, {**BODY, "account_number": "12345"}, {**BODY, "account_number": "12345678901a"}]:
        assert client.post(f"/card/{path}", json=body).status_code == 422
    db.rpc.assert_not_called()


@pytest.mark.parametrize("path", ["withdrawals", "deposits"])
@pytest.mark.parametrize("amount", [0, -5, 1.234])
def test_bad_amounts_are_rejected(client, db, path, amount):
    assert client.post(f"/card/{path}", json={**BODY, "amount": amount}).status_code == 422
    db.rpc.assert_not_called()


@pytest.mark.parametrize("path", ["withdrawals", "deposits"])
def test_unknown_savings_or_closed_number_is_not_found(client, db, path):
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
    response = client.post(f"/card/{path}", json=BODY)
    assert response.status_code == 404
    assert response.json()["detail"] == "No open checking account has that number."
    db.rpc.assert_not_called()


def test_daily_limit_becomes_a_readable_error(client, db):
    db.rpc.return_value.execute.side_effect = Exception('{"message": "card_limit_exceeded"}')
    response = client.post("/card/withdrawals", json={**BODY, "amount": 600})
    assert response.status_code == 409
    assert response.json()["detail"] == "This would exceed the $1,000 daily card withdrawal limit."


def test_unexpected_database_errors_are_a_500(client, db):
    db.rpc.return_value.execute.side_effect = Exception("boom")
    assert client.post("/card/withdrawals", json=BODY).status_code == 500


def test_cannot_withdraw_more_than_the_balance(client, db):
    db.rpc.return_value.execute.side_effect = Exception('{"message": "insufficient_funds"}')
    response = client.post("/card/withdrawals", json={**BODY, "amount": 100000})
    assert response.status_code == 409
    assert "Insufficient funds" in response.json()["detail"]
