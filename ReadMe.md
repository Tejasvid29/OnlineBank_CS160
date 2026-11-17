# CS160 Bank

CS160 Bank is a class online banking project: a **React Native / Expo** client for web, iOS, and Android in the repository root and a **FastAPI + Supabase** backend in `backend/`. The client presents accounts and balances, transfers, bill payments, transaction history, mobile check deposits, ATM search, notifications, profile settings, and a staff dashboard.

The interface takes its blue-and-white palette and navigation from Chase's web design. It uses its own **CS160 Bank** name and icon; it is not a Chase product.

## Prerequisites

- Node.js 20+ and npm
- Python 3.11+
- A Supabase project (for API mode). Demo mode needs no backend.
- An iOS simulator, Android emulator, or phone with Expo Go for the native app.

## 1. Run the web app (demo mode)

```bash
npm install
npm run web
```

Open the URL Expo prints. With no API configured, select **Open demo dashboard**. Demo data lives in browser memory, resets on reload, and never moves real money.

## 2. Set up the backend

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate          # macOS/Linux: source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env            # then fill in the values below
uvicorn main:app --reload
```

`backend/.env` (git-ignored):

| Variable | Where to find it |
| --- | --- |
| `SUPABASE_URL` | Supabase dashboard → Project Settings → API |
| `SUPABASE_PUBLISHABLE_KEY` | Same page, publishable key (`sb_publishable_...`) |
| `SUPABASE_SECRET_KEY` | Same page, secret key (`sb_secret_...`). Server only; it bypasses row-level security. |
| `SUPABASE_JWKS_URL` | `<SUPABASE_URL>/auth/v1/.well-known/jwks.json` |
| `CORS_ORIGINS` | Comma-separated frontend origins (defaults to the Expo dev ports) |

Check it works: open <http://127.0.0.1:8000/health/db>. It should return `{"status":"ok","supabase":"connected"}`. Interactive API docs are at <http://127.0.0.1:8000/docs>.

### Database

The backend expects a `public.users` table whose `id` is the user's Supabase Auth id. Passwords are **not** stored in it; Supabase Auth keeps the hashed password in `auth.users`. Run this once in the Supabase SQL editor:

```sql
create type public.account_role as enum ('customer', 'admin');
create type public.account_status as enum ('active', 'inactive');

create table public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone_number text,
  zip_code text check (zip_code ~ '^[0-9]{5}$'),
  role public.account_role not null default 'customer',
  status public.account_status not null default 'active',
  created_at timestamptz not null default now()
);

alter table public.users enable row level security;

create policy "Users can view own row"
  on public.users for select to authenticated
  using ((select auth.uid()) = id);
```

To make someone an admin, set their `role` to `admin` in the Supabase table editor. Registration always creates `customer` accounts.

## 3. Connect the frontend to the backend

```bash
cp .env.example .env     # root .env: EXPO_PUBLIC_API_URL=http://localhost:8000
npm run web              # restart Expo after changing .env
```

`EXPO_PUBLIC_API_URL` is embedded in the browser bundle, so it must hold only the API origin, never a secret. With it set, the app runs in **API mode**: use **Create an account** on the login screen to register, then sign in.

## 4. Run the mobile app and check deposit flow

```bash
npm start
```

Open the project in an iOS simulator, Android emulator, or Expo Go. The **Deposit** tab walks through account and amount selection, front and back photos, review, and submission. Without an API URL, the flow creates only a pending demo record and does not change the balance. For API mode on a physical phone, set `EXPO_PUBLIC_API_URL` to a backend address reachable from that phone; `localhost` on the phone is the phone itself.

Before API-mode check deposits, the Supabase project needs `public.users` and `public.accounts` (the repository does not include an accounts-table migration). Run `backend/sql/transactions.sql` after those tables exist, then run `backend/sql/check_deposits.sql` in the Supabase SQL editor. This creates a **private** `check-deposits` Storage bucket, the check-deposit table, and an atomic database function for a pending ledger entry. The backend needs `python-multipart` and `Pillow`, both included in `backend/requirements.txt`. If the bucket name is changed, set `CHECK_DEPOSIT_BUCKET` in `backend/.env` to match it.

`POST /deposits` accepts multipart `account_id`, `amount`, `front_image`, and `back_image`. It validates account ownership and the photos, strips image metadata, stores them privately, and records a pending check deposit and pending transaction. `GET /deposits` returns the customer's recent deposits without image paths. Repeating the same photos for the same pending deposit returns its existing record. **Submission never increases the balance.** OCR, check verification, reviewer approval, and fund availability still need to be built before any deposit can be credited.

## PLEASE READ (THIS IS FOR ANDROID SIMULATOR WITH ANDROID SIMULATOR)

When you initiate the mobile emulator on android studio, you will get an error when trying the app tries to interact with the backend because android simulator doesn't look at the same localhost url as a pc does. So for it to work, after you initiate the android simulator and its running, please enter in this command in the powershell 

```bash
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" reverse tcp:8000 tcp:8000
```

## Authentication and authorization

- Supabase Auth issues a JWT access token and a refresh token. The frontend sends `Authorization: Bearer <access token>`; the backend validates it with Supabase on every request, so logout takes effect immediately.
- On web, the refresh token is kept in `localStorage` so a reload restores the session. On native it is kept in Expo SecureStore.
- `get_current_user` (authentication) and `require_role("admin")` (authorization) are in `backend/auth.py`.

| Route | Access |
| --- | --- |
| `POST /auth/register`, `/auth/login`, `/auth/refresh`, `/auth/forgot-password` | Public |
| `GET /auth/me`, `POST /auth/logout` | Signed-in user |
| `GET /manager/customers` | Admin only |

## Project files

| Path | Purpose |
| --- | --- |
| `app/` | Expo Router pages (one file per screen) |
| `src/components/` | `LoginScreen` (sign in, register, reset), `AppShell`, shared cards |
| `src/state/AppState.jsx` | App-wide state, auth flow, and screen actions |
| `src/services/api.js` | FastAPI client, bearer token, and session storage |
| `src/data/demo.js` | Clearly labeled sample data |
| `src/theme.js`, `src/styles/` | Colors, formatting, and styles |
| `backend/main.py` | FastAPI app, CORS, health checks, admin routes |
| `backend/auth.py` | Auth routes and the auth/role dependencies |
| `backend/deposits.py`, `backend/sql/check_deposits.sql` | Private mobile check intake and pending-record schema |
| `backend/config.py`, `backend/db.py` | Settings from `.env` and the Supabase client |
| `PROJECT_HANDOFF.md` | Architecture, design choices, status, and next steps |

## Verify

```bash
npm run check
npm run build:web
backend/.venv/bin/pytest -q backend/Tests
```


## End-to-End (E2E) Testing with Playwright

The project includes 37 end-to-end tests using Playwright. These tests verify authentication, account management, deposits, transfers, bill payments, transaction history, ATM searches, profile settings, and manager authorization.

The following setup instructions use **Windows PowerShell**. Run all commands from the repository root unless stated otherwise.

### 1. Install dependencies

Clone the repository if you have not already done so:

```powershell
git clone https://github.com/Tejasvid29/OnlineBank_CS160.git
cd OnlineBank_CS160
```

Install the frontend dependencies and Playwright's Chromium browser:

```powershell
npm install
npx.cmd playwright install chromium
```

Make sure you have Node.js 20+ and Python 3.11+ installed.

### 2. Configure the backend and database

The E2E tests use the live FastAPI backend connected to Supabase, not the frontend's demo mode.

Follow the backend and Supabase instructions earlier in this README. Use a **separate test Supabase project**, with the required tables, database functions, and SQL migrations installed.

In PowerShell:

```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
Copy-Item .env.example .env
```

Fill in `backend/.env` with the required Supabase configuration values described earlier in this README. Never commit this file or any API keys to GitHub.

The ATM search tests also require a Geoapify API key.

### 3. Prepare the E2E test users

Create two customer accounts through the application's registration screen:

- **Primary test user:** Used for authentication, deposits, accounts, transfers, bill payments, profile settings, and other tests.
- **Recipient test user:** Used to verify transfers and attempts to access another customer's accounts.

Both accounts must have an active checking account. The primary account should contain sufficient simulated funds for transfers and bill payments.

Use dedicated test users because the tests can create or close accounts, change balances, submit payments, and create transaction records.

Also choose a valid-format account number that does not exist in the test database for the nonexistent-recipient transfer test.

### 4. Start the backend (Terminal 1)

Open a PowerShell terminal and run:

```powershell
cd OnlineBank_CS160\backend
```

If you are already in the repository root, use `cd backend` instead.

Set the Geoapify API key:

```powershell
$env:GEOAPIFY_API_KEY = Read-Host "Geoapify API key"
```

Start the backend:

```powershell
.\.venv\Scripts\python.exe -m uvicorn main:app --port 8000
```

Verify the backend is connected to Supabase:

http://127.0.0.1:8000/health/db

Expected response:

```json
{"status":"ok","supabase":"connected"}
```

Keep this terminal running while executing the tests.

### 5. Start the frontend (Terminal 2)

Open another PowerShell terminal in the repository root.

Set the backend URL:

```powershell
$env:EXPO_PUBLIC_API_URL = "http://127.0.0.1:8000"
```

Start Expo Web on port 3001:

```powershell
npm.cmd run web -- --port 3001 --clear
```

The frontend should be available at:

http://localhost:3001

Keep this terminal running. The backend and frontend must both be running during E2E testing.

### 6. Set the test environment variables (Terminal 3)

Open a third PowerShell terminal in the repository root.

Set the credentials for your two dedicated test users:

```powershell
$env:E2E_TEST_EMAIL = Read-Host "Primary test email"
$env:E2E_TEST_PASSWORD = Read-Host "Primary test password"

$env:E2E_RECIPIENT_EMAIL = Read-Host "Recipient test email"
$env:E2E_RECIPIENT_PASSWORD = Read-Host "Recipient test password"
```

Set an unused account number:

```powershell
$env:E2E_MISSING_ACCOUNT_NUMBER = "999999999999"
```

Verify that the selected account number does not exist in your Supabase test database before running the tests. Change it if necessary.

These environment variables apply only to the current PowerShell session. Set them again when opening a new terminal.

**Security:** Do not hardcode credentials inside the test files or commit passwords, API keys, or environment files. Note that ordinary `Read-Host` displays the entered password in the terminal.

### 7. Run all 37 E2E tests

From the repository root, run:

```powershell
npx.cmd playwright test auth.spec.js deposit.spec.js accounts.spec.js transfer.spec.js payments.spec.js activity.spec.js atms.spec.js accounts-ui.spec.js profile.spec.js manager.spec.js --workers=1
```

Expected result:

```text
37 passed
```

The tests cover:

| Test file | Tests | Description |
| --- | ---: | --- |
| `auth.spec.js` | 3 | Registration and authentication |
| `deposit.spec.js` | 5 | ATM cash deposits and deposit validation |
| `accounts.spec.js` | 6 | Account API operations |
| `accounts-ui.spec.js` | 2 | Account creation and closure through the UI |
| `transfer.spec.js` | 9 | Internal transfers and sending money |
| `payments.spec.js` | 5 | Bill payment validation, scheduling, and cancellation |
| `activity.spec.js` | 3 | Transaction history and filtering |
| `atms.spec.js` | 2 | ATM search and location results |
| `profile.spec.js` | 1 | Profile information and settings |
| `manager.spec.js` | 1 | Customer restrictions on manager access |
| **Total** | **37** | |

The `--workers=1` option runs tests sequentially to reduce interference between tests that share accounts and balances.

Important notes

- Always start both the backend and frontend before running the tests.
- Use a test Supabase database, not a production database.
- Ensure the test accounts have active checking accounts and enough simulated funds.
- The ATM search tests require a working Geoapify API key.
- The customer-facing cash deposit tests use `POST /atm/deposits`, not the admin-only `POST /accounts/{account_id}/deposits` endpoint.
- One-time bill payments are processed immediately; recurring payments can be scheduled and canceled.
- Some tests modify persistent database data. Repeated runs may create additional accounts, transactions, and payment records.
- If tests fail after a teammate updates the frontend or backend, check whether the UI labels, API endpoints, or expected responses have changed.
- The full 37-test suite was verified successfully after the latest E2E test updates.


The repository also includes browser tests under `tests/e2e/`. Live check OCR and settlement tests are still pending. See [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) for the full handoff.


