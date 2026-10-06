# CS160 Bank

CS160 Bank is a class online banking project: a **React Native / Expo (web)** client in the repository root and a **FastAPI + Supabase** backend in `backend/`. The client presents accounts and balances, transfers, bill payments, transaction history, ATM search, notifications, profile settings, and a staff dashboard in one responsive interface.

The interface takes its blue-and-white palette and navigation from Chase's web design. It uses its own **CS160 Bank** name and icon; it is not a Chase product.

## Prerequisites

- Node.js 20+ and npm
- Python 3.11+
- A Supabase project (for API mode). Demo mode needs no backend.

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

## Authentication and authorization

- Supabase Auth issues a JWT access token and a refresh token. The frontend sends `Authorization: Bearer <access token>`; the backend validates it with Supabase on every request, so logout takes effect immediately.
- On web, the refresh token is kept in `localStorage` so a reload restores the session. On native it stays in memory.
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
| `backend/config.py`, `backend/db.py` | Settings from `.env` and the Supabase client |
| `PROJECT_HANDOFF.md` | Architecture, design choices, status, and next steps |

## Verify

```bash
npm run check
npm run build:web
```

Automated end-to-end tests are still pending. See [PROJECT_HANDOFF.md](PROJECT_HANDOFF.md) for the full handoff.
