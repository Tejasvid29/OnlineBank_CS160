-- No self-review for review_check_deposit(). Run after check_deposit_review.sql. Safe to re-run.
--
-- A manager can't approve or reject a check they deposited themselves ('own_deposit').

begin;

create or replace function public.review_check_deposit(
  p_deposit_id uuid, p_reviewer_id uuid, p_decision text, p_notes text
) returns public.check_deposits
language plpgsql
security invoker
set search_path = ''
as $$
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
      update public.transactions set status = 'completed'
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
$$;

revoke all on function public.review_check_deposit(uuid, uuid, text, text) from public, anon, authenticated;
grant execute on function public.review_check_deposit(uuid, uuid, text, text) to service_role;

commit;
