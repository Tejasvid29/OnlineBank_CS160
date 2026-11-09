"""Login lockout: 3 failed attempts lock the account for 5 minutes and email the owner."""

from datetime import datetime, timedelta, timezone
from types import SimpleNamespace

import auth
from support import USER_ID, make_profile

LOGIN = {"email": "test@example.com", "password": "wrong-password"}


def _future(minutes: int = 5) -> str:
    return (datetime.now(timezone.utc) + timedelta(minutes=minutes)).isoformat()


def test_failed_login_records_attempt(client, supabase, auth_client, auth_error):
    auth_client.fail(auth_error())
    response = client.post("/auth/login", json=LOGIN)
    assert response.status_code == 401
    supabase.mock.rpc.assert_called_once_with(
        "record_failed_login", {"p_user_id": USER_ID, "p_max_attempts": 3, "p_lock_seconds": 300}
    )


def test_unknown_email_is_not_counted(client, supabase, auth_client, auth_error):
    supabase.set_profile(None)
    auth_client.fail(auth_error())
    assert client.post("/auth/login", json=LOGIN).status_code == 401
    supabase.mock.rpc.assert_not_called()


def test_third_failure_locks_and_emails(client, supabase, auth_client, auth_error, monkeypatch):
    sent = []
    monkeypatch.setattr(auth, "send_email", lambda to, subject, text: sent.append((to, subject, text)))
    supabase.mock.rpc.return_value.execute.return_value.data = _future()
    supabase.mock.auth.admin.generate_link.return_value = SimpleNamespace(
        properties=SimpleNamespace(action_link="https://example.supabase.co/auth/v1/verify?token=abc")
    )
    auth_client.fail(auth_error())
    response = client.post("/auth/login", json=LOGIN)
    assert response.status_code == 429
    assert "locked" in response.json()["detail"]
    assert "Retry-After" in response.headers
    assert [(to, subject) for to, subject, _ in sent] == [("test@example.com", "Your OnlineBank account has been locked")]
    assert "https://example.supabase.co/auth/v1/verify?token=abc" in sent[0][2]
    link_request = supabase.mock.auth.admin.generate_link.call_args.args[0]
    assert link_request["type"] == "recovery" and link_request["email"] == "test@example.com"
    audit_entry = supabase.mock.table.return_value.insert.call_args.args[0]
    assert audit_entry["action"] == "account_locked"


def test_locked_account_rejects_even_correct_password(client, supabase, auth_client):
    supabase.use_profile(locked_until=_future(), failed_login_attempts=0)
    response = client.post("/auth/login", json={"email": "test@example.com", "password": "right-password"})
    assert response.status_code == 429
    auth_client.mock.auth.sign_in_with_password.assert_not_called()


def test_expired_lock_allows_login(client, supabase):
    supabase.use_profile(locked_until=_future(-1))
    response = client.post("/auth/login", json={"email": "test@example.com", "password": "right-password"})
    assert response.status_code == 200


def test_success_resets_failed_attempts(client, supabase):
    supabase.use_profile(failed_login_attempts=2)
    assert client.post("/auth/login", json={"email": "test@example.com", "password": "right-password"}).status_code == 200
    supabase.mock.table.return_value.update.assert_called_with({"failed_login_attempts": 0, "locked_until": None})


def test_lock_email_still_sent_if_link_fails(client, supabase, auth_client, auth_error, monkeypatch):
    sent = []
    monkeypatch.setattr(auth, "send_email", lambda to, subject, text: sent.append(text))
    supabase.mock.rpc.return_value.execute.return_value.data = _future()
    supabase.mock.auth.admin.generate_link.side_effect = auth_error()
    auth_client.fail(auth_error())
    assert client.post("/auth/login", json=LOGIN).status_code == 429
    assert len(sent) == 1 and "Forgot password" in sent[0]


def test_password_reset_lifts_lockout(client, supabase):
    response = client.post("/auth/reset-password", json={"access_token": "recovery", "password": "newpassword1"})
    assert response.status_code == 204
    supabase.mock.table.return_value.update.assert_called_with({"failed_login_attempts": 0, "locked_until": None})
