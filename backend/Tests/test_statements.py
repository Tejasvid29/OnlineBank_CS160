"""Statements: month-to-date generation, listing, and the month-end email sweep. The statement maths is in sql/statements.sql."""

from datetime import datetime, timezone
from unittest.mock import MagicMock

import pytest
from fastapi.testclient import TestClient

import statements
from auth import get_current_user
from db import get_supabase
from main import app

USER_ID = "11111111-1111-1111-1111-111111111111"
ACCOUNT_ID = "33333333-3333-3333-3333-333333333333"
STATEMENT_ID = "44444444-4444-4444-4444-444444444444"


def _statement(**overrides) -> dict:
    return {
        "id": STATEMENT_ID, "account_id": ACCOUNT_ID, "customer_id": USER_ID, "kind": "monthly",
        "period_start": "2026-10-01", "period_end": "2026-10-31",
        "opening_balance": "100.00", "closing_balance": "130.50", "total_deposits": "50.00", "total_withdrawals": "19.50",
        "transaction_count": 2, "generated_at": "2026-10-31T23:55:00+00:00", "emailed_at": None,
        "transactions": [
            {"date": "2026-10-05T12:00:00+00:00", "description": "Payroll", "type": "deposit", "amount": 50, "balance": 150},
            {"date": "2026-10-20T12:00:00+00:00", "description": "ATM withdrawal · Main St", "type": "withdrawal", "amount": -19.5, "balance": 130.5},
        ],
        **overrides,
    }


@pytest.fixture
def db():
    mock = MagicMock()
    mock.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = [
        {"id": ACCOUNT_ID, "account_type": "checking", "status": "activated", "balance": 130.5}
    ]
    app.dependency_overrides[get_supabase] = lambda: mock
    app.dependency_overrides[get_current_user] = lambda: {"id": USER_ID, "role": "customer"}
    yield mock
    app.dependency_overrides.clear()


@pytest.fixture
def client(db):
    with TestClient(app) as test_client:
        yield test_client


def test_generate_is_month_to_date(client, db):
    db.rpc.return_value.execute.return_value.data = _statement(kind="month_to_date")
    response = client.post("/statements", json={"account_id": ACCOUNT_ID})
    assert response.status_code == 201
    assert response.json()["statement"]["closing_balance"] == 130.5
    name, params = db.rpc.call_args.args
    today = datetime.now(timezone.utc).date()
    assert name == "generate_statement"
    assert params["p_start"] == today.replace(day=1).isoformat()
    assert params["p_end"] == today.isoformat()
    assert params["p_kind"] == "month_to_date" and params["p_user_id"] == USER_ID


def test_generate_for_someone_elses_account_is_not_found(client, db):
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
    assert client.post("/statements", json={"account_id": ACCOUNT_ID}).status_code == 404
    db.rpc.assert_not_called()


def test_list_only_asks_for_the_callers_statements(client, db):
    query = db.table.return_value.select.return_value.eq.return_value
    query.order.return_value.order.return_value.limit.return_value.execute.return_value.data = [_statement()]
    response = client.get("/statements")
    assert response.status_code == 200
    assert response.json()["statements"][0]["total_deposits"] == 50.0
    db.table.return_value.select.return_value.eq.assert_called_with("customer_id", USER_ID)


def test_get_unknown_statement_is_not_found(client, db):
    db.table.return_value.select.return_value.eq.return_value.eq.return_value.limit.return_value.execute.return_value.data = []
    assert client.get(f"/statements/{STATEMENT_ID}").status_code == 404


def test_email_text_has_totals_and_lines():
    text = statements.statement_text(statements._out(_statement()), "123456789012")
    assert "123456789012" in text
    assert "Opening balance:   $100.00" in text and "Closing balance:   $130.50" in text
    assert "Payroll" in text and "-$19.50" in text


def _sweep_db(pending: list[dict], claim_succeeds: bool = True) -> MagicMock:
    """A db whose statements query returns `pending`, and whose lookups return an account and a customer."""
    db = MagicMock()
    db.statements_table = MagicMock()

    def table(name):
        t = db.statements_table if name == "statements" else MagicMock()
        if name == "statements":
            t.select.return_value.eq.return_value.is_.return_value.order.return_value.limit.return_value.execute.return_value.data = pending
            t.update.return_value.eq.return_value.is_.return_value.execute.return_value.data = [{"id": STATEMENT_ID}] if claim_succeeds else []
        elif name == "accounts":
            t.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"account_number": "123456789012"}]
        else:
            t.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [{"email": "customer@example.com"}]
        return t

    db.table.side_effect = table
    return db


def test_sweep_emails_the_customer(monkeypatch):
    sent = []
    monkeypatch.setattr(statements, "send_email", lambda to, subject, text: sent.append((to, subject)) or True)
    assert statements.send_pending_statement_emails(_sweep_db([_statement()])) == 1
    assert sent == [("customer@example.com", "Your October 2026 statement")]


def test_sweep_releases_the_claim_when_sending_fails(monkeypatch):
    monkeypatch.setattr(statements, "send_email", lambda *args: False)
    db = _sweep_db([_statement()])
    assert statements.send_pending_statement_emails(db) == 0
    updates = [call.args[0] for call in db.statements_table.update.call_args_list]
    assert updates[0]["emailed_at"] is not None  # claimed
    assert updates[-1] == {"emailed_at": None}  # released, so the next check retries


def test_sweep_skips_a_statement_another_process_claimed(monkeypatch):
    sent = []
    monkeypatch.setattr(statements, "send_email", lambda *args: sent.append(args) or True)
    assert statements.send_pending_statement_emails(_sweep_db([_statement()], claim_succeeds=False)) == 0
    assert sent == []
