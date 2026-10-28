import pytest

from support import ACCESS_TOKEN

AUTH = {"Authorization": f"Bearer {ACCESS_TOKEN}"}


def account(balance, account_type="checking", status="activated", owner="u1", zip_code="94105"):
    return {
        "id": f"a-{balance}", "account_number": "000000000000", "account_type": account_type,
        "balance": balance, "status": status, "created_at": "2026-01-01T00:00:00+00:00", "closed_at": None,
        "users": {"id": owner, "first_name": owner.upper(), "last_name": "Test", "zip_code": zip_code},
    }


@pytest.fixture
def accounts(supabase):
    rows = [
        account(100, owner="u1", zip_code="94105"),
        account(300, "savings", owner="u1", zip_code="94105"),
        account(50, owner="u2", zip_code=None),
    ]
    query = supabase.mock.table.return_value.select.return_value
    query.execute.return_value.data = rows
    query.eq.return_value.execute.return_value.data = rows[:1]
    return rows


def test_report_requires_login(client):
    assert client.get("/manager/reports/summary").status_code == 401


@pytest.mark.parametrize("path", ["/manager/reports/summary", "/manager/accounts"])
def test_report_forbidden_for_customer(client, path):
    assert client.get(path, headers=AUTH).status_code == 403


def test_report_overall_totals(client, supabase, accounts):
    supabase.use_profile(role="admin")
    body = client.get("/manager/reports/summary", headers=AUTH).json()
    assert body["totals"] == {
        "customer_count": 2, "account_count": 3, "total_balance": 450.0,
        "average_balance": 150.0, "min_balance": 50.0, "max_balance": 300.0,
    }
    assert [g["group"] for g in body["groups"]] == ["All accounts"]


def test_report_group_by_zip_code(client, supabase, accounts):
    supabase.use_profile(role="admin")
    groups = client.get("/manager/reports/summary?group_by=zip_code", headers=AUTH).json()["groups"]
    assert [(g["group"], g["account_count"], g["total_balance"]) for g in groups] == [("94105", 2, 400.0), ("Unknown", 1, 50.0)]


def test_report_group_by_account_type(client, supabase, accounts):
    supabase.use_profile(role="admin")
    groups = client.get("/manager/reports/summary?group_by=account_type", headers=AUTH).json()["groups"]
    assert {g["group"]: g["total_balance"] for g in groups} == {"Checking": 150.0, "Savings": 300.0}


def test_report_applies_filter(client, supabase, accounts):
    supabase.use_profile(role="admin")
    body = client.get("/manager/reports/summary?account_status=activated", headers=AUTH).json()
    supabase.mock.table.return_value.select.return_value.eq.assert_called_with("status", "activated")
    assert body["totals"]["account_count"] == 1


@pytest.mark.parametrize("query", ["group_by=bogus", "zip_code=abc", "account_type=loan", "min_balance=-1"])
def test_report_rejects_bad_params(client, supabase, query):
    supabase.use_profile(role="admin")
    assert client.get(f"/manager/reports/summary?{query}", headers=AUTH).status_code == 422
