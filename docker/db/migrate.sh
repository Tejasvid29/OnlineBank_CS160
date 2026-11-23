#!/bin/bash
# Applies the app's SQL (docker/db/order.txt) to the local Supabase database once Auth and Storage have created
# their own schemas. Safe to re-run: each file is applied once and recorded in public._app_migrations.
set -euo pipefail

export PGPASSWORD="${POSTGRES_PASSWORD:?POSTGRES_PASSWORD is required}"
psql_run() { psql -h "${POSTGRES_HOST:-db}" -p "${POSTGRES_PORT:-5432}" -U postgres -d "${POSTGRES_DB:-postgres}" -X -q -v ON_ERROR_STOP=1 "$@"; }

echo "Waiting for the Auth and Storage schemas..."
for _ in $(seq 1 60); do
  ready=$(psql_run -tAc "select (to_regclass('auth.users') is not null and to_regclass('storage.buckets') is not null)::text" 2>/dev/null || true)
  [ "$ready" = "true" ] && break
  sleep 2
done
[ "${ready:-}" = "true" ] || { echo "Auth/Storage schemas never appeared." >&2; exit 1; }

psql_run <<'SQL'
create table if not exists public._app_migrations (name text primary key, applied_at timestamptz not null default now());
alter table public._app_migrations enable row level security;
revoke all on table public._app_migrations from anon, authenticated;
SQL

applied=0
while IFS= read -r line; do
  entry="${line%%#*}"; entry="$(echo "$entry" | xargs)"
  [ -n "$entry" ] || continue
  case "$entry" in
    docker/*)  file="/migrations/docker/${entry#docker/}" ;;
    backend/*) file="/migrations/backend/${entry#backend/}" ;;
    *) echo "Unknown entry in order.txt: $entry" >&2; exit 1 ;;
  esac
  [ -f "$file" ] || { echo "Missing migration file: $entry" >&2; exit 1; }

  done_already=$(psql_run -tAc "select exists(select 1 from public._app_migrations where name = '$entry')::text")
  if [ "$done_already" = "true" ]; then echo "skip   $entry"; continue; fi

  echo "apply  $entry"
  # Strip CRs so a Windows (CRLF) checkout does not leave \r inside function bodies.
  # Files that manage their own transaction (begin/commit) cannot be wrapped in another one.
  if grep -qiE '^[[:space:]]*begin[[:space:]]*;' "$file"; then tr -d '\r' < "$file" | psql_run -f -; else tr -d '\r' < "$file" | psql_run -1 -f -; fi
  psql_run -c "insert into public._app_migrations (name) values ('$entry')"
  applied=$((applied + 1))
done < /migrations/docker/order.txt

# Make PostgREST pick up the new tables and functions straight away.
psql_run -c "notify pgrst, 'reload schema'"
echo "Done: $applied migration(s) applied."
