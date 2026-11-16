-- Purchases: a debit from a checking account on behalf of a merchant. Run once in the Supabase SQL editor after transactions.sql.
--
-- Same shape as post_atm_transaction: the checks run under the account row lock so two simultaneous
-- purchases cannot overspend. Checking accounts only, no overdraft. The ledger row is a 'withdrawal'
-- whose description the backend writes as 'Purchase: <merchant>'.

create or replace function public.post_purchase(
  p_user_id uuid, p_account_id uuid, p_amount numeric, p_description text
) returns public.transactions
language plpgsql
security invoker
set search_path = ''
as $$
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
$$;

revoke execute on function public.post_purchase(uuid, uuid, numeric, text) from public, anon, authenticated;
grant execute on function public.post_purchase(uuid, uuid, numeric, text) to service_role;
