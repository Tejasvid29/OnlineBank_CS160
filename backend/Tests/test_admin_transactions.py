"""POST /accounts/{id}/deposits and /withdrawals are admin only: customers get 403 and nothing is posted; admins post
and get notified as before. Each table gets its own mock so the calls can be told apart."""

from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

from auth import get_current_user
from db import get_supabase
from main import app

ADMIN_ID = "99999999-9999-9999-9999-999999999999"
CUSTOMER_ID = "11111111-1111-1111-1111-111111111111"
ACCOUNT_ID = "33333333-3333-3333-3333-333333333333"
ADMIN = {"id": ADMIN_ID, "role": "admin", "first_name": "Max", "last_name": "Park"}
CUSTOMER = {"id": CUSTOMER_ID, "role": "customer", "first_name": "Ada", "last_name": "Lopez"}
ROUTES = [("deposits", 75, "deposit"), ("withdrawals", -75, "withdrawal")]


@pytest.fixture
def tables():
    tables = {}
    db = MagicMock()
    db.table.side_effect = lambda name: tables.setdefault(name, MagicMock())
    tables.setdefault("accounts", MagicMock()).select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"id": ACCOUNT_ID, "account_type": "checking", "account_number": "123456781234", "status": "activated", "balance": 500}
    ]
    tables["db"] = db
    app.dependency_overrides[get_supabase] = lambda: db
    yield tables
    app.dependency_overrides.clear()


def _client(user):
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app)


@pytest.mark.parametrize("path, _amount, _kind", ROUTES)
def test_customer_gets_403_and_nothing_is_posted(tables, path, _amount, _kind):
    response = _client(CUSTOMER).post(f"/accounts/{ACCOUNT_ID}/{path}", json={"amount": 75})
    assert response.status_code == 403
    tables["db"].rpc.assert_not_called()
    assert "notifications" not in tables


@pytest.mark.parametrize("path, amount, kind", ROUTES)
def test_admin_posts_and_is_notified(tables, path, amount, kind):
    tables["db"].rpc.return_value.execute.return_value.data = {
        "id": "t1", "account_id": ACCOUNT_ID, "customer_id": ADMIN_ID, "transaction_type": kind, "amount": amount,
        "status": "completed", "description": kind.capitalize(), "created_at": "2026-11-15T12:00:00+00:00",
    }
    response = _client(ADMIN).post(f"/accounts/{ACCOUNT_ID}/{path}", json={"amount": 75, "description": "Teller"})
    assert response.status_code == 201
    assert response.json()["transaction"]["amount"] == amount

    fn, params = tables["db"].rpc.call_args.args
    assert fn == "post_account_transaction"
    assert params["p_user_id"] == ADMIN_ID and params["p_account_id"] == ACCOUNT_ID
    assert params["p_amount"] == str(amount) and params["p_type"] == kind and params["p_description"] == "Teller"

    [sent] = [call.args[0] for call in tables["notifications"].insert.call_args_list]
    assert sent["user_id"] == ADMIN_ID and sent["type"] == kind and sent["transaction_id"] == "t1"
    assert "$75.00" in sent["message"] and "ending 1234" in sent["message"]


def test_admin_cannot_post_to_an_account_they_do_not_own(tables):
    tables["accounts"].select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
    assert _client(ADMIN).post(f"/accounts/{ACCOUNT_ID}/deposits", json={"amount": 75}).status_code == 404
    tables["db"].rpc.assert_not_called()
