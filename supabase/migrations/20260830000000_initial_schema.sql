-- The Prayer Whiteboard initial migration (final local revision)
-- This file is intentionally not executed against Supabase yet.
-- It defines the approved schema for teachings, category-based structure,
-- ranged homepage highlights, admin authorization, monthly calendars,
-- and private chalkboard assets.
-- No prayer-needs or praise-report tables are included.

create extension if not exists pgcrypto;

-- Safe one-time admin authorization process:
-- 1. Use a trusted server-side process (service role, secure admin API, or dashboard with elevated permissions).
-- 2. Confirm the authenticated user identity before inserting auth.uid() into admin_authorizations.
-- 3. Insert one row with is_active = true, leaving no public or anon self-authorization path.
-- 4. Keep RLS in place: all admin-only access is still controlled by public.is_authenticated_admin().
create table if not exists public.admin_authorizations (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  role text not null default 'admin' check (role in ('admin', 'editor')),
  is_active boolean not null default true,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_authenticated_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_authorizations aa
    where aa.user_id = auth.uid()
      and aa.is_active = true
      and aa.revoked_at is null
  );
$$;

revoke all on function public.is_authenticated_admin() from public;
grant execute on function public.is_authenticated_admin() to anon, authenticated;

create table if not exists public.teachings (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  summary text,
  introduction text,
  central_theme text,
  gathering_date date,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  is_featured boolean not null default false,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  archived_at timestamptz,
  constraint teachings_featured_published_check
    check (is_featured = false or status = 'published')
);

create table if not exists public.teaching_categories (
  id uuid not null,
  teaching_id uuid not null references public.teachings(id) on delete cascade,
  slug text not null,
  title text not null,
  description text,
  sort_order integer not null default 1,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  primary key (id, teaching_id),
  unique (teaching_id, slug),
  unique (teaching_id, sort_order)
);

create table if not exists public.teaching_sections (
  id uuid not null,
  teaching_id uuid not null,
  category_id uuid not null,
  slug text not null,
  title text not null,
  introduction text,
  content jsonb not null default '[]'::jsonb,
  sort_order integer not null default 1,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  primary key (id, teaching_id),
  unique (teaching_id, category_id, slug),
  unique (teaching_id, category_id, sort_order),
  foreign key (teaching_id) references public.teachings(id) on delete cascade,
  foreign key (category_id, teaching_id) references public.teaching_categories(id, teaching_id) on delete restrict
);

create table if not exists public.homepage_highlights (
  id uuid primary key default gen_random_uuid(),
  teaching_id uuid not null references public.teachings(id) on delete cascade,
  section_id uuid,
  slug text not null,
  title text not null,
  summary text,
  description text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  sort_order integer not null default 1,
  is_primary boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (teaching_id, slug),
  unique (teaching_id, sort_order),
  foreign key (section_id, teaching_id) references public.teaching_sections(id, teaching_id) on delete set null
);

create table if not exists public.site_settings (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  value jsonb not null default '{}'::jsonb,
  is_public boolean not null default false,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  description text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

create table if not exists public.monthly_calendars (
  id uuid primary key default gen_random_uuid(),
  month_date date not null unique,
  introduction text,
  closing_message text,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (date_trunc('month', month_date) = month_date)
);

create table if not exists public.calendar_entries (
  id uuid primary key default gen_random_uuid(),
  calendar_id uuid not null references public.monthly_calendars(id) on delete cascade,
  gathering_date date not null,
  public_title text not null,
  chat_coffee_time time,
  meeting_time time,
  public_notes text,
  is_canceled boolean not null default false,
  is_no_meeting boolean not null default false,
  sort_order integer not null default 1,
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  unique (calendar_id, sort_order)
);

create table if not exists public.chalkboard_assets (
  id uuid primary key default gen_random_uuid(),
  teaching_id uuid not null references public.teachings(id) on delete cascade,
  storage_path text not null unique,
  alt_text text,
  width integer,
  height integer,
  version_number integer not null default 1,
  uploaded_at timestamptz not null default now(),
  is_current_version boolean not null default true,
  status text not null default 'active' check (status in ('active', 'superseded', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teaching_id, version_number),
  check (version_number > 0),
  check (width is null or width > 0),
  check (height is null or height > 0),
  check ((is_current_version = false) or (status = 'active'))
);

create unique index if not exists chalkboard_assets_one_current_version_per_teaching_idx
  on public.chalkboard_assets (teaching_id)
  where is_current_version = true;

create index if not exists teachings_status_published_idx
  on public.teachings (status, published_at desc);

create unique index if not exists teachings_one_featured_published_idx
  on public.teachings (id)
  where is_featured = true and status = 'published';

create index if not exists teachings_slug_idx
  on public.teachings (slug);

create index if not exists teaching_categories_teaching_status_idx
  on public.teaching_categories (teaching_id, status, sort_order);

create index if not exists teaching_sections_teaching_status_idx
  on public.teaching_sections (teaching_id, category_id, status, sort_order);

create index if not exists homepage_highlights_status_teaching_sort_idx
  on public.homepage_highlights (status, teaching_id, sort_order);

create index if not exists site_settings_public_idx
  on public.site_settings (is_public, status);

create index if not exists monthly_calendars_status_month_idx
  on public.monthly_calendars (status, month_date);

create index if not exists calendar_entries_calendar_status_idx
  on public.calendar_entries (calendar_id, status, gathering_date, sort_order);

create index if not exists chalkboard_assets_teaching_status_idx
  on public.chalkboard_assets (teaching_id, is_current_version, status, uploaded_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger teachings_set_updated_at
before update on public.teachings
for each row execute function public.set_updated_at();

create trigger teaching_categories_set_updated_at
before update on public.teaching_categories
for each row execute function public.set_updated_at();

create trigger teaching_sections_set_updated_at
before update on public.teaching_sections
for each row execute function public.set_updated_at();

create trigger homepage_highlights_set_updated_at
before update on public.homepage_highlights
for each row execute function public.set_updated_at();

create trigger site_settings_set_updated_at
before update on public.site_settings
for each row execute function public.set_updated_at();

create trigger admin_authorizations_set_updated_at
before update on public.admin_authorizations
for each row execute function public.set_updated_at();

create trigger monthly_calendars_set_updated_at
before update on public.monthly_calendars
for each row execute function public.set_updated_at();

create trigger calendar_entries_set_updated_at
before update on public.calendar_entries
for each row execute function public.set_updated_at();

create trigger chalkboard_assets_set_updated_at
before update on public.chalkboard_assets
for each row execute function public.set_updated_at();

create or replace function public.enforce_published_calendar_parent()
returns trigger
language plpgsql
as $$
begin
  if (new.status = 'published') and not exists (
    select 1
    from public.monthly_calendars mc
    where mc.id = new.calendar_id
      and mc.status = 'published'
  ) then
    raise exception 'Published calendar entries require a published parent monthly calendar.';
  end if;

  return new;
end;
$$;

create trigger calendar_entries_publish_requires_published_calendar
before insert or update on public.calendar_entries
for each row
execute function public.enforce_published_calendar_parent();

create or replace function public.enforce_published_calendar_parent_on_update()
returns trigger
language plpgsql
as $$
begin
  if (new.status <> 'published') and exists (
    select 1
    from public.calendar_entries ce
    where ce.calendar_id = new.id
      and ce.status = 'published'
  ) then
    raise exception 'A monthly calendar cannot be unpublished while published entries still reference it.';
  end if;

  return new;
end;
$$;

create trigger monthly_calendars_cannot_be_unpublished_if_published_entries_exist
before update on public.monthly_calendars
for each row
when (new.status <> old.status)
execute function public.enforce_published_calendar_parent_on_update();

alter table public.teachings enable row level security;
alter table public.teaching_categories enable row level security;
alter table public.teaching_sections enable row level security;
alter table public.homepage_highlights enable row level security;
alter table public.site_settings enable row level security;
alter table public.admin_authorizations enable row level security;
alter table public.monthly_calendars enable row level security;
alter table public.calendar_entries enable row level security;
alter table public.chalkboard_assets enable row level security;

create policy "Public can read published teachings"
on public.teachings
for select
using (
  (status = 'published')
  or public.is_authenticated_admin()
);

create policy "Admins manage teachings"
on public.teachings
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

create policy "Public can read published teaching categories"
on public.teaching_categories
for select
using (
  ((status = 'published')
   and exists (
     select 1
     from public.teachings t
     where t.id = teaching_id
       and t.status = 'published'
   ))
  or public.is_authenticated_admin()
);

create policy "Admins manage teaching categories"
on public.teaching_categories
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

create policy "Public can read published teaching sections"
on public.teaching_sections
for select
using (
  ((status = 'published')
   and exists (
     select 1
     from public.teachings t
     where t.id = teaching_id
       and t.status = 'published'
   ))
  or public.is_authenticated_admin()
);

create policy "Admins manage teaching sections"
on public.teaching_sections
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

create policy "Public can read published homepage highlights"
on public.homepage_highlights
for select
using (
  ((status = 'published')
   and exists (
     select 1
     from public.teachings t
     where t.id = teaching_id
       and t.status = 'published'
   ))
  or public.is_authenticated_admin()
);

create policy "Admins manage homepage highlights"
on public.homepage_highlights
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

create policy "Public can read published site settings"
on public.site_settings
for select
using (
  ((is_public = true)
   and (status = 'published'))
  or public.is_authenticated_admin()
);

create policy "Admins manage site settings"
on public.site_settings
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

create policy "Admins manage administrator authorizations"
on public.admin_authorizations
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

create policy "Public can read published monthly calendars"
on public.monthly_calendars
for select
using (
  (status = 'published')
  or public.is_authenticated_admin()
);

create policy "Admins manage monthly calendars"
on public.monthly_calendars
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

create policy "Public can read published calendar entries"
on public.calendar_entries
for select
using (
  ((status = 'published')
   and exists (
     select 1
     from public.monthly_calendars mc
     where mc.id = calendar_id
       and mc.status = 'published'
   ))
  or public.is_authenticated_admin()
);

create policy "Admins manage calendar entries"
on public.calendar_entries
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

create policy "Admins manage chalkboard asset metadata"
on public.chalkboard_assets
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

-- The chalkboards bucket remains private.
-- Service-role credentials stay server-only.
-- Trusted server-side code may issue signed URLs only after confirming the parent teaching is published.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chalkboards',
  'chalkboards',
  false,
  15728640,
  array['image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

create policy "Admins can manage chalkboards bucket objects"
on storage.objects
for all
using (
  (bucket_id = 'chalkboards')
  and public.is_authenticated_admin()
)
with check (
  (bucket_id = 'chalkboards')
  and public.is_authenticated_admin()
);

-- No public or anonymous select policy is created for storage.objects in the chalkboards bucket.

grant usage on schema public to anon, authenticated;

grant select on public.teachings to anon, authenticated;
grant select on public.teaching_categories to anon, authenticated;
grant select on public.teaching_sections to anon, authenticated;
grant select on public.homepage_highlights to anon, authenticated;
grant select on public.site_settings to anon, authenticated;
grant select on public.monthly_calendars to anon, authenticated;
grant select on public.calendar_entries to anon, authenticated;

grant select, insert, update, delete on public.teachings to authenticated;
grant select, insert, update, delete on public.teaching_categories to authenticated;
grant select, insert, update, delete on public.teaching_sections to authenticated;
grant select, insert, update, delete on public.homepage_highlights to authenticated;
grant select, insert, update, delete on public.site_settings to authenticated;
grant select, insert, update, delete on public.monthly_calendars to authenticated;
grant select, insert, update, delete on public.calendar_entries to authenticated;
grant select, insert, update, delete on public.chalkboard_assets to authenticated;
grant select, insert, update, delete on public.admin_authorizations to authenticated;

-- No public policy permits reading drafts, archived material, private chalkboards,
-- administrator records, or calendar entries whose parent calendar is unpublished.

