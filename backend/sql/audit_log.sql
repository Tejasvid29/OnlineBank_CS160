-- Audit trail of changes to a customer's account, shown to managers. Run once in the Supabase SQL editor.
--
-- customer_id is the customer the event is about; actor_id is who did it (the customer, or later a manager).
-- details holds event-specific data, e.g. which profile fields changed. Never store passwords or tokens in it.

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references public.users (id),
  actor_id uuid references public.users (id),
  action varchar(40) not null,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_log_customer_idx on public.audit_log (customer_id, created_at desc);

-- Only the backend (secret key, which bypasses RLS) reads or writes this table.
alter table public.audit_log enable row level security;
