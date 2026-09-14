begin;

select plan(10);

create temp table weekly_update_test_ids (
  key text primary key,
  id uuid not null
) on commit drop;

insert into weekly_update_test_ids (key, id)
values
  ('admin_user', '00000000-0000-4000-9100-000000000001'),
  ('regular_user', '00000000-0000-4000-9100-000000000002'),
  ('admin_auth', '00000000-0000-4000-9100-000000000003'),
  ('previous_update', '00000000-0000-4000-9100-000000000004'),
  ('draft_update', '00000000-0000-4000-9100-000000000005'),
  ('regular_draft_update', '00000000-0000-4000-9100-000000000006'),
  ('anon_draft_update', '00000000-0000-4000-9100-000000000007'),
  ('missing_update', '00000000-0000-4000-9100-000000000099');

grant select on weekly_update_test_ids to anon, authenticated;

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
  key || '@weekly-update.local',
  'local-regression-placeholder',
  now(),
  now(),
  now()
from weekly_update_test_ids
where key like '%_user';

insert into public.admin_authorizations (id, user_id, role, is_active)
values (
  (select id from weekly_update_test_ids where key = 'admin_auth'),
  (select id from weekly_update_test_ids where key = 'admin_user'),
  'admin',
  true
);

insert into public.weekly_updates (
  id,
  title,
  body_markdown,
  converted_content,
  source_document_storage_path,
  source_document_file_name,
  status,
  is_current,
  published_at
)
values
  (
    (select id from weekly_update_test_ids where key = 'previous_update'),
    'Local Regression Previous Current',
    'Previous body',
    '[{"type":"paragraph","children":[{"text":"Previous body"}]}]'::jsonb,
    'weekly-updates/source-documents/00000000-0000-4000-9100-000000000004/00000000-0000-4000-9100-000000000014-previous.docx',
    'previous.docx',
    'published',
    true,
    now() - interval '1 day'
  ),
  (
    (select id from weekly_update_test_ids where key = 'draft_update'),
    'Local Regression Draft',
    'Draft body',
    '[{"type":"paragraph","children":[{"text":"Draft body"}]}]'::jsonb,
    'weekly-updates/source-documents/00000000-0000-4000-9100-000000000005/00000000-0000-4000-9100-000000000015-draft.docx',
    'draft.docx',
    'draft',
    false,
    null
  ),
  (
    (select id from weekly_update_test_ids where key = 'regular_draft_update'),
    'Local Regression Regular Draft',
    'Regular draft body',
    '[{"type":"paragraph","children":[{"text":"Regular draft body"}]}]'::jsonb,
    null,
    null,
    'draft',
    false,
    null
  ),
  (
    (select id from weekly_update_test_ids where key = 'anon_draft_update'),
    'Local Regression Anonymous Draft',
    'Anonymous draft body',
    '[{"type":"paragraph","children":[{"text":"Anonymous draft body"}]}]'::jsonb,
    null,
    null,
    'draft',
    false,
    null
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from weekly_update_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(public.is_authenticated_admin(), true, 'test admin is authenticated admin');

select lives_ok(
  $$ select public.publish_weekly_update((select id from weekly_update_test_ids where key = 'draft_update')) $$,
  'administrator can publish an existing draft'
);

select is(
  (select status from public.weekly_updates where id = (select id from weekly_update_test_ids where key = 'draft_update')),
  'published',
  'selected draft becomes published'
);

select is(
  (select is_current from public.weekly_updates where id = (select id from weekly_update_test_ids where key = 'draft_update')),
  true,
  'selected draft becomes current'
);

select is(
  (select status from public.weekly_updates where id = (select id from weekly_update_test_ids where key = 'previous_update')),
  'archived',
  'previous current update is archived'
);

select is(
  (select is_current from public.weekly_updates where id = (select id from weekly_update_test_ids where key = 'previous_update')),
  false,
  'previous current update is no longer current'
);

select is(
  (select count(*) from public.weekly_updates where status = 'published' and is_current = true),
  1::bigint,
  'only one current published weekly update remains'
);

select throws_ok(
  $$ select public.publish_weekly_update((select id from weekly_update_test_ids where key = 'missing_update')) $$,
  'P0002',
  null,
  'nonexistent weekly update raises genuine not-found error'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from weekly_update_test_ids where key = 'regular_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ select public.publish_weekly_update((select id from weekly_update_test_ids where key = 'regular_draft_update')) $$,
  '42501',
  null,
  'non-admin authenticated user cannot publish'
);

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select throws_ok(
  $$ select public.publish_weekly_update((select id from weekly_update_test_ids where key = 'anon_draft_update')) $$,
  '42501',
  null,
  'anonymous user cannot publish'
);

select * from finish();

rollback;
