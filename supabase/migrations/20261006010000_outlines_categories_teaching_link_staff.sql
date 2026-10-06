-- Follow-up to teaching outlines:
-- 1. Each outline can point at its related teaching (optional; cleared if
--    that teaching is ever deleted).
-- 2. Categories get an optional Spanish name for the Español library.
-- 3. Starter categories.
-- 4. Content managers can upload and edit outlines, same as admins.

alter table public.outline_categories
  add column if not exists name_es text;

alter table public.outline_categories
  drop constraint if exists outline_categories_name_es_check,
  add constraint outline_categories_name_es_check
    check (name_es is null or length(trim(name_es)) between 1 and 80);

alter table public.teaching_outlines
  add column if not exists teaching_id uuid references public.teachings(id) on delete set null;

create index if not exists teaching_outlines_teaching_idx
  on public.teaching_outlines (teaching_id);

insert into public.outline_categories (name, name_es, slug, sort_order)
values
  ('Prayer', 'Oración', 'prayer', 1),
  ('Communion', 'Comunión', 'communion', 2),
  ('Christian Living', 'Vida cristiana', 'christian-living', 3)
on conflict do nothing;

drop policy if exists "Admins manage outline categories" on public.outline_categories;
drop policy if exists "Staff manage outline categories" on public.outline_categories;
create policy "Staff manage outline categories"
on public.outline_categories
for all
using (public.is_content_manager_or_admin())
with check (public.is_content_manager_or_admin());

drop policy if exists "Admins manage teaching outlines" on public.teaching_outlines;
drop policy if exists "Staff manage teaching outlines" on public.teaching_outlines;
create policy "Staff manage teaching outlines"
on public.teaching_outlines
for all
using (public.is_content_manager_or_admin())
with check (public.is_content_manager_or_admin());

drop policy if exists "Admins manage teaching outline files" on storage.objects;
drop policy if exists "Staff manage teaching outline files" on storage.objects;
create policy "Staff manage teaching outline files"
on storage.objects
for all
using (bucket_id = 'teaching-outlines' and public.is_content_manager_or_admin())
with check (bucket_id = 'teaching-outlines' and public.is_content_manager_or_admin());
