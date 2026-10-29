-- Fix for databases that already ran check_deposits.sql. Safe to re-run.
-- Only the backend reads check_deposits, with its secret (service_role) key, which bypasses RLS.
-- The customer select policy let a signed-in user read whole rows (review notes, OCR fields, photo hashes,
-- storage paths) straight from the Supabase Data API, so it is removed. RLS stays on, so anon and
-- authenticated get no rows; their table grants are also revoked in case RLS is ever turned off.

begin;

drop policy if exists "Customers can view own check deposits" on public.check_deposits;

alter table public.check_deposits enable row level security;

revoke all on table public.check_deposits from anon, authenticated;

commit;
