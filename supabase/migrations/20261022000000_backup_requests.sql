-- "Back up now" button on /admin/cm. The backup itself runs on the administrator's own computer (Windows Task
-- Scheduler, scripts/scheduled-backup.mjs): it needs the Supabase CLI login, the local disk and the flash drive, none of
-- which exist on Vercel. So the button only leaves a request here, and scripts/backup-request-poller.mjs, which Task
-- Scheduler starts every minute on that computer, picks it up, runs the same backup and records how it went.

create table if not exists public.backup_requests (
  id uuid primary key default gen_random_uuid(),
  requested_at timestamptz not null default now(),
  requested_by uuid,
  status text not null default 'pending' check (status in ('pending', 'running', 'done', 'failed')),
  started_at timestamptz,
  finished_at timestamptz,
  message text
);

-- One request at a time: pressing the button twice, or while a run is going, cannot queue a second backup.
create unique index if not exists backup_requests_one_active
  on public.backup_requests ((true))
  where status in ('pending', 'running');

create index if not exists backup_requests_requested_at_idx on public.backup_requests (requested_at desc);

-- Service role only (the admin page's server code and the poller): RLS on with no policies, and this project's default
-- grants to anon/authenticated revoked explicitly.
alter table public.backup_requests enable row level security;
revoke all on public.backup_requests from anon, authenticated;
grant select, insert, update on public.backup_requests to service_role;
