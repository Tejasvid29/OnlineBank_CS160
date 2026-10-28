# CS160 Bank: project handoff

## Scope and current state

This repository holds the **web and native UI** (Expo / React Native, repository root) and a **FastAPI backend** (`backend/`) for the online banking class project. See [ReadMe.md](ReadMe.md) for setup.

The backend now contains routes for authentication, accounts, transactions, transfers, bill payments, ATM search, and **pending mobile check intake**. Native screens are in `app/*.native.jsx`. The check intake migration and private Storage bucket must be applied to Supabase before live submission can work. OCR, check verification, approval, and fund availability are not implemented; submitting a check does not change the account balance. Notifications, MFA, and most manager routes are also incomplete.

The low-level design and high-level test plan guided the screen list, API route names, and validation behavior. Check capture runs on mobile; web continues to show guidance for that mobile-only workflow.

## Architecture and how it is used

| Layer | Technology | This repository's role |
| --- | --- | --- |
| Web and mobile UI | React Native + Expo | Platform-specific Expo Router screens share app state and API calls. `app/checks.native.jsx` owns camera capture, while `app/checks.jsx` is web guidance. |
| API | Python + FastAPI | `backend/` includes auth and banking routes. `backend/deposits.py` accepts multipart check photos from native clients. |
| Authentication and session | Supabase Auth + JWT | FastAPI registers users and signs them in through Supabase. The access token (JWT) is sent as a bearer token and validated with Supabase on every request. The refresh token is stored in `localStorage` on web and SecureStore on native. |
| Authorization | FastAPI role checks + Supabase RLS | `require_role(...)` in `backend/auth.py` enforces roles server side. The UI also hides manager navigation, but that is a convenience only. Inactive users are rejected at login and on every request. |
| Data and storage | Supabase PostgreSQL and private Storage | The existing Supabase project must provide users and accounts; repository SQL defines transactions, payments, and pending check deposits. The check bucket is private and images are stored only through FastAPI. The secret key bypasses RLS, so ownership checks are enforced in FastAPI and the check-deposit database function. |
| ATM and notifications | Geoapify geocoding + Places (ATMs; needs `GEOAPIFY_API_KEY`) and notification service | ATM search built (`backend/atms.py`). Notifications not built. Demo mode supplies sample locations and messages. |

The intended live request flow is:

```text
React Native web or mobile screen
  -> src/services/api.js (JSON or multipart request + bearer token)
  -> FastAPI router
  -> JWT and role/account authorization
  -> Supabase PostgreSQL, private Storage, or external integration
```

Navigation uses Expo Router (`app/`, with `.native.jsx` versions for native screens). `src/state/AppState.jsx` owns app-wide state and actions, including check-deposit submission. Shared controls live in `src/ui/primitives.jsx` and `src/ui/mobilePrimitives.jsx`. `src/theme.js` centralizes colors and formatting. `src/data/demo.js` supplies sample data. A page reload resets the demo; in API mode a reload restores the session from the saved refresh token.

### Demo and API modes

- **Demo mode** is selected when `EXPO_PUBLIC_API_URL` is absent. Login opens a sample dashboard. Transfers and other demo actions change only React state in the current browser session. The interface labels this mode on the login screen and in a banner after entry.
- **API mode** is selected when `EXPO_PUBLIC_API_URL` is set. Login, accounts, transactions, transfers, payments, ATM search, and check deposits call FastAPI. Optional list failures do not block sign-in. Manager access is based on the role returned by `/auth/me`.
- `EXPO_PUBLIC_API_URL` is public in the web bundle. Put only the API origin there, never a Supabase service key or other secret.

## Visual and interaction design

The team requested a Chase-inspired web layout. The UI uses a deep blue header treatment, white account cards, a left banking menu on wide screens, and a horizontal menu below 860 px. The account overview groups balances, quick actions, and recent activity so the most common tasks are visible first. The project uses **CS160 Bank** branding and standard icon fonts rather than Chase logos, images, or proprietary assets.

The high-level test plan's usability goals informed readable labels, high-contrast text, descriptive errors, keyboard-focusable controls, and explicit success messages. Money fields accept positive values with at most two decimal places, and payment dates are checked before submission. These client checks support the workflow; the backend must repeat validation and enforce transaction rules.

## Screens and current behavior

| Screen | Current behavior | Live dependency |
| --- | --- | --- |
| Sign in / register / recovery | Demo entry; API login, registration, reset request, session restore, and logout. MFA entry exists in the UI only | `/auth/*` implemented; `/auth/mfa/verify` not built |
| Overview / accounts | Balance cards, account selection, opening, and two-step closure UI | `/accounts`, `POST /accounts`, `POST /accounts/{id}/close` |
| Transfers | Validates distinct accounts, positive amount, and available funds; demo updates both balances | `POST /transfers` with atomic server processing |
| Bill payments | Schedule, view, and cancel payments; validates amount and date | `/bill-payments` |
| Activity | Account, description, type, and date filters | `GET /accounts/{id}/transactions` |
| Notifications | Unread count, list, and mark read | `GET /notifications`, `PATCH /notifications/{id}/read` |
| ATM search | Search field, results, and directions link | `GET /atm/search` (built; Geoapify, Chase ATMs only) |
| Profile | Editable in demo; read-only save action in API mode | Dedicated profile update route has not been specified |
| Manager | Customer/account search and filtered balance summary; staff-only navigation | `/manager/customers` built (admin only); `/manager/accounts` and `/manager/reports` not built, so the dashboard shows an error in API mode |
| Check deposit | Native camera capture, amount/account review, private upload, duplicate retry handling, pending history; web shows mobile guidance | `POST/GET /deposits` and `sql/check_deposits.sql` added. OCR, verification, approval, and crediting remain future work. |

## API contract (implemented auth routes)

- `POST /auth/register` takes `first_name`, `last_name`, `email`, optional `phone`, and `password` (8-72 characters). It always creates an active `customer`, then returns the same body as login. A duplicate email returns 409.
- `POST /auth/login` and `POST /auth/refresh` return `access_token`, `refresh_token`, `expires_in`, and `profile` (`id`, `first_name`, `last_name`, `email`, `phone`, `role`, `status`, `created_at`). Bad credentials return one generic 401. Inactive accounts return 403.
- `GET /auth/me` returns `{ "profile": ... }`. `POST /auth/logout` revokes the session (204). `POST /auth/forgot-password` returns 204 whether or not the email exists.
- Errors use FastAPI's `{ "detail": "..." }`, which `src/services/api.js` displays.

## Integration notes

1. List routes return keyed objects such as `{ "accounts": [...] }` and `{ "deposits": [...] }`. Account IDs are UUIDs. `GET /deposits` returns only the signed-in customer's 50 newest records and omits private photo paths and hashes.
2. Transfers use `POST /transfers` with `source_account_id`, `destination_account_id`, `amount`, and optional `description`; the backend posts both sides in one database function. Bill payments use `account_id`, `recipient`, `amount`, `next_payment_date`, and `frequency` at `POST /bill-payments`.
3. Account creation uses `POST /accounts` with `account_type`; new accounts start with a zero balance. Closure uses `POST /accounts/{id}/close`.
4. Check intake uses `POST /deposits` with multipart `account_id`, `amount`, `front_image`, and `back_image`. FastAPI checks account ownership, photo format and size, normalizes JPEG orientation, strips metadata, stores private photos, and calls a database function that inserts a pending check and pending transaction atomically. The account balance is unchanged. Duplicate photo submissions return the existing pending reference.
5. `GET /atm/search` accepts a `location` text query or `lat`/`lng` and searches through Geoapify. A profile update endpoint, MFA verification, and password-reset link landing page still need to be built.

## Verification completed and remaining

Completed locally:

- `npm run check` and `npm run build:web` succeed.
- `npx expo export --platform ios` succeeds, confirming the native bundle resolves.
- `backend/.venv/bin/pytest -q backend/Tests` passes all 44 tests, including 16 check-deposit tests for validation, ownership, duplicate retry, pending records, and cleanup after upload failures.
- Backend auth flow tested against the real Supabase project: register, duplicate email, wrong password, `me` with valid/missing/invalid tokens, customer blocked from an admin route (403), refresh, forgot-password, logout, and token rejection after logout. The test user was deleted afterwards.
- Earlier browser smoke checks covered demo entry, responsive navigation, transfer balance updates, account creation, and manager preview.

Important limits:

- `npm run check` runs TypeScript with `checkJs: false`; it does not type-check the JavaScript screens. The web build verifies that they bundle.
- The repository now includes backend pytest and Playwright suites. The new check-deposit tests use fake storage/database clients and do not exercise a live Supabase project or mobile device.
- Real MFA and a check review/approval workflow do not exist yet. The new SQL migration has not been applied to a live Supabase project in this task.
- The client-side manager menu and validation are usability controls only. Every new backend route needs `get_current_user` or `require_role(...)`, ownership checks (the secret key bypasses RLS), and atomic financial operations.

## Recommended next steps

1. Confirm the Supabase project has the `public.users` and `public.accounts` tables, apply `sql/transactions.sql` if needed, then `sql/check_deposits.sql`; use a non-production project to verify private uploads and pending records end to end. This repository does not include an accounts-table migration.
2. Choose a check-processing/OCR provider, verify routing/check number and written amount against the customer's entry, and add a reviewed approval workflow. Only that controlled backend workflow should credit funds, atomically and once.
3. Finish remaining notifications and manager routes behind `get_current_user` / `require_role`, with account ownership checks and RLS enabled.
4. Add a profile update route, MFA, and a "set new password" screen for reset links.
5. Expand device and end-to-end tests for unreadable checks, rejected checks, retries, and accessibility; add production CORS origins and rate limiting.

For setup instructions, start with [ReadMe.md](ReadMe.md).
