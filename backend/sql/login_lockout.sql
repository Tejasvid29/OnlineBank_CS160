-- Login lockout: too many failed sign-ins lock the account for a while. Run once in the Supabase SQL editor.
--
-- failed_login_attempts counts consecutive failures; locked_until is set when the limit is reached. A successful
-- login resets both. The backend (secret key) is the only caller; customers never read or write these columns.

alter table public.users
  add column failed_login_attempts integer not null default 0,
  add column locked_until timestamptz;

-- Records one failed login atomically (so concurrent attempts cannot undercount). Returns the new locked_until when
-- this failure locked the account, otherwise null. A lock that has already expired starts a fresh count.
create or replace function public.record_failed_login(p_user_id uuid, p_max_attempts integer, p_lock_seconds integer)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
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
$$;

revoke execute on function public.record_failed_login(uuid, integer, integer) from public, anon, authenticated;
grant execute on function public.record_failed_login(uuid, integer, integer) to service_role;
