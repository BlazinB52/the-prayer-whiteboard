begin;

select * from no_plan();

-- admin ...9400-000000000001   editor ...9400-000000000002   other editor ...9400-000000000003

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9400-000000000001', 'authenticated', 'authenticated', 'admin@recall.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9400-000000000002', 'authenticated', 'authenticated', 'editor@recall.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9400-000000000003', 'authenticated', 'authenticated', 'other@recall.local', 'x', now(), now(), now());
insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ('00000000-0000-4000-9400-000000000001', 'admin', true, null, 'Recall Admin', 'admin@recall.local'),
  ('00000000-0000-4000-9400-000000000002', 'content_manager', true, null, 'Recall Editor', 'editor@recall.local'),
  ('00000000-0000-4000-9400-000000000003', 'content_manager', true, null, 'Other Editor', 'other@recall.local');

insert into public.teachings (id, slug, title, central_theme, introduction, summary, status)
values ('00000000-0000-4000-9400-0000000000a1', 'recall-t1', 'Recall Title', 'Theme', 'Intro.', 'Summary.', 'draft');

-- The editor proposes and submits.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9400-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select lives_ok($$ select public.create_teaching_revision('00000000-0000-4000-9400-0000000000a1') $$, 'the editor starts a revision');
select lives_ok($$
  select public.save_teaching_revision_draft(
    (select id from public.content_revisions where submitted_by = '00000000-0000-4000-9400-000000000002'),
    jsonb_build_array(jsonb_build_object('target_kind','teaching','target_id',null,'field_key','summary','base_value','Summary.','proposed_value','New summary.'))) $$, 'with one change');
select is(public.submit_teaching_revision((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9400-000000000002')), 1, 'and submits it');

-- Another editor cannot take it back.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9400-000000000003', true); end $$;
select throws_ok($$ select public.recall_revision((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9400-000000000002')) $$, '42501', null, 'someone else cannot recall it');
select throws_ok($$ select public.mark_revision_opened((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9400-000000000002')) $$, '42501', null, 'an editor cannot mark it opened');

-- The owner can, while nobody has opened it, and the change is kept.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9400-000000000002', true); end $$;
select lives_ok($$ select public.recall_revision((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9400-000000000002')) $$, 'the owner recalls an unopened revision');
select is((select status from public.content_revisions where submitted_by = '00000000-0000-4000-9400-000000000002'), 'draft', 'it is a draft again');
select is((select count(*)::int from public.content_revision_changes), 1, 'with its change kept');
select throws_ok($$ select public.recall_revision((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9400-000000000002')) $$, 'P0001', null, 'a draft cannot be recalled again');

-- Resubmit, then the Administrator opens it: too late.
select is(public.submit_teaching_revision((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9400-000000000002')), 1, 'the editor resubmits');
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9400-000000000001', true); end $$;
select lives_ok($$ select public.mark_revision_opened((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9400-000000000002')) $$, 'the Administrator opens it');
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9400-000000000002', true); end $$;
select throws_ok($$ select public.recall_revision((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9400-000000000002')) $$, 'P0001', 'An Administrator has already started reviewing this, so it can no longer be taken back.', 'an opened revision cannot be recalled');

select * from finish();
rollback;
