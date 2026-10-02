begin;

select plan(24);

create temp table content_manager_test_ids (
  key text primary key,
  id uuid not null
) on commit drop;

insert into content_manager_test_ids (key, id)
values
  ('admin_user', '00000000-0000-4000-9100-000000000001'),
  ('cm_user', '00000000-0000-4000-9100-000000000002'),
  ('revoked_user', '00000000-0000-4000-9100-000000000003'),
  ('regular_user', '00000000-0000-4000-9100-000000000004');

grant select on content_manager_test_ids to anon, authenticated;

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
  key || '@content-managers.local',
  'local-regression-placeholder',
  now(),
  now(),
  now()
from content_manager_test_ids;

insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ((select id from content_manager_test_ids where key = 'admin_user'), 'admin', true, null, null, null),
  ((select id from content_manager_test_ids where key = 'cm_user'), 'content_manager', true, null, 'Local CM', 'cm_user@content-managers.local'),
  ((select id from content_manager_test_ids where key = 'revoked_user'), 'content_manager', false, now(), 'Revoked CM', 'revoked_user@content-managers.local');

select throws_ok(
  $$ insert into public.admin_authorizations (user_id, role) values ((select id from content_manager_test_ids where key = 'regular_user'), 'editor') $$,
  '23514',
  null,
  'unknown roles are rejected'
);
select throws_ok(
  $$ update public.admin_authorizations set is_active = true where user_id = (select id from content_manager_test_ids where key = 'revoked_user') $$,
  '23514',
  null,
  'a revoked row cannot be marked active without clearing revoked_at'
);
select is(to_regclass('public.reviewer_accounts')::text, null, 'unused Review Portal tables are removed');

-- Admin
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from content_manager_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(public.is_authenticated_admin(), true, 'admin is admin');
select is(public.is_content_manager_or_admin(), true, 'admin passes the content manager check');
select is(public.current_staff_role(), 'admin', 'admin staff role');

-- Content manager
select set_config('request.jwt.claim.sub', (select id::text from content_manager_test_ids where key = 'cm_user'), true);

select is(public.is_authenticated_admin(), false, 'content manager is not admin');
select is(public.is_content_manager_or_admin(), true, 'content manager passes the content manager check');
select is(public.current_staff_role(), 'content_manager', 'content manager staff role');

select lives_ok(
  $$ select public.admin_create_point_of_agreement('Local CM Point', 'CM scripture', 'CM target', 'CM decree', null, current_date + 30, 'active') $$,
  'content manager can create a point through the RPC'
);
select is(
  (select updated_by_name from public.points_of_agreement where point_of_agreement = 'Local CM Point'),
  'Local CM',
  'last edited by records the content manager name'
);
select lives_ok(
  $$ update public.points_of_agreement set decree = 'CM decree edited' where point_of_agreement = 'Local CM Point' $$,
  'content manager can edit a point'
);
select is(
  (select decree from public.points_of_agreement where point_of_agreement = 'Local CM Point'),
  'CM decree edited',
  'content manager edit was saved'
);
select lives_ok(
  $$ update public.points_of_agreement_guide_settings set subtitle = subtitle where id = true $$,
  'content manager can edit guide settings'
);

select is((select count(*) from public.admin_authorizations), 0::bigint, 'content manager cannot read staff authorizations');
update public.admin_authorizations set role = 'admin' where user_id = auth.uid();
select is(public.current_staff_role(), 'content_manager', 'content manager cannot promote themselves');
select throws_ok(
  $$ insert into public.site_settings (key) values ('local-cm-test') $$,
  '42501',
  null,
  'content manager cannot write admin-only tables'
);

select public.mark_staff_activated();
reset role;
select ok(
  (select activated_at is not null from public.admin_authorizations where user_id = (select id from content_manager_test_ids where key = 'cm_user')),
  'mark_staff_activated records first password set'
);

-- Revoked content manager
set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from content_manager_test_ids where key = 'revoked_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(public.is_content_manager_or_admin(), false, 'revoked content manager fails the content manager check');
select is(public.current_staff_role(), null, 'revoked content manager has no staff role');
select is((select count(*) from public.points_of_agreement), 0::bigint, 'revoked content manager cannot read points');
select throws_ok(
  $$ select public.admin_create_point_of_agreement('Local Revoked Point', 's', 't', 'd', null, current_date + 30, 'active') $$,
  '42501',
  null,
  'revoked content manager cannot create points'
);

-- Regular signed-in user
select set_config('request.jwt.claim.sub', (select id::text from content_manager_test_ids where key = 'regular_user'), true);
select is(public.is_content_manager_or_admin(), false, 'regular user fails the content manager check');
select is(public.current_staff_role(), null, 'regular user has no staff role');

select * from finish();

rollback;
