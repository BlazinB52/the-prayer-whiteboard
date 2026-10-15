begin;

select * from no_plan();

-- admin ...9900-01   editor ...02   other editor ...03
-- T1 draft teaching (a1)   D1 draft devotional (d1)   O1 draft outline (c1)   H1 draft handout (f1)

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9900-000000000001', 'authenticated', 'authenticated', 'admin@ok.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9900-000000000002', 'authenticated', 'authenticated', 'editor@ok.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9900-000000000003', 'authenticated', 'authenticated', 'other@ok.local', 'x', now(), now(), now());

insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ('00000000-0000-4000-9900-000000000001', 'admin', true, null, 'Admin', 'admin@ok.local'),
  ('00000000-0000-4000-9900-000000000002', 'content_manager', true, null, 'Editor', 'editor@ok.local'),
  ('00000000-0000-4000-9900-000000000003', 'content_manager', true, null, 'Other', 'other@ok.local');

insert into public.teachings (id, slug, title, status) values ('00000000-0000-4000-9900-0000000000a1', 'ok-teaching', 'Ok Teaching', 'draft');
insert into public.teaching_devotionals (id, teaching_id, slug, title, status) values ('00000000-0000-4000-9900-0000000000d1', '00000000-0000-4000-9900-0000000000a1', 'ok-devotional', 'Ok Devotional', 'draft');
insert into public.teaching_handouts (id, title, gathering_date, language, status, content) values ('00000000-0000-4000-9900-0000000000f1', 'Ok Handout', '2026-10-10', 'en', 'draft', '[{"type":"paragraph","inlines":[{"text":"x"}]}]'::jsonb);

-- ===========================================================================
-- Not sent yet: nobody can say it was reviewed
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok($$ select public.mark_review_ok('teaching', '00000000-0000-4000-9900-0000000000a1') $$, 'P0001', null, 'an unsent teaching cannot be marked reviewed');
select throws_ok($$ select public.mark_review_ok('handout', '00000000-0000-4000-9900-0000000000f1') $$, 'P0001', null, 'an unsent handout cannot be marked reviewed');
select throws_ok($$ select public.mark_review_ok('weekly_update', '00000000-0000-4000-9900-0000000000f1') $$, 'P0001', null, 'a kind that has no such note is refused');
reset role;

-- ===========================================================================
-- Sent: a Content Manager can mark it reviewed, only for themselves
-- ===========================================================================

update public.teachings set sent_for_review_at = now() where id = '00000000-0000-4000-9900-0000000000a1';
update public.teaching_devotionals set sent_for_review_at = now() where id = '00000000-0000-4000-9900-0000000000d1';
update public.teaching_handouts set sent_for_review_at = now() where id = '00000000-0000-4000-9900-0000000000f1';

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select lives_ok($$ select public.mark_review_ok('teaching', '00000000-0000-4000-9900-0000000000a1') $$, 'a Content Manager can mark a sent teaching reviewed with no changes');
select lives_ok($$ select public.mark_review_ok('devotional', '00000000-0000-4000-9900-0000000000d1') $$, 'and a devotional');
select lives_ok($$ select public.mark_review_ok('handout', '00000000-0000-4000-9900-0000000000f1') $$, 'and a handout');
select lives_ok($$ select public.mark_review_ok('teaching', '00000000-0000-4000-9900-0000000000a1') $$, 'doing it twice is harmless');
select is((select count(*)::int from public.content_review_oks), 3, 'they see their own three notes');
select is((select user_name from public.content_review_oks where subject_type = 'teaching'), 'Editor', 'each note carries the person''s name');
select throws_ok($$ insert into public.content_review_oks (subject_type, subject_id, user_id) values ('teaching', '00000000-0000-4000-9900-0000000000a1', '00000000-0000-4000-9900-000000000003') $$, '42501', null, 'a note cannot be written directly');
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000003', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.content_review_oks), 0, 'another Content Manager sees none of them');
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.content_review_oks), 3, 'the Administrator sees all of them');
reset role;

-- ===========================================================================
-- Taking a note back, and the notes ending with the round
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select lives_ok($$ select public.clear_review_ok('devotional', '00000000-0000-4000-9900-0000000000d1') $$, 'a person can take their own note back');
select is((select count(*)::int from public.content_review_oks where subject_type = 'devotional'), 0, 'and it is gone');
reset role;

update public.teachings set sent_for_review_at = null where id = '00000000-0000-4000-9900-0000000000a1';
select is((select count(*)::int from public.content_review_oks where subject_type = 'teaching'), 0, 'taking a teaching back from review clears its notes');

update public.teaching_handouts set sent_for_review_at = null where id = '00000000-0000-4000-9900-0000000000f1';
select is((select count(*)::int from public.content_review_oks where subject_type = 'handout'), 0, 'taking a handout back from review clears its notes');

-- ===========================================================================
-- A draft with no edits is cleared; a draft with real changes must be finished first
-- ===========================================================================

update public.teachings set sent_for_review_at = now() where id = '00000000-0000-4000-9900-0000000000a1';
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select lives_ok($$ select public.create_teaching_revision('00000000-0000-4000-9900-0000000000a1') $$, 'a Content Manager saves a draft without editing anything');
select lives_ok($$ select public.mark_review_ok('teaching', '00000000-0000-4000-9900-0000000000a1') $$, 'a draft saved with no edits is not a proposal: they can still mark it reviewed');
select is((select count(*)::int from public.content_revisions where subject_type = 'teaching' and teaching_id = '00000000-0000-4000-9900-0000000000a1' and status = 'draft'), 0, 'and the empty draft is cleared away');
select lives_ok($$ select public.save_teaching_revision_draft(public.create_teaching_revision('00000000-0000-4000-9900-0000000000a1'), jsonb_build_array(jsonb_build_object('target_kind', 'teaching', 'target_id', null, 'field_key', 'title', 'base_value', 'Ok Teaching', 'proposed_value', 'Ok Teaching Two'))) $$, 'they then propose a real change');
select throws_ok($$ select public.mark_review_ok('teaching', '00000000-0000-4000-9900-0000000000a1') $$, 'P0001', null, 'with a real proposal still open they cannot also mark it reviewed');
reset role;

-- ===========================================================================
-- Deleting the item deletes its notes
-- ===========================================================================

update public.teaching_devotionals set sent_for_review_at = now() where id = '00000000-0000-4000-9900-0000000000d1';
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000003', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select lives_ok($$ select public.mark_review_ok('devotional', '00000000-0000-4000-9900-0000000000d1') $$, 'another person marks the devotional reviewed');
reset role;
delete from public.teaching_devotionals where id = '00000000-0000-4000-9900-0000000000d1';
select is((select count(*)::int from public.content_review_oks where subject_type = 'devotional'), 0, 'deleting the devotional deletes its notes');

select * from finish();
rollback;
