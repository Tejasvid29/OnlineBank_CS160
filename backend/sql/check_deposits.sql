-- Mobile check intake. Run after transactions.sql. Photos are private and submissions stay pending;
-- this migration does not include OCR, approval, or any account-balance change.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('check-deposits', 'check-deposits', false, 10485760, array['image/jpeg'])
on conflict (id) do update
  set public = false, file_size_limit = 10485760, allowed_mime_types = array['image/jpeg'];

create table if not exists public.check_deposits (
  id uuid primary key,
  customer_id uuid not null references public.users (id),
  account_id uuid not null references public.accounts (id),
  amount numeric(12, 2) not null check (amount > 0),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  front_image_path text not null,
  back_image_path text not null,
  front_sha256 char(64) not null,
  back_sha256 char(64) not null,
  transaction_id uuid unique references public.transactions (id),
  routing_number text,
  check_number text,
  extracted_amount numeric(12, 2),
  review_notes text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  constraint distinct_check_sides check (front_sha256 <> back_sha256),
  constraint unique_check_photos unique (customer_id, front_sha256, back_sha256)
);

create index if not exists check_deposits_customer_created_idx
  on public.check_deposits (customer_id, created_at desc);

-- No customer policies: only the backend's secret key (service_role, which bypasses RLS) reads this table,
-- and deposits.py returns only safe columns. With RLS on and no policy, anon and authenticated get no rows.
-- Databases created before this change: run check_deposits_policy_fix.sql.
alter table public.check_deposits enable row level security;

drop policy if exists "Customers can view own check deposits" on public.check_deposits;

revoke all on table public.check_deposits from anon, authenticated;

-- The backend calls this with its secret-key client after validating the JWT and storing both images.
-- The check row and pending ledger entry are inserted in one database transaction. Retried identical
-- photos return the existing pending row and cannot create a second transaction.
create or replace function public.submit_check_deposit(
  p_deposit_id uuid, p_user_id uuid, p_account_id uuid, p_amount numeric,
  p_front_path text, p_back_path text, p_front_sha256 text, p_back_sha256 text
) returns public.check_deposits
language plpgsql
security invoker
set search_path = ''
as $$
declare
  acct public.accounts;
  submitted public.check_deposits;
  txn_id uuid;
begin
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;
  if p_front_sha256 = p_back_sha256 then raise exception 'same_photo'; end if;
  select * into acct from public.accounts
    where id = p_account_id and user_id = p_user_id for update;
  if not found then raise exception 'account_not_found'; end if;
  if acct.status <> 'activated' then raise exception 'account_closed'; end if;

  insert into public.check_deposits
    (id, customer_id, account_id, amount, front_image_path, back_image_path, front_sha256, back_sha256)
  values
    (p_deposit_id, p_user_id, p_account_id, p_amount, p_front_path, p_back_path, p_front_sha256, p_back_sha256)
  on conflict (customer_id, front_sha256, back_sha256) do nothing
  returning * into submitted;

  if submitted.id is null then
    select * into submitted from public.check_deposits
      where customer_id = p_user_id and front_sha256 = p_front_sha256 and back_sha256 = p_back_sha256;
    if submitted.account_id <> p_account_id or submitted.amount <> p_amount or submitted.status <> 'pending' then
      raise exception 'duplicate_check';
    end if;
    return submitted;
  end if;

  insert into public.transactions
    (account_id, customer_id, transaction_type, amount, status, description)
  values
    (p_account_id, p_user_id, 'deposit', p_amount, 'pending', 'Mobile check deposit')
  returning id into txn_id;

  update public.check_deposits set transaction_id = txn_id
    where id = p_deposit_id returning * into submitted;
  return submitted;
end;
$$;

revoke all on function public.submit_check_deposit(uuid, uuid, uuid, numeric, text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.submit_check_deposit(uuid, uuid, uuid, numeric, text, text, text, text)
  to service_role;
