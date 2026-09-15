-- Add reusable chalkboard assignments and reusable content footers.

drop index if exists public.teachings_chalkboard_asset_unique_idx;

create table if not exists public.teaching_chalkboard_assignments (
  teaching_id uuid not null references public.teachings(id) on delete cascade,
  chalkboard_asset_id uuid not null references public.chalkboard_assets(id) on delete cascade,
  display_order integer not null default 1,
  created_at timestamptz not null default now(),
  primary key (teaching_id, chalkboard_asset_id),
  constraint teaching_chalkboard_assignments_display_order_check check (display_order > 0)
);

create unique index if not exists teaching_chalkboard_assignments_order_idx
  on public.teaching_chalkboard_assignments (teaching_id, display_order);

create index if not exists teaching_chalkboard_assignments_asset_idx
  on public.teaching_chalkboard_assignments (chalkboard_asset_id);

create table if not exists public.weekly_update_chalkboard_assignments (
  weekly_update_id uuid not null references public.weekly_updates(id) on delete cascade,
  chalkboard_asset_id uuid not null references public.chalkboard_assets(id) on delete cascade,
  display_order integer not null default 1,
  created_at timestamptz not null default now(),
  primary key (weekly_update_id, chalkboard_asset_id),
  constraint weekly_update_chalkboard_assignments_display_order_check check (display_order > 0)
);

create unique index if not exists weekly_update_chalkboard_assignments_order_idx
  on public.weekly_update_chalkboard_assignments (weekly_update_id, display_order);

create index if not exists weekly_update_chalkboard_assignments_asset_idx
  on public.weekly_update_chalkboard_assignments (chalkboard_asset_id);

insert into public.teaching_chalkboard_assignments (teaching_id, chalkboard_asset_id, display_order)
select id, chalkboard_asset_id, 1
from public.teachings
where chalkboard_asset_id is not null
on conflict do nothing;

insert into public.weekly_update_chalkboard_assignments (weekly_update_id, chalkboard_asset_id, display_order)
select id, chalkboard_asset_id, 1
from public.weekly_updates
where chalkboard_asset_id is not null
on conflict do nothing;

create table if not exists public.content_footers (
  id uuid primary key default gen_random_uuid(),
  internal_title text not null,
  content text not null,
  status text not null default 'active',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_footers_internal_title_check check (length(trim(internal_title)) > 0 and length(internal_title) <= 160),
  constraint content_footers_content_check check (length(trim(content)) > 0 and length(content) <= 5000),
  constraint content_footers_status_check check (status in ('active', 'archived'))
);

drop trigger if exists content_footers_set_updated_at on public.content_footers;
create trigger content_footers_set_updated_at
before update on public.content_footers
for each row execute function public.set_updated_at();

create table if not exists public.teaching_footer_assignments (
  teaching_id uuid primary key references public.teachings(id) on delete cascade,
  footer_id uuid not null references public.content_footers(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists teaching_footer_assignments_set_updated_at on public.teaching_footer_assignments;
create trigger teaching_footer_assignments_set_updated_at
before update on public.teaching_footer_assignments
for each row execute function public.set_updated_at();

create index if not exists teaching_footer_assignments_footer_idx
  on public.teaching_footer_assignments (footer_id);

create table if not exists public.weekly_update_footer_assignments (
  weekly_update_id uuid primary key references public.weekly_updates(id) on delete cascade,
  footer_id uuid not null references public.content_footers(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

drop trigger if exists weekly_update_footer_assignments_set_updated_at on public.weekly_update_footer_assignments;
create trigger weekly_update_footer_assignments_set_updated_at
before update on public.weekly_update_footer_assignments
for each row execute function public.set_updated_at();

create index if not exists weekly_update_footer_assignments_footer_idx
  on public.weekly_update_footer_assignments (footer_id);

alter table public.teaching_chalkboard_assignments enable row level security;
alter table public.weekly_update_chalkboard_assignments enable row level security;
alter table public.content_footers enable row level security;
alter table public.teaching_footer_assignments enable row level security;
alter table public.weekly_update_footer_assignments enable row level security;

drop policy if exists "Admins manage teaching chalkboard assignments" on public.teaching_chalkboard_assignments;
create policy "Admins manage teaching chalkboard assignments"
on public.teaching_chalkboard_assignments
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

drop policy if exists "Public reads published teaching chalkboard assignments" on public.teaching_chalkboard_assignments;
create policy "Public reads published teaching chalkboard assignments"
on public.teaching_chalkboard_assignments
for select
using (
  exists (
    select 1
    from public.teachings teaching
    where teaching.id = teaching_chalkboard_assignments.teaching_id
      and teaching.status = 'published'
  )
  or public.is_authenticated_admin()
);

drop policy if exists "Admins manage weekly update chalkboard assignments" on public.weekly_update_chalkboard_assignments;
create policy "Admins manage weekly update chalkboard assignments"
on public.weekly_update_chalkboard_assignments
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

drop policy if exists "Public reads current weekly update chalkboard assignments" on public.weekly_update_chalkboard_assignments;
create policy "Public reads current weekly update chalkboard assignments"
on public.weekly_update_chalkboard_assignments
for select
using (
  exists (
    select 1
    from public.weekly_updates weekly_update
    where weekly_update.id = weekly_update_chalkboard_assignments.weekly_update_id
      and weekly_update.status = 'published'
      and weekly_update.is_current = true
  )
  or public.is_authenticated_admin()
);

drop policy if exists "Admins manage content footers" on public.content_footers;
create policy "Admins manage content footers"
on public.content_footers
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

drop policy if exists "Public reads assigned public content footers" on public.content_footers;
create policy "Public reads assigned public content footers"
on public.content_footers
for select
using (
  status = 'active'
  and (
    exists (
      select 1
      from public.teaching_footer_assignments assignment
      join public.teachings teaching on teaching.id = assignment.teaching_id
      where assignment.footer_id = content_footers.id
        and teaching.status = 'published'
    )
    or exists (
      select 1
      from public.weekly_update_footer_assignments assignment
      join public.weekly_updates weekly_update on weekly_update.id = assignment.weekly_update_id
      where assignment.footer_id = content_footers.id
        and weekly_update.status = 'published'
        and weekly_update.is_current = true
    )
    or public.is_authenticated_admin()
  )
);

drop policy if exists "Admins manage teaching footer assignments" on public.teaching_footer_assignments;
create policy "Admins manage teaching footer assignments"
on public.teaching_footer_assignments
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

drop policy if exists "Public reads published teaching footer assignments" on public.teaching_footer_assignments;
create policy "Public reads published teaching footer assignments"
on public.teaching_footer_assignments
for select
using (
  exists (
    select 1
    from public.teachings teaching
    where teaching.id = teaching_footer_assignments.teaching_id
      and teaching.status = 'published'
  )
  or public.is_authenticated_admin()
);

drop policy if exists "Admins manage weekly update footer assignments" on public.weekly_update_footer_assignments;
create policy "Admins manage weekly update footer assignments"
on public.weekly_update_footer_assignments
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

drop policy if exists "Public reads current weekly update footer assignments" on public.weekly_update_footer_assignments;
create policy "Public reads current weekly update footer assignments"
on public.weekly_update_footer_assignments
for select
using (
  exists (
    select 1
    from public.weekly_updates weekly_update
    where weekly_update.id = weekly_update_footer_assignments.weekly_update_id
      and weekly_update.status = 'published'
      and weekly_update.is_current = true
  )
  or public.is_authenticated_admin()
);

grant select, insert, update, delete on public.teaching_chalkboard_assignments to authenticated;
grant select, insert, update, delete on public.weekly_update_chalkboard_assignments to authenticated;
grant select, insert, update, delete on public.content_footers to authenticated;
grant select, insert, update, delete on public.teaching_footer_assignments to authenticated;
grant select, insert, update, delete on public.weekly_update_footer_assignments to authenticated;
grant select on public.teaching_chalkboard_assignments to anon;
grant select on public.weekly_update_chalkboard_assignments to anon;
grant select on public.content_footers to anon;
grant select on public.teaching_footer_assignments to anon;
grant select on public.weekly_update_footer_assignments to anon;
