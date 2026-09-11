-- Adds stable public URL slugs to the existing teaching_devotionals records.
-- The initial value reuses the associated teaching slug so the existing
-- one-devotional-per-teaching relationship remains the source of truth.

alter table public.teaching_devotionals
add column if not exists slug text;

update public.teaching_devotionals d
set slug = t.slug
from public.teachings t
where t.id = d.teaching_id
  and (d.slug is null or length(trim(d.slug)) = 0);

alter table public.teaching_devotionals
alter column slug set default '';

alter table public.teaching_devotionals
alter column slug set not null;

create unique index if not exists teaching_devotionals_slug_idx
  on public.teaching_devotionals (slug)
  where length(trim(slug)) > 0;

create index if not exists teaching_devotionals_status_slug_idx
  on public.teaching_devotionals (status, slug);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'teaching_devotionals_slug_length_check'
  ) then
    alter table public.teaching_devotionals
    add constraint teaching_devotionals_slug_length_check
      check (char_length(slug) <= 180);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'teaching_devotionals_published_slug_check'
  ) then
    alter table public.teaching_devotionals
    add constraint teaching_devotionals_published_slug_check
      check (status <> 'published' or length(trim(slug)) > 0);
  end if;
end $$;
