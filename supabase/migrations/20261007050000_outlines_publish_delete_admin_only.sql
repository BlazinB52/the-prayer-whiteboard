-- Teaching outlines: publishing and deleting are Administrator-only. A content manager can upload an
-- outline (always as a draft) and edit a draft for review, and can read every outline, but cannot
-- publish, unpublish, edit a published outline, or delete one.
--
-- 20261006010000 gave content managers full access to the table and to the stored Word files. That is
-- replaced here by an Administrator policy (everything) plus narrower staff policies.

-- ---------------------------------------------------------------------------
-- teaching_outlines
-- ---------------------------------------------------------------------------

drop policy if exists "Staff manage teaching outlines" on public.teaching_outlines;
drop policy if exists "Admins manage teaching outlines" on public.teaching_outlines;
drop policy if exists "Staff read teaching outlines" on public.teaching_outlines;
drop policy if exists "Staff add draft teaching outlines" on public.teaching_outlines;
drop policy if exists "Staff edit draft teaching outlines" on public.teaching_outlines;

create policy "Admins manage teaching outlines"
on public.teaching_outlines
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

create policy "Staff read teaching outlines"
on public.teaching_outlines
for select
using (public.is_content_manager_or_admin());

-- A new outline from a content manager is always a draft that has not been published.
create policy "Staff add draft teaching outlines"
on public.teaching_outlines
for insert
with check (public.is_content_manager_or_admin() and status = 'draft' and published_at is null);

-- A content manager can only change an outline that is a draft, and cannot make it anything else.
create policy "Staff edit draft teaching outlines"
on public.teaching_outlines
for update
using (public.is_content_manager_or_admin() and status = 'draft')
with check (public.is_content_manager_or_admin() and status = 'draft' and published_at is null);

-- There is deliberately no delete policy for content managers.

-- ---------------------------------------------------------------------------
-- The stored Word files
-- ---------------------------------------------------------------------------

drop policy if exists "Staff manage teaching outline files" on storage.objects;
drop policy if exists "Admins manage teaching outline files" on storage.objects;
drop policy if exists "Staff add teaching outline files" on storage.objects;
drop policy if exists "Staff remove unused teaching outline files" on storage.objects;

create policy "Admins manage teaching outline files"
on storage.objects
for all
using (bucket_id = 'teaching-outlines' and public.is_authenticated_admin())
with check (bucket_id = 'teaching-outlines' and public.is_authenticated_admin());

create policy "Staff add teaching outline files"
on storage.objects
for insert
with check (bucket_id = 'teaching-outlines' and public.is_content_manager_or_admin());

-- A content manager can clear up a file that no outline uses (for example after a failed save), but
-- never a file that an outline, draft or published, still points to.
create policy "Staff remove unused teaching outline files"
on storage.objects
for delete
using (
  bucket_id = 'teaching-outlines'
  and public.is_content_manager_or_admin()
  and not exists (select 1 from public.teaching_outlines o where o.source_path = storage.objects.name)
);
