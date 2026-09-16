begin;

alter table public.teachings
  add column if not exists teaching_type text not null default 'standard';

create or replace function public.publish_and_feature_teaching(p_teaching_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teaching public.teachings%rowtype;
begin
  if not public.is_authenticated_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  select *
    into v_teaching
    from public.teachings
    where id = p_teaching_id
    for update;

  if not found then
    raise exception 'Teaching could not be found.' using errcode = 'P0002';
  end if;

  if v_teaching.teaching_type = 'standard' then
    update public.teachings
      set is_featured = false
      where is_featured = true
        and id <> p_teaching_id;
  end if;

  update public.teaching_categories
    set status = 'published',
        published_at = coalesce(published_at, now())
    where teaching_id = p_teaching_id
      and status in ('draft', 'published');

  update public.teaching_sections
    set status = 'published',
        published_at = coalesce(published_at, now())
    where teaching_id = p_teaching_id
      and status in ('draft', 'published');

  update public.teachings
    set status = 'published',
        is_featured = case when v_teaching.teaching_type = 'standard' then true else false end,
        published_at = coalesce(published_at, now())
    where id = p_teaching_id
      and status in ('draft', 'published');
end;
$$;

select plan(10);

create temp table deep_dive_test_ids (
  key text primary key,
  id uuid not null
) on commit drop;

insert into deep_dive_test_ids (key, id)
values
  ('admin_user', '00000000-0000-4000-b000-000000001001'),
  ('admin_auth', '00000000-0000-4000-b000-000000001002'),
  ('regular_user', '00000000-0000-4000-b000-000000001003'),
  ('featured_standard', '00000000-0000-4000-b000-000000001011'),
  ('next_standard', '00000000-0000-4000-b000-000000001012'),
  ('deep_dive', '00000000-0000-4000-b000-000000001013'),
  ('draft_deep_dive', '00000000-0000-4000-b000-000000001014'),
  ('featured_category', '00000000-0000-4000-b000-000000001021'),
  ('next_category', '00000000-0000-4000-b000-000000001022'),
  ('deep_dive_category', '00000000-0000-4000-b000-000000001023'),
  ('featured_section', '00000000-0000-4000-b000-000000001031'),
  ('next_section', '00000000-0000-4000-b000-000000001032'),
  ('deep_dive_section', '00000000-0000-4000-b000-000000001033');

grant select on deep_dive_test_ids to authenticated;

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
  ('00000000-0000-0000-0000-000000000000', (select id from deep_dive_test_ids where key = 'admin_user'), 'authenticated', 'authenticated', 'deep-dive-admin@example.test', 'local-regression-placeholder', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', (select id from deep_dive_test_ids where key = 'regular_user'), 'authenticated', 'authenticated', 'deep-dive-regular@example.test', 'local-regression-placeholder', now(), now(), now());

insert into public.admin_authorizations (id, user_id, role, is_active)
values ((select id from deep_dive_test_ids where key = 'admin_auth'), (select id from deep_dive_test_ids where key = 'admin_user'), 'admin', true);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from deep_dive_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.teachings (id, title, slug, status, summary, gathering_date, is_featured, teaser_1_heading, teaser_1_text)
values (
  (select id from deep_dive_test_ids where key = 'featured_standard'),
  'Featured Standard Teaching',
  'featured-standard-teaching',
  'published',
  'Already featured standard summary.',
  '2026-09-01',
  true,
  'Featured teaser',
  'Featured teaser text.'
);

insert into public.teachings (id, title, slug, status, summary, gathering_date, is_featured, teaser_1_heading, teaser_1_text)
values (
  (select id from deep_dive_test_ids where key = 'next_standard'),
  'Next Standard Teaching',
  'next-standard-teaching',
  'draft',
  'Next standard summary.',
  '2026-09-08',
  false,
  'Next teaser',
  'Next teaser text.'
);

insert into public.teachings (id, title, slug, teaching_type, status, summary, gathering_date, is_featured)
values
  (
    (select id from deep_dive_test_ids where key = 'deep_dive'),
    'Deep Dive Teaching',
    'deep-dive-teaching',
    'deep_dive',
    'draft',
    'Deep Dive summary.',
    '2026-09-15',
    false
  ),
  (
    (select id from deep_dive_test_ids where key = 'draft_deep_dive'),
    'Draft Deep Dive Teaching',
    'draft-deep-dive-teaching',
    'deep_dive',
    'draft',
    'Draft Deep Dive summary.',
    '2026-09-22',
    false
  );

select is(
  (select teaching_type from public.teachings where id = (select id from deep_dive_test_ids where key = 'featured_standard')),
  'standard',
  'existing teachings default to standard'
);

insert into public.teaching_categories (id, teaching_id, slug, title, sort_order, status)
values
  ((select id from deep_dive_test_ids where key = 'featured_category'), (select id from deep_dive_test_ids where key = 'featured_standard'), 'featured-category', 'Featured Category', 1, 'published'),
  ((select id from deep_dive_test_ids where key = 'next_category'), (select id from deep_dive_test_ids where key = 'next_standard'), 'next-category', 'Next Category', 1, 'draft'),
  ((select id from deep_dive_test_ids where key = 'deep_dive_category'), (select id from deep_dive_test_ids where key = 'deep_dive'), 'deep-dive-category', 'Deep Dive Category', 1, 'draft');

insert into public.teaching_sections (id, teaching_id, category_id, slug, title, content, sort_order, status)
values
  ((select id from deep_dive_test_ids where key = 'featured_section'), (select id from deep_dive_test_ids where key = 'featured_standard'), (select id from deep_dive_test_ids where key = 'featured_category'), 'featured-section', 'Featured Section', '{"format":"paragraph","text":"Featured content."}'::jsonb, 1, 'published'),
  ((select id from deep_dive_test_ids where key = 'next_section'), (select id from deep_dive_test_ids where key = 'next_standard'), (select id from deep_dive_test_ids where key = 'next_category'), 'next-section', 'Next Section', '{"format":"paragraph","text":"Next content."}'::jsonb, 1, 'draft'),
  ((select id from deep_dive_test_ids where key = 'deep_dive_section'), (select id from deep_dive_test_ids where key = 'deep_dive'), (select id from deep_dive_test_ids where key = 'deep_dive_category'), 'deep-dive-section', 'Deep Dive Section', '{"format":"paragraph","text":"Deep Dive content."}'::jsonb, 1, 'draft');

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from deep_dive_test_ids where key = 'regular_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select public.publish_and_feature_teaching((select id from deep_dive_test_ids where key = 'deep_dive')) $$,
  '42501',
  'Administrator authorization is required.',
  'administrator authorization remains required for Deep Dive publishing'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from deep_dive_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select public.publish_and_feature_teaching((select id from deep_dive_test_ids where key = 'deep_dive'));

select ok(
  exists (
    select 1
    from public.teachings
    where id = (select id from deep_dive_test_ids where key = 'deep_dive')
      and status = 'published'
      and teaching_type = 'deep_dive'
      and is_featured = false
  ),
  'a Deep Dive can be saved and published without becoming featured'
);

select ok(
  exists (
    select 1
    from public.teachings
    where id = (select id from deep_dive_test_ids where key = 'featured_standard')
      and status = 'published'
      and is_featured = true
  ),
  'publishing a Deep Dive does not replace the normal featured teaching'
);

select is(
  (select status from public.teaching_categories where id = (select id from deep_dive_test_ids where key = 'deep_dive_category')),
  'published',
  'Deep Dive categories are published with the teaching'
);

select is(
  (select status from public.teaching_sections where id = (select id from deep_dive_test_ids where key = 'deep_dive_section')),
  'published',
  'Deep Dive sections are published with the teaching'
);

select is(
  (
    select count(*)
    from public.teachings
    where status = 'published'
      and teaching_type = 'deep_dive'
      and id in (
        (select id from deep_dive_test_ids where key = 'deep_dive'),
        (select id from deep_dive_test_ids where key = 'draft_deep_dive'),
        (select id from deep_dive_test_ids where key = 'featured_standard')
      )
  ),
  1::bigint,
  'published Deep Dives appear in the collection while drafts and standard teachings do not'
);

select public.publish_and_feature_teaching((select id from deep_dive_test_ids where key = 'next_standard'));

select ok(
  exists (
    select 1
    from public.teachings
    where id = (select id from deep_dive_test_ids where key = 'next_standard')
      and status = 'published'
      and is_featured = true
  ),
  'existing standard teaching publish-and-feature behavior remains intact'
);

select ok(
  exists (
    select 1
    from public.teachings
    where id = (select id from deep_dive_test_ids where key = 'featured_standard')
      and status = 'published'
      and is_featured = false
  ),
  'standard publishing still unfeatures the previous standard feature'
);

select ok(
  exists (
    select 1
    from public.teachings
    where id = (select id from deep_dive_test_ids where key = 'deep_dive')
      and status = 'published'
      and teaching_type = 'deep_dive'
      and is_featured = false
  ),
  'standard publishing does not alter the published Deep Dive'
);

select * from finish();

rollback;
