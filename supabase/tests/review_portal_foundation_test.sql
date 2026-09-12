begin;

select plan(44);

create temp table review_portal_test_ids (
  key text primary key,
  id uuid not null
) on commit drop;

insert into review_portal_test_ids (key, id)
values
  ('admin_user', '00000000-0000-4000-8000-000000000001'),
  ('pending_user', '00000000-0000-4000-8000-000000000002'),
  ('must_change_user', '00000000-0000-4000-8000-000000000003'),
  ('disabled_user', '00000000-0000-4000-8000-000000000004'),
  ('expired_user', '00000000-0000-4000-8000-000000000005'),
  ('gale_user', '00000000-0000-4000-8000-000000000006'),
  ('kay_user', '00000000-0000-4000-8000-000000000007'),
  ('brent_user', '00000000-0000-4000-8000-000000000008'),
  ('admin_auth', '00000000-0000-4000-8000-000000000009'),
  ('pending_reviewer', '00000000-0000-4000-8000-000000000010'),
  ('must_change_reviewer', '00000000-0000-4000-8000-000000000011'),
  ('disabled_reviewer', '00000000-0000-4000-8000-000000000012'),
  ('expired_reviewer', '00000000-0000-4000-8000-000000000013'),
  ('gale_reviewer', '00000000-0000-4000-8000-000000000014'),
  ('kay_reviewer', '00000000-0000-4000-8000-000000000015'),
  ('brent_reviewer', '00000000-0000-4000-8000-000000000016'),
  ('teaching_one', '00000000-0000-4000-8000-000000000017'),
  ('teaching_two', '00000000-0000-4000-8000-000000000018');

grant select on review_portal_test_ids to anon, authenticated;

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
  key || '@review-portal-foundation.local',
  'local-regression-placeholder',
  now(),
  now(),
  now()
from review_portal_test_ids
where key like '%_user';

insert into public.admin_authorizations (id, user_id, role, is_active)
values (
  (select id from review_portal_test_ids where key = 'admin_auth'),
  (select id from review_portal_test_ids where key = 'admin_user'),
  'admin',
  true
);

insert into public.reviewer_accounts (
  id,
  auth_user_id,
  login_name,
  display_name,
  status,
  must_change_password,
  first_login_completed_at,
  temporary_password_issued_at,
  temporary_password_expires_at,
  activated_at,
  deactivated_at
)
values
  (
    (select id from review_portal_test_ids where key = 'pending_reviewer'),
    (select id from review_portal_test_ids where key = 'pending_user'),
    'pending@review-portal-foundation.local',
    'Pending Test',
    'pending',
    true,
    null,
    now(),
    now() + interval '72 hours',
    null,
    null
  ),
  (
    (select id from review_portal_test_ids where key = 'must_change_reviewer'),
    (select id from review_portal_test_ids where key = 'must_change_user'),
    'must-change@review-portal-foundation.local',
    'Must Change Test',
    'active',
    true,
    null,
    now(),
    now() + interval '72 hours',
    now(),
    null
  ),
  (
    (select id from review_portal_test_ids where key = 'disabled_reviewer'),
    (select id from review_portal_test_ids where key = 'disabled_user'),
    'disabled@review-portal-foundation.local',
    'Disabled Test',
    'disabled',
    false,
    now(),
    null,
    null,
    now(),
    now()
  ),
  (
    (select id from review_portal_test_ids where key = 'expired_reviewer'),
    (select id from review_portal_test_ids where key = 'expired_user'),
    'expired@review-portal-foundation.local',
    'Expired Test',
    'active',
    true,
    null,
    now() - interval '96 hours',
    now() - interval '24 hours',
    now(),
    null
  ),
  (
    (select id from review_portal_test_ids where key = 'gale_reviewer'),
    (select id from review_portal_test_ids where key = 'gale_user'),
    'gale@review-portal-foundation.local',
    'Gale Test',
    'active',
    false,
    now(),
    null,
    null,
    now(),
    null
  ),
  (
    (select id from review_portal_test_ids where key = 'kay_reviewer'),
    (select id from review_portal_test_ids where key = 'kay_user'),
    'kay@review-portal-foundation.local',
    'Kay Test',
    'active',
    false,
    now(),
    null,
    null,
    now(),
    null
  ),
  (
    (select id from review_portal_test_ids where key = 'brent_reviewer'),
    (select id from review_portal_test_ids where key = 'brent_user'),
    'brent@review-portal-foundation.local',
    'Brent Test',
    'active',
    false,
    now(),
    null,
    null,
    now(),
    null
  );

insert into public.review_required_approvers (reviewer_account_id)
values
  ((select id from review_portal_test_ids where key = 'gale_reviewer')),
  ((select id from review_portal_test_ids where key = 'kay_reviewer'));

insert into public.teachings (
  id,
  slug,
  title,
  summary,
  gathering_date,
  status
)
values
  (
    (select id from review_portal_test_ids where key = 'teaching_one'),
    'review-portal-foundation-one',
    'Review Portal Foundation One',
    'Disposable local test teaching.',
    '2026-09-12',
    'draft'
  ),
  (
    (select id from review_portal_test_ids where key = 'teaching_two'),
    'review-portal-foundation-two',
    'Review Portal Foundation Two',
    'Disposable local test teaching.',
    '2026-09-12',
    'draft'
  );

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(public.is_authenticated_admin(), true, 'admin user is authenticated admin');

select public.admin_submit_review_snapshot(
  null,
  'teaching',
  (select id from review_portal_test_ids where key = 'teaching_one'),
  null,
  'Review Portal Foundation Request One',
  'version one',
  '{"version": 1, "content": "one"}'::jsonb
) as snapshot_id
into temporary table review_portal_snapshot_one;

select review_request_id as request_id
into temporary table review_portal_request_one
from public.review_snapshots
where id = (select snapshot_id from review_portal_snapshot_one);

select public.admin_submit_review_snapshot(
  null,
  'teaching',
  (select id from review_portal_test_ids where key = 'teaching_two'),
  null,
  'Review Portal Foundation Request Two',
  'version one',
  '{"version": 1, "content": "two"}'::jsonb
) as snapshot_id
into temporary table review_portal_snapshot_other;

select review_request_id as request_id
into temporary table review_portal_request_other
from public.review_snapshots
where id = (select snapshot_id from review_portal_snapshot_other);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'gale_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);
select is(public.is_authenticated_admin(), false, 'reviewer authorization does not satisfy admin authorization');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is((select count(*) from public.reviewer_accounts), 0::bigint, 'anonymous cannot read reviewer_accounts');
select is((select count(*) from public.review_requests), 0::bigint, 'anonymous cannot read review_requests');
select is((select count(*) from public.review_snapshots), 0::bigint, 'anonymous cannot read review_snapshots');
select is((select count(*) from public.review_required_approvers), 0::bigint, 'anonymous cannot read review_required_approvers');
select is((select count(*) from public.review_comments), 0::bigint, 'anonymous cannot read review_comments');
select is((select count(*) from public.review_suggestions), 0::bigint, 'anonymous cannot read review_suggestions');
select is((select count(*) from public.review_change_requests), 0::bigint, 'anonymous cannot read review_change_requests');
select is((select count(*) from public.review_approvals), 0::bigint, 'anonymous cannot read review_approvals');
select is((select count(*) from public.review_activity_events), 0::bigint, 'anonymous cannot read review_activity_events');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'pending_user'), true);
select is((select count(*) from public.review_requests), 0::bigint, 'pending reviewer cannot read review content');

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'must_change_user'), true);
select is((select count(*) from public.review_requests), 0::bigint, 'must-change reviewer cannot read review content');

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'disabled_user'), true);
select is((select count(*) from public.review_requests), 0::bigint, 'disabled reviewer cannot read review content');

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'expired_user'), true);
select is((select count(*) from public.review_requests), 0::bigint, 'expired temporary-password reviewer cannot read review content');

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'gale_user'), true);
select is(
  (select count(*) from public.review_requests where id = (select request_id from review_portal_request_one)),
  1::bigint,
  'active reviewer can read active review request'
);
select is(
  (select count(*) from public.review_snapshots where id = (select snapshot_id from review_portal_snapshot_one)),
  1::bigint,
  'active reviewer can read active review snapshot'
);

select results_eq(
  $$ update public.review_snapshots set title = 'Tampered' where id = (select snapshot_id from review_portal_snapshot_one) returning id $$,
  $$ values (null::uuid) limit 0 $$,
  'reviewer cannot update snapshot'
);
select results_eq(
  $$ delete from public.review_snapshots where id = (select snapshot_id from review_portal_snapshot_one) returning id $$,
  $$ values (null::uuid) limit 0 $$,
  'reviewer cannot delete snapshot'
);
select throws_ok(
  $$
    insert into public.review_comments (
      review_request_id,
      snapshot_id,
      snapshot_version,
      reviewer_account_id,
      body
    )
    values (
      (select request_id from review_portal_request_one),
      (select snapshot_id from review_portal_snapshot_one),
      1,
      (select id from review_portal_test_ids where key = 'kay_reviewer'),
      'impersonation'
    )
    returning id
  $$,
  '42501',
  null,
  'reviewer cannot add action under another reviewer identity'
);
select throws_ok(
  $$
    insert into public.review_approvals (
      review_request_id,
      snapshot_id,
      snapshot_version,
      reviewer_account_id
    )
    values (
      (select request_id from review_portal_request_other),
      (select snapshot_id from review_portal_snapshot_one),
      1,
      (select id from review_portal_test_ids where key = 'gale_reviewer')
    )
  $$,
  '42501',
  null,
  'reviewer cannot act on snapshot belonging to another request'
);

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'brent_user'), true);
select public.review_approve_current((select request_id from review_portal_request_one));
select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'active',
  'Brent approval does not affect readiness'
);

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'gale_user'), true);
select public.review_approve_current((select request_id from review_portal_request_one));
select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'active',
  'Gale alone does not make request ready'
);

select public.review_withdraw_current_approval((select request_id from review_portal_request_one), 'reset for Kay alone test');

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'kay_user'), true);
select public.review_approve_current((select request_id from review_portal_request_one));
select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'active',
  'Kay alone does not make request ready'
);

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'gale_user'), true);
select public.review_approve_current((select request_id from review_portal_request_one));
select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'ready_for_publication',
  'Gale and Kay approving same current snapshot makes request ready'
);

select public.review_withdraw_current_approval((select request_id from review_portal_request_one), 'testing withdrawal readiness');
select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'active',
  'withdrawing required approval returns request to active'
);

select public.review_approve_current((select request_id from review_portal_request_one));
select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'ready_for_publication',
  'Gale re-approval with Kay restores ready state'
);

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'kay_user'), true);
select public.review_request_changes((select request_id from review_portal_request_one), 'Please revise this section.');
select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'active',
  'requesting changes recalculates request to active'
);
select is(
  (
    select count(*)
    from public.review_approvals
    where review_request_id = (select request_id from review_portal_request_one)
      and reviewer_account_id = (select id from review_portal_test_ids where key = 'kay_reviewer')
      and withdrawn_at is null
  ),
  0::bigint,
  'requesting changes withdraws same reviewer approval'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'admin_user'), true);
select public.admin_submit_review_snapshot(
  (select request_id from review_portal_request_one),
  'teaching',
  (select id from review_portal_test_ids where key = 'teaching_one'),
  null,
  'Review Portal Foundation Request One',
  'version two',
  '{"version": 2, "content": "one"}'::jsonb
) as snapshot_id
into temporary table review_portal_snapshot_two;

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'gale_user'), true);
select public.review_approve_current((select request_id from review_portal_request_one));
select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'active',
  'Gale alone on new version is active'
);

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'admin_user'), true);
select public.admin_submit_review_snapshot(
  (select request_id from review_portal_request_one),
  'teaching',
  (select id from review_portal_test_ids where key = 'teaching_one'),
  null,
  'Review Portal Foundation Request One',
  'version three',
  '{"version": 3, "content": "one"}'::jsonb
) as snapshot_id
into temporary table review_portal_snapshot_three;

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'kay_user'), true);
select public.review_approve_current((select request_id from review_portal_request_one));
select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'active',
  'Gale and Kay approving different versions does not make current version ready'
);

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'gale_user'), true);
select throws_ok(
  $$
    insert into public.review_approvals (
      review_request_id,
      snapshot_id,
      snapshot_version,
      reviewer_account_id
    )
    values (
      (select request_id from review_portal_request_one),
      (select snapshot_id from review_portal_snapshot_two),
      2,
      (select id from review_portal_test_ids where key = 'gale_reviewer')
    )
  $$,
  '42501',
  null,
  'reviewer cannot approve previous snapshot after a new current version exists'
);
select public.review_approve_current((select request_id from review_portal_request_one));
select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'ready_for_publication',
  'Gale and Kay on current version makes ready after version mismatch test'
);

select public.review_add_comment((select request_id from review_portal_request_one), 'A comment', 'section', 's1');

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'brent_user'), true);
select public.review_suggest_replacement((select request_id from review_portal_request_one), 'section', 's1', 'Replacement wording', 'Old wording', 'Test note');

select ok(
  exists (
    select 1
    from public.review_activity_events
    where review_request_id = (select request_id from review_portal_request_one)
      and action_type = 'snapshot.submitted'
  ),
  'audit event created for snapshot.submitted'
);
select ok(
  exists (
    select 1
    from public.review_activity_events
    where review_request_id = (select request_id from review_portal_request_one)
      and action_type = 'approval.created'
  ),
  'audit event created for approval.created'
);
select ok(
  exists (
    select 1
    from public.review_activity_events
    where review_request_id = (select request_id from review_portal_request_one)
      and action_type = 'approval.withdrawn'
  ),
  'audit event created for approval.withdrawn'
);
select ok(
  exists (
    select 1
    from public.review_activity_events
    where review_request_id = (select request_id from review_portal_request_one)
      and action_type = 'changes.requested'
  ),
  'audit event created for changes.requested'
);
select ok(
  exists (
    select 1
    from public.review_activity_events
    where review_request_id = (select request_id from review_portal_request_one)
      and action_type = 'comment.created'
  ),
  'audit event created for comment.created'
);
select ok(
  exists (
    select 1
    from public.review_activity_events
    where review_request_id = (select request_id from review_portal_request_one)
      and action_type = 'suggestion.created'
  ),
  'audit event created for suggestion.created'
);

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'gale_user'), true);
select results_eq(
  $$ update public.review_activity_events set metadata = '{"tampered": true}'::jsonb returning id $$,
  $$ values (null::uuid) limit 0 $$,
  'reviewer cannot update audit events'
);
select results_eq(
  $$ delete from public.review_activity_events returning id $$,
  $$ values (null::uuid) limit 0 $$,
  'reviewer cannot delete audit events'
);

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'admin_user'), true);
select results_eq(
  $$ update public.review_activity_events set metadata = '{"tampered": true}'::jsonb returning id $$,
  $$ values (null::uuid) limit 0 $$,
  'ordinary admin client cannot update audit events'
);
select results_eq(
  $$ delete from public.review_activity_events returning id $$,
  $$ values (null::uuid) limit 0 $$,
  'ordinary admin client cannot delete audit events'
);
select is(public.is_authenticated_admin(), true, 'existing admin authorization still works after review foundation');

set local role postgres;

delete from public.review_activity_events
where review_request_id in (
  select request_id from review_portal_request_one
  union all
  select request_id from review_portal_request_other
);
delete from public.review_approvals
where review_request_id in (
  select request_id from review_portal_request_one
  union all
  select request_id from review_portal_request_other
);
delete from public.review_comments
where review_request_id in (
  select request_id from review_portal_request_one
  union all
  select request_id from review_portal_request_other
);
delete from public.review_suggestions
where review_request_id in (
  select request_id from review_portal_request_one
  union all
  select request_id from review_portal_request_other
);
delete from public.review_change_requests
where review_request_id in (
  select request_id from review_portal_request_one
  union all
  select request_id from review_portal_request_other
);
update public.review_requests
set current_snapshot_id = null
where id in (
  select request_id from review_portal_request_one
  union all
  select request_id from review_portal_request_other
);
delete from public.review_snapshots
where review_request_id in (
  select request_id from review_portal_request_one
  union all
  select request_id from review_portal_request_other
);
delete from public.review_requests
where id in (
  select request_id from review_portal_request_one
  union all
  select request_id from review_portal_request_other
);
delete from public.review_required_approvers
where reviewer_account_id in (
  select id from review_portal_test_ids where key in ('gale_reviewer', 'kay_reviewer')
);
delete from public.reviewer_accounts
where id in (
  select id from review_portal_test_ids where key like '%_reviewer'
);
delete from public.teachings
where id in (
  select id from review_portal_test_ids where key like 'teaching_%'
);
delete from public.admin_authorizations
where id = (select id from review_portal_test_ids where key = 'admin_auth');
delete from auth.users
where id in (
  select id from review_portal_test_ids where key like '%_user'
);

select * from finish();

rollback;

