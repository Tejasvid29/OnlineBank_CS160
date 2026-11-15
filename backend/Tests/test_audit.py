"""Audit-log recording and the manager endpoint that reads it."""

from unittest.mock import MagicMock

import pytest

from audit import PASSWORD_RESET, PROFILE_UPDATED, record_event
from support import ACCESS_TOKEN, USER_ID

AUTH = {"Authorization": f"Bearer {ACCESS_TOKEN}"}


def test_record_event_inserts_entry():
    db = MagicMock()
    record_event(db, USER_ID, PASSWORD_RESET)
    db.table.assert_called_with("audit_log")
    entry = db.table.return_value.insert.call_args.args[0]
    assert entry == {"customer_id": USER_ID, "actor_id": USER_ID, "action": PASSWORD_RESET, "details": {}}


def test_record_event_swallows_failures():
    db = MagicMock()
    db.table.return_value.insert.return_value.execute.side_effect = RuntimeError("db down")
    record_event(db, USER_ID, PASSWORD_RESET)  # must not raise


def test_reset_password_is_logged(client, supabase):
    response = client.post("/auth/reset-password", json={"access_token": "recovery", "password": "newpassword1"})
    assert response.status_code == 204
    entry = supabase.mock.table.return_value.insert.call_args.args[0]
    assert entry["action"] == PASSWORD_RESET and entry["customer_id"] == USER_ID


def test_profile_update_logs_only_changed_fields(client, supabase):
    response = client.patch("/auth/me", json={"first_name": "New", "last_name": "Customer"}, headers=AUTH)
    assert response.status_code == 200
    supabase.mock.table.return_value.update.assert_called_once_with({"first_name": "New"})
    entry = supabase.mock.table.return_value.insert.call_args.args[0]
    assert entry["action"] == PROFILE_UPDATED
    assert entry["details"] == {"changes": {"first_name": {"from": "Test", "to": "New"}}}


def test_profile_update_without_changes_logs_nothing(client, supabase):
    response = client.patch("/auth/me", json={"first_name": "Test"}, headers=AUTH)
    assert response.status_code == 200
    supabase.mock.table.return_value.insert.assert_not_called()


def test_audit_log_requires_manager(client, supabase):
    response = client.get(f"/manager/customers/{USER_ID}/audit-log", headers=AUTH)
    assert response.status_code == 403


def test_manager_reads_audit_log(client, supabase):
    supabase.use_profile(role="admin")
    chain = supabase.mock.table.return_value.select.return_value.eq.return_value
    chain.order.return_value.limit.return_value.execute.return_value.data = [{"id": "1", "action": PASSWORD_RESET}]
    response = client.get(f"/manager/customers/{USER_ID}/audit-log", headers=AUTH)
    assert response.status_code == 200
    assert response.json() == {"entries": [{"id": "1", "action": PASSWORD_RESET}]}


# Mailing address (PATCH /auth/me). zip_code is the postal code; the stub profile starts with no address.

ADDRESS = {"address_line1": "1 Washington Sq", "address_line2": "Apt 4", "city": "San Jose", "state": "ca", "zip_code": "95192"}


def test_profile_update_saves_and_logs_a_full_address(client, supabase):
    response = client.patch("/auth/me", json={**ADDRESS, "address_line1": "  1 Washington Sq  "}, headers=AUTH)
    assert response.status_code == 200
    saved = {**ADDRESS, "state": "CA"}
    supabase.mock.table.return_value.update.assert_called_once_with(saved)
    entry = supabase.mock.table.return_value.insert.call_args.args[0]
    assert entry["action"] == PROFILE_UPDATED
    assert entry["details"] == {"changes": {column: {"from": None, "to": value} for column, value in saved.items()}}


def test_profile_returns_address_fields(client, supabase):
    supabase.use_profile(**{**ADDRESS, "state": "CA"})
    profile = client.get("/auth/me", headers=AUTH).json()["profile"]
    assert {key: profile[key] for key in ADDRESS} == {**ADDRESS, "state": "CA"}


def test_incomplete_address_is_rejected_and_nothing_saved(client, supabase):
    response = client.patch("/auth/me", json={"address_line1": "1 Washington Sq", "city": "San Jose"}, headers=AUTH)
    assert response.status_code == 422
    assert response.json()["detail"] == "Enter the street address, city, state and ZIP code, or clear the address."
    supabase.mock.table.return_value.update.assert_not_called()
    supabase.mock.table.return_value.insert.assert_not_called()


def test_zip_code_alone_is_allowed(client, supabase):
    assert client.patch("/auth/me", json={"zip_code": "94105"}, headers=AUTH).status_code == 200
    supabase.mock.table.return_value.update.assert_called_once_with({"zip_code": "94105"})


def test_clearing_the_address_stores_nulls(client, supabase):
    supabase.use_profile(**{**ADDRESS, "state": "CA"})
    body = {"address_line1": "", "address_line2": "", "city": " ", "state": "", "zip_code": None}
    assert client.patch("/auth/me", json=body, headers=AUTH).status_code == 200
    supabase.mock.table.return_value.update.assert_called_once_with({column: None for column in ADDRESS})


def test_old_partial_address_does_not_block_a_name_change(client, supabase):
    supabase.use_profile(city="San Jose")
    assert client.patch("/auth/me", json={"first_name": "New"}, headers=AUTH).status_code == 200


@pytest.mark.parametrize("field, value", [
    ("state", "California"), ("state", "C1"), ("zip_code", "9519"), ("zip_code", "95192-1234"), ("address_line1", "x" * 101), ("city", "x" * 61),
])
def test_invalid_address_fields_are_422(client, supabase, field, value):
    assert client.patch("/auth/me", json={**ADDRESS, field: value}, headers=AUTH).status_code == 422
    supabase.mock.table.return_value.update.assert_not_called()
