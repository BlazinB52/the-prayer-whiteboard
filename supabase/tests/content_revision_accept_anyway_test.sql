begin;

select * from no_plan();

-- admin ...9300-000000000001   editor ...9300-000000000002
-- draft teaching ...a1, second draft teaching ...a2 (published later), category ...c1/c2, sections ...b1 (will be removed), ...b2

create temp table accept_anyway_ids (key text primary key, id uuid not null) on commit drop;
insert into accept_anyway_ids values
  ('admin', '00000000-0000-4000-9300-000000000001'),
  ('editor', '00000000-0000-4000-9300-000000000002');
grant select on accept_anyway_ids to anon, authenticated;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', key || '@accept-anyway.local', 'local-regression-placeholder', now(), now(), now()
from accept_anyway_ids;

insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ('00000000-0000-4000-9300-000000000001', 'admin', true, null, 'Local Admin', 'admin@accept-anyway.local'),
  ('00000000-0000-4000-9300-000000000002', 'content_manager', true, null, 'Local Editor', 'editor@accept-anyway.local');

insert into public.teachings (id, slug, title, central_theme, introduction, summary, status)
values
  ('00000000-0000-4000-9300-0000000000a1', 'anyway-t1', 'Anyway Title', 'Original theme', 'Original introduction.', 'Original summary.', 'draft'),
  ('00000000-0000-4000-9300-0000000000a2', 'anyway-t2', 'Second Draft', 'Second theme', 'Second intro.', 'Second summary.', 'draft');
insert into public.teaching_categories (id, teaching_id, slug, title, sort_order, status)
values
  ('00000000-0000-4000-9300-0000000000c1', '00000000-0000-4000-9300-0000000000a1', 'cat-one', 'Category One', 1, 'draft'),
  ('00000000-0000-4000-9300-0000000000c2', '00000000-0000-4000-9300-0000000000a2', 'cat-two', 'Category Two', 1, 'draft');
insert into public.teaching_sections (id, teaching_id, category_id, slug, title, content, sort_order, status)
values
  ('00000000-0000-4000-9300-0000000000b1', '00000000-0000-4000-9300-0000000000a1', '00000000-0000-4000-9300-0000000000c1', 'sec-one', 'Removable',
    '{"version":1,"format":"paragraph","text":"Removable text.","showTitle":true}'::jsonb, 1, 'draft'),
  ('00000000-0000-4000-9300-0000000000b2', '00000000-0000-4000-9300-0000000000a2', '00000000-0000-4000-9300-0000000000c2', 'sec-two', 'Second',
    '{"version":1,"format":"paragraph","text":"Second text.","showTitle":true}'::jsonb, 1, 'draft');

select is(to_regprocedure('public.review_teaching_revision_change(uuid,text,text)')::text, null, 'the old three-argument review function is gone, so a call can never be ambiguous');
select isnt(to_regprocedure('public.review_teaching_revision_change(uuid,text,text,boolean)')::text, null, 'the review function now takes an accept-anyway flag');

-- ---------------------------------------------------------------------------
-- The editor proposes three changes on teaching 1, submits; then the Administrator edits two of those
-- fields directly and removes the section, so those proposals are stale.
-- ---------------------------------------------------------------------------

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9300-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select lives_ok($$ select public.create_teaching_revision('00000000-0000-4000-9300-0000000000a1') $$, 'the editor starts a revision');
select lives_ok($$
  select public.save_teaching_revision_draft(
    (select id from public.content_revisions where submitted_by = '00000000-0000-4000-9300-000000000002'),
    jsonb_build_array(
      jsonb_build_object('target_kind','teaching','target_id',null,'field_key','central_theme','base_value','Original theme','proposed_value','Editor theme'),
      jsonb_build_object('target_kind','teaching','target_id',null,'field_key','summary','base_value','Original summary.','proposed_value','Editor summary.'),
      jsonb_build_object('target_kind','teaching','target_id',null,'field_key','introduction','base_value','Original introduction.','proposed_value','Editor introduction.'),
      jsonb_build_object('target_kind','section','target_id','00000000-0000-4000-9300-0000000000b1','field_key','text','base_value','Removable text.','proposed_value','Editor section text.')
    )) $$, 'with four proposals');
select is((select public.submit_teaching_revision((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9300-000000000002'))), 4, 'and submits it');
reset role;

update public.teachings set central_theme = 'Admin theme', summary = 'Admin summary.' where id = '00000000-0000-4000-9300-0000000000a1';
delete from public.teaching_sections where id = '00000000-0000-4000-9300-0000000000b1';

-- ---------------------------------------------------------------------------
-- Only an Administrator can accept anyway
-- ---------------------------------------------------------------------------

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9300-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok(
  $$ select public.review_teaching_revision_change((select id from public.content_revision_changes where field_key = 'central_theme'), 'accept', null, true) $$,
  '42501', null, 'a co-editor cannot accept anyway'
);
reset role;
select is((select central_theme from public.teachings where id = '00000000-0000-4000-9300-0000000000a1'), 'Admin theme', 'the refused attempt changed nothing');

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9300-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

-- A plain accept of a stale change is still refused
select throws_ok(
  $$ select public.review_teaching_revision_change((select id from public.content_revision_changes where field_key = 'central_theme'), 'accept') $$,
  'P0001', null, 'a plain Accept of a stale change is still refused'
);
select throws_ok(
  $$ select public.review_teaching_revision_change((select id from public.content_revision_changes where field_key = 'central_theme'), 'accept', null, false) $$,
  'P0001', null, 'and so is an accept with the flag off'
);

-- Accept All never overrides: it skips the stale ones and applies the one that is not stale
select is(
  (select (public.review_all_teaching_revision_changes((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9300-000000000002'), 'accept') ->> 'skipped_stale')::int),
  3, 'Accept All skips every stale change (it never accepts anyway)'
);
select is((select central_theme from public.teachings where id = '00000000-0000-4000-9300-0000000000a1'), 'Admin theme', 'Accept All did not overwrite the Administrator''s theme');
select is((select summary from public.teachings where id = '00000000-0000-4000-9300-0000000000a1'), 'Admin summary.', 'Accept All did not overwrite the Administrator''s summary');
select is((select introduction from public.teachings where id = '00000000-0000-4000-9300-0000000000a1'), 'Editor introduction.', 'a change that was not stale (the Administrator never touched the introduction) was applied normally by Accept All');

reset role;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9300-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

select is((select count(*)::int from public.content_revision_changes where change_status = 'pending'), 3, 'three changes are still waiting (the unchanged introduction was applied by Accept All)');

-- Accept anyway on the stale central theme
select is(
  (select (public.review_teaching_revision_change((select id from public.content_revision_changes where field_key = 'central_theme'), 'accept', 'Editor wording is better', true) ->> 'accepted_anyway')::boolean),
  true, 'an Administrator can accept a stale change anyway'
);
reset role;
select is((select central_theme from public.teachings where id = '00000000-0000-4000-9300-0000000000a1'), 'Editor theme', 'accepting anyway replaces the current wording with the proposal');
select is(
  (select (accepted_anyway and change_status = 'accepted' and reviewed_by = '00000000-0000-4000-9300-000000000001' and admin_note = 'Editor wording is better')
   from public.content_revision_changes where field_key = 'central_theme'),
  true, 'the override, the Administrator and the note are recorded on the change'
);

-- The removed section cannot be forced
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9300-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok(
  $$ select public.review_teaching_revision_change((select id from public.content_revision_changes where field_key = 'text'), 'accept', null, true) $$,
  'P0001', 'stale: The part of the teaching this refers to no longer exists. Reject it.',
  'even accepting anyway cannot write into a section that no longer exists'
);

-- Reject with the flag set is still a rejection
select lives_ok(
  $$ select public.review_teaching_revision_change((select id from public.content_revision_changes where field_key = 'text'), 'reject', null, true) $$,
  'rejecting with the flag set simply rejects'
);
select is((select accepted_anyway from public.content_revision_changes where field_key = 'text'), false, 'a rejected change is never marked accepted anyway');

-- Finish: accept the last stale one anyway, then the audit row keeps the override count
select lives_ok(
  $$ select public.review_teaching_revision_change((select id from public.content_revision_changes where field_key = 'summary'), 'accept', null, true) $$,
  'the last stale change is accepted anyway'
);
reset role;
select is((select summary from public.teachings where id = '00000000-0000-4000-9300-0000000000a1'), 'Editor summary.', 'the summary now holds the proposal');
select is(
  (select (status = 'completed' and total_changes = 4 and accepted_count = 3 and rejected_count = 1 and overridden_count = 2 and purged_at is not null)
   from public.content_revisions where submitted_by = '00000000-0000-4000-9300-000000000002'),
  true, 'the audit row keeps the accepted, rejected and accepted-anyway counts'
);
select is((select count(*)::int from public.content_revision_changes), 0, 'the wording is deleted once the revision is finished');

-- A non-stale change accepted with the flag set is a normal acceptance (not marked as an override)
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9300-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select lives_ok($$ select public.create_teaching_revision('00000000-0000-4000-9300-0000000000a2') $$, 'the editor starts a revision on the second teaching');
select lives_ok($$
  select public.save_teaching_revision_draft(
    (select id from public.content_revisions where teaching_id = '00000000-0000-4000-9300-0000000000a2'),
    jsonb_build_array(jsonb_build_object('target_kind','section','target_id','00000000-0000-4000-9300-0000000000b2','field_key','text','base_value','Second text.','proposed_value','Second text, improved.'))) $$,
  'with one proposal');
select is((select public.submit_teaching_revision((select id from public.content_revisions where teaching_id = '00000000-0000-4000-9300-0000000000a2'))), 1, 'and submits it');

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9300-000000000001', true); end $$;
select is(
  (select (public.review_teaching_revision_change((select id from public.content_revision_changes), 'accept', null, true) ->> 'accepted_anyway')::boolean),
  false, 'a change that is not stale is just accepted, and is not recorded as an override'
);
reset role;
select is((select overridden_count from public.content_revisions where teaching_id = '00000000-0000-4000-9300-0000000000a2'), 0, 'its audit row records no overrides');

-- Once the teaching is published nothing can be applied, with or without the flag
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9300-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select lives_ok($$ select public.create_teaching_revision('00000000-0000-4000-9300-0000000000a2') $$, 'a second revision is started on the second teaching');
select lives_ok($$
  select public.save_teaching_revision_draft(
    (select id from public.content_revisions where teaching_id = '00000000-0000-4000-9300-0000000000a2' and status = 'draft'),
    jsonb_build_array(jsonb_build_object('target_kind','teaching','target_id',null,'field_key','summary','base_value','Second summary.','proposed_value','Another summary.'))) $$,
  'with a proposal');
select lives_ok($$ select public.submit_teaching_revision((select id from public.content_revisions where teaching_id = '00000000-0000-4000-9300-0000000000a2' and status = 'draft')) $$, 'submitted');
reset role;
update public.teachings set summary = 'Changed so it is stale.' where id = '00000000-0000-4000-9300-0000000000a2';

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9300-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
reset role;
update public.teachings set status = 'published', published_at = now() where id = '00000000-0000-4000-9300-0000000000a2';
select is((select count(*)::int from public.content_revisions where teaching_id = '00000000-0000-4000-9300-0000000000a2' and status = 'cancelled' and purged_at is not null), 1, 'publishing closed the waiting revision and deleted its wording, so it can no longer be accepted, even anyway');
select is((select count(*)::int from public.content_revision_changes c join public.content_revisions r on r.id = c.revision_id where r.teaching_id = '00000000-0000-4000-9300-0000000000a2'), 0, 'no proposed wording is left for a published teaching');

-- The override column can only ever be set on an accepted change
insert into public.content_revisions (id, subject_type, teaching_id, subject_title, status, submitted_by, submitted_at)
values ('00000000-0000-4000-9300-0000000000d1', 'teaching', '00000000-0000-4000-9300-0000000000a1', 'Constraint check', 'submitted', '00000000-0000-4000-9300-000000000002', now());
insert into public.content_revision_changes (id, revision_id, target_kind, target_id, field_key, original_value, proposed_value)
values ('00000000-0000-4000-9300-0000000000e1', '00000000-0000-4000-9300-0000000000d1', 'teaching', null, 'title', 'a', 'b');
select throws_ok(
  $$ update public.content_revision_changes set accepted_anyway = true where id = '00000000-0000-4000-9300-0000000000e1' $$,
  '23514', null, 'the database refuses an override flag on a change that was not accepted'
);

select * from finish();
rollback;
