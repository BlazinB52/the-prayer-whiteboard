-- Separates devotional ownership from teaching assignment so one devotional can
-- be reused by multiple teachings without duplicating its content.

create table if not exists public.teaching_devotional_assignments (
  teaching_id uuid primary key references public.teachings(id) on delete cascade,
  devotional_id uuid not null references public.teaching_devotionals(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists teaching_devotional_assignments_devotional_idx
  on public.teaching_devotional_assignments (devotional_id);

insert into public.teaching_devotional_assignments (teaching_id, devotional_id)
select teaching_id, id
from public.teaching_devotionals
on conflict (teaching_id) do nothing;

create trigger teaching_devotional_assignments_set_updated_at
before update on public.teaching_devotional_assignments
for each row execute function public.set_updated_at();

alter table public.teaching_devotional_assignments enable row level security;

create policy "Public can read published teaching devotional assignments"
on public.teaching_devotional_assignments
for select
using (
  exists (
    select 1
    from public.teachings t
    where t.id = teaching_id
      and t.status = 'published'
  )
  or public.is_authenticated_admin()
);

create policy "Admins manage teaching devotional assignments"
on public.teaching_devotional_assignments
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

grant select on public.teaching_devotional_assignments to anon, authenticated;
grant insert, update, delete on public.teaching_devotional_assignments to authenticated;

drop policy if exists "Public can read published teaching devotionals"
  on public.teaching_devotionals;

create policy "Public can read published teaching devotionals"
on public.teaching_devotionals
for select
using (
  (
    status = 'published'
    and exists (
      select 1
      from public.teaching_devotional_assignments a
      join public.teachings t on t.id = a.teaching_id
      where a.devotional_id = teaching_devotionals.id
        and t.status = 'published'
    )
  )
  or public.is_authenticated_admin()
);

drop policy if exists "Public can read published teaching devotional days"
  on public.teaching_devotional_days;

create policy "Public can read published teaching devotional days"
on public.teaching_devotional_days
for select
using (
  exists (
    select 1
    from public.teaching_devotionals d
    join public.teaching_devotional_assignments a on a.devotional_id = d.id
    join public.teachings t on t.id = a.teaching_id
    where d.id = teaching_devotional_days.devotional_id
      and d.status = 'published'
      and t.status = 'published'
  )
  or public.is_authenticated_admin()
);
