-- Gives the Supabase service roles the database password. Based on the official self-hosted stack's roles.sql, minus
-- supabase_functions_admin (that role only exists when Edge Functions are set up, which this app does not use).
\set pgpass `echo "$POSTGRES_PASSWORD"`

ALTER USER authenticator WITH PASSWORD :'pgpass';
ALTER USER pgbouncer WITH PASSWORD :'pgpass';
ALTER USER supabase_auth_admin WITH PASSWORD :'pgpass';
ALTER USER supabase_storage_admin WITH PASSWORD :'pgpass';
