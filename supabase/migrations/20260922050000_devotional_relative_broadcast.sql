-- Replaces per-subscriber devotional drip tracking with calendar-relative
-- broadcasting.
--
-- Day numbers are derived from how many calendar days have passed since the
-- teaching was published, so no per-subscriber counter is needed. The whole
-- list receives the same day on the same morning.

drop table if exists public.email_devotional_enrollments;

-- One row per (teaching, day) ever broadcast. The compound unique key is the
-- idempotency guard: re-running the cron, or editing the teaching, cannot
-- produce a second blast for a day that already went out.
create table if not exists public.email_devotional_broadcast_ledger (
  id uuid primary key default gen_random_uuid(),
  teaching_id uuid not null references public.teachings(id) on delete cascade,
  day_number integer not null,
  status text not null default 'sending',
  recipient_count integer not null default 0,
  error jsonb,
  created_at timestamptz not null default now(),
  constraint email_devotional_broadcast_ledger_status_check check (status in ('sending', 'sent', 'failed')),
  constraint email_devotional_broadcast_ledger_day_number_check check (day_number between 1 and 100),
  constraint email_devotional_broadcast_ledger_recipient_count_check check (recipient_count >= 0)
);

create unique index if not exists email_devotional_broadcast_ledger_teaching_day_idx
  on public.email_devotional_broadcast_ledger (teaching_id, day_number);

create index if not exists email_devotional_broadcast_ledger_created_idx
  on public.email_devotional_broadcast_ledger (created_at desc);

alter table public.email_devotional_broadcast_ledger enable row level security;

drop policy if exists "Admins read devotional broadcast ledger" on public.email_devotional_broadcast_ledger;
create policy "Admins read devotional broadcast ledger"
on public.email_devotional_broadcast_ledger
for select
using (public.is_authenticated_admin());

grant select on public.email_devotional_broadcast_ledger to authenticated;
-- No delete grant: broadcast history is append-only, matching the other email tables.
grant select, insert, update on public.email_devotional_broadcast_ledger to service_role;

-- The cron route reads teaching and devotional content with the service role.
-- Repeated here because the grants in 20260922030000/20260922040000 did not take
-- effect when those migrations were applied.
grant select on public.teachings to service_role;
grant select on public.weekly_updates to service_role;
grant select on public.teaching_devotionals to service_role;
grant select on public.teaching_devotional_days to service_role;
grant select on public.teaching_devotional_assignments to service_role;
