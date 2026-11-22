# Running CS160 Bank with Docker

One command starts the whole app on your machine: the web app, the FastAPI backend, and a self-hosted Supabase (database, auth, storage). No Supabase account or API keys are needed.

- [Quick start](#quick-start)
- [What is running](#what-is-running)
- [Demo data and logins](#demo-data-and-logins)
- [Everyday commands](#everyday-commands)
- [Using the mobile app](#using-the-mobile-app)
- [Configuration](#configuration)
- [Changing the database](#changing-the-database)
- [Running the tests](#running-the-tests)
- [Troubleshooting](#troubleshooting)

## Quick start

**You need:** [Docker Desktop](https://www.docker.com/products/docker-desktop/) running, and about 6 GB of free disk space for the images.

From the repository root:

```bash
docker compose up --build
```

The first run downloads several images and builds the web app, so it takes a few minutes. Later runs start in seconds. When the output settles, open <http://localhost:3000>.

To run it in the background instead, use `docker compose up -d --build`.

> **Windows:** if the build stops with `additional privileges requested: pass "--allow=fs.read=..."`, set `BUILDX_BAKE_ENTITLEMENTS_FS=0` for that command. In PowerShell: `$env:BUILDX_BAKE_ENTITLEMENTS_FS=0; docker compose up --build`.

Then load some demo users (optional but recommended):

```bash
docker compose run --rm seed
```

## What is running

| Address | What it is |
| --- | --- |
| <http://localhost:3000> | Web app (nginx serving the built Expo web app, in API mode) |
| <http://localhost:8000/docs> | Backend API and interactive docs (`/health` and `/health/db` for health checks) |
| <http://localhost:54331> | Supabase gateway: `/auth/v1`, `/rest/v1`, `/storage/v1` |
| <http://localhost:8025> | Mailpit, which catches the password-reset emails |
| `localhost:54332` | Postgres (user `postgres`, password `postgres-local-dev-password`) |

Behind those addresses are nine services:

| Service | Purpose |
| --- | --- |
| `web` | The web frontend |
| `api` | The FastAPI backend ([backend/](../backend)) |
| `db` | Postgres with the Supabase roles and `pg_cron` |
| `auth` | Supabase Auth (GoTrue): sign-in, tokens, password reset |
| `rest` | PostgREST, the database API the backend uses |
| `storage` | Supabase Storage, which keeps the check photos |
| `kong` | The gateway that puts Auth, REST and Storage behind one address |
| `mailpit` | A fake mail server for local emails |
| `db-migrate` | Runs once at start-up and applies the database SQL, then exits (that is normal) |

An optional `seed` service creates demo users. It only runs when you ask for it.

All local data lives in Docker volumes, so it survives `docker compose down` and is erased by `docker compose down -v`.

## Demo data and logins

`docker compose run --rm seed` creates these users, each with a funded checking account. You can run it again at any time; it never duplicates anything.

| Who | Email | Password |
| --- | --- | --- |
| Manager (admin screens) | `admin@example.com` | `DemoPass2026!` |
| Customer | `e2e-user@example.com` | `DemoPass2026!` |
| Second customer, to send money to | `e2e-recipient@example.com` | `DemoPass2026!` |
| Used by `deposit.spec.js` | `deposit-test-2@example.com` and `deposit-test-3@example.com` | `DepositTest2026` |

You can also register your own account on the sign-in screen. Registration always creates a customer; to make someone an admin, change their `role` to `admin` in the `users` table (see [Looking inside the database](#looking-inside-the-database)).

> The seed only talks to the local stack, and its passwords are public, so do not point it at a real project.

## Everyday commands

```bash
docker compose up -d                 # start everything in the background
docker compose ps                    # see what is running and healthy
docker compose logs -f api           # follow one service's logs (api, web, auth, db, ...)
docker compose down                  # stop everything, keep the data
docker compose down -v               # stop and delete ALL local data (database, check photos)
docker compose up -d --build web     # rebuild and restart just the web app after changing frontend code
docker compose up -d --build api     # same for the backend
```

The images are production-style, so code changes need a rebuild; there is no live reload. If you want live reload while developing, run the dev servers on your machine against this stack: `npm run web` for the frontend (set `EXPO_PUBLIC_API_URL=http://localhost:8000`) and `uvicorn main:app --reload` in `backend/` with `SUPABASE_URL=http://localhost:54331` plus the keys from `docker-compose.yml` in `backend/.env`.

### Looking inside the database

```bash
docker compose exec db psql -U postgres
```

Useful queries:

```sql
select email, role from public.users;
update public.users set role = 'admin' where email = 'someone@example.com';
select jobname, schedule from cron.job;
```

You can also connect a GUI (DBeaver, TablePlus, ...) to `localhost:54332`.

## Using the mobile app

The mobile app is not in Docker. It runs through Expo on your computer and talks to the Docker backend.

1. Start the stack and seed it: `docker compose up -d`, then `docker compose run --rm seed`.
2. In the root `.env` file (the Expo one, not `docker/.env`) set `EXPO_PUBLIC_API_URL=http://localhost:8000`.
3. Start the app with `npm start` (add `-- --clear` after changing `.env`).

### Android emulator

Inside the emulator, `localhost` is the emulator itself, so forward the two ports it needs. Start the emulator first, then in PowerShell:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb reverse tcp:8000 tcp:8000       # the API
& $adb reverse tcp:54331 tcp:54331     # check images (signed links point at the gateway)
```

Run both again whenever the emulator or adb restarts. `& $adb reverse --list` should show both. Then press `a` in the `npm start` terminal. Without the second forward, the manager's check review shows **Unavailable** for the photos.

To set a location for ATM search: emulator toolbar `⋯`, then **Location**.

### Physical phone (Expo Go)

`localhost` will not work. Use your computer's address on the same Wi-Fi (for example `192.168.1.20`). Create `docker/.env` with:

```
PUBLIC_API_URL=http://192.168.1.20:8000
SUPABASE_PUBLIC_URL=http://192.168.1.20:54331
```

Rebuild with `docker compose --env-file docker/.env up -d --build`, and set `EXPO_PUBLIC_API_URL=http://192.168.1.20:8000` in the root `.env` too. Allow ports 8000 and 54331 through your firewall.

### iOS simulator

The simulator shares your Mac's network, so `EXPO_PUBLIC_API_URL=http://localhost:8000` works with no extra steps.

## Configuration

Everything has a working local default. To change something, copy [docker/.env.example](../docker/.env.example) to `docker/.env` (it is git-ignored), uncomment what you need, and start with:

```bash
docker compose --env-file docker/.env up -d --build
```

The ones you are most likely to want:

| Setting | Why |
| --- | --- |
| `GEOAPIFY_API_KEY` | ATM search. `docker-compose.yml` ships a default free-tier key, so it works out of the box; set your own from [geoapify.com](https://www.geoapify.com) to use a different quota (an empty value makes that screen return a 503) |
| `WEB_PORT`, `API_PORT`, `SUPABASE_PORT`, `DB_PORT`, `MAILPIT_PORT` | Change a port if something else is using it |
| `PUBLIC_API_URL` | The API address baked into the web app. Rebuild `web` after changing it |
| `SUPABASE_PUBLIC_URL` | The address browsers and phones use for Supabase (check images) |
| `RESEND_API_KEY` or `SMTP_*` | Lets the backend send its own emails (account-locked notice, month-end statements); otherwise they are skipped |

The default keys and passwords are public development values. They are fine on your own machine and must not be used anywhere else.

## Changing the database

The stack builds the database from scratch the first time it starts, using these files:

- [docker/db/000_base_schema.sql](../docker/db/000_base_schema.sql): the `users` and `accounts` tables, copied from the hosted project.
- [backend/sql/](../backend/sql): everything else (transactions, deposits, statements, ...), the same files used on the hosted Supabase project.
- [docker/db/order.txt](../docker/db/order.txt): the order they are applied in.

The `db-migrate` service applies each file once and records it, so restarting never repeats work.

**To add a change:** put a new `.sql` file in `backend/sql/`, add its name to `docker/db/order.txt`, then run `docker compose run --rm db-migrate`. Run the same file in the Supabase SQL editor on the hosted project if that one needs it too.

**Editing a file that was already applied** does not re-run it. Either write a new file that makes the change, or reset everything with `docker compose down -v` and start again.

## Running the tests

**Backend unit tests** use fakes and need no running stack. Run them from the repo root:

```bash
backend/.venv/Scripts/pytest -q backend/Tests      # Windows
backend/.venv/bin/pytest -q backend/Tests          # macOS / Linux
```

**End-to-end tests (Playwright)** can run against this stack. They reuse the web app on port 3000 and talk to the API on port 8000.

```bash
npx playwright install                # once, downloads the test browsers
docker compose run --rm seed          # prints the E2E_* values below
```

Set the values the seed command prints (PowerShell shown), then run the tests:

```powershell
$env:E2E_TEST_EMAIL="e2e-user@example.com"
$env:E2E_TEST_PASSWORD="DemoPass2026!"
$env:E2E_RECIPIENT_EMAIL="e2e-recipient@example.com"
$env:E2E_RECIPIENT_PASSWORD="DemoPass2026!"
$env:E2E_MISSING_ACCOUNT_NUMBER="999999999999"
npm run test:e2e
```

The ATM spec uses the stack's default Geoapify key, so it needs nothing extra unless that key's daily quota runs out.

## Troubleshooting

**A port is already in use.** Another program holds 3000, 8000, 8025, 54331 or 54332. Stop it, or change the port in `docker/.env`. This stack avoids the Supabase CLI's ports (54321 to 54324), so it can run next to `supabase start`.

**The `db` container is unhealthy or keeps restarting after a failed first start.** Postgres only runs its set-up once, so a half-finished first start sticks. Reset and retry: `docker compose down -v`, then `docker compose up -d`.

**The app shows demo data or "Open demo dashboard".** The web app was built without an API address. Rebuild it: `docker compose up -d --build web`.

**Login or requests fail from the web app with a network or CORS error.** The web app must be opened at `http://localhost:3000` or `http://127.0.0.1:3000`. For any other address, add it to `CORS_ORIGINS` in `docker/.env`.

**ATM search says 503 or returns no results.** The default Geoapify key may be over its daily quota, or `GEOAPIFY_API_KEY` was set to an empty value in `docker/.env`. Set your own key (see [Configuration](#configuration)).

**Check photos say "Unavailable" in the mobile app.** The emulator or phone cannot reach the Supabase gateway. See [Using the mobile app](#using-the-mobile-app) for the second `adb reverse`, or the LAN address setup for a phone.

**No password-reset email.** Open <http://localhost:8025>; Mailpit catches it there. It is never sent to a real inbox.

**A different container, `supabase_vector_..._CS160`, keeps restarting.** That belongs to the Supabase CLI (`supabase start`), not this stack. Vector cannot reach Docker's TCP port on Docker Desktop. Run `supabase stop` and then `supabase start -x vector`, or ignore it.

**Something else is broken.** `docker compose ps` shows which service is unhealthy, and `docker compose logs <service>` shows why. If in doubt, `docker compose down -v && docker compose up --build` gives you a clean slate.
