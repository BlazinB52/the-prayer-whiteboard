begin;

select plan(7);

create temp table copyright_disclaimer_test_ids (
  key text primary key,
  id uuid not null
) on commit drop;

insert into copyright_disclaimer_test_ids (key, id)
values
  ('admin_user', '00000000-0000-4000-a000-000000000101'),
  ('regular_user', '00000000-0000-4000-a000-000000000102'),
  ('admin_auth', '00000000-0000-4000-a000-000000000103');

grant select on copyright_disclaimer_test_ids to anon, authenticated;

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
  key || '@copyright-disclaimers.local',
  'local-regression-placeholder',
  now(),
  now(),
  now()
from copyright_disclaimer_test_ids
where key like '%_user';

insert into public.admin_authorizations (id, user_id, role, is_active)
values (
  (select id from copyright_disclaimer_test_ids where key = 'admin_auth'),
  (select id from copyright_disclaimer_test_ids where key = 'admin_user'),
  'admin',
  true
);

select ok(
  exists (select 1 from public.copyright_disclaimers where disclaimer_key = 'full_page'),
  'full_page disclaimer exists'
);

select ok(
  exists (select 1 from public.copyright_disclaimers where disclaimer_key = 'email_short'),
  'email_short disclaimer exists'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from copyright_disclaimer_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

update public.copyright_disclaimers
set content = 'Admin edited full page disclaimer'
where disclaimer_key = 'full_page';

select is(
  (select content from public.copyright_disclaimers where disclaimer_key = 'full_page'),
  'Admin edited full page disclaimer',
  'admin can edit full_page'
);

update public.copyright_disclaimers
set content = 'Admin edited email short disclaimer'
where disclaimer_key = 'email_short';

select is(
  (select content from public.copyright_disclaimers where disclaimer_key = 'email_short'),
  'Admin edited email short disclaimer',
  'admin can edit email_short'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from copyright_disclaimer_test_ids where key = 'regular_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ update public.copyright_disclaimers set content = 'regular user edit' where disclaimer_key = 'full_page' $$,
  '42501',
  null,
  'public cannot edit copyright disclaimers'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is(
  (select count(*) from public.copyright_disclaimers where disclaimer_key in ('full_page', 'email_short')),
  2::bigint,
  'public can read seeded copyright disclaimers'
);

select throws_ok(
  $$ insert into public.copyright_disclaimers (disclaimer_key, title, content) values ('other', 'Other', 'Other') $$,
  '42501',
  null,
  'public cannot insert copyright disclaimers'
);

select * from finish();

rollback;
