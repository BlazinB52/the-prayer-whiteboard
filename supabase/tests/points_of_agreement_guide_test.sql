begin;

select plan(12);

create temp table points_of_agreement_test_ids (
  key text primary key,
  id uuid not null
) on commit drop;

insert into points_of_agreement_test_ids (key, id)
values
  ('admin_user', '00000000-0000-4000-9000-000000000001'),
  ('regular_user', '00000000-0000-4000-9000-000000000002'),
  ('admin_auth', '00000000-0000-4000-9000-000000000003');

grant select on points_of_agreement_test_ids to anon, authenticated;

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
  key || '@points-of-agreement.local',
  'local-regression-placeholder',
  now(),
  now(),
  now()
from points_of_agreement_test_ids
where key like '%_user';

insert into public.admin_authorizations (id, user_id, role, is_active)
values (
  (select id from points_of_agreement_test_ids where key = 'admin_auth'),
  (select id from points_of_agreement_test_ids where key = 'admin_user'),
  'admin',
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from points_of_agreement_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(public.is_authenticated_admin(), true, 'test admin is authenticated admin');

insert into public.points_of_agreement (
  point_of_agreement,
  scripture,
  target,
  decree,
  additional_direction,
  expires_on,
  display_order,
  status,
  archived_at
)
values
  (
    'Local Regression Active Current',
    'Current scripture',
    'Current target',
    'Current decree',
    null,
    current_date + 30,
    9001,
    'active',
    null
  ),
  (
    'Local Regression Active Expired',
    'Expired scripture',
    'Expired target',
    'Expired decree',
    'Expired direction',
    current_date - 1,
    9002,
    'active',
    null
  ),
  (
    'Local Regression Archived',
    'Archived scripture',
    'Archived target',
    'Archived decree',
    null,
    current_date + 30,
    9003,
    'archived',
    now()
  );

update public.points_of_agreement_guide_settings
set title = 'LOCAL REGRESSION PRAYER GUIDE'
where id = true;

select is(
  (select title from public.points_of_agreement_guide_settings where id = true),
  'LOCAL REGRESSION PRAYER GUIDE',
  'admin can update guide settings'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is((select count(*) from public.points_of_agreement), 0::bigint, 'anonymous cannot read underlying points table');
select is((select count(*) from public.points_of_agreement_guide_settings), 0::bigint, 'anonymous cannot read underlying guide settings table');
select is(
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'public_points_of_agreement' and column_name in ('id', 'expires_on', 'status', 'created_at', 'updated_at', 'archived_at')),
  0::bigint,
  'public points view does not expose admin-only columns'
);
select is(
  (select count(*) from information_schema.columns where table_schema = 'public' and table_name = 'public_points_of_agreement_guide_settings' and column_name in ('id', 'created_at', 'updated_at')),
  0::bigint,
  'public guide settings view does not expose internal columns'
);
select is(
  (select title from public.public_points_of_agreement_guide_settings limit 1),
  'LOCAL REGRESSION PRAYER GUIDE',
  'anonymous can read public guide settings through public view'
);
select is(
  (select count(*) from public.public_points_of_agreement where point_of_agreement = 'Local Regression Active Current'),
  1::bigint,
  'anonymous can read active current point through public view'
);
select is(
  (select count(*) from public.public_points_of_agreement where point_of_agreement = 'Local Regression Active Expired'),
  1::bigint,
  'anonymous can read active expired point through public view'
);
select is(
  (select count(*) from public.public_points_of_agreement where point_of_agreement = 'Local Regression Archived'),
  0::bigint,
  'anonymous cannot read archived point through public view'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from points_of_agreement_test_ids where key = 'regular_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$
    insert into public.points_of_agreement (
      point_of_agreement,
      scripture,
      target,
      decree,
      expires_on,
      display_order,
      status
    )
    values (
      'Local Regression Unauthorized',
      'Nope',
      'Nope',
      'Nope',
      current_date + 30,
      9004,
      'active'
    )
  $$,
  '42501',
  null,
  'non-admin authenticated user cannot insert points'
);
select is(public.is_authenticated_admin(), false, 'regular user is not authenticated admin');

select * from finish();

rollback;
