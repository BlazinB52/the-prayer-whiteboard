begin;

select * from no_plan();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9400-000000000001', 'authenticated', 'authenticated', 'admin@outcat.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9400-000000000002', 'authenticated', 'authenticated', 'cm@outcat.local', 'x', now(), now(), now());

insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ('00000000-0000-4000-9400-000000000001', 'admin', true, null, 'Admin', 'admin@outcat.local'),
  ('00000000-0000-4000-9400-000000000002', 'content_manager', true, null, 'CM', 'cm@outcat.local');

insert into public.outline_categories (id, name, slug, sort_order)
values ('00000000-0000-4000-9400-0000000000c1', 'Outcat Test', 'outcat-test', 99);

-- ===========================================================================
-- A content manager can read categories but cannot add, rename or delete one
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9400-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

select ok((select count(*) from public.outline_categories where id = '00000000-0000-4000-9400-0000000000c1') = 1, 'a content manager can read categories');

select throws_ok(
  $$ insert into public.outline_categories (name, slug, sort_order) values ('CM Added', 'cm-added', 100) $$,
  '42501', null, 'a content manager cannot add a category'
);

update public.outline_categories set name = 'CM Renamed' where id = '00000000-0000-4000-9400-0000000000c1';
select is((select name from public.outline_categories where id = '00000000-0000-4000-9400-0000000000c1'), 'Outcat Test', 'a content manager cannot rename a category');

delete from public.outline_categories where id = '00000000-0000-4000-9400-0000000000c1';
select is((select count(*)::int from public.outline_categories where id = '00000000-0000-4000-9400-0000000000c1'), 1, 'a content manager cannot delete a category');

-- They can still file an outline under an existing category.
select lives_ok(
  $$ insert into public.teaching_outlines (slug, title, category_id, content, source_path, status) values ('cm-outline-outcat', 'CM Outline', '00000000-0000-4000-9400-0000000000c1', '[]'::jsonb, '00000000-0000-4000-9400-0000000000f1.docx', 'draft') $$,
  'a content manager can still file an outline under an existing category'
);
reset role;

-- ===========================================================================
-- An Administrator can manage categories
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9400-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

select lives_ok($$ insert into public.outline_categories (name, slug, sort_order) values ('Admin Added', 'admin-added', 101) $$, 'an Administrator can add a category');
update public.outline_categories set name = 'Admin Renamed' where id = '00000000-0000-4000-9400-0000000000c1';
select is((select name from public.outline_categories where id = '00000000-0000-4000-9400-0000000000c1'), 'Admin Renamed', 'an Administrator can rename a category');
delete from public.outline_categories where slug = 'admin-added';
select is((select count(*)::int from public.outline_categories where slug = 'admin-added'), 0, 'an Administrator can delete a category');
reset role;

select * from finish();
rollback;
