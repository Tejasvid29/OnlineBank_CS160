-- LOCAL DEV ONLY mock data. Runs after migrations on `supabase start` (first run) and `supabase db reset`,
-- or on demand via `.\scripts\supabase-local-sync.ps1 -Seed`. Safe to re-run: it skips if the manager already exists.
--
-- Logins (all emails are confirmed):
--   admin@gmail.com            12345678      manager (role = 'admin')
--   alice@example.com, bob@example.com, carol@example.com, dave@example.com    password123    customers

do $seed$
declare
  pw_admin text := extensions.crypt('12345678', extensions.gen_salt('bf'));
  pw_cust  text := extensions.crypt('password123', extensions.gen_salt('bf'));
  u record;
  admin_id uuid := '00000000-0000-4000-8000-000000000001';
  alice uuid := '00000000-0000-4000-8000-000000000011';
  bob   uuid := '00000000-0000-4000-8000-000000000012';
  carol uuid := '00000000-0000-4000-8000-000000000013';
  dave  uuid := '00000000-0000-4000-8000-000000000014';
  a_chk uuid := '10000000-0000-4000-8000-000000000011';
  a_sav uuid := '10000000-0000-4000-8000-000000000021';
  b_chk uuid := '10000000-0000-4000-8000-000000000012';
  c_chk uuid := '10000000-0000-4000-8000-000000000013';
  c_sav uuid := '10000000-0000-4000-8000-000000000023';
  d_chk uuid := '10000000-0000-4000-8000-000000000014';
  t_transfer_out uuid := gen_random_uuid();
begin
  if exists (select 1 from auth.users where email = 'admin@gmail.com') then
    raise notice 'seed: already seeded, skipping';
    return;
  end if;

  -- Auth users (GoTrue needs the token columns to be '' rather than null) + email identities
  for u in
    select * from (values
      (admin_id, 'admin@gmail.com',     pw_admin),
      (alice,    'alice@example.com',   pw_cust),
      (bob,      'bob@example.com',     pw_cust),
      (carol,    'carol@example.com',   pw_cust),
      (dave,     'dave@example.com',    pw_cust)
    ) as v(id, email, pw)
  loop
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change,
      email_change_token_current, phone_change, phone_change_token, reauthentication_token
    ) values (
      '00000000-0000-0000-0000-000000000000', u.id, 'authenticated', 'authenticated', u.email, u.pw, now(),
      '{"provider":"email","providers":["email"]}', '{}', now(), now(),
      '', '', '', '', '', '', '', ''
    );
    insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      gen_random_uuid(), u.id::text, u.id,
      jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true, 'phone_verified', false),
      'email', now(), now(), now()
    );
  end loop;

  -- App profiles. The manager is role 'admin' (what the backend's admin-only routes check).
  insert into public.users (id, first_name, last_name, email, phone_number, role, status, zip_code, address_line1, city, state) values
    (admin_id, 'Morgan', 'Manager',  'admin@gmail.com',   '4085550100', 'admin',    'active', '95192', '1 Washington Sq',   'San Jose',      'CA'),
    (alice,    'Alice',  'Johnson',  'alice@example.com', '4085550111', 'customer', 'active', '95112', '120 Main St',       'San Jose',      'CA'),
    (bob,      'Bob',    'Smith',    'bob@example.com',   '6505550122', 'customer', 'active', '94301', '45 University Ave', 'Palo Alto',     'CA'),
    (carol,    'Carol',  'Martinez', 'carol@example.com', '5105550133', 'customer', 'active', '94607', '800 Broadway',      'Oakland',       'CA'),
    (dave,     'Dave',   'Lee',      'dave@example.com',  '4155550144', 'customer', 'active', '94103', '9 Mission St',      'San Francisco', 'CA');

  insert into public.accounts (id, user_id, account_number, account_type, balance) values
    (a_chk, alice, '100000000011', 'checking', 0),
    (a_sav, alice, '100000000021', 'savings',  0),
    (b_chk, bob,   '100000000012', 'checking', 0),
    (c_chk, carol, '100000000013', 'checking', 0),
    (c_sav, carol, '100000000023', 'savings',  0),
    (d_chk, dave,  '100000000014', 'checking', 0);

  insert into public.transactions (account_id, customer_id, transaction_type, amount, status, description, created_at) values
    (a_chk, alice, 'deposit',    2500.00, 'completed', 'Payroll deposit',             now() - interval '25 days'),
    (a_chk, alice, 'withdrawal', -1200.00,'completed', 'Rent',                        now() - interval '22 days'),
    (a_chk, alice, 'withdrawal',   -85.40,'completed', 'Card purchase: Grocery Outlet', now() - interval '14 days'),
    (a_chk, alice, 'withdrawal',   -42.15,'completed', 'Card purchase: Shell',        now() - interval '9 days'),
    (a_chk, alice, 'withdrawal',   -60.00,'completed', 'ATM withdrawal: Main St',     now() - interval '5 days'),
    (a_sav, alice, 'deposit',    5000.00, 'completed', 'Opening deposit',             now() - interval '40 days'),
    (b_chk, bob,   'deposit',    1800.00, 'completed', 'Payroll deposit',             now() - interval '20 days'),
    (b_chk, bob,   'withdrawal',  -250.00,'completed', 'ATM withdrawal: University',  now() - interval '12 days'),
    (b_chk, bob,   'withdrawal',   -23.99,'completed', 'Card purchase: Spotify',      now() - interval '3 days'),
    (c_chk, carol, 'deposit',    3200.00, 'completed', 'Payroll deposit',             now() - interval '18 days'),
    (c_chk, carol, 'withdrawal',  -900.00,'completed', 'Bill payment: Landlord',      now() - interval '15 days'),
    (c_chk, carol, 'withdrawal',  -150.75,'completed', 'Card purchase: Costco',       now() - interval '6 days'),
    (c_sav, carol, 'deposit',   10000.00, 'completed', 'Opening deposit',             now() - interval '60 days'),
    (d_chk, dave,  'deposit',     750.50, 'completed', 'Payroll deposit',             now() - interval '10 days'),
    (d_chk, dave,  'withdrawal',  -120.00,'completed', 'Card purchase: Best Buy',     now() - interval '2 days');

  -- Alice moves 500 from checking to her savings (a transfer is a debit/credit pair)
  insert into public.transactions (id, account_id, customer_id, transaction_type, amount, status, description, created_at) values
    (t_transfer_out, a_chk, alice, 'transfer', -500.00, 'completed', 'Transfer to Savings',   now() - interval '7 days'),
    (gen_random_uuid(), a_sav, alice, 'transfer', 500.00, 'completed', 'Transfer from Checking', now() - interval '7 days');

  -- Balances = sum of completed transactions, so the ledger and balances always agree
  update public.accounts a set balance = coalesce(
    (select sum(t.amount) from public.transactions t where t.account_id = a.id and t.status = 'completed'), 0);

  insert into public.scheduled_payments (account_id, customer_id, recipient, amount, frequency, next_payment_date) values
    (a_chk, alice, 'PG&E Electric',  85.00, 'monthly', current_date + 10),
    (c_chk, carol, 'Comcast Internet', 60.00, 'monthly', current_date + 4),
    (b_chk, bob,   'Gym Membership', 29.99, 'weekly',  current_date + 3);

  insert into public.notifications (user_id, type, title, message, created_at) values
    (alice, 'deposit',      'Deposit received',       'Your payroll deposit of $2,500.00 posted to checking.', now() - interval '25 days'),
    (alice, 'transfer',     'Transfer complete',      'You moved $500.00 from checking to savings.',            now() - interval '7 days'),
    (carol, 'bill_payment', 'Bill paid',              'Your payment of $900.00 to Landlord was paid.',          now() - interval '15 days'),
    (bob,   'withdrawal',   'ATM withdrawal',         'You withdrew $250.00 at an ATM.',                        now() - interval '12 days');

  insert into public.audit_log (customer_id, actor_id, action, details) values
    (alice, admin_id, 'seed', '{"note":"local mock data"}');
end
$seed$;
