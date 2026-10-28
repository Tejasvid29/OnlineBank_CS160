-- Optional 5-digit ZIP code on the customer profile, used by manager reports.
alter table public.users add column zip_code text check (zip_code ~ '^[0-9]{5}$');
