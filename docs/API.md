# CS160 Bank API

The FastAPI backend in `backend/` serves both the web app and the phone app. This guide covers how to call it. Each
route's request and response fields are in the interactive docs.

- **Interactive docs (Swagger UI):** <http://127.0.0.1:8000/docs>. Use **Authorize** to paste an access token, then
  **Try it out** on any route.
- **ReDoc:** <http://127.0.0.1:8000/redoc>
- **OpenAPI document:** <http://127.0.0.1:8000/openapi.json>, for Postman, Insomnia or generating a client.

To start the server, follow the backend section of the ReadMe:

```bash
cd backend && .venv/bin/uvicorn main:app --reload
```

## Signing in

1. `POST /auth/login` with `{"email", "password"}`, or `POST /auth/register`. Both return:

   ```json
   {"access_token": "eyJ…", "refresh_token": "v1.Mb…", "expires_in": 3600,
    "profile": {"id": "…", "first_name": "Ada", "last_name": "Lopez", "email": "ada@example.com", "phone": null,
                "zip_code": "94105", "role": "customer", "status": "active", "created_at": "…"}}
   ```

2. Send the access token on every other request: `Authorization: Bearer <access_token>`.
3. When it expires (after `expires_in` seconds), a request returns 401. Call `POST /auth/refresh` with
   `{"refresh_token"}` to get a new pair, as the apps do.
4. `POST /auth/logout` (with the bearer header) revokes the session.

**Account lockout:** after 3 failed sign-ins the account is locked for 5 minutes. Login then returns 429 with a
`Retry-After` header, and the owner gets an email. Resetting the password lifts the lock.

## Roles

| Role | Can use |
|---|---|
| `customer` | Their own profile, accounts, transactions, payments, check deposits, statements and notifications. Another customer's records always return 404, never 403, so their existence isn't revealed. |
| `admin` (shown as "manager" in the apps) | Everything a customer can, plus the routes marked *(admin)* below. Admins can't review their own check deposits. |

Registration always creates a `customer`. Roles are changed in the database, never through the API.

## Conventions

- **Amounts:** requests take positive numbers with at most two decimal places (`25`, `25.5`, `25.50`). Responses return
  numbers; money leaving an account is negative.
- **Labels:** transaction `transaction_type` and `status`, and bill payment `frequency` and `status`, are returned
  capitalized (`"Deposit"`, `"Completed"`), as the apps display them. Requests use lowercase.
- **Dates:** request dates are `YYYY-MM-DD`; timestamps are ISO 8601 in UTC.
- **IDs:** UUIDs. Account numbers are 12 digits and are what customers share to receive money.
- **Response envelopes:** responses wrap their data in a named key, for example `{"accounts": [...]}`,
  `{"account": {...}}` or `{"transaction": {...}}`.

## Errors

Errors the routes raise themselves return a message to show the user:

```json
{"detail": "Insufficient funds."}
```

A request that fails validation (wrong type, missing field, out of range) returns **422** in FastAPI's standard form:

```json
{"detail": [{"loc": ["body", "amount"], "msg": "Input should be greater than 0", "type": "greater_than"}]}
```

Some checks are made in code after validation and also return 422 in the first, single-message form. Examples: a check
amount, a check photo that's too small or unreadable, or ATM search without a place.

| Status | Meaning |
|---|---|
| 400 | Can't be done as sent, e.g. a transfer to the same account, or sending money to your own account. |
| 401 | Missing, malformed or expired access token (`"Not authenticated."` / `"Your session has expired…"`). |
| 403 | Signed in but not allowed: an admin route, an inactive profile, or reviewing your own check. |
| 404 | Not found, or not yours. |
| 409 | Conflicts with the current state: insufficient funds, closed account, already reviewed, daily ATM limit. |
| 413 / 415 | Check photo too large, or not JPEG/PNG. |
| 429 | Sign-in locked; see `Retry-After`. |
| 502 / 503 | The map service failed, or a service (ATM search, check storage) isn't configured or is unavailable. |

Each route in `/docs` lists the errors it can return and what they mean there.

## Routes

The lock icon in `/docs` marks the routes that need a bearer token: all routes except the public ones below.

### auth

| Method | Path | Summary |
|---|---|---|
| POST | `/auth/register` | Register as a customer and sign in (public) |
| POST | `/auth/login` | Sign in (public) |
| POST | `/auth/refresh` | Renew a session (public) |
| POST | `/auth/forgot-password` | Email a password-reset link (public; always 204) |
| POST | `/auth/reset-password` | Set a new password from a reset link (public) |
| GET | `/auth/me` | Get your profile |
| PATCH | `/auth/me` | Update your name, phone number or mailing address (send only the fields to change). The address (`address_line1`, `address_line2`, `city`, `state`, `zip_code`) must end up complete or empty; a ZIP code alone is allowed |
| POST | `/auth/logout` | Sign out |

### accounts

| Method | Path | Summary |
|---|---|---|
| GET | `/accounts` | List your accounts |
| POST | `/accounts` | Open a checking or savings account (`{"account_type": "savings"}`; starts at $0) |
| GET | `/accounts/{account_id}` | Get one of your accounts |
| POST | `/accounts/{account_id}/close` | Close one of your accounts (needs a $0 balance, nothing pending and no scheduled bill payments) |

### transactions

| Method | Path | Summary |
|---|---|---|
| GET | `/accounts/{account_id}/transactions` | List an account's transactions. Filters: `transaction_type`, `start`, `end`, `limit`, `offset` |
| POST | `/transfers` | Transfer between your own accounts; both balances change together |
| POST | `/transfers/send` | Send money to another customer by their 12-digit account number |
| POST | `/accounts/{account_id}/deposits` | Post a deposit to your own account *(admin)* |
| POST | `/accounts/{account_id}/withdrawals` | Post a withdrawal from your own account *(admin)* |

The last two post a completed transaction of any amount, so only admins may call them. The apps never call them.
Customers add money through ATM deposits and reviewed check deposits.

### bill-payments

| Method | Path | Summary |
|---|---|---|
| GET | `/bill-payments` | List scheduled and failed payments |
| POST | `/bill-payments` | Pay a bill now (`frequency: "once"`) or schedule `daily`, `weekly` or `monthly` payments from `next_payment_date` |
| DELETE | `/bill-payments/{payment_id}` | Cancel a scheduled payment (kept with status `canceled`) |
| POST | `/bill-payments/run-due` | Run due scheduled payments now *(admin)* |

A database job (`pg_cron`, every 5 minutes) pays scheduled payments that are due. A payment that can't be paid is marked
`Failed`, and the customer gets a notification.

### check-deposits

| Method | Path | Summary |
|---|---|---|
| GET | `/deposits` | List your check deposits |
| POST | `/deposits` | Submit a check deposit for review: `multipart/form-data` with `account_id`, `amount`, `front_image` and `back_image` |
| GET | `/manager/check-deposits` | List check deposits for review *(admin)*. `status=pending` (default; oldest first), `approved`, `rejected` or `all` |
| GET | `/manager/check-deposits/{deposit_id}` | Get a check deposit with signed image links *(admin)*. Links expire after `image_url_expires_in` seconds |
| POST | `/manager/check-deposits/{deposit_id}/approve` | Approve a check deposit and credit it *(admin)* |
| POST | `/manager/check-deposits/{deposit_id}/reject` | Reject a check deposit *(admin)*, with `{"notes": "reason shown to the customer"}` |

Submitting never changes a balance; only approval credits the check. Submitting the same two photos again while the
deposit is pending returns **200** with that deposit and `"already_submitted": true`. With a different account or amount,
it returns 409.

### atm

| Method | Path | Summary |
|---|---|---|
| POST | `/atm/withdrawals` | Withdraw cash at an ATM: checking only, up to $5,000 at once and per account in any 24 hours |
| POST | `/atm/deposits` | Deposit cash at an ATM: checking only, whole dollars, up to $5,000 |
| GET | `/atm/search` | Find ATMs near `location` (a city, ZIP or address) or `lat` and `lng`; up to 10, nearest first |

ATM search needs `GEOAPIFY_API_KEY` on the server; without it, it returns 503.

### debit-card

| Method | Path | Summary |
|---|---|---|
| POST | `/card/withdrawals` | Withdraw by checking account number, no sign-in: `{"account_number", "amount", "location"?, "reference"?}` |
| POST | `/card/deposits` | Deposit by checking account number, same body |

The 12-digit account number acts like a debit card number. A withdrawal can't exceed the balance (409
"Insufficient funds."), so the account never goes negative. Card withdrawals are also limited to $1,000 per account in
any rolling 24 hours (409); deposits have no limit. Errors: 404 if no open checking account has that number (also
for savings and closed accounts), 422 for a bad number or amount. Rows are described `Card withdrawal: <location>` /
`Card deposit: <location>`. Requires `backend/sql/card_transactions.sql`. Demo only: anyone with the number can use it.

### purchases

| Method | Path | Summary |
|---|---|---|
| POST | `/purchases` | Purchase by checking account number, no sign-in: `{"account_number", "merchant", "amount", "reference"?}`, up to $2,500 each |

The 12-digit account number acts like a debit card number. The result is a completed withdrawal described
`Purchase: <merchant> - <reference>`. Errors: 404 if no open checking account has that number (also for savings and
closed accounts), 409 for insufficient funds, 422 for a bad number or amount. Requires `backend/sql/purchases.sql`.
Demo only: anyone with the number can charge the account, and there are no merchant keys, expiry/CVV, idempotency or
rate limits.

### statements

| Method | Path | Summary |
|---|---|---|
| GET | `/statements` | List your statements (optional `account_id`) |
| GET | `/statements/{statement_id}` | Get a statement with its transactions |
| POST | `/statements` | Generate a month-to-date statement (`{"account_id"}`) |

A database job writes a month-end statement for every open account on the last day of each month. The backend then
emails it.

### notifications

| Method | Path | Summary |
|---|---|---|
| GET | `/notifications` | List your notifications, newest first (`limit`, default 50) |
| PATCH | `/notifications/{notification_id}/read` | Mark a notification read |
| POST | `/notifications/read-all` | Mark all your notifications read |

Notifications are created automatically by these actions:
- ATM, teller, transfer and send-money transactions (the recipient is notified too);
- bill payments;
- check deposits (received, approved, rejected);
- opening and closing accounts;
- month-end statements.

### manager *(all admin)*

| Method | Path | Summary |
|---|---|---|
| GET | `/manager/customers` | List all customers |
| GET | `/manager/accounts` | List all accounts with their owners |
| GET | `/manager/customers/{customer_id}/audit-log` | Get a customer's audit log |
| GET | `/manager/reports/summary` | Balance summary report. Filters: `zip_code`, `account_type`, `account_status`, `min_balance`, `max_balance`, `created_from`, `created_to`; grouped by `group_by` |

### health

| Method | Path | Summary |
|---|---|---|
| GET | `/health` | Check the API is running |
| GET | `/health/db` | Check the database connection |

## Keeping the docs current

- The OpenAPI metadata (description, tags, error model) is in `backend/api_docs.py`.
- **Each route** declares `summary=` and `responses=errors(...)` in its decorator. Its docstring, if any, becomes its
  description.
- **Request models** carry an example in `model_config`.
- `backend/Tests/test_api_docs.py` fails if a route has no summary or tag, if an example no longer validates, or if a
  route needing a token is missing the lock.
- Update this file when routes are added or change.
