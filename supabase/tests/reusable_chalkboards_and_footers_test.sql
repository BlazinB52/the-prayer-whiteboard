begin;

select plan(13);

create temp table reusable_content_test_ids (
  key text primary key,
  id uuid not null
) on commit drop;

insert into reusable_content_test_ids (key, id)
values
  ('admin_user', '00000000-0000-4000-a000-000000000001'),
  ('regular_user', '00000000-0000-4000-a000-000000000002'),
  ('admin_auth', '00000000-0000-4000-a000-000000000003'),
  ('teaching_one', '00000000-0000-4000-a000-000000000011'),
  ('teaching_two', '00000000-0000-4000-a000-000000000012'),
  ('teaching_without_chalkboard', '00000000-0000-4000-a000-000000000013'),
  ('category_without_chalkboard', '00000000-0000-4000-a000-000000000014'),
  ('section_without_chalkboard', '00000000-0000-4000-a000-000000000015'),
  ('weekly_update', '00000000-0000-4000-a000-000000000021'),
  ('chalkboard_one', '00000000-0000-4000-a000-000000000031'),
  ('chalkboard_two', '00000000-0000-4000-a000-000000000032'),
  ('footer_one', '00000000-0000-4000-a000-000000000041'),
  ('footer_two', '00000000-0000-4000-a000-000000000042');

grant select on reusable_content_test_ids to anon, authenticated;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
select
  '00000000-0000-0000-0000-000000000000',
  id,
  'authenticated',
  'authenticated',
  key || '@reusable-content.local',
  'local-regression-placeholder',
  now(),
  now(),
  now()
from reusable_content_test_ids
where key like '%_user';

insert into public.admin_authorizations (id, user_id, role, is_active)
values (
  (select id from reusable_content_test_ids where key = 'admin_auth'),
  (select id from reusable_content_test_ids where key = 'admin_user'),
  'admin',
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from reusable_content_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.teachings (id, title, slug, status, summary, chalkboard_asset_id)
values
  ((select id from reusable_content_test_ids where key = 'teaching_one'), 'Reusable Test Teaching One', 'reusable-test-teaching-one', 'published', 'Teaching one summary', null),
  ((select id from reusable_content_test_ids where key = 'teaching_two'), 'Reusable Test Teaching Two', 'reusable-test-teaching-two', 'published', 'Teaching two summary', null);

insert into public.weekly_updates (id, title, body_markdown, converted_content, status, is_current, published_at)
values ((select id from reusable_content_test_ids where key = 'weekly_update'), 'Reusable Test Weekly Update', 'Weekly body', '[]'::jsonb, 'published', true, now());

insert into public.chalkboard_assets (
  id,
  asset_group_id,
  storage_path,
  website_storage_path,
  title,
  canonical_name,
  chalkboard_date,
  alt_text,
  display_order,
  width,
  height,
  version_number,
  is_current_version,
  status
)
values
  (
    (select id from reusable_content_test_ids where key = 'chalkboard_one'),
    (select id from reusable_content_test_ids where key = 'chalkboard_one'),
    'library/20260914_reusable-one/00000000-0000-4000-a000-000000000031/v1/incoming.png',
    'library/20260914_reusable-one/00000000-0000-4000-a000-000000000031/v1/website.webp',
    'Reusable Chalkboard One',
    '20260914_Reusable Chalkboard One',
    '2026-09-14',
    'Reusable chalkboard one',
    1,
    1080,
    1440,
    1,
    true,
    'active'
  ),
  (
    (select id from reusable_content_test_ids where key = 'chalkboard_two'),
    (select id from reusable_content_test_ids where key = 'chalkboard_two'),
    'library/20260914_reusable-two/00000000-0000-4000-a000-000000000032/v1/incoming.png',
    'library/20260914_reusable-two/00000000-0000-4000-a000-000000000032/v1/website.webp',
    'Reusable Chalkboard Two',
    '20260914_Reusable Chalkboard Two',
    '2026-09-14',
    'Reusable chalkboard two',
    2,
    1080,
    1440,
    1,
    true,
    'active'
  );

insert into public.teaching_chalkboard_assignments (teaching_id, chalkboard_asset_id, display_order)
values
  ((select id from reusable_content_test_ids where key = 'teaching_one'), (select id from reusable_content_test_ids where key = 'chalkboard_one'), 1),
  ((select id from reusable_content_test_ids where key = 'teaching_two'), (select id from reusable_content_test_ids where key = 'chalkboard_one'), 1);

select is(
  (select count(*) from public.teaching_chalkboard_assignments where chalkboard_asset_id = (select id from reusable_content_test_ids where key = 'chalkboard_one')),
  2::bigint,
  'same chalkboard can be assigned to two teachings'
);

delete from public.teaching_chalkboard_assignments
where teaching_id = (select id from reusable_content_test_ids where key = 'teaching_one')
  and chalkboard_asset_id = (select id from reusable_content_test_ids where key = 'chalkboard_one');

select is(
  (select count(*) from public.teaching_chalkboard_assignments where chalkboard_asset_id = (select id from reusable_content_test_ids where key = 'chalkboard_one')),
  1::bigint,
  'removing one chalkboard assignment leaves the other assignment intact'
);

insert into public.teaching_chalkboard_assignments (teaching_id, chalkboard_asset_id, display_order)
values
  ((select id from reusable_content_test_ids where key = 'teaching_one'), (select id from reusable_content_test_ids where key = 'chalkboard_one'), 1),
  ((select id from reusable_content_test_ids where key = 'teaching_one'), (select id from reusable_content_test_ids where key = 'chalkboard_two'), 2);

select is(
  (select count(*) from public.teaching_chalkboard_assignments where teaching_id = (select id from reusable_content_test_ids where key = 'teaching_one')),
  2::bigint,
  'one teaching can have multiple chalkboards'
);

insert into public.weekly_update_chalkboard_assignments (weekly_update_id, chalkboard_asset_id, display_order)
values
  ((select id from reusable_content_test_ids where key = 'weekly_update'), (select id from reusable_content_test_ids where key = 'chalkboard_one'), 1),
  ((select id from reusable_content_test_ids where key = 'weekly_update'), (select id from reusable_content_test_ids where key = 'chalkboard_two'), 2);

select is(
  (select count(*) from public.weekly_update_chalkboard_assignments where weekly_update_id = (select id from reusable_content_test_ids where key = 'weekly_update')),
  2::bigint,
  'one Weekly Update can have multiple chalkboards'
);

insert into public.content_footers (id, internal_title, content, status)
values
  ((select id from reusable_content_test_ids where key = 'footer_one'), 'Reusable Footer One', 'Shared footer content', 'active'),
  ((select id from reusable_content_test_ids where key = 'footer_two'), 'Reusable Footer Two', 'Different footer content', 'active');

insert into public.teaching_footer_assignments (teaching_id, footer_id)
values ((select id from reusable_content_test_ids where key = 'teaching_one'), (select id from reusable_content_test_ids where key = 'footer_one'));
insert into public.weekly_update_footer_assignments (weekly_update_id, footer_id)
values ((select id from reusable_content_test_ids where key = 'weekly_update'), (select id from reusable_content_test_ids where key = 'footer_one'));
insert into public.teaching_footer_assignments (teaching_id, footer_id)
values ((select id from reusable_content_test_ids where key = 'teaching_two'), (select id from reusable_content_test_ids where key = 'footer_two'));

select is(
  (select count(*) from public.teaching_footer_assignments where footer_id = (select id from reusable_content_test_ids where key = 'footer_one'))
  + (select count(*) from public.weekly_update_footer_assignments where footer_id = (select id from reusable_content_test_ids where key = 'footer_one')),
  2::bigint,
  'same footer can be assigned to a teaching and a Weekly Update'
);

select is(
  (select footer_id from public.teaching_footer_assignments where teaching_id = (select id from reusable_content_test_ids where key = 'teaching_two')),
  (select id from reusable_content_test_ids where key = 'footer_two'),
  'a different footer can be assigned to another item'
);

update public.content_footers
set content = 'Updated shared footer content'
where id = (select id from reusable_content_test_ids where key = 'footer_one');

select is(
  (select footer.content from public.teaching_footer_assignments assignment join public.content_footers footer on footer.id = assignment.footer_id where assignment.teaching_id = (select id from reusable_content_test_ids where key = 'teaching_one')),
  'Updated shared footer content',
  'editing a shared footer updates teaching consumers'
);

select is(
  (select footer.content from public.weekly_update_footer_assignments assignment join public.content_footers footer on footer.id = assignment.footer_id where assignment.weekly_update_id = (select id from reusable_content_test_ids where key = 'weekly_update')),
  'Updated shared footer content',
  'editing a shared footer updates Weekly Update consumers'
);

delete from public.teaching_footer_assignments
where teaching_id = (select id from reusable_content_test_ids where key = 'teaching_one');

select is(
  (select count(*) from public.weekly_update_footer_assignments where footer_id = (select id from reusable_content_test_ids where key = 'footer_one')),
  1::bigint,
  'removing a footer assignment from one item leaves the other item assigned'
);

select throws_ok(
  $$ delete from public.content_footers where id = (select id from reusable_content_test_ids where key = 'footer_one') $$,
  '23503',
  null,
  'database blocks deleting an assigned footer'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  (select count(*) from public.content_footers where id = (select id from reusable_content_test_ids where key = 'footer_one')),
  1::bigint,
  'anonymous can read an active footer assigned to public content'
);

select is(
  (select count(*) from public.content_footers where id = (select id from reusable_content_test_ids where key = 'footer_two')),
  1::bigint,
  'anonymous can read a different active footer assigned to public teaching content'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from reusable_content_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.teachings (id, title, slug, status, summary, gathering_date, chalkboard_asset_id)
values (
  (select id from reusable_content_test_ids where key = 'teaching_without_chalkboard'),
  'Publish Without Chalkboard',
  'publish-without-chalkboard',
  'draft',
  'This teaching has all publishable content except a chalkboard.',
  '2026-09-15',
  null
);

insert into public.teaching_categories (id, teaching_id, slug, title, sort_order, status)
values (
  (select id from reusable_content_test_ids where key = 'category_without_chalkboard'),
  (select id from reusable_content_test_ids where key = 'teaching_without_chalkboard'),
  'publishable-category',
  'Publishable Category',
  1,
  'draft'
);

insert into public.teaching_sections (id, teaching_id, category_id, slug, title, content, sort_order, status)
values (
  (select id from reusable_content_test_ids where key = 'section_without_chalkboard'),
  (select id from reusable_content_test_ids where key = 'teaching_without_chalkboard'),
  (select id from reusable_content_test_ids where key = 'category_without_chalkboard'),
  'publishable-section',
  'Publishable Section',
  '{"format":"paragraph","text":"Publishable section text."}'::jsonb,
  1,
  'draft'
);

select public.publish_and_feature_teaching((select id from reusable_content_test_ids where key = 'teaching_without_chalkboard'));

select ok(
  exists (
    select 1
    from public.teachings teaching
    where teaching.id = (select id from reusable_content_test_ids where key = 'teaching_without_chalkboard')
      and teaching.status = 'published'
      and teaching.is_featured = true
      and teaching.chalkboard_asset_id is null
      and not exists (
        select 1
        from public.teaching_chalkboard_assignments assignment
        where assignment.teaching_id = teaching.id
      )
  ),
  'admin can publish and feature a teaching without a chalkboard'
);

select * from finish();

rollback;
