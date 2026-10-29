from collections.abc import Iterator
from typing import Callable

import pytest
from fastapi.testclient import TestClient

# Importing ``support`` first puts the backend package root on ``sys.path``.
from support import AuthClientStub, SupabaseStub

import auth
from db import get_supabase
from main import app
from supabase_auth.errors import AuthApiError


@pytest.fixture
def supabase() -> SupabaseStub:
    """Stand-in for the admin Supabase client, with one active profile row."""
    return SupabaseStub()


@pytest.fixture
def auth_client(monkeypatch) -> AuthClientStub:
    """Stand-in for the throwaway client used to sign users in."""
    stub = AuthClientStub()

    def create_client(url: str, key: str, **kwargs):
        stub.created_with.append((url, key))
        return stub.mock

    monkeypatch.setattr(auth, "create_client", create_client)
    return stub


@pytest.fixture
def client(supabase: SupabaseStub, auth_client: AuthClientStub) -> Iterator[TestClient]:
    """A TestClient whose ``get_supabase`` dependency is the stub."""
    app.dependency_overrides[get_supabase] = lambda: supabase.mock
    try:
        with TestClient(app) as test_client:
            yield test_client
    finally:
        app.dependency_overrides.clear()


@pytest.fixture
def auth_error() -> Callable[..., AuthApiError]:
    """Build the error Supabase Auth raises when a call is rejected."""

    def factory(
        message: str = "Invalid login credentials",
        status: int = 400,
        code: str | None = "invalid_credentials",
    ) -> AuthApiError:
        return AuthApiError(message, status, code)

    return factory
