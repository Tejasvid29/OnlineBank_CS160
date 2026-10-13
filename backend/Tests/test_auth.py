import os
import sys
from pathlib import Path
from unittest.mock import MagicMock
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

os.environ.setdefault(
    "SUPABASE_URL", "https://test.supabase.co"
)
os.environ.setdefault(
    "SUPABASE_PUBLISHABLE_KEY", "test-key"
)
os.environ.setdefault(
    "SUPABASE_SECRET_KEY", "test-secret"
)

sys.path.insert(
    0, str(Path(__file__).resolve().parents[1])
)

import auth
from main import app
from db import get_supabase

def test_register_success(monkeypatch):
    fake_db = MagicMock()

    fake_db.auth.admin.create_user.return_value = SimpleNamespace(
        user=SimpleNamespace(id="test_user_id"),
    )

    profile =  {
        "id":  "test_user_id",
        "first_name": "Test",
        "last_name": "User",
        "email": "test@example.com",
        "phone_number": "1234567890",
        "role": "customer",
        "status": "active",
        "created_at": "2023-01-01T00:00:00Z",
        }

    fake_db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [profile]

    fake_auth_client=MagicMock()

    fake_auth_client.auth.sign_in_with_password.return_value = SimpleNamespace(
        user=SimpleNamespace(
            id="test_user_id",
        ),
        session = SimpleNamespace(
            access_token="test_access_token",
            refresh_token="test_refresh_token",
            expires_in=3600,
        )
    )

    monkeypatch.setattr(auth, "create_client", lambda *args, **kwargs:fake_auth_client)

    app.dependency_overrides[get_supabase] = lambda: fake_db

    try:
        with TestClient(app) as client:
            response = client.post(
                "/auth/register",
                json={
                    "first_name": "Test",
                    "last_name": "Customer",
                    "email": "test@example.com",
                    "password": "Password123!"
                }
            ) 
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 201

    result = response.json()

    assert result["profile"]["email"] == "test@example.com"
    assert result["profile"]["role"] == "customer"
    assert result["access_token"] == "test_access_token"

    fake_db.auth.admin.create_user.assert_called_once()
    
    inserted = fake_db.table.return_value.insert.call_args.args[0]

    assert inserted["role"] == "customer"
    assert inserted["status"] == "active"
    assert inserted["email"] == "test@example.com"



#test 2
def test_register_duplicate_email(monkeypatch):
    fake_db = MagicMock()

    class FakeAuthError(Exception):
        pass

    fake_db.auth.admin.create_user.side_effect = FakeAuthError(
        "There is a user already registered"
    )

    monkeypatch.setattr(auth, "AuthApiError", FakeAuthError)
    app.dependency_overrides[get_supabase] = lambda: fake_db

    try:
        with TestClient(app) as client:
            response = client.post(
                "/auth/register",
                json={
                    "first_name": "Test",
                    "last_name": "Customer",
                    "email": "existing@example.com",
                    "password": "Password123!"
                }
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 409
    assert response.json()["detail"] == (
        "An account with this email already exists."
    )

    fake_db.table.assert_not_called()

#test 3 invalid email

def test_register_invalid_email():
    fake_db = MagicMock()

    app.dependency_overrides[get_supabase] = lambda: fake_db

    try:
        with TestClient(app) as client:
            response = client.post(
                "/auth/register",
                json={
                    "first_name": "Test",
                    "last_name": "Customer",
                    "email": "invalidemail",
                    "password": "Password123!"
                }
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422
    fake_db.auth.admin.create_user.assert_not_called()

#test4 password
def test_register_short_password():
    fake_db = MagicMock()

    app.dependency_overrides[get_supabase] = lambda: fake_db

    try:
        with TestClient(app) as client:
            response = client.post(
                "/auth/register",
                json={
                    "first_name": "Test",
                    "last_name": "Customer",
                    "email": "test@example.com",
                    "password": "12345"
                }
            )
    finally:
        app.dependency_overrides.clear()


    assert response.status_code == 422


    errors = response.json()["detail"]
    assert any(
        error["loc"] == ["body", "password"]
        for error in errors
    )

    
    fake_db.auth.admin.create_user.assert_not_called()

#test5 field requirement
@pytest.mark.parametrize("missing_field", [
    "first_name",
    "last_name",
    "email",
    "password"
])
def test_register_missing_fields(missing_field):
    fake_db = MagicMock()

    payload = {
        "first_name": "Test",
        "last_name": "Customer",
        "email": "test@example.com",
        "password": "Password123!"
    }
    del payload[missing_field]

    app.dependency_overrides[get_supabase] = lambda: fake_db

    try:
        with TestClient(app) as client:
            response = client.post(
                "/auth/register",
                json=payload
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422

    errors = response.json()["detail"]

    assert any(
        error["loc"][-1] == missing_field
        for error in errors
    )

    fake_db.auth.admin.create_user.assert_not_called()

#test6 phone number validation
@pytest.mark.parametrize("invalid_phone", [
    "abc123",
    "123",
    "123@456789",
    "123456789012345678901"
])
def test_register_invalid_phone(invalid_phone):
    fake_db = MagicMock()

    payload = {
        "first_name": "Test",
        "last_name": "Customer",
        "email": "test@example.com",
        "password": "Password123!",
        "phone": invalid_phone
    }

    app.dependency_overrides[get_supabase] = lambda: fake_db

    try:
        with TestClient(app) as client:
            response = client.post(
                "/auth/register",
                json=payload
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422

    errors = response.json()["detail"]

    assert any(
        error["loc"][-1] == "phone"
        for error in errors
    )
    fake_db.auth.admin.create_user.assert_not_called()

#Test 7  (log 1) log in
def test_login_success(monkeypatch):
    fake_db = MagicMock()

    profile = {
        "id": "test_user_id",
        "first_name": "Test",
        "last_name": "User",
        "email": "test@example.com",
        "phone_number": "1234567890",
        "role": "customer",
        "status": "active",
        "created_at": "2026-10-12T12:00:00Z"
    }

    fake_db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [profile]

    fake_auth_client = MagicMock()

    fake_auth_client.auth.sign_in_with_password.return_value = SimpleNamespace(
        user=SimpleNamespace(id="test_user_id"),
        session=SimpleNamespace(
            access_token="test_access_token",
            refresh_token="test_refresh_token",
            expires_in=3600
        )
    )

    monkeypatch.setattr(
        auth,
        "create_client",
        lambda *args, **kwargs: fake_auth_client
    )

    app.dependency_overrides[get_supabase] = lambda: fake_db

    try:
        with TestClient(app) as client:
            response = client.post(
                "/auth/login",
                json={
                    "email": "test@example.com",
                    "password": "Password123!"
                }
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 200

    result = response.json()

    assert result["access_token"] == "test_access_token"
    assert result["refresh_token"] == "test_refresh_token"
    assert result["profile"]["email"] == "test@example.com"
    assert result["profile"]["role"] == "customer"

    fake_auth_client.auth.sign_in_with_password.assert_called_once_with({
        "email": "test@example.com",
        "password": "Password123!"
    })


#test8 incorrect password
def test_login_wrong_password(monkeypatch):
    fake_db = MagicMock()
    fake_auth_client = MagicMock()

    class FakeAuthError(Exception):
        pass

    fake_auth_client.auth.sign_in_with_password.side_effect = FakeAuthError(
        "Invalid login credentials"
    )
    monkeypatch.setattr(
        auth,
        "create_client",
        lambda *args, **kwargs: fake_auth_client
    )

    monkeypatch.setattr(auth, "AuthApiError", FakeAuthError)

    app.dependency_overrides[get_supabase] = lambda: fake_db

    try:
        with TestClient(app) as client:
            response = client.post(
                "/auth/login",
                json={
                    "email": "test@example.com",
                    "password": "WrongPassword123!"
                }
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401

    assert response.json()["detail"] == "Invalid email or password."

    fake_auth_client.auth.sign_in_with_password.assert_called_once_with({
        "email": "test@example.com",
        "password": "WrongPassword123!"
    })
    fake_db.table.assert_not_called()


#test9 invalid email
def test_login_unregistered_email(monkeypatch):
    fake_db = MagicMock()
    fake_auth_client = MagicMock()

    class FakeAuthError(Exception):
        pass

    fake_auth_client.auth.sign_in_with_password.side_effect = FakeAuthError(
        "Invalid login credentials"
    )

    monkeypatch.setattr(
        auth,
        "create_client",
        lambda *args, **kwargs: fake_auth_client
    )

    monkeypatch.setattr(auth, "AuthApiError", FakeAuthError)

    app.dependency_overrides[get_supabase] = lambda: fake_db

    try:
        with TestClient(app) as client:
            response = client.post(
                "/auth/login",
                json={
                    "email": "unknown@example.com",
                    "password": "Password123!"
                }
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 401

    assert response.json()["detail"] == "Invalid email or password."

    fake_auth_client.auth.sign_in_with_password.assert_called_once()

    fake_db.table.assert_not_called()


#test10 empty email/password
@pytest.mark.parametrize("email, password", [
    ("", "Password123!"),
    ("test@example.com", ""),
    ("", "")
])
def test_login_empty_credentials(monkeypatch, email, password):
    fake_db = MagicMock()
    fake_create_client = MagicMock()

    monkeypatch.setattr(
        auth, "create_client", fake_create_client
    )

    app.dependency_overrides[get_supabase] = lambda: fake_db

    try:
        with TestClient(app) as client:
            response = client.post(
                "/auth/login",
                json={
                    "email": email,
                    "password": password
                }
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422

    errors = response.json()["detail"]

    if not email:
        assert any(
            error["loc"][-1] == "email"
            for error in errors
        )

    if not password:
        assert any(
            error["loc"][-1] == "password"
            for error in errors
        )

    fake_create_client.assert_not_called()


#test11 invalid email format
@pytest.mark.parametrize("invalid_email", [
    "invalidemail",
    "test@",
    "@example.com",
    "test.example.com"
])
def test_login_invalid_email(monkeypatch, invalid_email):
    fake_db = MagicMock()
    fake_auth_client = MagicMock()

    monkeypatch.setattr(
        auth,
        "create_client",
        fake_auth_client
    )

    app.dependency_overrides[get_supabase] = lambda: fake_db

    try:
        with TestClient(app) as client:
            response = client.post(
                "/auth/login",
                json={
                    "email": invalid_email,
                    "password": "Password123!"
                }
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 422

    errors = response.json()["detail"]

    assert any(
        error["loc"][-1] == "email"
        for error in errors
    )
    fake_auth_client.assert_not_called()


#test12 logout
def test_logout_success():
    fake_db = MagicMock()

    app.dependency_overrides[get_supabase] = lambda: fake_db

    try:
        with TestClient(app) as client:
            response = client.post(
                "/auth/logout",
                headers={
                    "Authorization": "Bearer test_access_token"
                }
            )
    finally:
        app.dependency_overrides.clear()

    assert response.status_code == 204

    assert response.content == b""

    fake_db.auth.admin.sign_out.assert_called_once_with(
        "test_access_token"
    )


#test 13 Unauthorized access after logout
def test_access_after_logout():
    fake_db = MagicMock()
    token = "test_access_token"

    profile = {
        "id": "test_user_id",
        "first_name": "Test",
        "last_name": "User",
        "email": "test@example.com",
        "status": "active",
        "role": "customer",
        "phone_number": None
    }

    fake_db.table.return_value.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = [profile]
    revoked_tokens = set()

    def fake_get_user(access_token):
        if access_token in revoked_tokens:
            return SimpleNamespace(user=None)

        return SimpleNamespace(
            user=SimpleNamespace(id="test_user_id")
        )

    def fake_sign_out(access_token):
        revoked_tokens.add(access_token)

    fake_db.auth.get_user.side_effect = fake_get_user
    fake_db.auth.admin.sign_out.side_effect = fake_sign_out

    app.dependency_overrides[get_supabase] = lambda: fake_db

    try:
        with TestClient(app) as client:
            headers = {
                "Authorization": f"Bearer {token}"
            }
            before = client.get("/auth/me", headers=headers)
            logout = client.post("/auth/logout", headers=headers)
            after = client.get("/auth/me", headers=headers)

    finally:
        app.dependency_overrides.clear()

    assert before.status_code == 200
    assert logout.status_code == 204
    assert after.status_code == 401

    fake_db.auth.admin.sign_out.assert_called_once_with(token)

