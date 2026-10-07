-- Outline categories (Prayer, Communion, Christian Living, and any others) are an Administrator-only
-- function. Content managers can still file outlines under the existing categories and read the list,
-- but cannot add, rename, reorder or delete a category.
--
-- 20261006010000 gave content managers full access to this table. Reading stays open to everyone
-- through the existing "Public reads outline categories" policy; all writes are now Administrator only.

drop policy if exists "Staff manage outline categories" on public.outline_categories;
drop policy if exists "Admins manage outline categories" on public.outline_categories;
create policy "Admins manage outline categories"
on public.outline_categories
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());
