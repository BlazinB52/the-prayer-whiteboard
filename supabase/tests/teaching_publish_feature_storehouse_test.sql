begin;

select plan(17);

create temp table teaching_publish_test_ids (
  key text primary key,
  id uuid not null
) on commit drop;

insert into teaching_publish_test_ids (key, id)
values
  ('admin_user', '00000000-0000-4000-b000-000000000001'),
  ('admin_auth', '00000000-0000-4000-b000-000000000002'),
  ('regular_user', '00000000-0000-4000-b000-000000000003'),
  ('first_teaching', '00000000-0000-4000-b000-000000000011'),
  ('second_teaching', '00000000-0000-4000-b000-000000000012'),
  ('first_category', '00000000-0000-4000-b000-000000000021'),
  ('second_category', '00000000-0000-4000-b000-000000000022'),
  ('first_section', '00000000-0000-4000-b000-000000000031'),
  ('second_section', '00000000-0000-4000-b000-000000000032');

grant select on teaching_publish_test_ids to authenticated;

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
values
  (
    '00000000-0000-0000-0000-000000000000',
    (select id from teaching_publish_test_ids where key = 'admin_user'),
    'authenticated',
    'authenticated',
    'teaching-publish-admin@example.test',
    'local-regression-placeholder',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    (select id from teaching_publish_test_ids where key = 'regular_user'),
    'authenticated',
    'authenticated',
    'teaching-publish-regular@example.test',
    'local-regression-placeholder',
    now(),
    now(),
    now()
  );

insert into public.admin_authorizations (id, user_id, role, is_active)
values (
  (select id from teaching_publish_test_ids where key = 'admin_auth'),
  (select id from teaching_publish_test_ids where key = 'admin_user'),
  'admin',
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teaching_publish_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.teachings (id, title, slug, status, summary, gathering_date, is_featured, teaser_1_heading, teaser_1_text, teaser_2_heading, teaser_2_text)
values
  (
    (select id from teaching_publish_test_ids where key = 'first_teaching'),
    'First Storehouse Teaching',
    'first-storehouse-teaching',
    'draft',
    'First publishable teaching summary.',
    '2026-09-01',
    false,
    'First teaser',
    'First teaser text.',
    'Second first teaser',
    'Second first teaser text.'
  ),
  (
    (select id from teaching_publish_test_ids where key = 'second_teaching'),
    'Second Storehouse Teaching',
    'second-storehouse-teaching',
    'draft',
    'Second publishable teaching summary.',
    '2026-09-08',
    false,
    'Second teaser',
    'Second teaser text.',
    null,
    null
  );

insert into public.teaching_categories (id, teaching_id, slug, title, sort_order, status)
values
  (
    (select id from teaching_publish_test_ids where key = 'first_category'),
    (select id from teaching_publish_test_ids where key = 'first_teaching'),
    'first-category',
    'First Category',
    1,
    'draft'
  ),
  (
    (select id from teaching_publish_test_ids where key = 'second_category'),
    (select id from teaching_publish_test_ids where key = 'second_teaching'),
    'second-category',
    'Second Category',
    1,
    'draft'
  );

insert into public.teaching_sections (id, teaching_id, category_id, slug, title, content, sort_order, status)
values
  (
    (select id from teaching_publish_test_ids where key = 'first_section'),
    (select id from teaching_publish_test_ids where key = 'first_teaching'),
    (select id from teaching_publish_test_ids where key = 'first_category'),
    'first-section',
    'First Section',
    '{"format":"paragraph","text":"First publishable section."}'::jsonb,
    1,
    'draft'
  ),
  (
    (select id from teaching_publish_test_ids where key = 'second_section'),
    (select id from teaching_publish_test_ids where key = 'second_teaching'),
    (select id from teaching_publish_test_ids where key = 'second_category'),
    'second-section',
    'Second Section',
    '{"format":"paragraph","text":"Second publishable section."}'::jsonb,
    1,
    'draft'
  );

update public.teachings
set teaser_1_heading = null
where id = (select id from teaching_publish_test_ids where key = 'first_teaching');

select throws_ok(
  $$ select public.publish_and_feature_teaching((select id from teaching_publish_test_ids where key = 'first_teaching')) $$,
  'P0001',
  'Teaser 1 heading is required before publishing.',
  'teaser 1 heading is required for publication'
);

update public.teachings
set teaser_1_heading = 'First teaser'
where id = (select id from teaching_publish_test_ids where key = 'first_teaching');

update public.teachings
set teaser_1_text = null
where id = (select id from teaching_publish_test_ids where key = 'first_teaching');

select throws_ok(
  $$ select public.publish_and_feature_teaching((select id from teaching_publish_test_ids where key = 'first_teaching')) $$,
  'P0001',
  'Teaser 1 text is required before publishing.',
  'teaser 1 text is required for publication'
);

update public.teachings
set teaser_1_text = 'First teaser text.'
where id = (select id from teaching_publish_test_ids where key = 'first_teaching');

select throws_ok(
  $$ update public.teachings
     set teaser_2_heading = 'Incomplete second teaser',
         teaser_2_text = null
     where id = (select id from teaching_publish_test_ids where key = 'second_teaching') $$,
  '23514',
  null,
  'database rejects incomplete teaser 2 values'
);

select throws_ok(
  $$ update public.teachings
     set teaser_1_text = repeat('x', 301)
     where id = (select id from teaching_publish_test_ids where key = 'first_teaching') $$,
  '23514',
  null,
  'database enforces teaser text maximum length'
);

select throws_ok(
  $$ update public.teachings
     set teaser_1_heading = repeat('x', 101)
     where id = (select id from teaching_publish_test_ids where key = 'first_teaching') $$,
  '23514',
  null,
  'database enforces teaser heading maximum length'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teaching_publish_test_ids where key = 'regular_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

update public.teachings
set teaser_1_heading = 'Non-admin edit',
    teaser_1_text = 'Non-admin teaser text.'
where id = (select id from teaching_publish_test_ids where key = 'first_teaching');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teaching_publish_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(
  (
    select teaser_1_heading || '|' || teaser_1_text
    from public.teachings
    where id = (select id from teaching_publish_test_ids where key = 'first_teaching')
  ),
  'First teaser|First teaser text.',
  'non-admin cannot update teaching teaser metadata'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teaching_publish_test_ids where key = 'regular_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select public.publish_and_feature_teaching((select id from teaching_publish_test_ids where key = 'first_teaching')) $$,
  '42501',
  'Administrator authorization is required.',
  'administrator authorization remains required for publishing'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from teaching_publish_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.publish_and_feature_teaching((select id from teaching_publish_test_ids where key = 'first_teaching'));

select ok(
  exists (
    select 1
    from public.teachings
    where id = (select id from teaching_publish_test_ids where key = 'first_teaching')
      and status = 'published'
      and is_featured = true
  ),
  'newly published teaching is published and featured'
);

select public.publish_and_feature_teaching((select id from teaching_publish_test_ids where key = 'second_teaching'));

select ok(
  exists (
    select 1
    from public.teachings
    where id = (select id from teaching_publish_test_ids where key = 'second_teaching')
      and status = 'published'
      and is_featured = true
  ),
  'newly published replacement feature is published and featured'
);

select ok(
  exists (
    select 1
    from public.teachings
    where id = (select id from teaching_publish_test_ids where key = 'first_teaching')
      and status = 'published'
      and is_featured = false
  ),
  'previous feature remains published and becomes unfeatured'
);

select is(
  (
    select status
    from public.teaching_categories
    where id = (select id from teaching_publish_test_ids where key = 'first_category')
  ),
  'published',
  'previous feature category remains published'
);

select is(
  (
    select status
    from public.teaching_sections
    where id = (select id from teaching_publish_test_ids where key = 'first_section')
  ),
  'published',
  'previous feature section remains published'
);

select is(
  (
    select count(*)
    from public.teachings
    where status = 'published'
      and id in (
        (select id from teaching_publish_test_ids where key = 'first_teaching'),
        (select id from teaching_publish_test_ids where key = 'second_teaching')
      )
  ),
  2::bigint,
  'both teachings qualify for the Storehouse published-teachings query'
);

select is(
  (
    select string_agg(slug, ',' order by gathering_date desc nulls last, id desc)
    from public.teachings
    where status = 'published'
      and id in (
        (select id from teaching_publish_test_ids where key = 'first_teaching'),
        (select id from teaching_publish_test_ids where key = 'second_teaching')
      )
  ),
  'second-storehouse-teaching,first-storehouse-teaching',
  'Storehouse query orders by gathering date descending with deterministic id tie-breaker'
);

select is(
  (
    select count(*)
    from public.teachings
    where status = 'draft'
      and id in (
        (select id from teaching_publish_test_ids where key = 'first_teaching'),
        (select id from teaching_publish_test_ids where key = 'second_teaching')
      )
  ),
  0::bigint,
  'publishing and featuring does not return any teaching to draft'
);

update public.teachings
set status = 'draft', is_featured = false
where id = (select id from teaching_publish_test_ids where key = 'first_teaching')
  and status = 'published';

select ok(
  exists (
    select 1
    from public.teachings
    where id = (select id from teaching_publish_test_ids where key = 'first_teaching')
      and status = 'draft'
      and is_featured = false
  ),
  'explicit unpublish operation can return a teaching to draft'
);

select ok(
  exists (
    select 1
    from public.teachings
    where id = (select id from teaching_publish_test_ids where key = 'second_teaching')
      and status = 'published'
      and is_featured = true
  ),
  'explicit unpublish of one teaching does not affect the current feature'
);

select * from finish();

rollback;
