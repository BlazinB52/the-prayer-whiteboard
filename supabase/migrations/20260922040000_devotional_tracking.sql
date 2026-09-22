-- Per-subscriber devotional pacing state.
--
-- Each row tracks one subscriber's progress through one devotional series.
-- The unique constraint keeps a subscriber from being enrolled twice in the
-- same series, which would double their daily mail.

create table if not exists public.email_devotional_enrollments (
  id uuid primary key default gen_random_uuid(),
  subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
  series_slug text not null,
  current_day integer not null default 1,
  status text not null default 'active',
  last_sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint email_devotional_enrollments_series_slug_check check (length(trim(series_slug)) > 0),
  constraint email_devotional_enrollments_current_day_check check (current_day between 1 and 100),
  constraint email_devotional_enrollments_status_check check (status in ('active', 'completed', 'paused'))
);

create unique index if not exists email_devotional_enrollments_subscriber_series_idx
  on public.email_devotional_enrollments (subscriber_id, series_slug);

-- Drives the cron query: active enrollments ordered by how long they have waited.
create index if not exists email_devotional_enrollments_due_idx
  on public.email_devotional_enrollments (status, last_sent_at nulls first);

drop trigger if exists email_devotional_enrollments_set_updated_at on public.email_devotional_enrollments;
create trigger email_devotional_enrollments_set_updated_at
before update on public.email_devotional_enrollments
for each row execute function public.set_updated_at();

alter table public.email_devotional_enrollments enable row level security;

drop policy if exists "Admins manage devotional enrollments" on public.email_devotional_enrollments;
create policy "Admins manage devotional enrollments"
on public.email_devotional_enrollments
for select
using (public.is_authenticated_admin());

grant select on public.email_devotional_enrollments to authenticated;
-- No delete grant: enrollment history is append-only, matching the other email tables.
grant select, insert, update on public.email_devotional_enrollments to service_role;

-- The cron route reads devotional content with the service role.
grant select on public.teaching_devotionals to service_role;
grant select on public.teaching_devotional_days to service_role;
