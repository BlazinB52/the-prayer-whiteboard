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
  ('brent_reviewer', '00000000-0000-4000-8000-000000000016');

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

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(public.is_authenticated_admin(), true, 'admin user is authenticated admin');

select public.admin_create_document_review_request(
  'condensed_foldable_teaching',
  'Foldable - Speak the Word Rest in God',
  'Review pages 1-2. This is a Word-first foldable before website integration.',
  'Two-page landscape foldable',
  'https://example.sharepoint.com/sites/prayer/word-review',
  null,
  null,
  null,
  null,
  null
) as request_id
into temporary table review_portal_request_one;

select is(
  (select source_teaching_id is null and source_devotional_id is null from public.review_requests where id = (select request_id from review_portal_request_one)),
  true,
  'document-first request requires no teaching or devotional row'
);
select is(
  (select subject_type from public.review_requests where id = (select request_id from review_portal_request_one)),
  'condensed_foldable_teaching',
  'document-first request stores the expanded review type'
);

select public.admin_register_review_document_version(
  (select request_id from review_portal_request_one),
  'original',
  'Foldable - Speak the Word Rest in God.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  123456,
  'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
  'https://example.sharepoint.com/sites/prayer/word-review',
  null,
  null,
  null
) as document_id
into temporary table review_portal_original_document;

select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'editorial_review',
  'original document version moves request into editorial review'
);
select ok(
  (select storage_path from public.review_document_versions where id = (select document_id from review_portal_original_document)) like 'review-requests/%/versions/%.docx',
  'document storage path is generated'
);

select public.admin_set_review_onedrive_url(
  (select request_id from review_portal_request_one),
  'https://example.sharepoint.com/sites/prayer/updated-word-review',
  'drive-1',
  'item-1',
  'version-1'
);

select is(
  (select onedrive_url from public.review_requests where id = (select request_id from review_portal_request_one)),
  'https://example.sharepoint.com/sites/prayer/updated-word-review',
  'OneDrive working URL is stored as request metadata'
);

select public.admin_register_review_document_version(
  (select request_id from review_portal_request_one),
  'final_candidate',
  'Foldable - Speak the Word Rest in God final.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  223456,
  'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
  null,
  null,
  null,
  null
) as document_id
into temporary table review_portal_candidate_one;

select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'final_candidate_awaiting_approval',
  'final candidate awaits approval'
);

select public.admin_create_document_review_request(
  'other_publication_material',
  'Other Document Request',
  null,
  null,
  null,
  null,
  null,
  null,
  null,
  null
) as request_id
into temporary table review_portal_request_other;

select public.admin_register_review_document_version(
  (select request_id from review_portal_request_other),
  'final_candidate',
  'Other.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  12345,
  'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc',
  null,
  null,
  null,
  null
) as document_id
into temporary table review_portal_candidate_other;

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'gale_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select is(public.is_authenticated_admin(), false, 'reviewer authorization does not satisfy admin authorization');

set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claim.role', 'anon', true);

select is((select count(*) from public.reviewer_accounts), 0::bigint, 'anonymous cannot read reviewer_accounts');
select is((select count(*) from public.review_requests), 0::bigint, 'anonymous cannot read review_requests');
select is((select count(*) from public.review_document_versions), 0::bigint, 'anonymous cannot read review_document_versions');
select is((select count(*) from public.review_approvals), 0::bigint, 'anonymous cannot read review_approvals');
select is((select count(*) from public.review_activity_events), 0::bigint, 'anonymous cannot read review_activity_events');

set local role authenticated;
select set_config('request.jwt.claim.role', 'authenticated', true);

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'pending_user'), true);
select is((select count(*) from public.review_requests), 0::bigint, 'pending reviewer cannot read document review content');

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'must_change_user'), true);
select is((select count(*) from public.review_requests), 0::bigint, 'must-change reviewer cannot read document review content');

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'disabled_user'), true);
select is((select count(*) from public.review_requests), 0::bigint, 'disabled reviewer cannot read document review content');

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'expired_user'), true);
select is((select count(*) from public.review_requests), 0::bigint, 'expired temporary-password reviewer cannot read document review content');

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'gale_user'), true);
select is(
  (select count(*) from public.review_requests where id = (select request_id from review_portal_request_one)),
  1::bigint,
  'active reviewer can read permitted request metadata'
);
select is(
  (select count(*) from public.review_document_versions where id = (select document_id from review_portal_candidate_one)),
  1::bigint,
  'active reviewer can read permitted document-version metadata'
);

select results_eq(
  $$ update public.review_document_versions set original_filename = 'tampered.docx' where id = (select document_id from review_portal_candidate_one) returning id $$,
  $$ values (null::uuid) limit 0 $$,
  'reviewer cannot update document-version metadata'
);
select results_eq(
  $$ delete from public.review_document_versions where id = (select document_id from review_portal_candidate_one) returning id $$,
  $$ values (null::uuid) limit 0 $$,
  'reviewer cannot delete document-version metadata'
);
select throws_ok(
  $$ select public.review_approve_document_version((select request_id from review_portal_request_one), (select document_id from review_portal_candidate_other)) $$,
  'P0002',
  null,
  'mismatched request and document version cannot be approved'
);
select throws_ok(
  $$ select public.review_approve_document_version((select request_id from review_portal_request_one), (select document_id from review_portal_original_document)) $$,
  '42501',
  null,
  'old document versions cannot be approved'
);

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'brent_user'), true);
select public.review_approve_current((select request_id from review_portal_request_one));
select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'final_candidate_awaiting_approval',
  'Brent approval does not affect readiness'
);

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'gale_user'), true);
select public.review_approve_current((select request_id from review_portal_request_one));
select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'final_candidate_awaiting_approval',
  'Gale alone does not make ready'
);

select public.review_withdraw_current_approval((select request_id from review_portal_request_one), 'reset for Kay alone');

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'kay_user'), true);
select public.review_approve_current((select request_id from review_portal_request_one));
select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'final_candidate_awaiting_approval',
  'Kay alone does not make ready'
);

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'gale_user'), true);
select public.review_approve_current((select request_id from review_portal_request_one));
select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'ready_for_publication',
  'Gale and Kay approving same current final candidate makes ready'
);

select ok(
  exists (
    select 1
    from public.review_approvals
    where review_request_id = (select request_id from review_portal_request_one)
      and document_version_id = (select document_id from review_portal_candidate_one)
      and document_sha256_hex = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
      and snapshot_id is null
  ),
  'formal approval targets immutable document version and fingerprint, not OneDrive'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'admin_user'), true);
select public.admin_register_review_document_version(
  (select request_id from review_portal_request_one),
  'final_candidate',
  'Foldable - Speak the Word Rest in God candidate two.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  323456,
  'dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd',
  null,
  null,
  null,
  null
) as document_id
into temporary table review_portal_candidate_two;

select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'final_candidate_awaiting_approval',
  'new final candidate invalidates previous readiness'
);

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'gale_user'), true);
select public.review_approve_current((select request_id from review_portal_request_one));

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'admin_user'), true);
select public.admin_register_review_document_version(
  (select request_id from review_portal_request_one),
  'final_candidate',
  'Foldable - Speak the Word Rest in God candidate three.docx',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  423456,
  'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee',
  null,
  null,
  null,
  null
) as document_id
into temporary table review_portal_candidate_three;

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'kay_user'), true);
select public.review_approve_current((select request_id from review_portal_request_one));
select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'final_candidate_awaiting_approval',
  'different-version approvals do not make current candidate ready'
);

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'gale_user'), true);
select public.review_approve_current((select request_id from review_portal_request_one));
select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'ready_for_publication',
  'Gale and Kay on same replacement candidate makes ready'
);

select set_config('request.jwt.claim.sub', (select id::text from review_portal_test_ids where key = 'kay_user'), true);
select public.review_request_changes((select request_id from review_portal_request_one), 'Please resolve Word comments.');
select is(
  (select status from public.review_requests where id = (select request_id from review_portal_request_one)),
  'changes_suggested',
  'requesting changes changes editorial state'
);
select is(
  (
    select count(*)
    from public.review_approvals
    where review_request_id = (select request_id from review_portal_request_one)
      and document_version_id = (select document_id from review_portal_candidate_three)
      and reviewer_account_id = (select id from review_portal_test_ids where key = 'kay_reviewer')
      and withdrawn_at is null
  ),
  0::bigint,
  'requesting changes withdraws same reviewer approval on current candidate'
);

select public.review_mark_word_review_complete((select request_id from review_portal_request_one), 'Word review complete.');
select public.review_report_changes_suggested((select request_id from review_portal_request_one), 'Track changes added.');
select ok(
  exists (
    select 1
    from public.review_document_reviewer_actions
    where review_request_id = (select request_id from review_portal_request_one)
      and reviewer_account_id = (select id from review_portal_test_ids where key = 'kay_reviewer')
      and action_type in ('word_review_complete', 'changes_suggested')
  ),
  'Word editorial actions are recorded separately from final approval'
);

select ok(
  exists (
    select 1
    from public.review_activity_events
    where review_request_id = (select request_id from review_portal_request_one)
      and action_type = 'document.final_candidate_registered'
  ),
  'audit event created for final candidate registration'
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
      and action_type = 'changes.requested'
  ),
  'audit event created for changes.requested'
);
select ok(
  exists (
    select 1
    from public.review_activity_events
    where review_request_id = (select request_id from review_portal_request_one)
      and action_type = 'word_review.completed'
  ),
  'audit event created for word review completion'
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
select is(public.is_authenticated_admin(), true, 'existing admin authorization still works after document-first correction');

select throws_ok(
  $$
    select public.admin_submit_review_snapshot(
      null,
      'teaching',
      null,
      null,
      'Legacy Snapshot',
      null,
      '{"legacy": true}'::jsonb
    )
  $$,
  '0A000',
  null,
  'legacy snapshot submission RPC is explicitly superseded'
);

select * from finish();

rollback;
