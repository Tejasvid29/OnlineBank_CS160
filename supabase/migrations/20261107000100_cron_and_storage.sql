-- Things a schema dump does not capture: the pg_cron job and the Storage bucket.

-- Daily job that posts due scheduled payments (mirrors the cloud project).
create extension if not exists pg_cron;

select cron.schedule(
  'process-due-payments',
  '0 8 * * *',
  'select public.process_due_payments()'
);

-- Private bucket for check-deposit images (mirrors the cloud project).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('check-deposits', 'check-deposits', false, 10485760, array['image/jpeg'])
on conflict (id) do nothing;
