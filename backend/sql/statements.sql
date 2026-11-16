-- Account statements. Run once in the Supabase SQL editor after transactions.sql.
--
-- A statement is a saved snapshot of one account over a date range (UTC days): opening and closing balance, totals,
-- and every completed transaction with its running balance. Customers generate a month-to-date statement on demand;
-- a cron job writes the full-month statement for every open account on the last day of each month. The backend then
-- emails monthly statements that have emailed_at null and stamps emailed_at.

create table public.statements (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id),
  customer_id uuid not null references public.users (id),
  kind text not null check (kind in ('month_to_date', 'monthly')),
  period_start date not null,
  period_end date not null check (period_end >= period_start),
  opening_balance numeric(12, 2) not null,
  closing_balance numeric(12, 2) not null,
  total_deposits numeric(12, 2) not null,
  total_withdrawals numeric(12, 2) not null,
  transaction_count integer not null,
  transactions jsonb not null default '[]'::jsonb,
  generated_at timestamptz not null default now(),
  emailed_at timestamptz,
  unique (account_id, period_start, period_end)
);

create index statements_customer_idx on public.statements (customer_id, generated_at desc);
create index statements_unsent_idx on public.statements (generated_at) where kind = 'monthly' and emailed_at is null;

alter table public.statements enable row level security;

create policy "Customers can view own statements"
  on public.statements for select to authenticated
  using ((select auth.uid()) = customer_id);

-- Builds (or rebuilds) the statement for p_account_id from p_start to p_end inclusive. Regenerating the same period
-- replaces the earlier snapshot; a monthly statement is never downgraded to month_to_date, and emailed_at is kept.
create or replace function public.generate_statement(
  p_user_id uuid, p_account_id uuid, p_start date, p_end date, p_kind text
) returns public.statements
language plpgsql
security invoker
set search_path = ''
as $$
declare
  acct public.accounts;
  start_ts timestamptz := p_start::timestamp at time zone 'UTC';
  end_ts timestamptz := (p_end + 1)::timestamp at time zone 'UTC';
  after_period numeric;
  closing numeric;
  opening numeric;
  net numeric;
  deposits numeric;
  withdrawals numeric;
  txn_count integer;
  lines jsonb;
  stmt public.statements;
begin
  select * into acct from public.accounts where id = p_account_id and user_id = p_user_id;
  if not found then raise exception 'account_not_found'; end if;
  if p_end < p_start then raise exception 'invalid_period'; end if;

  -- Balance at the end of the period: today's balance minus everything that happened after it.
  select coalesce(sum(amount), 0) into after_period from public.transactions
    where account_id = p_account_id and status = 'completed' and created_at >= end_ts;
  closing := acct.balance - after_period;

  select coalesce(sum(amount), 0),
         coalesce(sum(amount) filter (where amount > 0), 0),
         coalesce(-sum(amount) filter (where amount < 0), 0),
         count(*)
    into net, deposits, withdrawals, txn_count
    from public.transactions
    where account_id = p_account_id and status = 'completed' and created_at >= start_ts and created_at < end_ts;
  opening := closing - net;

  select coalesce(jsonb_agg(jsonb_build_object(
           'date', t.created_at, 'description', t.description, 'type', t.transaction_type,
           'amount', t.amount, 'balance', opening + t.running) order by t.created_at, t.id), '[]'::jsonb)
    into lines
    from (
      select id, created_at, description, transaction_type, amount,
             sum(amount) over (order by created_at, id) as running
      from public.transactions
      where account_id = p_account_id and status = 'completed' and created_at >= start_ts and created_at < end_ts
    ) t;

  insert into public.statements (
    account_id, customer_id, kind, period_start, period_end, opening_balance, closing_balance,
    total_deposits, total_withdrawals, transaction_count, transactions
  ) values (
    p_account_id, p_user_id, p_kind, p_start, p_end, opening, closing, deposits, withdrawals, txn_count, lines
  )
  on conflict (account_id, period_start, period_end) do update set
    kind = case when public.statements.kind = 'monthly' then 'monthly' else excluded.kind end,
    opening_balance = excluded.opening_balance,
    closing_balance = excluded.closing_balance,
    total_deposits = excluded.total_deposits,
    total_withdrawals = excluded.total_withdrawals,
    transaction_count = excluded.transaction_count,
    transactions = excluded.transactions,
    generated_at = now()
  returning * into stmt;
  return stmt;
end;
$$;

-- On the last day of a month, writes that month's statement for every open account. Any other day it does nothing,
-- which lets cron run it on days 28-31 without needing a "last day of month" schedule. Returns the number written.
create or replace function public.generate_monthly_statements()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  acct record;
  written integer := 0;
begin
  if (current_date + 1) <> date_trunc('month', current_date + 1)::date then
    return 0;
  end if;
  for acct in select id, user_id from public.accounts where status = 'activated' loop
    perform public.generate_statement(
      acct.user_id, acct.id, date_trunc('month', current_date)::date, current_date, 'monthly');
    written := written + 1;
  end loop;
  return written;
end;
$$;

revoke execute on function public.generate_statement(uuid, uuid, date, date, text) from public, anon, authenticated;
grant execute on function public.generate_statement(uuid, uuid, date, date, text) to service_role;
revoke execute on function public.generate_monthly_statements() from public, anon, authenticated;
grant execute on function public.generate_monthly_statements() to service_role;

-- 23:55 UTC on days 28-31; the function itself skips every day that is not the last of the month.
create extension if not exists pg_cron;
select cron.schedule('monthly-statements', '55 23 28-31 * *', $$select public.generate_monthly_statements()$$);
