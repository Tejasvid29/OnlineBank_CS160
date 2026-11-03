"""Audit-log recording and the manager endpoint that reads it."""

from unittest.mock import MagicMock

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
