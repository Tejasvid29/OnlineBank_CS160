"""The OpenAPI document (/docs, /openapi.json): every route is described, and documenting the Bearer scheme did not
change how the Authorization header is read."""

from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
from pydantic import BaseModel

import accounts
import atm
import auth
import bill_payments
import card
import deposits
import purchases
import statements
import transactions
from api_docs import TAGS
from db import get_supabase
from main import app

PUBLIC = {
    ("post", "/auth/register"), ("post", "/auth/login"), ("post", "/auth/refresh"), ("post", "/auth/forgot-password"),
    ("post", "/auth/reset-password"), ("get", "/health"), ("get", "/health/db"),
    ("post", "/purchases"),  # charged by account number, like a card number
    ("post", "/card/withdrawals"), ("post", "/card/deposits"),
}


@pytest.fixture(scope="module")
def spec():
    return app.openapi()


def _operations(spec):
    for path, operations in spec["paths"].items():
        for method, operation in operations.items():
            yield method, path, operation


def test_api_metadata(spec):
    assert spec["info"]["title"] == "CS160 Bank API"
    assert spec["info"]["version"] == "1.0.0"
    assert "Authorization: Bearer" in spec["info"]["description"]


def test_every_route_has_a_summary_and_a_known_tag(spec):
    known = {tag["name"] for tag in TAGS}
    for method, path, operation in _operations(spec):
        assert operation.get("summary"), f"{method} {path} has no summary"
        assert len(operation.get("tags", [])) == 1 and operation["tags"][0] in known, f"{method} {path} tags {operation.get('tags')}"


def test_bearer_scheme_and_which_routes_need_it(spec):
    assert spec["components"]["securitySchemes"]["BearerAuth"] == {
        "type": "http", "scheme": "bearer", "bearerFormat": "JWT", "description": auth.BEARER_DESCRIPTION,
    }
    for method, path, operation in _operations(spec):
        secured = operation.get("security") == [{"BearerAuth": []}]
        assert secured == ((method, path) not in PUBLIC), f"{method} {path} security {operation.get('security')}"
        if secured:
            assert "401" in operation["responses"], f"{method} {path} does not document 401"


def test_admin_routes_document_403(spec):
    for method, path, operation in _operations(spec):
        if "(admin)" in operation["summary"]:
            assert operation["responses"]["403"]["content"]["application/json"]["schema"] == {"$ref": "#/components/schemas/ErrorResponse"}


@pytest.mark.parametrize("model", [
    auth.RegisterRequest, auth.UpdateProfileRequest, auth.LoginRequest, auth.RefreshRequest, auth.ForgotPasswordRequest,
    auth.ResetPasswordRequest, accounts.OpenAccountRequest, transactions.AccountTransactionRequest,
    transactions.TransferRequest, transactions.SendMoneyRequest, bill_payments.SchedulePaymentRequest,
    atm.AtmWithdrawalRequest, atm.AtmDepositRequest, deposits.RejectRequest, statements.GenerateStatementRequest, purchases.PurchaseRequest, card.CardRequest,
])
def test_request_examples_are_valid(model: type[BaseModel]):
    examples = model.model_json_schema()["examples"]
    assert examples
    for example in examples:
        model.model_validate(example)


def test_docs_pages_are_served():
    with TestClient(app) as client:
        assert client.get("/docs").status_code == 200
        assert client.get("/openapi.json").status_code == 200


# The Authorization header is read exactly as before the Bearer scheme was documented.

@pytest.fixture
def seen_tokens():
    tokens = []

    def get_user(token):
        tokens.append(token)
        return SimpleNamespace(user=None)

    app.dependency_overrides[get_supabase] = lambda: SimpleNamespace(auth=SimpleNamespace(get_user=get_user))
    yield tokens
    app.dependency_overrides.clear()


@pytest.mark.parametrize("header", [None, "", "Bearer", "Bearer ", "Basic abc", "Token abc"])
def test_missing_or_malformed_header_is_401_not_authenticated(seen_tokens, header):
    with TestClient(app) as client:
        response = client.get("/accounts", headers={"Authorization": header} if header is not None else {})
    assert response.status_code == 401
    assert response.json() == {"detail": "Not authenticated."}
    assert seen_tokens == []


@pytest.mark.parametrize("header, token", [("Bearer abc", "abc"), ("bearer abc", "abc"), ("BEARER abc.def", "abc.def"), ("Bearer abc ", "abc ")])
def test_bearer_token_is_passed_on_unchanged(seen_tokens, header, token):
    with TestClient(app) as client:
        response = client.get("/accounts", headers={"Authorization": header})
    assert response.status_code == 401
    assert response.json() == {"detail": "Your session has expired. Please sign in again."}
    assert seen_tokens == [token]
