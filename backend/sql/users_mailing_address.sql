-- Mailing address on the customer profile (PATCH /auth/me, the Profile screen). Run after users_zip_code.sql.
-- Safe to re-run.
--
-- The postal code is the existing users.zip_code (5 digits, also used by manager reports), so this adds only the
-- street, city and state. All are optional. The backend accepts an address only when it is complete (street, city,
-- state and ZIP) or empty, except that a ZIP code on its own stays allowed, since registration collects just the ZIP.

begin;

alter table public.users add column if not exists address_line1 varchar(100);
alter table public.users add column if not exists address_line2 varchar(100);
alter table public.users add column if not exists city varchar(60);
alter table public.users add column if not exists state char(2);

-- US state or territory code, uppercase (CA, NY, DC, PR).
alter table public.users drop constraint if exists users_state_format;
alter table public.users add constraint users_state_format check (state is null or state ~ '^[A-Z]{2}$');

commit;
