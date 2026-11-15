-- In-app notifications (the bell). Run after transactions.sql, check_deposits.sql, scheduled_payments.sql and
-- statements.sql. Safe to re-run.
--
-- The backend writes most notifications (notifications.notify() in backend/notifications.py). Two jobs run inside the
-- database on pg_cron with no backend involved, so they write their own through public.add_notification():
--   process_due_payments()       a scheduled bill payment was paid, or failed;
--   generate_monthly_statements() a month-end statement is ready.
-- Both functions are redefined below with the same logic as before plus those calls; the cron jobs call them by name,
-- so they need no rescheduling.

begin;

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users (id),
  type varchar(20) not null
    check (type in ('deposit', 'withdrawal', 'transfer', 'bill_payment', 'check_deposit', 'account', 'statement')),
  title varchar(80) not null,
  message varchar(500) not null,
  transaction_id uuid references public.transactions (id),
  deposit_id uuid references public.check_deposits (id),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_created_idx on public.notifications (user_id, created_at desc);

-- Only the backend (secret key, which bypasses RLS) reads or writes this table, like check_deposits and audit_log.
alter table public.notifications enable row level security;

-- Best effort, like the backend's notify(): a failed insert is swallowed so it never rolls back the payment or
-- statement it describes.
create or replace function public.add_notification(
  p_user_id uuid, p_type text, p_title text, p_message text, p_transaction_id uuid default null
) returns void
language plpgsql
security invoker
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, type, title, message, transaction_id)
    values (p_user_id, p_type, p_title, left(p_message, 500), p_transaction_id);
exception when others then
  raise warning 'add_notification failed for %: %', p_user_id, sqlerrm;
end;
$$;

revoke execute on function public.add_notification(uuid, text, text, text, uuid) from public, anon, authenticated;
grant execute on function public.add_notification(uuid, text, text, text, uuid) to service_role;

-- Same as scheduled_payments.sql, plus a notification for each payment paid or failed.
create or replace function public.process_due_payments()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  due public.scheduled_payments;
  txn public.transactions;
  next_date date;
  processed integer := 0;
begin
  for due in
    select * from public.scheduled_payments
    where status = 'scheduled' and next_payment_date <= current_date
    order by next_payment_date
    for update skip locked
  loop
    begin
      txn := public.post_account_transaction(
        due.customer_id, due.account_id, -due.amount, 'withdrawal', 'Bill payment: ' || due.recipient);

      if due.frequency = 'once' then
        update public.scheduled_payments set status = 'completed' where id = due.id;
      else
        -- Skip past any missed cycles so a late run charges once, not once per missed cycle.
        next_date := due.next_payment_date;
        while next_date <= current_date loop
          next_date := case due.frequency
            when 'daily' then next_date + 1
            when 'weekly' then next_date + 7
            else (next_date + interval '1 month')::date
          end;
        end loop;
        update public.scheduled_payments set next_payment_date = next_date where id = due.id;
      end if;

      perform public.add_notification(due.customer_id, 'bill_payment', 'Bill paid',
        'Your scheduled payment of ' || to_char(due.amount, 'FM$999,999,990.00') || ' to ' || due.recipient || ' was paid.',
        txn.id);
    exception when others then
      -- The sub-transaction rolled back any partial withdrawal.
      update public.scheduled_payments set status = 'failed' where id = due.id;
      perform public.add_notification(due.customer_id, 'bill_payment', 'Bill payment failed',
        'Your scheduled payment of ' || to_char(due.amount, 'FM$999,999,990.00') || ' to ' || due.recipient
          || ' could not be paid. Check your balance, then schedule it again.');
    end;
    processed := processed + 1;
  end loop;
  return processed;
end;
$$;

revoke execute on function public.process_due_payments() from public, anon, authenticated;
grant execute on function public.process_due_payments() to service_role;

-- Same as statements.sql, plus a "statement ready" notification per account.
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
  for acct in select id, user_id, account_type, account_number from public.accounts where status = 'activated' loop
    perform public.generate_statement(
      acct.user_id, acct.id, date_trunc('month', current_date)::date, current_date, 'monthly');
    perform public.add_notification(acct.user_id, 'statement', 'Statement ready',
      'Your ' || to_char(current_date, 'FMMonth YYYY') || ' statement for your ' || acct.account_type
        || ' account ending ' || right(acct.account_number, 4) || ' is ready under Statements.');
    written := written + 1;
  end loop;
  return written;
end;
$$;

revoke execute on function public.generate_monthly_statements() from public, anon, authenticated;
grant execute on function public.generate_monthly_statements() to service_role;

commit;
