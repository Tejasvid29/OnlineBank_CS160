"""Shared test doubles and constants for the backend test-suite.

The Supabase project is replaced by in-memory test doubles so the auth routes
can be exercised without a live backend. Two doubles are needed:

* ``SupabaseStub`` stands in for ``db.get_supabase`` (the secret/admin client
  that reads and writes ``public.users``).
* ``AuthClientStub`` stands in for the throwaway client that
  ``auth.create_client`` builds for ``sign_in_with_password``.

``conftest.py`` turns these into pytest fixtures.
"""

import os
import sys
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import MagicMock

os.environ.setdefault("SUPABASE_URL", "https://test.supabase.co")
os.environ.setdefault("SUPABASE_PUBLISHABLE_KEY", "test-publishable-key")
os.environ.setdefault("SUPABASE_SECRET_KEY", "test-secret-key")

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.insert(0, str(BACKEND_DIR))

USER_ID = "11111111-1111-1111-1111-111111111111"
ACCESS_TOKEN = "test-access-token"
REFRESH_TOKEN = "test-refresh-token"
EXPIRES_IN = 3600

# Field limits declared by the request models in ``auth.py``.
PASSWORD_MIN_LENGTH = 8
PASSWORD_MAX_LENGTH = 72
NAME_MAX_LENGTH = 60

# Response details the routes return.
INVALID_LOGIN = "Invalid email or password."
NOT_AUTHENTICATED = "Not authenticated."
EXPIRED_SESSION = "Your session has expired. Please sign in again."
INACTIVE_ACCOUNT = "This account is inactive."
MISSING_PROFILE = "No profile exists for this account."
DUPLICATE_EMAIL = "An account with this email already exists."
GENERIC_REGISTER_FAILURE = "Could not create the account."


def make_profile(**overrides) -> dict:
    """A ``public.users`` row as Supabase would return it."""
    profile = {
        "id": USER_ID,
        "first_name": "Test",
        "last_name": "Customer",
        "email": "test@example.com",
        "phone_number": "5551234567",
        "role": "customer",
        "status": "active",
        "created_at": "2026-01-01T00:00:00+00:00",
    }
    profile.update(overrides)
    return profile


class SupabaseStub:
    """Test double for the admin Supabase client from ``db.get_supabase``."""

    def __init__(self):
        self.profile = make_profile()
        self.mock = MagicMock()
        self.mock.auth.admin.create_user.return_value = SimpleNamespace(
            user=SimpleNamespace(id=USER_ID)
        )
        self.mock.auth.get_user.return_value = SimpleNamespace(
            user=SimpleNamespace(id=USER_ID)
        )
        self._sync_profile_rows()

    def _sync_profile_rows(self) -> None:
        rows = [] if self.profile is None else [self.profile]
        query = self.mock.table.return_value
        query.select.return_value.eq.return_value.limit.return_value.execute.return_value.data = rows

    def set_profile(self, profile: dict | None) -> "SupabaseStub":
        """Set the row ``_load_profile`` finds. ``None`` means "no row"."""
        self.profile = profile
        self._sync_profile_rows()
        return self

    def use_profile(self, **overrides) -> "SupabaseStub":
        """Return a profile like the default one, with ``overrides`` applied."""
        return self.set_profile(make_profile(**overrides))

    def fail_user_creation(self, error: Exception) -> "SupabaseStub":
        """Make ``auth.admin.create_user`` raise ``error``."""
        self.mock.auth.admin.create_user.side_effect = error
        return self

    def fail_profile_insert(self, error: Exception) -> "SupabaseStub":
        """Make the ``public.users`` insert raise ``error``."""
        insert = self.mock.table.return_value.insert
        insert.return_value.execute.side_effect = error
        return self

    def set_token_user(self, user: SimpleNamespace | None) -> "SupabaseStub":
        """Set what ``auth.get_user`` returns for a bearer-token lookup."""
        self.mock.auth.get_user.return_value = user
        return self

    def fail_token_lookup(self, error: Exception) -> "SupabaseStub":
        """Make ``auth.get_user`` raise ``error``."""
        self.mock.auth.get_user.side_effect = error
        return self

    @property
    def inserted_user(self) -> dict:
        """The row the register route wrote, if it wrote one."""
        call = self.mock.table.return_value.insert.call_args
        assert call is not None, "no profile row was inserted"
        return call.args[0]


class AuthClientStub:
    """Test double for the throwaway client built by ``auth.create_client``."""

    def __init__(self):
        self.mock = MagicMock()
        self.created_with: list[tuple[str, str]] = []
        self.set_session()

    def set_session(
        self,
        user_id: str = USER_ID,
        access_token: str = ACCESS_TOKEN,
        refresh_token: str = REFRESH_TOKEN,
        expires_in: int = EXPIRES_IN,
    ) -> "AuthClientStub":
        """Make sign-in and refresh succeed and return a fresh session."""
        session = SimpleNamespace(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=expires_in,
        )
        result = SimpleNamespace(user=SimpleNamespace(id=user_id), session=session)
        self.mock.auth.sign_in_with_password.return_value = result
        self.mock.auth.refresh_session.return_value = result
        return self

    def set_no_session(self) -> "AuthClientStub":
        """A call that succeeds but carries no session (unconfirmed email)."""
        result = SimpleNamespace(user=SimpleNamespace(id=USER_ID), session=None)
        self.mock.auth.sign_in_with_password.return_value = result
        self.mock.auth.refresh_session.return_value = result
        return self

    def set_no_user(self) -> "AuthClientStub":
        """A call that succeeds but returns no user."""
        result = SimpleNamespace(user=None, session=None)
        self.mock.auth.sign_in_with_password.return_value = result
        self.mock.auth.refresh_session.return_value = result
        return self

    def fail(self, error: Exception) -> "AuthClientStub":
        """Make sign-in and refresh raise ``error``."""
        self.mock.auth.sign_in_with_password.side_effect = error
        self.mock.auth.refresh_session.side_effect = error
        return self
