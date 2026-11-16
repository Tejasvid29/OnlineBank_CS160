-- ATM deposits and withdrawals. Run once in the Supabase SQL editor after transactions.sql.
--
-- Same shape as post_account_transaction, plus the ATM-only rules, all checked under the account row lock so two
-- simultaneous requests cannot overspend: checking accounts only, no overdraft, and a rolling 24-hour withdrawal limit.
-- ATM rows are the withdrawals whose description starts with 'ATM withdrawal'; the backend writes that prefix.

create or replace function public.post_atm_transaction(
  p_user_id uuid, p_account_id uuid, p_amount numeric, p_type text, p_description text, p_daily_limit numeric
) returns public.transactions
language plpgsql
security invoker
set search_path = ''
as $$
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
$$;

revoke execute on function public.post_atm_transaction(uuid, uuid, numeric, text, text, numeric) from public, anon, authenticated;
grant execute on function public.post_atm_transaction(uuid, uuid, numeric, text, text, numeric) to service_role;
