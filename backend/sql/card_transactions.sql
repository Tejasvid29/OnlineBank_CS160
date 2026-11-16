-- Debit card withdrawals and deposits for external apps. Run once in the Supabase SQL editor after transactions.sql.
--
-- p_amount is signed: negative withdraws, positive deposits. Everything is checked under the account row lock so
-- two simultaneous withdrawals cannot overspend: checking accounts only, a withdrawal can never exceed the balance,
-- and card withdrawals are capped at p_daily_limit in any rolling 24 hours (rows whose description starts
-- 'Card withdrawal:'; the backend writes that prefix). Deposits have no limit.

create or replace function public.post_card_transaction_v2(
  p_user_id uuid, p_account_id uuid, p_amount numeric, p_description text, p_daily_limit numeric
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
$$;

revoke execute on function public.post_card_transaction_v2(uuid, uuid, numeric, text, numeric) from public, anon, authenticated;
grant execute on function public.post_card_transaction_v2(uuid, uuid, numeric, text, numeric) to service_role;
