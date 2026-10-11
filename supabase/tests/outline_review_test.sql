begin;

select * from no_plan();

-- Teaching outlines in the review cycle (20261011030000_outline_review.sql).
-- admin ...9900-01   editor ...02   other editor ...03
-- Outline O1 (a1) is a draft with a heading, paragraphs (bold, italic, a link, one with an asterisk), a list and a table.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9900-000000000001', 'authenticated', 'authenticated', 'admin@outline.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9900-000000000002', 'authenticated', 'authenticated', 'editor@outline.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9900-000000000003', 'authenticated', 'authenticated', 'other@outline.local', 'x', now(), now(), now());

insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ('00000000-0000-4000-9900-000000000001', 'admin', true, null, 'Admin', 'admin@outline.local'),
  ('00000000-0000-4000-9900-000000000002', 'content_manager', true, null, 'Editor', 'editor@outline.local'),
  ('00000000-0000-4000-9900-000000000003', 'content_manager', true, null, 'Other', 'other@outline.local');

insert into public.outline_categories (id, name, slug, sort_order) values ('00000000-0000-4000-9900-0000000000c1', 'Outline Review Test Category', 'outline-review-test-category', 999);

insert into public.teaching_outlines (id, slug, title, category_id, status, content, source_path)
values (
  '00000000-0000-4000-9900-0000000000a1', 'outline-review-test', 'Outline Review Test', '00000000-0000-4000-9900-0000000000c1', 'draft',
  $json$[
    {"type":"heading","level":1,"inlines":[{"text":"Lesson at a Glance"}]},
    {"type":"paragraph","inlines":[{"text":"Central truth: ","bold":true},{"text":"God is near."}]},
    {"type":"paragraph","inlines":[{"text":"This has a star * in it."}]},
    {"type":"heading","level":2,"inlines":[{"text":"Section 1"}]},
    {"type":"paragraph","inlines":[{"text":"Read "},{"text":"John 15","href":"https://example.com/john"},{"text":" today."}]},
    {"type":"list","items":[{"level":0,"ordered":false,"inlines":[{"text":"First"}]},{"level":0,"ordered":false,"inlines":[{"text":"Second","italic":true}]}]},
    {"type":"table","rows":[[[{"text":"A"}],[{"text":"B"}]]]}
  ]$json$::jsonb,
  '00000000-0000-4000-9900-0000000000f1.docx'
);

create temp table orev (key text primary key, id uuid);
grant all on orev to authenticated;

-- ===========================================================================
-- Not sent: a Content Manager sees nothing and can start nothing
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.teaching_outlines where id = '00000000-0000-4000-9900-0000000000a1'), 0, 'an unsent draft outline is invisible to a Content Manager');
select throws_ok($$ select public.create_outline_revision('00000000-0000-4000-9900-0000000000a1') $$, '42501', null, 'a revision cannot be started on an unsent outline');
select throws_ok($$ select * from public.outline_review_fields('00000000-0000-4000-9900-0000000000a1') $$, '42501', null, 'its fields are not handed out');
select throws_ok(
  $$ insert into public.teaching_outlines (slug, title, category_id, status, content, source_path)
     values ('cm-upload', 'CM Upload', '00000000-0000-4000-9900-0000000000c1', 'draft', '[]'::jsonb, '00000000-0000-4000-9900-0000000000f2.docx') $$,
  '42501', null, 'a Content Manager can no longer upload an outline'
);
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select lives_ok($$ select public.create_outline_revision('00000000-0000-4000-9900-0000000000a1') $$, 'an Administrator can use the review functions on an unsent draft');
select is((select count(*)::int from public.outline_review_fields('00000000-0000-4000-9900-0000000000a1')), 9, 'and sees every editable field');
reset role;
delete from public.content_revisions where subject_type = 'outline' and outline_id = '00000000-0000-4000-9900-0000000000a1';

-- ===========================================================================
-- Sent: visible, and the right text is offered
-- ===========================================================================

update public.teaching_outlines set sent_for_review_at = now() where id = '00000000-0000-4000-9900-0000000000a1';

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.teaching_outlines where id = '00000000-0000-4000-9900-0000000000a1'), 1, 'a sent outline is visible');

select is(
  (select string_agg(field_key, ',') from public.outline_review_fields('00000000-0000-4000-9900-0000000000a1')),
  'title,block_1,block_2,block_4,block_5,block_6_item_1,block_6_item_2,block_7_cell_1_1,block_7_cell_1_2',
  'fields come in reading order, and the paragraph with an asterisk is left out rather than risk altering it'
);
select is((select current_value from public.outline_review_fields('00000000-0000-4000-9900-0000000000a1') where field_key = 'block_2'), '**Central truth: **God is near.', 'bold is written as **bold**');
select is((select current_value from public.outline_review_fields('00000000-0000-4000-9900-0000000000a1') where field_key = 'block_5'), 'Read [John 15](https://example.com/john) today.', 'a link is written as [label](address)');
select is((select current_value from public.outline_review_fields('00000000-0000-4000-9900-0000000000a1') where field_key = 'block_6_item_2'), '*Second*', 'italic is written as *italic*');
select is((select context from public.outline_review_fields('00000000-0000-4000-9900-0000000000a1') where field_key = 'block_5'), 'Lesson at a Glance › Section 1', 'a field is grouped under the headings above it');

create temp table orows (n integer);
grant all on orows to authenticated;
do $$
declare v_n integer;
begin
  update public.teaching_outlines set title = 'Hacked' where id = '00000000-0000-4000-9900-0000000000a1';
  get diagnostics v_n = row_count;
  insert into orows values (v_n);
end $$;
select is((select n from orows), 0, 'a Content Manager cannot edit the outline directly');

insert into orev values ('r1', public.create_outline_revision('00000000-0000-4000-9900-0000000000a1'));
select is(
  public.save_outline_revision_draft((select id from orev where key = 'r1'), jsonb_build_array(
    jsonb_build_object('target_kind', 'outline', 'field_key', 'block_2', 'base_value', '**Central truth: **God is near.', 'proposed_value', '**Central truth: **God is *very* near.'),
    jsonb_build_object('target_kind', 'outline', 'field_key', 'block_5', 'base_value', 'Read [John 15](https://example.com/john) today.', 'proposed_value', 'Read [John 15:1](https://example.com/john) today.'),
    jsonb_build_object('target_kind', 'outline', 'field_key', 'block_6_item_1', 'base_value', 'First', 'proposed_value', 'First point'),
    jsonb_build_object('target_kind', 'outline', 'field_key', 'block_7_cell_1_1', 'base_value', 'A', 'proposed_value', 'A1'),
    jsonb_build_object('target_kind', 'outline', 'field_key', 'block_1', 'base_value', 'Lesson at a Glance', 'proposed_value', 'Lesson at a Glance')
  )),
  4, 'four changes are saved; an unchanged field is skipped'
);
select throws_ok(
  $$ select public.save_outline_revision_draft((select id from orev where key = 'r1'), jsonb_build_array(
       jsonb_build_object('target_kind', 'outline', 'field_key', 'block_3', 'base_value', 'This has a star * in it.', 'proposed_value', 'changed'))) $$,
  '22023', null, 'the left-out paragraph cannot be proposed'
);
select throws_ok(
  $$ select public.save_outline_revision_draft((select id from orev where key = 'r1'), jsonb_build_array(
       jsonb_build_object('target_kind', 'outline', 'field_key', 'block_2', 'base_value', 'older wording', 'proposed_value', 'x'))) $$,
  'P0001', null, 'a save written against old wording is refused'
);
select is(public.save_outline_revision_draft((select id from orev where key = 'r1'), jsonb_build_array(
    jsonb_build_object('target_kind', 'outline', 'field_key', 'block_2', 'base_value', '**Central truth: **God is near.', 'proposed_value', '**Central truth: **God is *very* near.'),
    jsonb_build_object('target_kind', 'outline', 'field_key', 'block_5', 'base_value', 'Read [John 15](https://example.com/john) today.', 'proposed_value', 'Read [John 15:1](https://example.com/john) today.'),
    jsonb_build_object('target_kind', 'outline', 'field_key', 'block_6_item_1', 'base_value', 'First', 'proposed_value', 'First point'),
    jsonb_build_object('target_kind', 'outline', 'field_key', 'block_7_cell_1_1', 'base_value', 'A', 'proposed_value', 'A1')
  )), 4, 'the same four are saved again');
select is(public.submit_outline_revision((select id from orev where key = 'r1')), 4, 'and submitted');
reset role;

-- Another Content Manager (not the author) cannot touch it.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000003', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok($$ select public.submit_outline_revision((select id from orev where key = 'r1')) $$, '42501', null, 'only the author can submit their revision');
select is((select count(*)::int from public.content_revisions where subject_type = 'outline'), 0, 'and another Content Manager cannot see it');
reset role;

-- ===========================================================================
-- The Administrator decides; accepted changes reach the outline with formatting intact
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is(
  (select (public.review_outline_revision_change((select id from public.content_revision_changes where revision_id = (select id from orev where key = 'r1') and field_key = 'block_2'), 'accept') ->> 'finished')::boolean),
  false, 'accepting one change leaves the review open'
);
select is(
  (select content -> 1 -> 'inlines' from public.teaching_outlines where id = '00000000-0000-4000-9900-0000000000a1'),
  '[{"text":"Central truth: ","bold":true},{"text":"God is "},{"text":"very","italic":true},{"text":" near."}]'::jsonb,
  'the accepted paragraph keeps its bold and gains the italic'
);
select is(
  (select (public.review_all_outline_revision_changes((select id from orev where key = 'r1'), 'accept') ->> 'finished')::boolean),
  true, 'accepting the rest finishes the review'
);
select is(
  (select content -> 4 -> 'inlines' from public.teaching_outlines where id = '00000000-0000-4000-9900-0000000000a1'),
  '[{"text":"Read "},{"text":"John 15:1","href":"https://example.com/john"},{"text":" today."}]'::jsonb,
  'a link keeps its address when its label is edited'
);
select is((select content -> 5 -> 'items' -> 0 -> 'inlines' from public.teaching_outlines where id = '00000000-0000-4000-9900-0000000000a1'), '[{"text":"First point"}]'::jsonb, 'a list item is updated in place');
select is((select content -> 5 -> 'items' -> 0 ->> 'level' from public.teaching_outlines where id = '00000000-0000-4000-9900-0000000000a1'), '0', 'and keeps its level');
select is((select content -> 6 -> 'rows' -> 0 -> 0 from public.teaching_outlines where id = '00000000-0000-4000-9900-0000000000a1'), '[{"text":"A1"}]'::jsonb, 'a table cell is updated in place');
select is((select status from public.content_revisions where id = (select id from orev where key = 'r1')), 'completed', 'the revision is recorded as completed');
select is((select count(*)::int from public.content_revision_changes where revision_id = (select id from orev where key = 'r1')), 4, 'and keeps its wording for the record');
reset role;

-- ===========================================================================
-- A link that is not http(s) never becomes a link
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
insert into orev values ('r2', public.create_outline_revision('00000000-0000-4000-9900-0000000000a1'));
select is(
  public.save_outline_revision_draft((select id from orev where key = 'r2'), jsonb_build_array(
    jsonb_build_object('target_kind', 'outline', 'field_key', 'block_5', 'base_value', 'Read [John 15:1](https://example.com/john) today.', 'proposed_value', 'Read [click](javascript:alert(1)) today.'))),
  1, 'wording that imitates a script link can be proposed as plain text'
);
select public.submit_outline_revision((select id from orev where key = 'r2'));
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select public.review_all_outline_revision_changes((select id from orev where key = 'r2'), 'accept');
select is(
  (select count(*)::int from public.teaching_outlines o, jsonb_array_elements(o.content -> 4 -> 'inlines') i where o.id = '00000000-0000-4000-9900-0000000000a1' and i ->> 'href' like 'javascript%'),
  0, 'it is stored as text, never as a link'
);
reset role;

-- ===========================================================================
-- Stale proposals, and accept anyway
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
insert into orev values ('r3', public.create_outline_revision('00000000-0000-4000-9900-0000000000a1'));
select public.save_outline_revision_draft((select id from orev where key = 'r3'), jsonb_build_array(
  jsonb_build_object('target_kind', 'outline', 'field_key', 'title', 'base_value', 'Outline Review Test', 'proposed_value', 'Proposed Title')));
select public.submit_outline_revision((select id from orev where key = 'r3'));
reset role;

update public.teaching_outlines set title = 'Newer Title' where id = '00000000-0000-4000-9900-0000000000a1';

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok(
  $$ select public.review_outline_revision_change((select id from public.content_revision_changes where revision_id = (select id from orev where key = 'r3')), 'accept') $$,
  'P0001', null, 'a change written against older wording cannot be accepted by accident'
);
select lives_ok(
  $$ select public.review_outline_revision_change((select id from public.content_revision_changes where revision_id = (select id from orev where key = 'r3')), 'accept', null, true) $$,
  'but the Administrator can accept it anyway'
);
select is((select title from public.teaching_outlines where id = '00000000-0000-4000-9900-0000000000a1'), 'Proposed Title', 'which replaces the newer wording');
reset role;

-- ===========================================================================
-- The Administrator edits the text directly
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok(
  $$ select public.admin_edit_outline_text('00000000-0000-4000-9900-0000000000a1', jsonb_build_array(jsonb_build_object('field_key', 'block_1', 'base_value', 'Lesson at a Glance', 'value', 'Hijack'))) $$,
  '42501', null, 'a Content Manager cannot use the Administrator text editor'
);
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is(
  public.admin_edit_outline_text('00000000-0000-4000-9900-0000000000a1', jsonb_build_array(jsonb_build_object('field_key', 'block_1', 'base_value', 'Lesson at a Glance', 'value', 'Lesson Overview'))),
  1, 'the Administrator edits a heading'
);
select is((select content -> 0 -> 'inlines' from public.teaching_outlines where id = '00000000-0000-4000-9900-0000000000a1'), '[{"text":"Lesson Overview"}]'::jsonb, 'and it is stored');
select throws_ok(
  $$ select public.admin_edit_outline_text('00000000-0000-4000-9900-0000000000a1', jsonb_build_array(jsonb_build_object('field_key', 'block_1', 'base_value', 'Lesson at a Glance', 'value', 'Again'))) $$,
  'P0001', null, 'an edit written against old wording is refused'
);
select throws_ok(
  $$ select public.admin_edit_outline_text('00000000-0000-4000-9900-0000000000a1', jsonb_build_array(jsonb_build_object('field_key', 'block_1', 'base_value', 'Lesson Overview', 'value', ''))) $$,
  'P0001', null, 'a heading cannot be emptied'
);
reset role;

-- ===========================================================================
-- Taking a submitted revision back
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
insert into orev values ('r4', public.create_outline_revision('00000000-0000-4000-9900-0000000000a1'));
select public.save_outline_revision_draft((select id from orev where key = 'r4'), jsonb_build_array(
  jsonb_build_object('target_kind', 'outline', 'field_key', 'block_6_item_2', 'base_value', '*Second*', 'proposed_value', '*Second thing*')));
select public.submit_outline_revision((select id from orev where key = 'r4'));
select lives_ok($$ select public.recall_revision((select id from orev where key = 'r4')) $$, 'a submitted revision can be taken back before an Administrator opens it');
select is((select status from public.content_revisions where id = (select id from orev where key = 'r4')), 'draft', 'and is a draft again');
reset role;

-- ===========================================================================
-- Taken back from the gate, then publishing closes everything
-- ===========================================================================

update public.teaching_outlines set sent_for_review_at = null where id = '00000000-0000-4000-9900-0000000000a1';

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9900-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.teaching_outlines where id = '00000000-0000-4000-9900-0000000000a1'), 0, 'an outline taken back is hidden again');
select throws_ok($$ select public.submit_outline_revision((select id from orev where key = 'r4')) $$, '42501', null, 'and the open draft can no longer be submitted');
reset role;

update public.teaching_outlines set sent_for_review_at = now() where id = '00000000-0000-4000-9900-0000000000a1';
update public.teaching_outlines set status = 'published', published_at = now() where id = '00000000-0000-4000-9900-0000000000a1';
select is((select sent_for_review_at from public.teaching_outlines where id = '00000000-0000-4000-9900-0000000000a1'), null, 'publishing clears the sent mark');
select is((select status from public.content_revisions where id = (select id from orev where key = 'r4')), 'cancelled', 'and closes the revision that was still open');
select is((select count(*)::int from public.content_revision_changes where revision_id = (select id from orev where key = 'r4')), 0, 'discarding the unsubmitted draft wording');

select * from finish();
rollback;
