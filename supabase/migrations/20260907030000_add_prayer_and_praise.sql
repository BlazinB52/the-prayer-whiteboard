-- Adds administrator-curated prayer points and praise reports.
-- Public access is read-only and limited to active, unexpired prayer points
-- and published praise reports.

create table if not exists public.prayer_needs (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  public_summary text not null default '',
  status text not null default 'draft' check (status in ('draft', 'active', 'answered', 'archived')),
  published_at timestamptz,
  expires_at timestamptz,
  answered_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint prayer_needs_public_summary_length_check
    check (char_length(public_summary) <= 420),
  constraint prayer_needs_public_summary_required_when_active_check
    check (status <> 'active' or length(trim(public_summary)) > 0),
  constraint prayer_needs_published_when_active_check
    check (status <> 'active' or published_at is not null),
  constraint prayer_needs_expires_when_active_check
    check (status <> 'active' or expires_at is not null),
  constraint prayer_needs_answered_at_when_answered_check
    check (status <> 'answered' or answered_at is not null)
);

create table if not exists public.praise_reports (
  id uuid primary key default gen_random_uuid(),
  category text not null,
  public_summary text not null default '',
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint praise_reports_public_summary_length_check
    check (char_length(public_summary) <= 420),
  constraint praise_reports_public_summary_required_when_published_check
    check (status <> 'published' or length(trim(public_summary)) > 0),
  constraint praise_reports_published_at_when_published_check
    check (status <> 'published' or published_at is not null)
);

create index if not exists prayer_needs_status_idx
  on public.prayer_needs (status);

create index if not exists prayer_needs_public_active_idx
  on public.prayer_needs (published_at desc, id desc)
  where status = 'active';

create index if not exists prayer_needs_expiration_idx
  on public.prayer_needs (expires_at)
  where status = 'active';

create index if not exists praise_reports_status_idx
  on public.praise_reports (status);

create index if not exists praise_reports_public_published_idx
  on public.praise_reports (published_at desc, id desc)
  where status = 'published';

create trigger prayer_needs_set_updated_at
before update on public.prayer_needs
for each row execute function public.set_updated_at();

create trigger praise_reports_set_updated_at
before update on public.praise_reports
for each row execute function public.set_updated_at();

alter table public.prayer_needs enable row level security;
alter table public.praise_reports enable row level security;

create policy "Public can read active unexpired prayer needs"
on public.prayer_needs
for select
using (
  (
    status = 'active'
    and expires_at > now()
  )
  or public.is_authenticated_admin()
);

create policy "Admins manage prayer needs"
on public.prayer_needs
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

create policy "Public can read published praise reports"
on public.praise_reports
for select
using (
  (status = 'published')
  or public.is_authenticated_admin()
);

create policy "Admins manage praise reports"
on public.praise_reports
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

grant select on public.prayer_needs to anon, authenticated;
grant select on public.praise_reports to anon, authenticated;
grant select, insert, update, delete on public.prayer_needs to authenticated;
grant select, insert, update, delete on public.praise_reports to authenticated;

-- No public insert, update, or delete policy is created. Expired prayer points
-- remain stored but fall out of public visibility through the public select
-- policy and matching application queries.
