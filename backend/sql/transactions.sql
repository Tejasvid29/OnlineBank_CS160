-- Transactions table and atomic posting functions.
-- Run once in the Supabase SQL editor (assumes public.users and public.accounts already exist).
--
-- amount is signed: credits are positive, debits are negative, so history can be summed or displayed directly.
-- The ledger is append-only: no UPDATE/DELETE policies exist, and the backend only inserts through the functions below.

create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id),
  customer_id uuid not null references public.users (id),
  transaction_type varchar(20) not null
    check (transaction_type in ('deposit', 'withdrawal', 'transfer')),
  amount numeric(12, 2) not null check (amount <> 0),
  status varchar(20) not null default 'completed'
    check (status in ('pending', 'completed', 'failed')),
  description varchar(255) not null default '',
  created_at timestamptz not null default now()
);

-- History is always read per account, newest first.
create index transactions_account_created_idx on public.transactions (account_id, created_at desc);
create index transactions_customer_idx on public.transactions (customer_id);

alter table public.transactions enable row level security;

create policy "Customers can view own transactions"
  on public.transactions for select to authenticated
  using ((select auth.uid()) = customer_id);

-- Deposit (positive p_amount) or withdrawal (negative p_amount) on one account, atomically.
create or replace function public.post_account_transaction(
  p_user_id uuid, p_account_id uuid, p_amount numeric, p_type text, p_description text
) returns public.transactions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  acct public.accounts;
  txn public.transactions;
begin
  select * into acct from public.accounts
    where id = p_account_id and user_id = p_user_id for update;
  if not found then raise exception 'account_not_found'; end if;
  if acct.status <> 'activated' then raise exception 'account_closed'; end if;
  if acct.balance + p_amount < 0 then raise exception 'insufficient_funds'; end if;

  update public.accounts set balance = balance + p_amount where id = p_account_id;
  insert into public.transactions (account_id, customer_id, transaction_type, amount, status, description)
    values (p_account_id, p_user_id, p_type, p_amount, 'completed', p_description)
    returning * into txn;
  return txn;
end;
$$;

-- Transfer between two of the caller's accounts: one debit row, one credit row, both balances, one transaction.
create or replace function public.post_transfer(
  p_user_id uuid, p_source_id uuid, p_dest_id uuid, p_amount numeric, p_description text
) returns setof public.transactions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  src public.accounts;
  dst public.accounts;
begin
  if p_source_id = p_dest_id then raise exception 'same_account'; end if;
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;

  -- Lock in id order so two opposite transfers cannot deadlock.
  perform 1 from public.accounts
    where id in (p_source_id, p_dest_id) and user_id = p_user_id order by id for update;
  select * into src from public.accounts where id = p_source_id and user_id = p_user_id;
  select * into dst from public.accounts where id = p_dest_id and user_id = p_user_id;
  if src.id is null or dst.id is null then raise exception 'account_not_found'; end if;
  if src.status <> 'activated' or dst.status <> 'activated' then raise exception 'account_closed'; end if;
  if src.balance < p_amount then raise exception 'insufficient_funds'; end if;

  update public.accounts set balance = balance - p_amount where id = src.id;
  update public.accounts set balance = balance + p_amount where id = dst.id;

  return query
    insert into public.transactions (account_id, customer_id, transaction_type, amount, status, description)
    values
      (src.id, p_user_id, 'transfer', -p_amount, 'completed',
        coalesce(nullif(p_description, ''), 'Transfer to ' || initcap(dst.account_type::text))),
      (dst.id, p_user_id, 'transfer', p_amount, 'completed',
        coalesce(nullif(p_description, ''), 'Transfer from ' || initcap(src.account_type::text)))
    returning *;
end;
$$;

-- Only the backend (secret key / service_role) may post money. Functions in public are executable by
-- everyone by default, so revoke that explicitly.
revoke execute on function public.post_account_transaction(uuid, uuid, numeric, text, text) from public, anon, authenticated;
revoke execute on function public.post_transfer(uuid, uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.post_account_transaction(uuid, uuid, numeric, text, text) to service_role;
grant execute on function public.post_transfer(uuid, uuid, uuid, numeric, text) to service_role;
