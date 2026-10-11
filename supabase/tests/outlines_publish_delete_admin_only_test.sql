begin;

select * from no_plan();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9600-000000000001', 'authenticated', 'authenticated', 'admin@outpub.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9600-000000000002', 'authenticated', 'authenticated', 'cm@outpub.local', 'x', now(), now(), now());

insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ('00000000-0000-4000-9600-000000000001', 'admin', true, null, 'Admin', 'admin@outpub.local'),
  ('00000000-0000-4000-9600-000000000002', 'content_manager', true, null, 'CM', 'cm@outpub.local');

insert into public.outline_categories (id, name, slug, sort_order)
values ('00000000-0000-4000-9600-0000000000c1', 'Outpub Test', 'outpub-test', 99);

insert into public.teaching_outlines (id, slug, title, category_id, content, source_path, status, published_at)
values
  ('00000000-0000-4000-9600-0000000000a1', 'outpub-draft', 'Draft Outline', '00000000-0000-4000-9600-0000000000c1', '[]'::jsonb, '00000000-0000-4000-9600-0000000000f1.docx', 'draft', null),
  ('00000000-0000-4000-9600-0000000000a2', 'outpub-live', 'Live Outline', '00000000-0000-4000-9600-0000000000c1', '[]'::jsonb, '00000000-0000-4000-9600-0000000000f2.docx', 'published', now());

-- ===========================================================================
-- A content manager: reads published outlines and drafts the Administrator sent, and changes nothing
-- (see outline_review_test.sql for the proposal cycle)
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9600-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

select is((select count(*)::int from public.teaching_outlines where id = '00000000-0000-4000-9600-0000000000a1'), 0, 'a content manager cannot see a draft that was not sent to them');
select is((select count(*)::int from public.teaching_outlines where id = '00000000-0000-4000-9600-0000000000a2'), 1, 'a content manager can read a published outline');

select throws_ok(
  $$ insert into public.teaching_outlines (slug, title, category_id, content, source_path, status) values ('outpub-new-draft', 'New Draft', '00000000-0000-4000-9600-0000000000c1', '[]'::jsonb, '00000000-0000-4000-9600-0000000000f4.docx', 'draft') $$,
  '42501', null, 'a content manager cannot add an outline, not even a draft'
);
select throws_ok(
  $$ insert into public.teaching_outlines (slug, title, category_id, content, source_path, status, published_at) values ('outpub-new-live', 'New Live', '00000000-0000-4000-9600-0000000000c1', '[]'::jsonb, '00000000-0000-4000-9600-0000000000f5.docx', 'published', now()) $$,
  '42501', null, 'a content manager cannot add a published outline'
);

update public.teaching_outlines set title = 'Edited By CM' where id = '00000000-0000-4000-9600-0000000000a1';
reset role;
select is((select title from public.teaching_outlines where id = '00000000-0000-4000-9600-0000000000a1'), 'Draft Outline', 'a content manager cannot edit a draft');

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9600-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
update public.teaching_outlines set status = 'published', published_at = now() where id = '00000000-0000-4000-9600-0000000000a1';
reset role;
select is((select status from public.teaching_outlines where id = '00000000-0000-4000-9600-0000000000a1'), 'draft', 'a content manager cannot publish a draft');

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9600-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
update public.teaching_outlines set title = 'Hacked Live' where id = '00000000-0000-4000-9600-0000000000a2';
update public.teaching_outlines set status = 'draft', published_at = null where id = '00000000-0000-4000-9600-0000000000a2';
delete from public.teaching_outlines where id in ('00000000-0000-4000-9600-0000000000a1', '00000000-0000-4000-9600-0000000000a2');
reset role;
select is((select title from public.teaching_outlines where id = '00000000-0000-4000-9600-0000000000a2'), 'Live Outline', 'a content manager cannot edit a published outline');
select is((select status from public.teaching_outlines where id = '00000000-0000-4000-9600-0000000000a2'), 'published', 'or unpublish it');
select is((select count(*)::int from public.teaching_outlines where id in ('00000000-0000-4000-9600-0000000000a1', '00000000-0000-4000-9600-0000000000a2')), 2, 'or delete a draft or a published outline');

-- (Stored Word files cannot be deleted by SQL in this database; that policy is covered by a source test.)

-- ===========================================================================
-- An Administrator can do all of it
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9600-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

update public.teaching_outlines set status = 'published', published_at = now() where id = '00000000-0000-4000-9600-0000000000a1';
select is((select status from public.teaching_outlines where id = '00000000-0000-4000-9600-0000000000a1'), 'published', 'an Administrator can publish');
update public.teaching_outlines set status = 'draft', published_at = null where id = '00000000-0000-4000-9600-0000000000a2';
select is((select status from public.teaching_outlines where id = '00000000-0000-4000-9600-0000000000a2'), 'draft', 'an Administrator can unpublish');
delete from public.teaching_outlines where id = '00000000-0000-4000-9600-0000000000a2';
select is((select count(*)::int from public.teaching_outlines where id = '00000000-0000-4000-9600-0000000000a2'), 0, 'an Administrator can delete');
reset role;

select * from finish();
rollback;
