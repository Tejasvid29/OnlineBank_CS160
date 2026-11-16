-- Baseline of the remote project's structure (no data), captured read-only via the Supabase MCP on 2026-11-16.
-- Covers: enums, tables, constraints, indexes, RLS + policies, functions, grants, ensure_rls event trigger,
-- pg_cron jobs, and the check-deposits storage bucket. Edge functions: none are deployed remotely.

set check_function_bodies = off;

-- 1. Enums
create type public.account_role as enum ('customer', 'admin');
create type public.account_status as enum ('active', 'inactive');

-- 2. Tables
create table public.users (
  id uuid not null,
  first_name text not null,
  last_name text not null,
  email text not null,
  phone_number text,
  role account_role not null default 'customer'::account_role,
  status account_status not null default 'active'::account_status,
  created_at timestamp with time zone not null default now(),
  zip_code text,
  failed_login_attempts integer not null default 0,
  locked_until timestamp with time zone,
  address_line1 character varying(100),
  address_line2 character varying(100),
  city character varying(60),
  state character(2)
);

create table public.accounts (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  account_number character varying(20) not null,
  account_type character varying(20) not null,
  balance numeric(15,2) not null default 0,
  status character varying(20) not null default 'activated'::character varying,
  created_at timestamp with time zone not null default now(),
  closed_at timestamp with time zone
);

create table public.audit_log (
  id uuid not null default gen_random_uuid(),
  customer_id uuid not null,
  actor_id uuid,
  action character varying(40) not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamp with time zone not null default now()
);

create table public.transactions (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null,
  customer_id uuid not null,
  transaction_type character varying(20) not null,
  amount numeric(12,2) not null,
  status character varying(20) not null default 'completed'::character varying,
  description character varying(255) not null default ''::character varying,
  created_at timestamp with time zone not null default now()
);

create table public.check_deposits (
  id uuid not null,
  customer_id uuid not null,
  account_id uuid not null,
  amount numeric(12,2) not null,
  status text not null default 'pending'::text,
  front_image_path text not null,
  back_image_path text not null,
  front_sha256 character(64) not null,
  back_sha256 character(64) not null,
  transaction_id uuid,
  routing_number text,
  check_number text,
  extracted_amount numeric(12,2),
  review_notes text,
  created_at timestamp with time zone not null default now(),
  reviewed_at timestamp with time zone,
  reviewed_by uuid
);

create table public.notifications (
  id uuid not null default gen_random_uuid(),
  user_id uuid not null,
  type character varying(20) not null,
  title character varying(80) not null,
  message character varying(500) not null,
  transaction_id uuid,
  deposit_id uuid,
  read_at timestamp with time zone,
  created_at timestamp with time zone not null default now()
);

create table public.scheduled_payments (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null,
  customer_id uuid not null,
  recipient character varying(100) not null,
  amount numeric(12,2) not null,
  frequency character varying(20) not null,
  next_payment_date date not null,
  status character varying(20) not null default 'scheduled'::character varying,
  created_at timestamp with time zone not null default now()
);

create table public.statements (
  id uuid not null default gen_random_uuid(),
  account_id uuid not null,
  customer_id uuid not null,
  kind text not null,
  period_start date not null,
  period_end date not null,
  opening_balance numeric(12,2) not null,
  closing_balance numeric(12,2) not null,
  total_deposits numeric(12,2) not null,
  total_withdrawals numeric(12,2) not null,
  transaction_count integer not null,
  transactions jsonb not null default '[]'::jsonb,
  generated_at timestamp with time zone not null default now(),
  emailed_at timestamp with time zone
);

-- 3. Constraints (primary keys, unique, check, then foreign keys)
alter table public.users add constraint accounts_pkey PRIMARY KEY (id);
alter table public.accounts add constraint accounts_pkey1 PRIMARY KEY (id);
alter table public.audit_log add constraint audit_log_pkey PRIMARY KEY (id);
alter table public.check_deposits add constraint check_deposits_pkey PRIMARY KEY (id);
alter table public.notifications add constraint notifications_pkey PRIMARY KEY (id);
alter table public.scheduled_payments add constraint scheduled_payments_pkey PRIMARY KEY (id);
alter table public.statements add constraint statements_pkey PRIMARY KEY (id);
alter table public.transactions add constraint transactions_pkey PRIMARY KEY (id);

alter table public.accounts add constraint accounts_account_number_key UNIQUE (account_number);
alter table public.users add constraint accounts_email_key UNIQUE (email);
alter table public.check_deposits add constraint check_deposits_transaction_id_key UNIQUE (transaction_id);
alter table public.statements add constraint statements_account_id_period_start_period_end_key UNIQUE (account_id, period_start, period_end);
alter table public.check_deposits add constraint unique_check_photos UNIQUE (customer_id, front_sha256, back_sha256);

alter table public.accounts add constraint accounts_account_type_check CHECK (((account_type)::text = ANY ((ARRAY['checking'::character varying, 'savings'::character varying])::text[])));
alter table public.accounts add constraint accounts_balance_check CHECK ((balance >= (0)::numeric));
alter table public.accounts add constraint accounts_status_check CHECK (((status)::text = ANY ((ARRAY['activated'::character varying, 'deactivated'::character varying])::text[])));
alter table public.check_deposits add constraint check_deposits_amount_check CHECK ((amount > (0)::numeric));
alter table public.check_deposits add constraint check_deposits_status_check CHECK ((status = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text])));
alter table public.check_deposits add constraint distinct_check_sides CHECK ((front_sha256 <> back_sha256));
alter table public.notifications add constraint notifications_type_check CHECK (((type)::text = ANY ((ARRAY['deposit'::character varying, 'withdrawal'::character varying, 'transfer'::character varying, 'bill_payment'::character varying, 'check_deposit'::character varying, 'account'::character varying, 'statement'::character varying])::text[])));
alter table public.scheduled_payments add constraint scheduled_payments_amount_check CHECK ((amount > (0)::numeric));
alter table public.scheduled_payments add constraint scheduled_payments_frequency_check CHECK (((frequency)::text = ANY ((ARRAY['once'::character varying, 'daily'::character varying, 'weekly'::character varying, 'monthly'::character varying])::text[])));
alter table public.scheduled_payments add constraint scheduled_payments_status_check CHECK (((status)::text = ANY ((ARRAY['scheduled'::character varying, 'completed'::character varying, 'canceled'::character varying, 'failed'::character varying])::text[])));
alter table public.statements add constraint statements_check CHECK ((period_end >= period_start));
alter table public.statements add constraint statements_kind_check CHECK ((kind = ANY (ARRAY['month_to_date'::text, 'monthly'::text])));
alter table public.transactions add constraint transactions_amount_check CHECK ((amount <> (0)::numeric));
alter table public.transactions add constraint transactions_status_check CHECK (((status)::text = ANY ((ARRAY['pending'::character varying, 'completed'::character varying, 'failed'::character varying])::text[])));
alter table public.transactions add constraint transactions_transaction_type_check CHECK (((transaction_type)::text = ANY ((ARRAY['deposit'::character varying, 'withdrawal'::character varying, 'transfer'::character varying])::text[])));
alter table public.users add constraint users_state_format CHECK (((state IS NULL) OR (state ~ '^[A-Z]{2}$'::text)));
alter table public.users add constraint users_zip_code_check CHECK ((zip_code ~ '^[0-9]{5}$'::text));

alter table public.users add constraint accounts_id_fkey FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
alter table public.accounts add constraint accounts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id) ON DELETE RESTRICT;
alter table public.audit_log add constraint audit_log_actor_id_fkey FOREIGN KEY (actor_id) REFERENCES public.users(id);
alter table public.audit_log add constraint audit_log_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id);
alter table public.transactions add constraint transactions_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);
alter table public.transactions add constraint transactions_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id);
alter table public.check_deposits add constraint check_deposits_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);
alter table public.check_deposits add constraint check_deposits_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id);
alter table public.check_deposits add constraint check_deposits_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.users(id);
alter table public.check_deposits add constraint check_deposits_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
alter table public.notifications add constraint notifications_deposit_id_fkey FOREIGN KEY (deposit_id) REFERENCES public.check_deposits(id);
alter table public.notifications add constraint notifications_transaction_id_fkey FOREIGN KEY (transaction_id) REFERENCES public.transactions(id);
alter table public.notifications add constraint notifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);
alter table public.scheduled_payments add constraint scheduled_payments_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);
alter table public.scheduled_payments add constraint scheduled_payments_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id);
alter table public.statements add constraint statements_account_id_fkey FOREIGN KEY (account_id) REFERENCES public.accounts(id);
alter table public.statements add constraint statements_customer_id_fkey FOREIGN KEY (customer_id) REFERENCES public.users(id);

-- 4. Indexes
CREATE INDEX accounts_user_id_idx ON public.accounts USING btree (user_id);
CREATE INDEX audit_log_customer_idx ON public.audit_log USING btree (customer_id, created_at DESC);
CREATE INDEX check_deposits_customer_created_idx ON public.check_deposits USING btree (customer_id, created_at DESC);
CREATE INDEX check_deposits_status_created_idx ON public.check_deposits USING btree (status, created_at);
CREATE INDEX notifications_user_created_idx ON public.notifications USING btree (user_id, created_at DESC);
CREATE INDEX scheduled_payments_account_idx ON public.scheduled_payments USING btree (account_id);
CREATE INDEX scheduled_payments_customer_idx ON public.scheduled_payments USING btree (customer_id);
CREATE INDEX scheduled_payments_due_idx ON public.scheduled_payments USING btree (status, next_payment_date);
CREATE INDEX statements_customer_idx ON public.statements USING btree (customer_id, generated_at DESC);
CREATE INDEX statements_unsent_idx ON public.statements USING btree (generated_at) WHERE ((kind = 'monthly'::text) AND (emailed_at IS NULL));
CREATE INDEX transactions_account_created_idx ON public.transactions USING btree (account_id, created_at DESC);
CREATE INDEX transactions_customer_idx ON public.transactions USING btree (customer_id);

-- 5. Row level security and policies (the backend uses the secret key, which bypasses RLS)
alter table public.users enable row level security;
alter table public.accounts enable row level security;
alter table public.audit_log enable row level security;
alter table public.transactions enable row level security;
alter table public.check_deposits enable row level security;
alter table public.notifications enable row level security;
alter table public.scheduled_payments enable row level security;
alter table public.statements enable row level security;

create policy "Users can view their own accounts" on public.accounts as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = user_id));
create policy "Customers can view own scheduled payments" on public.scheduled_payments as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = customer_id));
create policy "Customers can view own statements" on public.statements as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = customer_id));
create policy "Customers can view own transactions" on public.transactions as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = customer_id));
create policy "Users can view own row" on public.users as PERMISSIVE for SELECT to authenticated using ((( SELECT auth.uid() AS uid) = id));

-- 6. Functions
CREATE OR REPLACE FUNCTION public.add_notification(p_user_id uuid, p_type text, p_title text, p_message text, p_transaction_id uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
begin
  insert into public.notifications (user_id, type, title, message, transaction_id)
    values (p_user_id, p_type, p_title, left(p_message, 500), p_transaction_id);
exception when others then
  raise warning 'add_notification failed for %: %', p_user_id, sqlerrm;
end;
$function$;

CREATE OR REPLACE FUNCTION public.generate_statement(p_user_id uuid, p_account_id uuid, p_start date, p_end date, p_kind text)
 RETURNS statements
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.generate_monthly_statements()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.post_account_transaction(p_user_id uuid, p_account_id uuid, p_amount numeric, p_type text, p_description text)
 RETURNS transactions
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.pay_bill_now(p_user_id uuid, p_account_id uuid, p_recipient text, p_amount numeric)
 RETURNS scheduled_payments
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  paid public.scheduled_payments;
begin
  perform public.post_account_transaction(
    p_user_id, p_account_id, -p_amount, 'withdrawal', 'Bill payment: ' || p_recipient);
  insert into public.scheduled_payments (account_id, customer_id, recipient, amount, frequency, next_payment_date, status)
    values (p_account_id, p_user_id, p_recipient, p_amount, 'once', current_date, 'completed')
    returning * into paid;
  return paid;
end;
$function$;

CREATE OR REPLACE FUNCTION public.post_atm_transaction(p_user_id uuid, p_account_id uuid, p_amount numeric, p_type text, p_description text, p_daily_limit numeric)
 RETURNS transactions
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  acct public.accounts;
  txn public.transactions;
  withdrawn_today numeric;
begin
  select * into acct from public.accounts
    where id = p_account_id and user_id = p_user_id for update;
  if not found then raise exception 'account_not_found'; end if;
  if acct.status <> 'activated' then raise exception 'account_closed'; end if;
  if acct.account_type <> 'checking' then raise exception 'not_checking_account'; end if;

  if p_amount < 0 then
    if acct.balance + p_amount < 0 then raise exception 'insufficient_funds'; end if;
    select coalesce(sum(-amount), 0) into withdrawn_today from public.transactions
      where account_id = p_account_id
        and transaction_type = 'withdrawal'
        and status = 'completed'
        and description like 'ATM withdrawal%'
        and created_at > now() - interval '24 hours';
    if withdrawn_today - p_amount > p_daily_limit then raise exception 'daily_limit_exceeded'; end if;
  end if;

  update public.accounts set balance = balance + p_amount where id = p_account_id;
  insert into public.transactions (account_id, customer_id, transaction_type, amount, status, description)
    values (p_account_id, p_user_id, p_type, p_amount, 'completed', p_description)
    returning * into txn;
  return txn;
end;
$function$;

CREATE OR REPLACE FUNCTION public.post_card_transaction(p_user_id uuid, p_account_id uuid, p_amount numeric, p_description text)
 RETURNS transactions
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  acct public.accounts;
  txn public.transactions;
begin
  if p_amount = 0 then raise exception 'invalid_amount'; end if;

  select * into acct from public.accounts
    where id = p_account_id and user_id = p_user_id for update;
  if not found then raise exception 'account_not_found'; end if;
  if acct.status <> 'activated' then raise exception 'account_closed'; end if;
  if acct.account_type <> 'checking' then raise exception 'not_checking_account'; end if;
  if acct.balance + p_amount < 0 then raise exception 'insufficient_funds'; end if;

  update public.accounts set balance = balance + p_amount where id = p_account_id;
  insert into public.transactions (account_id, customer_id, transaction_type, amount, status, description)
    values (p_account_id, p_user_id, case when p_amount > 0 then 'deposit' else 'withdrawal' end,
            p_amount, 'completed', p_description)
    returning * into txn;
  return txn;
end;
$function$;

CREATE OR REPLACE FUNCTION public.post_card_transaction_v2(p_user_id uuid, p_account_id uuid, p_amount numeric, p_description text, p_daily_limit numeric)
 RETURNS transactions
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  acct public.accounts;
  txn public.transactions;
  withdrawn_today numeric;
begin
  if p_amount = 0 then raise exception 'invalid_amount'; end if;

  select * into acct from public.accounts
    where id = p_account_id and user_id = p_user_id for update;
  if not found then raise exception 'account_not_found'; end if;
  if acct.status <> 'activated' then raise exception 'account_closed'; end if;
  if acct.account_type <> 'checking' then raise exception 'not_checking_account'; end if;
  if acct.balance + p_amount < 0 then raise exception 'insufficient_funds'; end if;

  if p_amount < 0 then
    select coalesce(sum(-amount), 0) into withdrawn_today from public.transactions
      where account_id = p_account_id
        and transaction_type = 'withdrawal'
        and status = 'completed'
        and description like 'Card withdrawal:%'
        and created_at > now() - interval '24 hours';
    if withdrawn_today - p_amount > p_daily_limit then raise exception 'card_limit_exceeded'; end if;
  end if;

  update public.accounts set balance = balance + p_amount where id = p_account_id;
  insert into public.transactions (account_id, customer_id, transaction_type, amount, status, description)
    values (p_account_id, p_user_id, case when p_amount > 0 then 'deposit' else 'withdrawal' end,
            p_amount, 'completed', p_description)
    returning * into txn;
  return txn;
end;
$function$;

CREATE OR REPLACE FUNCTION public.post_customer_transfer(p_user_id uuid, p_source_id uuid, p_recipient_number text, p_amount numeric, p_description text)
 RETURNS transactions
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  dest_id uuid;
  src public.accounts;
  dst public.accounts;
  sender public.users;
  debit public.transactions;
begin
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;

  select id into dest_id from public.accounts where account_number = p_recipient_number;
  if dest_id is null then raise exception 'recipient_not_found'; end if;
  if dest_id = p_source_id then raise exception 'same_account'; end if;

  perform 1 from public.accounts where id in (p_source_id, dest_id) order by id for update;
  select * into src from public.accounts where id = p_source_id and user_id = p_user_id;
  select * into dst from public.accounts where id = dest_id;
  if src.id is null then raise exception 'account_not_found'; end if;
  if dst.user_id = p_user_id then raise exception 'own_account'; end if;
  if src.status <> 'activated' then raise exception 'account_closed'; end if;
  if dst.status <> 'activated' then raise exception 'recipient_not_found'; end if;
  if src.balance < p_amount then raise exception 'insufficient_funds'; end if;

  select * into sender from public.users where id = p_user_id;

  update public.accounts set balance = balance - p_amount where id = src.id;
  update public.accounts set balance = balance + p_amount where id = dst.id;

  insert into public.transactions (account_id, customer_id, transaction_type, amount, status, description)
    values (src.id, p_user_id, 'transfer', -p_amount, 'completed',
      coalesce(nullif(p_description, ''), 'Sent to account ending ' || right(dst.account_number, 4)))
    returning * into debit;
  insert into public.transactions (account_id, customer_id, transaction_type, amount, status, description)
    values (dst.id, dst.user_id, 'transfer', p_amount, 'completed',
      coalesce(nullif(p_description, ''), 'Received from ' || sender.first_name || ' ' || left(sender.last_name, 1) || '.'));

  return debit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.post_purchase(p_user_id uuid, p_account_id uuid, p_amount numeric, p_description text)
 RETURNS transactions
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  acct public.accounts;
  txn public.transactions;
begin
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;

  select * into acct from public.accounts
    where id = p_account_id and user_id = p_user_id for update;
  if not found then raise exception 'account_not_found'; end if;
  if acct.status <> 'activated' then raise exception 'account_closed'; end if;
  if acct.account_type <> 'checking' then raise exception 'not_checking_account'; end if;
  if acct.balance - p_amount < 0 then raise exception 'insufficient_funds'; end if;

  update public.accounts set balance = balance - p_amount where id = p_account_id;
  insert into public.transactions (account_id, customer_id, transaction_type, amount, status, description)
    values (p_account_id, p_user_id, 'withdrawal', -p_amount, 'completed', p_description)
    returning * into txn;
  return txn;
end;
$function$;

CREATE OR REPLACE FUNCTION public.post_transfer(p_user_id uuid, p_source_id uuid, p_dest_id uuid, p_amount numeric, p_description text)
 RETURNS SETOF transactions
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  src public.accounts;
  dst public.accounts;
begin
  if p_source_id = p_dest_id then raise exception 'same_account'; end if;
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;

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
$function$;

CREATE OR REPLACE FUNCTION public.process_due_payments()
 RETURNS integer
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.record_failed_login(p_user_id uuid, p_max_attempts integer, p_lock_seconds integer)
 RETURNS timestamp with time zone
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  attempts integer;
  lock_until timestamptz;
begin
  select case when locked_until is not null and locked_until <= now() then 0 else failed_login_attempts end
    into attempts
    from public.users
    where id = p_user_id
    for update;

  if not found then
    return null;
  end if;

  attempts := attempts + 1;
  if attempts >= p_max_attempts then
    lock_until := now() + make_interval(secs => p_lock_seconds);
    update public.users set failed_login_attempts = 0, locked_until = lock_until where id = p_user_id;
    return lock_until;
  end if;

  update public.users set failed_login_attempts = attempts, locked_until = null where id = p_user_id;
  return null;
end;
$function$;

CREATE OR REPLACE FUNCTION public.review_check_deposit(p_deposit_id uuid, p_reviewer_id uuid, p_decision text, p_notes text)
 RETURNS check_deposits
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare
  deposit public.check_deposits;
  acct public.accounts;
  notes text := nullif(btrim(coalesce(p_notes, '')), '');
begin
  if p_decision not in ('approve', 'reject') then raise exception 'invalid_decision'; end if;
  if p_decision = 'reject' and notes is null then raise exception 'notes_required'; end if;

  select * into deposit from public.check_deposits where id = p_deposit_id for update;
  if not found then raise exception 'deposit_not_found'; end if;
  if deposit.customer_id = p_reviewer_id then raise exception 'own_deposit'; end if;
  if deposit.status <> 'pending' then raise exception 'already_reviewed'; end if;

  if p_decision = 'approve' then
    select * into acct from public.accounts where id = deposit.account_id for update;
    if not found then raise exception 'account_not_found'; end if;
    if acct.status <> 'activated' then raise exception 'account_closed'; end if;

    update public.accounts set balance = balance + deposit.amount where id = acct.id;
    if deposit.transaction_id is null then
      insert into public.transactions (account_id, customer_id, transaction_type, amount, status, description)
        values (deposit.account_id, deposit.customer_id, 'deposit', deposit.amount, 'completed', 'Mobile check deposit')
        returning id into deposit.transaction_id;
    else
      update public.transactions set status = 'completed', created_at = now()
        where id = deposit.transaction_id and status = 'pending';
      if not found then raise exception 'transaction_not_pending'; end if;
    end if;
  elsif deposit.transaction_id is not null then
    update public.transactions set status = 'failed'
      where id = deposit.transaction_id and status = 'pending';
    if not found then raise exception 'transaction_not_pending'; end if;
  end if;

  update public.check_deposits
    set status = case when p_decision = 'approve' then 'approved' else 'rejected' end,
        transaction_id = deposit.transaction_id,
        review_notes = notes,
        reviewed_by = p_reviewer_id,
        reviewed_at = now()
    where id = p_deposit_id
    returning * into deposit;
  return deposit;
end;
$function$;

CREATE OR REPLACE FUNCTION public.submit_check_deposit(p_deposit_id uuid, p_user_id uuid, p_account_id uuid, p_amount numeric, p_front_path text, p_back_path text, p_front_sha256 text, p_back_sha256 text)
 RETURNS check_deposits
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.rls_auto_enable()
 RETURNS event_trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog'
AS $function$
DECLARE
  cmd record;
BEGIN
  FOR cmd IN
    SELECT *
    FROM pg_event_trigger_ddl_commands()
    WHERE command_tag IN ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
      AND object_type IN ('table','partitioned table')
  LOOP
     IF cmd.schema_name IS NOT NULL AND cmd.schema_name IN ('public') AND cmd.schema_name NOT IN ('pg_catalog','information_schema') AND cmd.schema_name NOT LIKE 'pg_toast%' AND cmd.schema_name NOT LIKE 'pg_temp%' THEN
      BEGIN
        EXECUTE format('alter table if exists %s enable row level security', cmd.object_identity);
        RAISE LOG 'rls_auto_enable: enabled RLS on %', cmd.object_identity;
      EXCEPTION
        WHEN OTHERS THEN
          RAISE LOG 'rls_auto_enable: failed to enable RLS on %', cmd.object_identity;
      END;
     ELSE
        RAISE LOG 'rls_auto_enable: skip % (either system schema or not in enforced list: %.)', cmd.object_identity, cmd.schema_name;
     END IF;
  END LOOP;
END;
$function$;

-- 7. Grants: remote exposes the RPC functions only to postgres + service_role, and check_deposits only to service_role.
-- (Supabase default privileges would otherwise grant anon/authenticated on new objects in public.)
revoke all on all functions in schema public from public, anon, authenticated;
grant execute on all functions in schema public to postgres, service_role;
grant execute on function public.rls_auto_enable() to public, anon, authenticated;
revoke all on table public.check_deposits from anon, authenticated;

-- 8. Event trigger: auto-enable RLS on new tables in public
create event trigger ensure_rls on ddl_command_end
  when tag in ('CREATE TABLE', 'CREATE TABLE AS', 'SELECT INTO')
  execute function public.rls_auto_enable();

-- 9. pg_cron jobs
create extension if not exists pg_cron;
select cron.schedule('process-due-payments', '*/5 * * * *', 'select public.process_due_payments()');
select cron.schedule('monthly-statements', '55 23 28-31 * *', 'select public.generate_monthly_statements()');

-- 10. Storage bucket (settings only, no files)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('check-deposits', 'check-deposits', false, 10485760, '{image/jpeg}'::text[])
on conflict (id) do update set public = excluded.public, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;
