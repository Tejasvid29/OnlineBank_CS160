import os
import sys
from pathlib import Path

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

from main import app
from auth import get_current_user
from db import get_supabase
@pytest.fixture

def client():
    app.dependency_overrides[get_supabase] = lambda: object()
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()

def test_health(client):
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}

def test_auth_require(client):
    response = client.get("/auth/me")
    assert response.status_code == 401

def test_invalid_deposit(client):
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "test_user_id", "role": "user"}

    response = client.post(
        "/accounts/test_account/deposits",
        json = {"amount":0}
    )
    assert response.status_code == 422


def test_external_transaction(client):
    app.dependency_overrides[get_current_user] = lambda: {
        "id": "test_user_id",
        "role": "customer"
    }
    response = client.post(
        "/transfers",
        json={
            "source_account_id": "test_account",
            "destination_account_id": "external_account",
            "amount": 100,
            "transfer_type": "external"
        }
    )
    assert response.status_code == 400
