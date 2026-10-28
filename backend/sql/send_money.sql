-- Customer-to-customer transfers. Run once in the Supabase SQL editor after transactions.sql.
--
-- The sender picks one of their own accounts and types the recipient's account number. Both balances change and
-- two ledger rows are written in one transaction: the debit under the sender, the credit under the recipient,
-- so each customer sees it in their own history.

create or replace function public.post_customer_transfer(
  p_user_id uuid, p_source_id uuid, p_recipient_number text, p_amount numeric, p_description text
) returns public.transactions
language plpgsql
security invoker
set search_path = ''
as $$
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

  -- Lock in id order so two opposite transfers cannot deadlock.
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
$$;

revoke execute on function public.post_customer_transfer(uuid, uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.post_customer_transfer(uuid, uuid, text, numeric, text) to service_role;
