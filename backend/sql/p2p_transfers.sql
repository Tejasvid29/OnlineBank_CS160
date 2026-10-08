-- Customer-to-customer (Zelle-style) transfers. Run once in the Supabase SQL editor after transactions.sql.
-- The recipient is identified by email. The money lands in their oldest activated checking account
-- (or their oldest activated account of any type if they have no checking account).

create or replace function public.post_p2p_transfer(
  p_sender_id uuid, p_source_id uuid, p_recipient_email text, p_amount numeric, p_description text
) returns setof public.transactions
language plpgsql
security invoker
set search_path = ''
as $$
declare
  sender public.users;
  recipient public.users;
  src public.accounts;
  dst public.accounts;
  dst_id uuid;
  note text := coalesce(nullif(btrim(p_description), ''), '');
begin
  if p_amount <= 0 then raise exception 'invalid_amount'; end if;

  select * into recipient from public.users
    where lower(email) = lower(btrim(p_recipient_email)) and status::text = 'active';
  if not found then raise exception 'recipient_not_found'; end if;
  if recipient.id = p_sender_id then raise exception 'same_customer'; end if;
  select * into sender from public.users where id = p_sender_id;

  select id into dst_id from public.accounts
    where user_id = recipient.id and status::text = 'activated'
    order by (account_type::text = 'checking') desc, created_at, id
    limit 1;
  if dst_id is null then raise exception 'recipient_not_found'; end if;

  -- Lock both accounts in id order so two opposite transfers cannot deadlock.
  perform 1 from public.accounts
    where id in (p_source_id, dst_id) order by id for update;
  select * into src from public.accounts where id = p_source_id and user_id = p_sender_id;
  if src.id is null then raise exception 'account_not_found'; end if;
  -- Re-read after locking: the recipient account may have been closed in the meantime.
  select * into dst from public.accounts where id = dst_id;
  if src.status::text <> 'activated' then raise exception 'account_closed'; end if;
  if dst.status::text <> 'activated' then raise exception 'recipient_not_found'; end if;
  if src.balance < p_amount then raise exception 'insufficient_funds'; end if;

  update public.accounts set balance = balance - p_amount where id = src.id;
  update public.accounts set balance = balance + p_amount where id = dst.id;

  return query
    insert into public.transactions (account_id, customer_id, transaction_type, amount, status, description)
    values
      (src.id, p_sender_id, 'transfer', -p_amount, 'completed',
        left('Sent to ' || recipient.first_name || ' ' || left(recipient.last_name, 1) || '.'
             || case when note <> '' then ' - ' || note else '' end, 255)),
      (dst.id, recipient.id, 'transfer', p_amount, 'completed',
        left('Received from ' || sender.first_name || ' ' || left(sender.last_name, 1) || '.'
             || case when note <> '' then ' - ' || note else '' end, 255))
    returning *;
end;
$$;

revoke execute on function public.post_p2p_transfer(uuid, uuid, text, numeric, text) from public, anon, authenticated;
grant execute on function public.post_p2p_transfer(uuid, uuid, text, numeric, text) to service_role;
