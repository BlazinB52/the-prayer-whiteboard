-- Lets a published devotional be read publicly on its own, with no teaching
-- assignment required.
--
-- Since 20260919010000 the public select policies have required a published
-- devotional to be reachable through teaching_devotional_assignments to a
-- PUBLISHED teaching. That made the teaching, not the devotional, the real
-- gate on publication, which is what kept a standalone series invisible even
-- after an admin published it.
--
-- The devotional's own status is now the only gate. Publishing one is an
-- explicit admin action, so nothing becomes public that an admin did not
-- deliberately publish.
--
-- Widening note: a published devotional assigned only to a DRAFT teaching was
-- previously hidden and is now visible. That follows directly from the
-- devotional owning its own publication state, but it is a real change in
-- exposure for that case.

drop policy if exists "Public can read published teaching devotionals"
  on public.teaching_devotionals;

create policy "Public can read published teaching devotionals"
on public.teaching_devotionals
for select
using (
  status = 'published'
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
    where d.id = teaching_devotional_days.devotional_id
      and d.status = 'published'
  )
  or public.is_authenticated_admin()
);

-- The assignment table's own policy is deliberately unchanged. It still only
-- exposes assignments to published teachings, so a devotional attached to a
-- draft teaching simply reads as having no teaching rather than leaking that
-- teaching's existence.
