"""ATM deposits and withdrawals: request rules are checked here; balance and daily-limit rules live in sql/atm.sql."""

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from auth import get_current_user
from db import get_supabase
from main import app

USER_ID = "11111111-1111-1111-1111-111111111111"
ACCOUNT_ID = "33333333-3333-3333-3333-333333333333"


def _txn(amount: float, kind: str) -> dict:
    return {
        "id": "t1", "account_id": ACCOUNT_ID, "customer_id": USER_ID, "transaction_type": kind,
        "amount": amount, "status": "completed", "description": "ATM", "created_at": "2026-11-09T12:00:00+00:00",
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


def _post(client, path, amount, **extra):
    return client.post(f"/atm/{path}", json={"account_id": ACCOUNT_ID, "amount": amount, "atm_name": "Main St ATM", **extra})


def test_withdrawal_posts_negative_amount(client, db):
    db.rpc.return_value.execute.return_value.data = _txn(-100, "withdrawal")
    response = _post(client, "withdrawals", 100)
    assert response.status_code == 201
    assert response.json()["transaction"]["amount"] == -100
    name, params = db.rpc.call_args.args
    assert name == "post_atm_transaction"
    assert params["p_amount"] == "-100"
    assert params["p_type"] == "withdrawal"
    assert params["p_description"].startswith("ATM withdrawal")
    assert params["p_user_id"] == USER_ID and params["p_daily_limit"] == "5000"


@pytest.mark.parametrize("amount", [25, 20.5, 4999.99, 5000])
def test_withdrawal_accepts_any_amount_up_to_the_limit(client, db, amount):
    db.rpc.return_value.execute.return_value.data = _txn(-amount, "withdrawal")
    assert _post(client, "withdrawals", amount).status_code == 201


def test_deposit_posts_positive_amount(client, db):
    db.rpc.return_value.execute.return_value.data = _txn(250, "deposit")
    response = _post(client, "deposits", 250)
    assert response.status_code == 201
    assert db.rpc.call_args.args[1]["p_amount"] == "250"
    assert db.rpc.call_args.args[1]["p_description"].startswith("ATM deposit")


@pytest.mark.parametrize("amount", [0, -20, 5000.01, 6000])
def test_withdrawal_rejects_bad_amounts(client, db, amount):
    assert _post(client, "withdrawals", amount).status_code == 422
    db.rpc.assert_not_called()


@pytest.mark.parametrize("amount", [0, -5, 10.5, 5001])
def test_deposit_rejects_bad_amounts(client, db, amount):
    assert _post(client, "deposits", amount).status_code == 422
    db.rpc.assert_not_called()


@pytest.mark.parametrize("error, expected_status, expected_text", [
    ("insufficient_funds", 409, "Insufficient funds"),
    ("daily_limit_exceeded", 409, "daily ATM withdrawal limit"),
    ("not_checking_account", 409, "checking account"),
    ("account_closed", 409, "closed"),
])
def test_database_rules_become_readable_errors(client, db, error, expected_status, expected_text):
    db.rpc.return_value.execute.side_effect = Exception(f'{{"message": "{error}"}}')
    response = _post(client, "withdrawals", 100)
    assert response.status_code == expected_status
    assert expected_text in response.json()["detail"]


def test_other_peoples_account_is_not_found(client, db):
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
    assert _post(client, "withdrawals", 100).status_code == 404
    db.rpc.assert_not_called()
