# CS160 Bank web client: project handoff

## Scope and current state

This repository contains the **web UI** for the online banking class project. It started as an otherwise empty repository. The UI is implemented and can be explored in demo mode; the FastAPI backend, Supabase project, and mobile client are separate team work and are not present here. No real bank accounts or payments are connected.

The low-level design and high-level test plan supplied for the project guided the screen list, API route names, and validation behavior. The web client currently covers sign-in and MFA entry, an account overview, account creation and closure, internal transfers, scheduled bill payments, transaction filtering, notifications, ATM search, profile settings, and a manager dashboard. Check deposit is presented as a mobile-only workflow, matching the design's image capture requirement.

## Architecture and how it is used

| Layer | Planned technology | This repository's role |
| --- | --- | --- |
| Web UI | React Native + Expo | Implemented with React Native components and Expo's web target, so the same UI framework can be shared with mobile work. |
| API | Python + FastAPI | `src/services/api.js` calls the planned `/auth`, `/accounts`, `/transfers`, `/bill-payments`, `/notifications`, `/atm`, and `/manager` routes. The server is not included here. |
| Authentication and session | Supabase Auth + JWT | The UI sends login, MFA, recovery, and logout requests through FastAPI. A returned bearer token is kept in memory and attached to API calls. Supabase is not called directly from the browser. |
| Authorization | FastAPI checks + Supabase row-level security | The UI only shows the manager navigation for a staff role returned by `/auth/me`. The backend must still enforce every role, account ownership, and status check. |
| Data and storage | Supabase PostgreSQL and S3 | Not accessed directly by this UI. All financial changes must go through the backend's atomic transaction flow. |
| ATM and notifications | Maps/Places API and notification service | The web UI displays server ATM results and notifications. Demo mode supplies sample locations and messages. |

The intended live request flow is:

```text
React Native Web screen
  -> src/services/api.js (JSON request + bearer token)
  -> FastAPI router
  -> JWT and role/account authorization
  -> service/repository layer
  -> Supabase PostgreSQL or external integration
```

`App.jsx` currently owns navigation and screen state. Each screen uses small shared controls (`Action`, `Field`, `Choice`, `Card`, `Notice`, and `SectionHeading`) defined in that file. `src/theme.js` centralizes colors and formatting. `src/data/demo.js` supplies a separate sample profile, accounts, transactions, payments, notifications, ATMs, and manager records. There is no URL-based routing or persistent client-side state yet; a page reload resets the demo and an API session token.

### Demo and API modes

- **Demo mode** is selected when `EXPO_PUBLIC_API_URL` is absent. Login opens a sample dashboard. Transfers and other demo actions change only React state in the current browser session. The interface labels this mode on the login screen and in a banner after entry.
- **API mode** is selected when `EXPO_PUBLIC_API_URL` is set. Login and account data are requested from FastAPI. If loading fails, the UI reports an error instead of showing sample balances. Manager access is based on the role returned by `/auth/me`.
- `EXPO_PUBLIC_API_URL` is public in the web bundle. Put only the API origin there, never a Supabase service key or other secret.

## Visual and interaction design

The team requested a Chase-inspired web layout. The UI uses a deep blue header treatment, white account cards, a left banking menu on wide screens, and a horizontal menu below 860 px. The account overview groups balances, quick actions, and recent activity so the most common tasks are visible first. The project uses **CS160 Bank** branding and standard icon fonts rather than Chase logos, images, or proprietary assets.

The high-level test plan's usability goals informed readable labels, high-contrast text, descriptive errors, keyboard-focusable controls, and explicit success messages. Money fields accept positive values with at most two decimal places, and payment dates are checked before submission. These client checks support the workflow; the backend must repeat validation and enforce transaction rules.

## Screens and current behavior

| Screen | Current behavior | Live dependency |
| --- | --- | --- |
| Sign in / MFA / recovery | Demo entry; API login, MFA code, reset request, and logout UI | `/auth/login`, `/auth/mfa/verify`, `/auth/forgot-password`, `/auth/logout`, `/auth/me` |
| Overview / accounts | Balance cards, account selection, opening, and two-step closure UI | `/accounts`, `POST /accounts`, `DELETE /accounts/{id}` |
| Transfers | Validates distinct accounts, positive amount, and available funds; demo updates both balances | `POST /transfers` with atomic server processing |
| Bill payments | Schedule, view, and cancel payments; validates amount and date | `/bill-payments` |
| Activity | Account, description, type, and date filters | `GET /accounts/{id}/transactions` |
| Notifications | Unread count, list, and mark read | `GET /notifications`, `PATCH /notifications/{id}/read` |
| ATM search | Search field, results, and directions link | `GET /atm/search`; backend Maps/Places integration |
| Profile | Editable in demo; read-only save action in API mode | Dedicated profile update route has not been specified |
| Manager | Customer/account search and filtered balance summary; staff-only navigation | `/manager/customers`, `/manager/accounts`, `/manager/reports` plus server role checks |
| Check deposit | Explains the mobile capture flow | Mobile app, image storage, OCR/check service |

## API integration assumptions to confirm

The supplied low-level design specifies endpoint paths but not full request or response schemas. The current client makes these assumptions; confirm them with the backend team before treating API mode as complete:

1. `POST /auth/login` and `POST /auth/mfa/verify` return `access_token` or `token`. Login may return `mfa_required` to move to the code screen. The MFA challenge payload and reset link handling still need a shared contract.
2. `GET /auth/me` returns the profile directly or under `profile`, including `first_name`, `last_name`, `email`, and `role`.
3. List routes return an array or an object keyed by `accounts`, `transactions`, `payments`, or `notifications` respectively. Account balances are numeric or numeric strings and account IDs remain opaque UUIDs.
4. Transfer creation accepts `source_account_id`, `destination_account_id`, `amount`, `transfer_type: "internal"`, and `description`. The server must make balance changes and transaction records atomic, reject insufficient funds and unauthorized access, and prevent duplicate requests.
5. Payment creation accepts `account_id`, `recipient`, `amount`, `next_payment_date`, and `frequency`. The backend owns scheduling, processing, and duplicate prevention.
6. Account creation currently sends `account_type` and `initial_deposit`. Closure uses `DELETE /accounts/{id}`. The server must reject closure with unresolved transactions and preserve history.
7. `GET /atm/search` is currently called with a `location` text query. The backend team's actual map API may require coordinates or a different parameter name.
8. A dedicated profile update endpoint is still needed. The web UI intentionally avoids sending personal details to the account update route.

The browser token is in memory only, so a reload requires sign-in again. This avoids local storage of a bearer token but does not provide session refresh. A production session policy, CSRF/CORS setup, token expiry handling, and logout behavior need agreement with the backend team.

## Verification completed and remaining

Completed locally:

- Installed dependencies and generated `package-lock.json`.
- `npm run check` completed.
- `EXPO_NO_TELEMETRY=1 npm run build:web` produced a web export.
- Browser smoke checks covered demo entry, responsive navigation, transfer balance updates, account creation, and manager preview.

Important limits:

- `npm run check` runs TypeScript with `checkJs: false`; it does not provide full static type checking of `App.jsx`. The web build verifies that the JavaScript bundles.
- There are no automated unit or Playwright tests in this repository yet.
- No live FastAPI/Supabase integration, real MFA, external ATM search, or real payment processing has been exercised.
- The client-side manager menu and validation are usability controls only. Backend authorization and atomic financial operations remain required.

## Recommended next steps

1. Agree on JSON schemas for authentication, account lists, transfers, payments, ATM search, and errors with the backend team; update `src/services/api.js` and the screen mapping together.
2. Connect to a non-production FastAPI/Supabase environment and test the high-level plan's authentication, ownership, insufficient-funds, rollback, and duplicate-request cases.
3. Add a profile update route and define MFA challenge/session refresh behavior.
4. Add Playwright tests for sign-in, account selection, transfer validation, payment scheduling, filtering, manager authorization, keyboard use, and large-text layouts.
5. As the UI expands, move the screen functions out of `App.jsx` into a `screens/` directory and add URL routing so pages can be bookmarked and refreshed directly.

For setup and a shorter app description, start with [ReadMe.md](ReadMe.md).
