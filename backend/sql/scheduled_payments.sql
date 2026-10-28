-- Scheduled (recurring) bill payments. Run once in the Supabase SQL editor after transactions.sql.
--
-- A payment is paid from account_id on next_payment_date. 'once' payments finish as 'completed'; recurring ones
-- move next_payment_date forward. Each payment becomes a 'withdrawal' row in the transactions ledger.

create table public.scheduled_payments (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.accounts (id),
  customer_id uuid not null references public.users (id),
  recipient varchar(100) not null,
  amount numeric(12, 2) not null check (amount > 0),
  frequency varchar(20) not null
    check (frequency in ('once', 'daily', 'weekly', 'monthly')),
  next_payment_date date not null,
  status varchar(20) not null default 'scheduled'
    check (status in ('scheduled', 'completed', 'canceled', 'failed')),
  created_at timestamptz not null default now()
);

create index scheduled_payments_due_idx on public.scheduled_payments (status, next_payment_date);
create index scheduled_payments_customer_idx on public.scheduled_payments (customer_id);
create index scheduled_payments_account_idx on public.scheduled_payments (account_id);

alter table public.scheduled_payments enable row level security;

create policy "Customers can view own scheduled payments"
  on public.scheduled_payments for select to authenticated
  using ((select auth.uid()) = customer_id);

-- Pays every due payment and returns how many were processed. A payment that cannot be paid (insufficient funds,
-- closed account) is marked 'failed' without affecting the others.
create or replace function public.process_due_payments()
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  due public.scheduled_payments;
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
      perform public.post_account_transaction(
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
    exception when others then
      -- The sub-transaction rolled back any partial withdrawal.
      update public.scheduled_payments set status = 'failed' where id = due.id;
    end;
    processed := processed + 1;
  end loop;
  return processed;
end;
$$;

revoke execute on function public.process_due_payments() from public, anon, authenticated;
grant execute on function public.process_due_payments() to service_role;

-- Run every day at 08:00 UTC.
create extension if not exists pg_cron;
select cron.schedule('process-due-payments', '0 8 * * *', $$select public.process_due_payments()$$);
