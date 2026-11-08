# CS160 Bank

CS160 Bank is a class online banking project: a **React Native / Expo** client for web, iOS, and Android in the repository root and a **FastAPI + Supabase** backend in `backend/`. The client presents accounts and balances, transfers, bill payments, transaction history, mobile check deposits, ATM search, notifications, profile settings, and a staff dashboard.

The interface takes its blue-and-white palette and navigation from Chase's web design. It uses its own **CS160 Bank** name and icon; it is not a Chase product.

## Prerequisites

- Node.js 20+ and npm
- Python 3.11+
- A Supabase project (for API mode), **or** Docker Desktop to run Supabase locally (see [Run with a local Supabase](#run-with-a-local-supabase-no-cloud-account-needed)). Demo mode needs no backend.
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

## Run with a local Supabase (no cloud account needed)

This is the way to test the project without access to our cloud Supabase project. The Supabase CLI runs Postgres, Auth and Storage in Docker on your machine, and the backend connects to it exactly as it would to the cloud. It replaces the manual SQL in the [Database](#database) section above: the full schema is in `supabase/migrations/`.

**You need:** Docker Desktop (running), Node.js 20+, and Python 3.11+. You do **not** need a Supabase account. The first start downloads several GB of Docker images, so do it on a good connection.

### 1. Start Supabase

From the repository root:

```bash
npx supabase start       # first run is slow; leave Docker running
npx supabase db reset    # builds the database from supabase/migrations/
npx supabase status      # prints the local URL and keys
```

`db reset` creates every table, enum, function and RLS policy, the daily `process-due-payments` pg_cron job, and the private `check-deposits` Storage bucket.

### 2. Point the backend at it

Copy `backend/.env.example` to `backend/.env` and fill in these four values from `npx supabase status` (the CLI labels the keys *Publishable*/*Secret*, or *anon*/*service_role* on older versions):

| Variable | Value |
| --- | --- |
| `SUPABASE_URL` | the API URL, normally `http://127.0.0.1:54321` |
| `SUPABASE_PUBLISHABLE_KEY` | the publishable (anon) key |
| `SUPABASE_SECRET_KEY` | the secret (service_role) key |
| `SUPABASE_JWKS_URL` | `http://127.0.0.1:54321/auth/v1/.well-known/jwks.json` |

If the backend runs **inside Docker**, use `http://host.docker.internal:54321` instead of `127.0.0.1` in the URL values (on Linux, also add `extra_hosts: ["host.docker.internal:host-gateway"]` to the service). Restart the backend after changing `.env`; it caches the Supabase client.

### 3. Seed the demo users

```bash
cd backend
.venv\Scripts\python seed_local.py       # macOS/Linux: .venv/bin/python seed_local.py
```

Run it after every `db reset`, which wipes all data. It is safe to run twice, and it refuses to run unless `SUPABASE_URL` is a local address, so it can never touch a cloud project.

| Role | Email | Password |
| --- | --- | --- |
| Admin (staff dashboard) | `admin@bankdemo.dev` | `AdminDemo#2026` |
| Customer | `customer@bankdemo.dev` | `CustomerDemo#2026` |

The customer starts with a checking account ($2,015.70), a savings account ($5,300.00), a few transactions and one scheduled payment. These accounts exist only on your machine. The sign-up form accepts `@gmail.com` addresses only, so use the accounts above, or register a Gmail address.

### 4. Check that it works

- Open <http://127.0.0.1:8000/health/db>; it should return `{"status":"ok","supabase":"connected"}`.
- Sign in with the customer account in the app (set `EXPO_PUBLIC_API_URL=http://localhost:8000` as in step 3 below).

### Local tools

| URL | What it is |
| --- | --- |
| <http://127.0.0.1:54323> | Supabase Studio: browse tables, run SQL, view Storage |
| <http://127.0.0.1:54324> | Mailpit: password-reset and other auth emails land here, not in a real inbox |

### Stopping, resetting, and safety

- `npx supabase stop` shuts the stack down and keeps your data. `npx supabase db reset` rebuilds a clean database (then re-run the seed).
- **Do not run `db push`, `db pull`, or `supabase link`.** Those talk to a cloud project. You have no credentials for ours, and this setup never needs them.
- If `supabase start` fails, check that Docker is running and that ports 54321-54324 are free.

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
| `supabase/migrations/` | Full database schema, pg_cron job and Storage bucket for the local Supabase stack |
| `backend/seed_local.py` | Seeds the local stack with demo admin and customer accounts (local only) |
| `PROJECT_HANDOFF.md` | Architecture, design choices, status, and next steps |

## Verify

```bash
npm run check
npm run build:web
backend/.venv/bin/pytest -q backend/Tests
```

The repository also includes browser tests under `tests/e2e/`. Live check OCR and settlement tests are still pending. See [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) for the full handoff.
