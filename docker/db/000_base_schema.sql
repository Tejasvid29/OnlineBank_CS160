-- Base tables for CS160 Bank: public.users and public.accounts.
--
-- Matches the hosted Supabase project (read from its live schema). Everything else is created by backend/sql/*.sql,
-- applied after this file. The Docker stack runs it automatically (docker/db/migrate.sh); on a hosted project, run it
-- once in the SQL editor before the files in backend/sql/ (users_zip_code.sql is not needed: zip_code is included here).
--
-- Later migrations add to users: failed_login_attempts, locked_until (login_lockout.sql) and
-- address_line1, address_line2, city, state (users_mailing_address.sql).

do $$ begin
  create type public.account_role as enum ('customer', 'admin');
exception when duplicate_object then null; end $$;

do $$ begin
  create type public.account_status as enum ('active', 'inactive');
exception when duplicate_object then null; end $$;

-- One profile row per Supabase Auth user. The backend inserts it right after creating the auth user (no trigger).
create table if not exists public.users (
  id uuid primary key references auth.users (id) on delete cascade,
  first_name text not null,
  last_name text not null,
  email text not null unique,
  phone_number text,
  role public.account_role not null default 'customer',
  status public.account_status not null default 'active',
  created_at timestamptz not null default now(),
  zip_code text check (zip_code ~ '^[0-9]{5}$')
);

alter table public.users enable row level security;

drop policy if exists "Users can view own row" on public.users;
create policy "Users can view own row" on public.users
  for select to authenticated
  using ((select auth.uid()) = id);

-- Bank accounts. Balance changes only through the posting functions in backend/sql/transactions.sql.
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id) on delete restrict,
  account_number varchar(20) not null unique,
  account_type varchar(20) not null check (account_type in ('checking', 'savings')),
  balance numeric(15, 2) not null default 0 check (balance >= 0),
  status varchar(20) not null default 'activated' check (status in ('activated', 'deactivated')),
  created_at timestamptz not null default now(),
  closed_at timestamptz
);

create index if not exists accounts_user_id_idx on public.accounts (user_id);

alter table public.accounts enable row level security;

drop policy if exists "Users can view their own accounts" on public.accounts;
create policy "Users can view their own accounts" on public.accounts
  for select to authenticated
  using ((select auth.uid()) = user_id);
