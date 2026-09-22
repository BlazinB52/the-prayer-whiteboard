-- Ledger for weekly update email broadcasts.
--
-- The unique constraint on weekly_update_id is the idempotency guard: Supabase
-- database webhooks fire on every row update, so a published weekly update that
-- is later edited would otherwise be broadcast again. The route inserts this row
-- before sending, and a duplicate key means the broadcast already ran.

create table if not exists public.email_broadcast_events (
  id uuid primary key default gen_random_uuid(),
  weekly_update_id uuid not null references public.weekly_updates(id) on delete cascade,
  status text not null default 'sending',
  recipient_count integer not null default 0,
  sent_count integer not null default 0,
  failed_count integer not null default 0,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_broadcast_events_status_check check (status in ('sending', 'sent', 'partial', 'failed')),
  constraint email_broadcast_events_counts_check check (
    recipient_count >= 0 and sent_count >= 0 and failed_count >= 0
    and sent_count + failed_count <= recipient_count
  )
);

create unique index if not exists email_broadcast_events_weekly_update_idx
  on public.email_broadcast_events (weekly_update_id);

create index if not exists email_broadcast_events_created_idx
  on public.email_broadcast_events (created_at desc);

drop trigger if exists email_broadcast_events_set_updated_at on public.email_broadcast_events;
create trigger email_broadcast_events_set_updated_at
before update on public.email_broadcast_events
for each row execute function public.set_updated_at();

alter table public.email_broadcast_events enable row level security;

drop policy if exists "Admins read email broadcast events" on public.email_broadcast_events;
create policy "Admins read email broadcast events"
on public.email_broadcast_events
for select
using (public.is_authenticated_admin());

grant select on public.email_broadcast_events to authenticated;
-- No delete grant: broadcast history is append-only, matching the subscription tables.
grant select, insert, update on public.email_broadcast_events to service_role;
