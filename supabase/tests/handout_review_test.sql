begin;

select * from no_plan();

-- Handouts in the review cycle (20261013000000_handout_review.sql).
-- admin ...9910-01   editor ...02   other editor ...03
-- Handout H1 (a1) goes with the teaching of 2026-10-10 (handout_publish_test.sql covers creating, publishing and unpublishing). It has two sections, a subtitle, titled and untitled
-- paragraphs (one with bold, one with an asterisk), a list and a closing line.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9910-000000000001', 'authenticated', 'authenticated', 'admin@handout.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9910-000000000002', 'authenticated', 'authenticated', 'editor@handout.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9910-000000000003', 'authenticated', 'authenticated', 'other@handout.local', 'x', now(), now(), now());

insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ('00000000-0000-4000-9910-000000000001', 'admin', true, null, 'Admin', 'admin@handout.local'),
  ('00000000-0000-4000-9910-000000000002', 'content_manager', true, null, 'Editor', 'editor@handout.local'),
  ('00000000-0000-4000-9910-000000000003', 'content_manager', true, null, 'Other', 'other@handout.local');

insert into public.teaching_handouts (id, title, gathering_date, content, original_content)
values (
  '00000000-0000-4000-9910-0000000000a1', 'Handout Test', '2026-10-10',
  $json$[
    {"type":"section_title","inlines":[{"text":"Glory"}]},
    {"type":"subtitle","inlines":[{"text":"Beholding the Lord"}]},
    {"type":"paragraph","inlines":[{"text":"Intro: ","bold":true},{"text":"God is near."}]},
    {"type":"paragraph_title","inlines":[{"text":"Joined"}]},
    {"type":"paragraph","inlines":[{"text":"Read "},{"text":"John 15","href":"https://example.com/john"},{"text":" today."}]},
    {"type":"list","items":[{"level":0,"ordered":false,"inlines":[{"text":"Behold. ","bold":true},{"text":"Look up."}]},{"level":0,"ordered":false,"inlines":[{"text":"Honor"}]}]},
    {"type":"tagline","inlines":[{"text":"Arise and shine"}]},
    {"type":"paragraph","inlines":[{"text":"This has a star * in it."}]},
    {"type":"section_title","inlines":[{"text":"Second"}]}
  ]$json$::jsonb,
  $json$[{"type":"section_title","inlines":[{"text":"Glory"}]}]$json$::jsonb
);

create temp table hrev (key text primary key, id uuid);
grant all on hrev to authenticated;

-- ===========================================================================
-- The shape of the table
-- ===========================================================================

select throws_ok(
  $$ insert into public.teaching_handouts (title, gathering_date, status, content, original_content) values ('Odd status', '2026-10-10', 'archived', '[{"type":"paragraph","inlines":[{"text":"x"}]}]'::jsonb, '[]'::jsonb) $$,
  '23514', null, 'a handout is either a draft or published'
);
select throws_ok(
  $$ insert into public.teaching_handouts (title, gathering_date, status, content, original_content) values ('No PDF', '2026-10-10', 'published', '[{"type":"paragraph","inlines":[{"text":"x"}]}]'::jsonb, '[]'::jsonb) $$,
  '23514', null, 'a handout cannot be marked published without its PDF'
);

-- ===========================================================================
-- Not sent: a Content Manager sees nothing and can start nothing
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.teaching_handouts where id = '00000000-0000-4000-9910-0000000000a1'), 0, 'an unsent handout is invisible to a Content Manager');
select throws_ok($$ select public.create_handout_revision('00000000-0000-4000-9910-0000000000a1') $$, '42501', null, 'a revision cannot be started on an unsent handout');
select throws_ok($$ select * from public.handout_review_fields('00000000-0000-4000-9910-0000000000a1') $$, '42501', null, 'its fields are not handed out');
select throws_ok(
  $$ insert into public.teaching_handouts (title, gathering_date, content, original_content)
     values ('CM Upload', '2026-10-10', '[{"type":"paragraph","inlines":[{"text":"x"}]}]'::jsonb, '[]'::jsonb) $$,
  '42501', null, 'a Content Manager cannot add a handout'
);
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.handout_review_fields('00000000-0000-4000-9910-0000000000a1')), 9, 'an Administrator sees every editable field of an unsent handout');
reset role;

-- ===========================================================================
-- Sent: visible, and the right text is offered
-- ===========================================================================

update public.teaching_handouts set sent_for_review_at = now() where id = '00000000-0000-4000-9910-0000000000a1';

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.teaching_handouts where id = '00000000-0000-4000-9910-0000000000a1'), 1, 'a sent handout is visible');
select is((select gathering_date::text from public.teaching_handouts where id = '00000000-0000-4000-9910-0000000000a1'), '2026-10-10', 'with the date of its teaching');

select is(
  (select string_agg(field_key, ',') from public.handout_review_fields('00000000-0000-4000-9910-0000000000a1')),
  'block_1,block_2,block_3,block_4,block_5,block_6_item_1,block_6_item_2,block_7,block_9',
  'fields come in reading order, and the paragraph with an asterisk is left out rather than risk altering it'
);
select is((select current_value from public.handout_review_fields('00000000-0000-4000-9910-0000000000a1') where field_key = 'block_3'), '**Intro: **God is near.', 'bold is written as **bold**');
select is((select current_value from public.handout_review_fields('00000000-0000-4000-9910-0000000000a1') where field_key = 'block_5'), 'Read [John 15](https://example.com/john) today.', 'a link is written as [label](address)');
select is((select current_value from public.handout_review_fields('00000000-0000-4000-9910-0000000000a1') where field_key = 'block_6_item_1'), '**Behold. **Look up.', 'a bullet keeps its bold lead-in');
select is((select context from public.handout_review_fields('00000000-0000-4000-9910-0000000000a1') where field_key = 'block_5'), 'Section 1: Glory › Joined', 'a paragraph is grouped under its section and paragraph title');
select is((select label from public.handout_review_fields('00000000-0000-4000-9910-0000000000a1') where field_key = 'block_3'), 'Opening paragraph', 'a paragraph before any paragraph title is the opening paragraph');
select is((select label from public.handout_review_fields('00000000-0000-4000-9910-0000000000a1') where field_key = 'block_5'), 'Paragraph', 'and one after a title is a paragraph');
select is((select label from public.handout_review_fields('00000000-0000-4000-9910-0000000000a1') where field_key = 'block_7'), 'Closing line', 'the closing line is named');
select is((select context from public.handout_review_fields('00000000-0000-4000-9910-0000000000a1') where field_key = 'block_9'), 'Section 2: Second', 'a second section starts a new group');

create temp table hrows (n integer);
grant all on hrows to authenticated;
do $$
declare v_n integer;
begin
  update public.teaching_handouts set title = 'Hacked' where id = '00000000-0000-4000-9910-0000000000a1';
  get diagnostics v_n = row_count;
  insert into hrows values (v_n);
end $$;
select is((select n from hrows), 0, 'a Content Manager cannot edit the handout directly');

insert into hrev values ('r1', public.create_handout_revision('00000000-0000-4000-9910-0000000000a1'));
select is((select subject_title from public.content_revisions where id = (select id from hrev where key = 'r1')), 'Handout Test (Oct 10, 2026)', 'the revision carries the teaching date in its name');
select is(
  public.save_handout_revision_draft((select id from hrev where key = 'r1'), jsonb_build_array(
    jsonb_build_object('target_kind', 'handout', 'field_key', 'block_3', 'base_value', '**Intro: **God is near.', 'proposed_value', '**Intro: **God is *very* near.'),
    jsonb_build_object('target_kind', 'handout', 'field_key', 'block_5', 'base_value', 'Read [John 15](https://example.com/john) today.', 'proposed_value', 'Read [John 15:1](https://example.com/john) today.'),
    jsonb_build_object('target_kind', 'handout', 'field_key', 'block_6_item_2', 'base_value', 'Honor', 'proposed_value', 'Honor Him'),
    jsonb_build_object('target_kind', 'handout', 'field_key', 'block_4', 'base_value', 'Joined', 'proposed_value', 'Joined and sealed'),
    jsonb_build_object('target_kind', 'handout', 'field_key', 'block_1', 'base_value', 'Glory', 'proposed_value', 'Glory')
  )),
  4, 'four changes are saved; an unchanged field is skipped'
);
select throws_ok(
  $$ select public.save_handout_revision_draft((select id from hrev where key = 'r1'), jsonb_build_array(
       jsonb_build_object('target_kind', 'handout', 'field_key', 'block_8', 'base_value', 'This has a star * in it.', 'proposed_value', 'changed'))) $$,
  '22023', null, 'the left-out paragraph cannot be proposed'
);
select throws_ok(
  $$ select public.save_handout_revision_draft((select id from hrev where key = 'r1'), jsonb_build_array(
       jsonb_build_object('target_kind', 'handout', 'field_key', 'block_3', 'base_value', 'older wording', 'proposed_value', 'x'))) $$,
  'P0001', null, 'a save written against old wording is refused'
);
select throws_ok(
  $$ select public.save_handout_revision_draft((select id from hrev where key = 'r1'), jsonb_build_array(
       jsonb_build_object('target_kind', 'outline', 'field_key', 'block_3', 'base_value', '**Intro: **God is near.', 'proposed_value', 'x'))) $$,
  '22023', null, 'a field of another kind cannot be smuggled in'
);
select is(public.save_handout_revision_draft((select id from hrev where key = 'r1'), jsonb_build_array(
    jsonb_build_object('target_kind', 'handout', 'field_key', 'block_3', 'base_value', '**Intro: **God is near.', 'proposed_value', '**Intro: **God is *very* near.'),
    jsonb_build_object('target_kind', 'handout', 'field_key', 'block_5', 'base_value', 'Read [John 15](https://example.com/john) today.', 'proposed_value', 'Read [John 15:1](https://example.com/john) today.'),
    jsonb_build_object('target_kind', 'handout', 'field_key', 'block_6_item_2', 'base_value', 'Honor', 'proposed_value', 'Honor Him'),
    jsonb_build_object('target_kind', 'handout', 'field_key', 'block_4', 'base_value', 'Joined', 'proposed_value', 'Joined and sealed')
  )), 4, 'the same four are saved again');
select is(public.submit_handout_revision((select id from hrev where key = 'r1')), 4, 'and submitted');
reset role;

-- Another Content Manager (not the author) cannot touch it.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000003', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok($$ select public.submit_handout_revision((select id from hrev where key = 'r1')) $$, '42501', null, 'only the author can submit their revision');
select is((select count(*)::int from public.content_revisions where subject_type = 'handout'), 0, 'and another Content Manager cannot see it');
reset role;

-- ===========================================================================
-- The Administrator decides; accepted changes reach the handout with formatting intact
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is(
  (select (public.review_handout_revision_change((select id from public.content_revision_changes where revision_id = (select id from hrev where key = 'r1') and field_key = 'block_3'), 'accept') ->> 'finished')::boolean),
  false, 'accepting one change leaves the review open'
);
select is(
  (select content -> 2 -> 'inlines' from public.teaching_handouts where id = '00000000-0000-4000-9910-0000000000a1'),
  '[{"text":"Intro: ","bold":true},{"text":"God is "},{"text":"very","italic":true},{"text":" near."}]'::jsonb,
  'the accepted paragraph keeps its bold and gains the italic'
);
select throws_ok(
  $$ select public.admin_handout_structure('00000000-0000-4000-9910-0000000000a1', 'delete', 'block_8') $$,
  'P0001', null, 'adding or removing a paragraph is refused while a proposal is open'
);
select is(
  (select (public.review_all_handout_revision_changes((select id from hrev where key = 'r1'), 'accept') ->> 'finished')::boolean),
  true, 'accepting the rest finishes the review'
);
select is(
  (select content -> 4 -> 'inlines' from public.teaching_handouts where id = '00000000-0000-4000-9910-0000000000a1'),
  '[{"text":"Read "},{"text":"John 15:1","href":"https://example.com/john"},{"text":" today."}]'::jsonb,
  'a link keeps its address when its label is edited'
);
select is((select content -> 5 -> 'items' -> 1 -> 'inlines' from public.teaching_handouts where id = '00000000-0000-4000-9910-0000000000a1'), '[{"text":"Honor Him"}]'::jsonb, 'a bullet is updated in place');
select is((select content -> 3 -> 'inlines' from public.teaching_handouts where id = '00000000-0000-4000-9910-0000000000a1'), '[{"text":"Joined and sealed"}]'::jsonb, 'a paragraph title is updated in place');
select is((select content -> 3 ->> 'type' from public.teaching_handouts where id = '00000000-0000-4000-9910-0000000000a1'), 'paragraph_title', 'and stays a paragraph title');
select is((select status from public.content_revisions where id = (select id from hrev where key = 'r1')), 'completed', 'the revision is recorded as completed');
select is((select count(*)::int from public.content_revision_changes where revision_id = (select id from hrev where key = 'r1')), 4, 'and keeps its wording for the record');
reset role;

-- ===========================================================================
-- A link that is not http(s) never becomes a link
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
insert into hrev values ('r2', public.create_handout_revision('00000000-0000-4000-9910-0000000000a1'));
select is(
  public.save_handout_revision_draft((select id from hrev where key = 'r2'), jsonb_build_array(
    jsonb_build_object('target_kind', 'handout', 'field_key', 'block_5', 'base_value', 'Read [John 15:1](https://example.com/john) today.', 'proposed_value', 'Read [click](javascript:alert(1)) today.'))),
  1, 'wording that imitates a script link can be proposed as plain text'
);
select public.submit_handout_revision((select id from hrev where key = 'r2'));
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select public.review_all_handout_revision_changes((select id from hrev where key = 'r2'), 'accept');
select is(
  (select count(*)::int from public.teaching_handouts o, jsonb_array_elements(o.content -> 4 -> 'inlines') i where o.id = '00000000-0000-4000-9910-0000000000a1' and i ->> 'href' like 'javascript%'),
  0, 'it is stored as text, never as a link'
);
reset role;

-- ===========================================================================
-- Stale proposals, and accept anyway
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
insert into hrev values ('r3', public.create_handout_revision('00000000-0000-4000-9910-0000000000a1'));
select public.save_handout_revision_draft((select id from hrev where key = 'r3'), jsonb_build_array(
  jsonb_build_object('target_kind', 'handout', 'field_key', 'block_7', 'base_value', 'Arise and shine', 'proposed_value', 'Arise, shine')));
select public.submit_handout_revision((select id from hrev where key = 'r3'));
reset role;

update public.teaching_handouts set content = jsonb_set(content, '{6,inlines}', '[{"text":"Arise and shine today"}]'::jsonb) where id = '00000000-0000-4000-9910-0000000000a1';

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok(
  $$ select public.review_handout_revision_change((select id from public.content_revision_changes where revision_id = (select id from hrev where key = 'r3')), 'accept') $$,
  'P0001', null, 'a change written against older wording cannot be accepted by accident'
);
select lives_ok(
  $$ select public.review_handout_revision_change((select id from public.content_revision_changes where revision_id = (select id from hrev where key = 'r3')), 'accept', null, true) $$,
  'but the Administrator can accept it anyway'
);
select is((select content -> 6 -> 'inlines' from public.teaching_handouts where id = '00000000-0000-4000-9910-0000000000a1'), '[{"text":"Arise, shine"}]'::jsonb, 'which replaces the newer wording');
reset role;

-- ===========================================================================
-- The Administrator edits the text directly, adds and removes paragraphs
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok(
  $$ select public.admin_edit_handout_text('00000000-0000-4000-9910-0000000000a1', jsonb_build_array(jsonb_build_object('field_key', 'block_1', 'base_value', 'Glory', 'value', 'Hijack'))) $$,
  '42501', null, 'a Content Manager cannot use the Administrator text editor'
);
select throws_ok($$ select public.admin_handout_structure('00000000-0000-4000-9910-0000000000a1', 'delete', 'block_5') $$, '42501', null, 'or add and remove paragraphs');
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is(
  public.admin_edit_handout_text('00000000-0000-4000-9910-0000000000a1', jsonb_build_array(jsonb_build_object('field_key', 'block_1', 'base_value', 'Glory', 'value', 'From Glory'))),
  1, 'the Administrator edits a section title'
);
select is((select content -> 0 -> 'inlines' from public.teaching_handouts where id = '00000000-0000-4000-9910-0000000000a1'), '[{"text":"From Glory"}]'::jsonb, 'and it is stored');
select throws_ok(
  $$ select public.admin_edit_handout_text('00000000-0000-4000-9910-0000000000a1', jsonb_build_array(jsonb_build_object('field_key', 'block_1', 'base_value', 'Glory', 'value', 'Again'))) $$,
  'P0001', null, 'an edit written against old wording is refused'
);
select throws_ok(
  $$ select public.admin_edit_handout_text('00000000-0000-4000-9910-0000000000a1', jsonb_build_array(jsonb_build_object('field_key', 'block_1', 'base_value', 'From Glory', 'value', ''))) $$,
  'P0001', null, 'a title cannot be emptied'
);
-- r3 was decided, r1 and r2 finished: nothing is open, so the structure can change.
select lives_ok($$ select public.admin_handout_structure('00000000-0000-4000-9910-0000000000a1', 'insert', 'block_5') $$, 'a paragraph can be added after one');
select is((select jsonb_array_length(content) from public.teaching_handouts where id = '00000000-0000-4000-9910-0000000000a1'), 10, 'which adds one block');
select is((select content -> 5 ->> 'type' from public.teaching_handouts where id = '00000000-0000-4000-9910-0000000000a1'), 'paragraph', 'as a paragraph');
select lives_ok($$ select public.admin_handout_structure('00000000-0000-4000-9910-0000000000a1', 'delete', 'block_6') $$, 'and removed again');
select lives_ok($$ select public.admin_handout_structure('00000000-0000-4000-9910-0000000000a1', 'insert', 'block_6_item_1') $$, 'a bullet can be added after a bullet');
select is((select jsonb_array_length(content -> 5 -> 'items') from public.teaching_handouts where id = '00000000-0000-4000-9910-0000000000a1'), 3, 'which makes three');
select throws_ok($$ select public.admin_handout_structure('00000000-0000-4000-9910-0000000000a1', 'delete', 'block_99') $$, 'P0001', null, 'a place that does not exist is refused');
reset role;

-- ===========================================================================
-- Taking a submitted revision back, then taking the handout back from the gate
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
insert into hrev values ('r4', public.create_handout_revision('00000000-0000-4000-9910-0000000000a1'));
select public.save_handout_revision_draft((select id from hrev where key = 'r4'), jsonb_build_array(
  jsonb_build_object('target_kind', 'handout', 'field_key', 'block_9', 'base_value', 'Second', 'proposed_value', 'Second thing')));
select public.submit_handout_revision((select id from hrev where key = 'r4'));
select lives_ok($$ select public.recall_revision((select id from hrev where key = 'r4')) $$, 'a submitted revision can be taken back before an Administrator opens it');
select is((select status from public.content_revisions where id = (select id from hrev where key = 'r4')), 'draft', 'and is a draft again');
reset role;

update public.teaching_handouts set sent_for_review_at = null where id = '00000000-0000-4000-9910-0000000000a1';

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.teaching_handouts where id = '00000000-0000-4000-9910-0000000000a1'), 0, 'a handout taken back is hidden again');
select throws_ok($$ select public.submit_handout_revision((select id from hrev where key = 'r4')) $$, '42501', null, 'and the open draft can no longer be submitted');
reset role;

-- ===========================================================================
-- Deleting a handout takes its revisions with it
-- ===========================================================================

delete from public.teaching_handouts where id = '00000000-0000-4000-9910-0000000000a1';
select is((select count(*)::int from public.content_revisions where subject_type = 'handout'), 0, 'deleting a handout removes its revisions');

select * from finish();
rollback;
