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
