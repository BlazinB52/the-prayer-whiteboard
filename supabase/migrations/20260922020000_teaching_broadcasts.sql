-- Ledger for teaching email broadcasts.
--
-- Mirrors email_broadcast_events: the unique constraint on teaching_id is the
-- idempotency guard, since database webhooks fire on every row update and a
-- published teaching that is later edited would otherwise broadcast again.
--
-- Per-recipient failures are kept in the single error jsonb column rather than
-- one row per recipient, so a broadcast costs one row regardless of list size.

create table if not exists public.email_teaching_broadcast_events (
  id uuid primary key default gen_random_uuid(),
  teaching_id uuid not null references public.teachings(id) on delete cascade,
  status text not null default 'sending',
  recipient_count integer not null default 0,
  error jsonb,
  created_at timestamptz not null default now(),
  constraint email_teaching_broadcast_events_status_check check (status in ('sending', 'sent', 'failed')),
  constraint email_teaching_broadcast_events_recipient_count_check check (recipient_count >= 0)
);

create unique index if not exists email_teaching_broadcast_events_teaching_idx
  on public.email_teaching_broadcast_events (teaching_id);

create index if not exists email_teaching_broadcast_events_created_idx
  on public.email_teaching_broadcast_events (created_at desc);

alter table public.email_teaching_broadcast_events enable row level security;

drop policy if exists "Admins read email teaching broadcast events" on public.email_teaching_broadcast_events;
create policy "Admins read email teaching broadcast events"
on public.email_teaching_broadcast_events
for select
using (public.is_authenticated_admin());

grant select on public.email_teaching_broadcast_events to authenticated;
-- No delete grant: broadcast history is append-only, matching the other email tables.
grant select, insert, update on public.email_teaching_broadcast_events to service_role;
