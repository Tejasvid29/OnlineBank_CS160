"""OpenAPI metadata for /docs and /openapi.json: the API description, tags, and the error responses routes declare.

Documentation only. Nothing here changes how a request is handled. docs/API.md is the written guide.
"""

from pydantic import BaseModel, ConfigDict

TITLE = "CS160 Bank API"
VERSION = "1.0.0"
DESCRIPTION = """
Backend for the CS160 Bank web and phone apps.

**Signing in.** `POST /auth/login` (or `/auth/register`) returns an `access_token` and a `refresh_token`. Send the
access token on every other request as `Authorization: Bearer <access_token>`; in this page, use **Authorize**. When it
expires (`expires_in` seconds), `POST /auth/refresh` returns a new pair.

**Roles.** Customers see and change only their own data. Routes marked *(admin)* need the `admin` role (the app calls
them managers) and return 403 to everyone else.

**Errors.** Errors return `{"detail": "<message to show the user>"}`. A request that fails validation (wrong type,
missing field, out of range) returns 422 with FastAPI's list form: `{"detail": [{"loc": [...], "msg": "...", ...}]}`.

**Money.** Request amounts are positive numbers with up to two decimal places. Responses return amounts as numbers;
withdrawals and money sent are negative.
"""

TAGS = [
    {"name": "auth", "description": "Register, sign in, sessions, password reset and your profile."},
    {"name": "accounts", "description": "Your checking and savings accounts."},
    {"name": "transactions", "description": "Account activity, transfers between your accounts, and sending money to another customer."},
    {"name": "bill-payments", "description": "Pay a bill now, or schedule daily, weekly or monthly payments."},
    {"name": "check-deposits", "description": "Mobile check deposits, and their review by a manager. A check is credited only when approved."},
    {"name": "atm", "description": "ATM cash withdrawals and deposits, and finding nearby ATMs."},
    {"name": "statements", "description": "Month-to-date and month-end statements."},
    {"name": "notifications", "description": "In-app notifications (the bell) for money movement and account changes."},
    {"name": "manager", "description": "Admin-only views of all customers and accounts, audit logs and reports."},
    {"name": "health", "description": "Checks that the API and its database are reachable."},
]

# Shown in /docs as the Authorize button. auth._bearer_token still reads the header itself, so this changes nothing.
BEARER_DESCRIPTION = "The `access_token` from `POST /auth/login`, `/auth/register` or `/auth/refresh`."


class ErrorResponse(BaseModel):
    """Every error the routes raise themselves."""

    detail: str

    model_config = ConfigDict(json_schema_extra={"examples": [{"detail": "Account not found."}]})


DEFAULT_DESCRIPTIONS = {
    400: "The request can't be carried out as sent.",
    401: "Missing, invalid or expired access token.",
    403: "Signed in, but your profile is missing or inactive.",
    404: "Not found, or not yours.",
    409: "Conflicts with the current state of the account or record.",
    413: "Upload too large.",
    415: "Unsupported file type.",
    429: "Too many attempts; see the Retry-After header.",
    500: "The server could not complete the request.",
    502: "An upstream service failed.",
    503: "A required service is unavailable or not configured.",
}


def errors(*items) -> dict:
    """responses= for a route. Each item is a status code, or (status code, description) to say what it means there."""
    out = {}
    for item in items:
        code, text = item if isinstance(item, tuple) else (item, DEFAULT_DESCRIPTIONS[item])
        out[code] = {"model": ErrorResponse, "description": text}
    return out


# Every signed-in route can return these (auth.get_current_user).
SIGNED_IN = (401, 403)
# Admin routes (auth.require_role("admin")).
ADMIN = (401, (403, "Not an admin, or your profile is inactive."))
