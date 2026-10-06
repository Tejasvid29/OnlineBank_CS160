# CS160 Bank: project handoff

## Scope and current state

This repository holds the **web UI** (Expo / React Native Web, repository root) and the start of the **FastAPI backend** (`backend/`) for the online banking class project. See [ReadMe.md](ReadMe.md) for setup.

**Working end to end against Supabase:** registration, login, token refresh, logout, password-reset email request, and role-based authorization (`customer` / `admin`), backed by a `public.users` table linked to Supabase Auth. **Not built yet:** the `/accounts`, `/transfers`, `/bill-payments`, `/notifications`, `/atm`, MFA, and most `/manager` routes. Those screens show sample data in demo mode and are empty in API mode. The mobile client is separate team work. No real bank accounts or payments are connected.

The low-level design and high-level test plan guided the screen list, API route names, and validation behavior. Check deposit is presented as a mobile-only workflow, matching the design's image capture requirement.

## Architecture and how it is used

| Layer | Technology | This repository's role |
| --- | --- | --- |
| Web UI | React Native + Expo | Implemented with Expo's web target, so the UI framework can be shared with mobile work. |
| API | Python + FastAPI | `backend/` implements `/auth/*`, `/manager/customers`, and `/health`. `src/services/api.js` also calls the planned banking routes, which do not exist yet. |
| Authentication and session | Supabase Auth + JWT | FastAPI registers users and signs them in through Supabase. The access token (JWT) is sent as a bearer token and validated with Supabase on every request, so logout takes effect immediately. The refresh token is stored in `localStorage` on web (memory only on native) and used to restore the session after a reload. |
| Authorization | FastAPI role checks + Supabase RLS | `require_role(...)` in `backend/auth.py` enforces roles server side. The UI also hides manager navigation, but that is a convenience only. Inactive users are rejected at login and on every request. |
| Data and storage | Supabase PostgreSQL and S3 | `public.users` (schema in the ReadMe) is the only table so far. The backend uses the secret key, which bypasses RLS, so ownership checks must be written in FastAPI. |
| ATM and notifications | Maps/Places API and notification service | Not built. Demo mode supplies sample locations and messages. |

The intended live request flow is:

```text
React Native Web screen
  -> src/services/api.js (JSON request + bearer token)
  -> FastAPI router
  -> JWT and role/account authorization
  -> service/repository layer
  -> Supabase PostgreSQL or external integration
```

Navigation uses Expo Router (`app/`, one file per screen). `src/state/AppState.jsx` owns app-wide state and actions, and `src/components/LoginScreen.jsx` holds the sign-in, registration, MFA, and reset views. Shared controls (`Action`, `Field`, `Choice`, `Card`, `Notice`, and `SectionHeading`) live in `src/ui/primitives.jsx`. `src/theme.js` centralizes colors and formatting. `src/data/demo.js` supplies a separate sample profile, accounts, transactions, payments, notifications, ATMs, and manager records. A page reload resets the demo; in API mode a reload restores the session from the saved refresh token.

### Demo and API modes

- **Demo mode** is selected when `EXPO_PUBLIC_API_URL` is absent. Login opens a sample dashboard. Transfers and other demo actions change only React state in the current browser session. The interface labels this mode on the login screen and in a banner after entry.
- **API mode** is selected when `EXPO_PUBLIC_API_URL` is set. Login and the profile are requested from FastAPI. Banking lists that have no backend route yet load as empty rather than blocking sign-in. Manager access is based on the role returned by `/auth/me`.
- `EXPO_PUBLIC_API_URL` is public in the web bundle. Put only the API origin there, never a Supabase service key or other secret.

## Visual and interaction design

The team requested a Chase-inspired web layout. The UI uses a deep blue header treatment, white account cards, a left banking menu on wide screens, and a horizontal menu below 860 px. The account overview groups balances, quick actions, and recent activity so the most common tasks are visible first. The project uses **CS160 Bank** branding and standard icon fonts rather than Chase logos, images, or proprietary assets.

The high-level test plan's usability goals informed readable labels, high-contrast text, descriptive errors, keyboard-focusable controls, and explicit success messages. Money fields accept positive values with at most two decimal places, and payment dates are checked before submission. These client checks support the workflow; the backend must repeat validation and enforce transaction rules.

## Screens and current behavior

| Screen | Current behavior | Live dependency |
| --- | --- | --- |
| Sign in / register / recovery | Demo entry; API login, registration, reset request, session restore, and logout. MFA entry exists in the UI only | `/auth/*` implemented; `/auth/mfa/verify` not built |
| Overview / accounts | Balance cards, account selection, opening, and two-step closure UI | `/accounts`, `POST /accounts`, `DELETE /accounts/{id}` |
| Transfers | Validates distinct accounts, positive amount, and available funds; demo updates both balances | `POST /transfers` with atomic server processing |
| Bill payments | Schedule, view, and cancel payments; validates amount and date | `/bill-payments` |
| Activity | Account, description, type, and date filters | `GET /accounts/{id}/transactions` |
| Notifications | Unread count, list, and mark read | `GET /notifications`, `PATCH /notifications/{id}/read` |
| ATM search | Search field, results, and directions link | `GET /atm/search`; backend Maps/Places integration |
| Profile | Editable in demo; read-only save action in API mode | Dedicated profile update route has not been specified |
| Manager | Customer/account search and filtered balance summary; staff-only navigation | `/manager/customers` built (admin only); `/manager/accounts` and `/manager/reports` not built, so the dashboard shows an error in API mode |
| Check deposit | Explains the mobile capture flow | Mobile app, image storage, OCR/check service |

## API contract (implemented auth routes)

- `POST /auth/register` takes `first_name`, `last_name`, `email`, optional `phone`, and `password` (8-72 characters). It always creates an active `customer`, then returns the same body as login. A duplicate email returns 409.
- `POST /auth/login` and `POST /auth/refresh` return `access_token`, `refresh_token`, `expires_in`, and `profile` (`id`, `first_name`, `last_name`, `email`, `phone`, `role`, `status`, `created_at`). Bad credentials return one generic 401. Inactive accounts return 403.
- `GET /auth/me` returns `{ "profile": ... }`. `POST /auth/logout` revokes the session (204). `POST /auth/forgot-password` returns 204 whether or not the email exists.
- Errors use FastAPI's `{ "detail": "..." }`, which `src/services/api.js` displays.

## Assumptions for routes not built yet

Confirm these with the backend team before building them:

1. List routes return an array or an object keyed by `accounts`, `transactions`, `payments`, or `notifications`. Account balances are numeric or numeric strings and account IDs are opaque UUIDs.
2. Transfer creation accepts `source_account_id`, `destination_account_id`, `amount`, `transfer_type: "internal"`, and `description`. The server must make balance changes and transaction records atomic, reject insufficient funds and unauthorized access, and prevent duplicate requests.
3. Payment creation accepts `account_id`, `recipient`, `amount`, `next_payment_date`, and `frequency`. The backend owns scheduling, processing, and duplicate prevention.
4. Account creation sends `account_type` and `initial_deposit`. Closure uses `DELETE /accounts/{id}`. The server must reject closure with unresolved transactions and preserve history.
5. `GET /atm/search` is called with a `location` text query; the chosen map API may need coordinates instead.
6. A dedicated profile update endpoint is still needed. The UI avoids sending personal details elsewhere.
7. MFA (`mfa_required` on login, `/auth/mfa/verify`) and the password-reset link landing page (a "set new password" screen) need a shared design.

## Verification completed and remaining

Completed locally:

- `npm run check` and `npm run build:web` succeed.
- Backend auth flow tested against the real Supabase project: register, duplicate email, wrong password, `me` with valid/missing/invalid tokens, customer blocked from an admin route (403), refresh, forgot-password, logout, and token rejection after logout. The test user was deleted afterwards.
- Earlier browser smoke checks covered demo entry, responsive navigation, transfer balance updates, account creation, and manager preview.

Important limits:

- `npm run check` runs TypeScript with `checkJs: false`; it does not type-check the JavaScript screens. The web build verifies that they bundle.
- There are no automated unit, backend, or Playwright tests yet; the auth checks above were run by hand. The registration and login UI has not been exercised in a browser against the live API.
- Real MFA, external ATM search, and payment processing do not exist yet.
- The client-side manager menu and validation are usability controls only. Every new backend route needs `get_current_user` or `require_role(...)`, ownership checks (the secret key bypasses RLS), and atomic financial operations.

## Recommended next steps

1. Build the banking routes (`/accounts`, `/transfers`, `/bill-payments`, `/notifications`, `/manager/*`) behind `get_current_user` / `require_role`, with account ownership checks and the tables they need (with RLS enabled).
2. Add a profile update route, MFA, and a "set new password" screen for reset links.
3. Decide whether to validate JWTs locally via `SUPABASE_JWKS_URL` (faster, but logout is not immediate) or keep the per-request Supabase check. Consider secure storage for native sessions.
4. Add backend tests (pytest) for auth and authorization, and Playwright tests for sign-in, registration, transfer validation, manager authorization, and large-text layouts.
5. Add production CORS origins, rate limiting on login and registration, and email confirmation if required.

For setup instructions, start with [ReadMe.md](ReadMe.md).
