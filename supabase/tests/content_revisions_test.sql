begin;

select * from no_plan();

-- Fixed ids so every step below is readable.
--   admin    ...9200-000000000001     editor A ...9200-000000000002
--   editor B ...9200-000000000003     nobody   ...9200-000000000004 (signed in, no staff role)
--   T1 (draft teaching) ...a1   T2 (published) ...a2   T3 (draft, for the publish test) ...a3
--   category ...c1   sections: paragraph ...b1, bullets ...b2, scripture ...b3

create temp table revision_test_ids (key text primary key, id uuid not null) on commit drop;
insert into revision_test_ids values
  ('admin', '00000000-0000-4000-9200-000000000001'),
  ('editor_a', '00000000-0000-4000-9200-000000000002'),
  ('editor_b', '00000000-0000-4000-9200-000000000003'),
  ('nobody', '00000000-0000-4000-9200-000000000004');
grant select on revision_test_ids to anon, authenticated;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', key || '@revisions.local', 'local-regression-placeholder', now(), now(), now()
from revision_test_ids;

insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ('00000000-0000-4000-9200-000000000001', 'admin', true, null, 'Local Admin', 'admin@revisions.local'),
  ('00000000-0000-4000-9200-000000000002', 'content_manager', true, null, 'Editor A', 'editor_a@revisions.local'),
  ('00000000-0000-4000-9200-000000000003', 'content_manager', true, null, 'Editor B', 'editor_b@revisions.local');

insert into public.teachings (id, slug, title, central_theme, introduction, summary, teaser_1_heading, teaser_1_text, status, published_at)
values
  ('00000000-0000-4000-9200-0000000000a1', 'revisions-t1', 'Original Title', 'Original theme', 'Original introduction.', 'Original summary.', 'Teaser heading', 'Teaser text', 'draft', null),
  ('00000000-0000-4000-9200-0000000000a2', 'revisions-t2', 'Published Title', 'Published theme', 'Published intro.', 'Published summary.', 'Heading', 'Text', 'published', now()),
  ('00000000-0000-4000-9200-0000000000a3', 'revisions-t3', 'Third Draft', 'Third theme', 'Third intro.', 'Third summary.', 'Heading', 'Text', 'draft', null);

insert into public.teaching_categories (id, teaching_id, slug, title, sort_order, status)
values
  ('00000000-0000-4000-9200-0000000000c1', '00000000-0000-4000-9200-0000000000a1', 'cat-one', 'Category One', 1, 'draft'),
  ('00000000-0000-4000-9200-0000000000c3', '00000000-0000-4000-9200-0000000000a3', 'cat-three', 'Category Three', 1, 'draft');

insert into public.teaching_sections (id, teaching_id, category_id, slug, title, content, sort_order, status)
values
  ('00000000-0000-4000-9200-0000000000b1', '00000000-0000-4000-9200-0000000000a1', '00000000-0000-4000-9200-0000000000c1', 'sec-one', 'Faithful',
    '{"version":1,"format":"paragraph","text":"The Lord is faithful. See **grace** and [a link](https://example.com).","showTitle":true}'::jsonb, 1, 'draft'),
  ('00000000-0000-4000-9200-0000000000b2', '00000000-0000-4000-9200-0000000000a1', '00000000-0000-4000-9200-0000000000c1', 'sec-two', 'Points',
    '{"version":1,"format":"bullets","introduction":"Intro line","bullets":["One","Two"],"conclusion":"Wrap up","showTitle":true}'::jsonb, 2, 'draft'),
  ('00000000-0000-4000-9200-0000000000b3', '00000000-0000-4000-9200-0000000000a1', '00000000-0000-4000-9200-0000000000c1', 'sec-three', 'Psalm',
    '{"version":1,"format":"scripture","reference":"Psalm 23:1","translation":"NIV","quotation":"The Lord is my shepherd.","showTitle":true}'::jsonb, 3, 'draft'),
  ('00000000-0000-4000-9200-0000000000b4', '00000000-0000-4000-9200-0000000000a3', '00000000-0000-4000-9200-0000000000c3', 'sec-four', 'Third',
    '{"version":1,"format":"paragraph","text":"Third text.","showTitle":true}'::jsonb, 1, 'draft');

-- ===========================================================================
-- The tables are read-only to the app roles, and nobody outside the staff list gets in
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9200-000000000004', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

select throws_ok(
  $$ select public.create_teaching_revision('00000000-0000-4000-9200-0000000000a1') $$,
  '42501', null, 'a signed-in user with no staff role cannot start a revision'
);
select throws_ok(
  $$ insert into public.content_revisions (subject_type, teaching_id, subject_title) values ('teaching', '00000000-0000-4000-9200-0000000000a1', 'x') $$,
  '42501', null, 'the revision table cannot be written to directly'
);
select is((select count(*)::int from public.teachings where id = '00000000-0000-4000-9200-0000000000a1'), 0, 'a user with no staff role cannot read a draft teaching');

reset role;
set local role anon;
select throws_ok($$ select * from public.content_revisions $$, '42501', null, 'the public cannot read revisions');
select throws_ok($$ select * from public.content_revision_changes $$, '42501', null, 'the public cannot read proposed changes');
select throws_ok($$ select public.create_teaching_revision('00000000-0000-4000-9200-0000000000a1') $$, '42501', null, 'the public cannot start a revision');
select is((select count(*)::int from public.teachings where id = '00000000-0000-4000-9200-0000000000a1'), 0, 'the public cannot read a draft teaching (draft text is private until published)');
reset role;

-- ===========================================================================
-- Editor A: create, edit, submit
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9200-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

select is((select count(*)::int from public.teachings where id = '00000000-0000-4000-9200-0000000000a1'), 1, 'an editor can read a draft teaching');
select is((select count(*)::int from public.teaching_sections where teaching_id = '00000000-0000-4000-9200-0000000000a1'), 3, 'an editor can read the draft teaching sections');

select lives_ok($$ select public.create_teaching_revision('00000000-0000-4000-9200-0000000000a1') $$, 'a co-editor can create a draft revision');
select is(
  (select count(*)::int from public.content_revisions where teaching_id = '00000000-0000-4000-9200-0000000000a1' and submitted_by = '00000000-0000-4000-9200-000000000002' and status = 'draft'),
  1, 'the draft belongs to the co-editor'
);
select is(
  (select public.create_teaching_revision('00000000-0000-4000-9200-0000000000a1')),
  (select id from public.content_revisions where teaching_id = '00000000-0000-4000-9200-0000000000a1' and submitted_by = '00000000-0000-4000-9200-000000000002'),
  'asking again returns the same open draft instead of making a second one'
);
select throws_ok(
  $$ select public.create_teaching_revision('00000000-0000-4000-9200-0000000000a2') $$,
  'P0001', null, 'changes cannot be proposed to a published teaching'
);

-- Insertions and deletions are only proposals: a word added to the title, a word removed from the section.
select lives_ok($$
  select public.save_teaching_revision_draft(
    (select id from public.content_revisions where teaching_id = '00000000-0000-4000-9200-0000000000a1' and submitted_by = '00000000-0000-4000-9200-000000000002'),
    jsonb_build_array(
      jsonb_build_object('target_kind','teaching','target_id',null,'field_key','title','base_value','Original Title','proposed_value','Original Better Title'),
      jsonb_build_object('target_kind','section','target_id','00000000-0000-4000-9200-0000000000b1','field_key','text',
        'base_value','The Lord is faithful. See **grace** and [a link](https://example.com).','proposed_value','The Lord remains faithful. See **grace** and [a link](https://example.com).'),
      jsonb_build_object('target_kind','section','target_id','00000000-0000-4000-9200-0000000000b2','field_key','bullets','base_value',E'One\nTwo','proposed_value',E'One'),
      jsonb_build_object('target_kind','teaching','target_id',null,'field_key','summary','base_value','Original summary.','proposed_value','Original summary.')
    )) $$, 'a co-editor can edit their own draft');
select is(
  (select count(*)::int from public.content_revision_changes c join public.content_revisions r on r.id = c.revision_id where r.submitted_by = '00000000-0000-4000-9200-000000000002'),
  3, 'only fields that actually differ are stored (the unchanged summary is not)'
);
select is((select title from public.teachings where id = '00000000-0000-4000-9200-0000000000a1'), 'Original Title', 'the approved teaching is unchanged by a draft proposal (insertion)');
select is((select content ->> 'text' from public.teaching_sections where id = '00000000-0000-4000-9200-0000000000b1'), 'The Lord is faithful. See **grace** and [a link](https://example.com).', 'the approved section is unchanged by a draft proposal (word replaced)');
select is((select jsonb_array_length(content -> 'bullets') from public.teaching_sections where id = '00000000-0000-4000-9200-0000000000b2'), 2, 'a proposed bullet deletion does not remove the bullet');

-- Fields that stay Administrator-only, and bad input
select throws_ok(
  $$ select public.save_teaching_revision_draft(
       (select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'),
       jsonb_build_array(jsonb_build_object('target_kind','teaching','target_id',null,'field_key','slug','base_value','revisions-t1','proposed_value','hacked'))) $$,
  '22023', null, 'the slug cannot be proposed'
);
select throws_ok(
  $$ select public.save_teaching_revision_draft(
       (select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'),
       jsonb_build_array(jsonb_build_object('target_kind','teaching','target_id',null,'field_key','status','base_value','draft','proposed_value','published'))) $$,
  '22023', null, 'the publish status cannot be proposed'
);
select throws_ok(
  $$ select public.save_teaching_revision_draft(
       (select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'),
       jsonb_build_array(jsonb_build_object('target_kind','section','target_id','00000000-0000-4000-9200-0000000000b3','field_key','translation','base_value','NIV','proposed_value','KJV'))) $$,
  '22023', null, 'a scripture translation (which decides the copyright notice) cannot be proposed'
);
select throws_ok(
  $$ select public.save_teaching_revision_draft(
       (select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'),
       jsonb_build_array(jsonb_build_object('target_kind','section','target_id','00000000-0000-4000-9200-0000000000b2','field_key','text','base_value','','proposed_value','wrong format'))) $$,
  '22023', null, 'a text change for the wrong section format is refused'
);
select throws_ok(
  $$ select public.save_teaching_revision_draft(
       (select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'),
       jsonb_build_array(jsonb_build_object('target_kind','teaching','target_id',null,'field_key','title','base_value','Original Title','proposed_value', repeat('x', 161)))) $$,
  '22023', null, 'text over the length limit is refused'
);
select throws_ok(
  $$ select public.save_teaching_revision_draft(
       (select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'),
       jsonb_build_array(jsonb_build_object('target_kind','section','target_id','00000000-0000-4000-9200-0000000000b4','field_key','text','base_value','Third text.','proposed_value','other teaching'))) $$,
  '22023', null, 'a section from a different teaching cannot be proposed through this revision'
);
select throws_ok(
  $$ select public.save_teaching_revision_draft(
       (select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'),
       jsonb_build_array(jsonb_build_object('target_kind','teaching','target_id',null,'field_key','title','base_value','Someone changed this','proposed_value','Mine'))) $$,
  'P0001', 'conflict: teaching:title changed after you opened this page. Reload to see the current wording.',
  'an editor whose starting wording is out of date cannot overwrite newer work'
);
select is(
  (select count(*)::int from public.content_revision_changes c join public.content_revisions r on r.id = c.revision_id where r.submitted_by = '00000000-0000-4000-9200-000000000002'),
  3, 'a refused save leaves the saved draft exactly as it was'
);

-- Direct writes to the approved teaching do nothing
select lives_ok($$ update public.teachings set title = 'Hacked' where id = '00000000-0000-4000-9200-0000000000a1' $$, 'a direct update by an editor runs without error...');
select lives_ok($$ update public.teaching_sections set title = 'Hacked' where id = '00000000-0000-4000-9200-0000000000b1' $$, '...and so does a direct section update...');
select lives_ok($$ delete from public.teaching_sections where id = '00000000-0000-4000-9200-0000000000b1' $$, '...and a direct section delete');
select throws_ok(
  $$ update public.content_revisions set status = 'completed' where submitted_by = '00000000-0000-4000-9200-000000000002' $$,
  '42501', null, 'an editor cannot change a revision record directly'
);
select throws_ok(
  $$ update public.content_revision_changes set change_status = 'accepted' $$,
  '42501', null, 'an editor cannot mark a change accepted'
);
select throws_ok(
  $$ delete from public.content_revisions $$,
  '42501', null, 'an editor cannot delete revision history'
);

-- Editors cannot decide anything
select throws_ok(
  $$ select public.review_teaching_revision_change((select id from public.content_revision_changes limit 1), 'accept') $$,
  '42501', null, 'a co-editor cannot accept a change'
);
select throws_ok(
  $$ select public.review_teaching_revision_change((select id from public.content_revision_changes limit 1), 'reject') $$,
  '42501', null, 'a co-editor cannot reject a change'
);
select throws_ok(
  $$ select public.review_all_teaching_revision_changes((select id from public.content_revisions limit 1), 'accept') $$,
  '42501', null, 'a co-editor cannot accept all changes'
);
select throws_ok($$ select public.purge_revision_history(0) $$, '42501', null, 'a co-editor cannot clear revision history');
select throws_ok($$ select public.cancel_teaching_revision((select id from public.content_revisions limit 1)) $$, '42501', null, 'a co-editor cannot cancel a revision');

reset role;
select is((select title from public.teachings where id = '00000000-0000-4000-9200-0000000000a1'), 'Original Title', 'direct teaching update changed nothing');
select is((select title from public.teaching_sections where id = '00000000-0000-4000-9200-0000000000b1'), 'Faithful', 'direct section update changed nothing');
select is((select count(*)::int from public.teaching_sections where id = '00000000-0000-4000-9200-0000000000b1'), 1, 'direct section delete removed nothing');

-- ===========================================================================
-- Editor B cannot touch editor A's draft, and cannot see it
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9200-000000000003', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

select is((select count(*)::int from public.content_revisions), 0, 'editor B cannot see editor A''s revision');
select is((select count(*)::int from public.content_revision_changes), 0, 'editor B cannot see editor A''s proposed changes');
select throws_ok(
  $$ select public.save_teaching_revision_draft(
       (select id from public.content_revisions where submitted_by is not null limit 1), '[]'::jsonb) $$,
  'P0002', null, 'editor B cannot edit editor A''s draft (it is not even visible)'
);
reset role;
select throws_ok(
  $$ select 1 from (select set_config('request.jwt.claim.sub', '00000000-0000-4000-9200-000000000003', true)) s,
     lateral (select public.save_teaching_revision_draft((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'), '[]'::jsonb)) x $$,
  '42501', null, 'even knowing the id, editor B cannot edit editor A''s draft'
);
select throws_ok(
  $$ select 1 from (select set_config('request.jwt.claim.sub', '00000000-0000-4000-9200-000000000003', true)) s,
     lateral (select public.submit_teaching_revision((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'))) x $$,
  '42501', null, 'editor B cannot submit editor A''s draft'
);
select throws_ok(
  $$ select 1 from (select set_config('request.jwt.claim.sub', '00000000-0000-4000-9200-000000000003', true)) s,
     lateral (select public.discard_teaching_revision((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'))) x $$,
  '42501', null, 'editor B cannot discard editor A''s draft'
);

-- ===========================================================================
-- Editor A submits; after that the revision is locked
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9200-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

select is((select public.submit_teaching_revision((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'))), 3, 'a co-editor can submit their own draft');
select throws_ok(
  $$ select public.save_teaching_revision_draft((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'), '[]'::jsonb) $$,
  'P0001', null, 'a submitted revision cannot be edited'
);
select throws_ok(
  $$ select public.submit_teaching_revision((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002')) $$,
  'P0001', null, 'a submitted revision cannot be submitted twice'
);
select throws_ok(
  $$ select public.discard_teaching_revision((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002')) $$,
  'P0001', null, 'an editor cannot discard a submitted revision'
);
select is((select status from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'), 'submitted', 'the editor sees the status of their proposal');

-- ===========================================================================
-- Editor B proposes the SAME summary wording as a competing revision (separate revision)
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9200-000000000003', true); end $$;
select lives_ok($$ select public.create_teaching_revision('00000000-0000-4000-9200-0000000000a1') $$, 'a second co-editor can start their own revision on the same teaching');
select lives_ok($$
  select public.save_teaching_revision_draft(
    (select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000003'),
    jsonb_build_array(jsonb_build_object('target_kind','teaching','target_id',null,'field_key','title','base_value','Original Title','proposed_value','Editor B Title'))) $$,
  'the second co-editor can save a proposal for the same field');
select is((select public.submit_teaching_revision((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000003'))), 1, 'the second co-editor can submit');
reset role;
select is((select count(*)::int from public.content_revisions where teaching_id = '00000000-0000-4000-9200-0000000000a1' and status = 'submitted'), 2, 'two co-editors have two separate submitted revisions');

-- ===========================================================================
-- Administrator review
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9200-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

select is((select count(*)::int from public.content_revisions where status = 'submitted'), 2, 'an Administrator can see every submitted revision');
select is((select count(*)::int from public.content_revision_changes), 4, 'an Administrator can see every proposed change');

-- Accept the title change from editor A (revision A, field title)
select lives_ok(
  $$ select public.review_teaching_revision_change(
       (select c.id from public.content_revision_changes c join public.content_revisions r on r.id = c.revision_id
        where r.submitted_by = '00000000-0000-4000-9200-000000000002' and c.field_key = 'title'), 'accept', 'Looks good') $$,
  'an Administrator can accept one change'
);
select is((select title from public.teachings where id = '00000000-0000-4000-9200-0000000000a1'), 'Original Better Title', 'the accepted change is applied to the teaching');
select is(
  (select change_status from public.content_revision_changes c join public.content_revisions r on r.id = c.revision_id where r.submitted_by = '00000000-0000-4000-9200-000000000002' and c.field_key = 'title'),
  'accepted', 'the change is marked accepted'
);
select is(
  (select (c.reviewed_by = '00000000-0000-4000-9200-000000000001' and c.reviewed_at is not null and c.admin_note = 'Looks good')
   from public.content_revision_changes c join public.content_revisions r on r.id = c.revision_id where r.submitted_by = '00000000-0000-4000-9200-000000000002' and c.field_key = 'title'),
  true, 'the Administrator, the time and the note are recorded'
);
select is((select content ->> 'text' from public.teaching_sections where id = '00000000-0000-4000-9200-0000000000b1'), 'The Lord is faithful. See **grace** and [a link](https://example.com).', 'a change that was not accepted is not applied');
select throws_ok(
  $$ select public.review_teaching_revision_change(
       (select c.id from public.content_revision_changes c join public.content_revisions r on r.id = c.revision_id
        where r.submitted_by = '00000000-0000-4000-9200-000000000002' and c.field_key = 'title'), 'reject') $$,
  'P0001', 'That change was already decided.', 'a decided change cannot be reopened'
);

-- Reject one: the section text proposal
select lives_ok(
  $$ select public.review_teaching_revision_change(
       (select c.id from public.content_revision_changes c join public.content_revisions r on r.id = c.revision_id
        where r.submitted_by = '00000000-0000-4000-9200-000000000002' and c.field_key = 'text'), 'reject') $$,
  'an Administrator can reject one change'
);
select is((select content ->> 'text' from public.teaching_sections where id = '00000000-0000-4000-9200-0000000000b1'), 'The Lord is faithful. See **grace** and [a link](https://example.com).', 'a rejected change leaves the approved text intact (original wording and formatting)');

-- The competing proposal from editor B was based on the old title: it is now stale and cannot be accepted
select throws_ok(
  $$ select public.review_teaching_revision_change(
       (select c.id from public.content_revision_changes c join public.content_revisions r on r.id = c.revision_id
        where r.submitted_by = '00000000-0000-4000-9200-000000000003'), 'accept') $$,
  'P0001', null, 'a proposal made against older wording cannot overwrite newer approved text'
);
select is((select title from public.teachings where id = '00000000-0000-4000-9200-0000000000a1'), 'Original Better Title', 'approving one editor''s change did not silently get overwritten by the other');
select is(
  (select (public.review_all_teaching_revision_changes((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000003'), 'accept') ->> 'skipped_stale')::int),
  1, 'Accept All skips a stale change and reports it'
);
select is((select status from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000003'), 'submitted', 'a revision with a stale change stays open for the Administrator to decide');

-- Admin direct edit still works, and makes older proposals stale
select lives_ok($$ update public.teachings set summary = 'Admin direct edit.' where id = '00000000-0000-4000-9200-0000000000a1' $$, 'an Administrator can still edit a teaching directly');
select is((select summary from public.teachings where id = '00000000-0000-4000-9200-0000000000a1'), 'Admin direct edit.', 'the direct edit was applied');

-- Accept All on editor A's remaining change (bullets) finishes the revision and clears its text
select is(
  (select (public.review_all_teaching_revision_changes((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'), 'accept') ->> 'finished')::boolean),
  true, 'Accept All finishes a revision when nothing is left to decide'
);
select is((select jsonb_array_length(content -> 'bullets') from public.teaching_sections where id = '00000000-0000-4000-9200-0000000000b2'), 1, 'the accepted bullet deletion was applied');
select is((select status from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'), 'completed', 'the finished revision is marked completed');
select is(
  (select (accepted_count = 2 and rejected_count = 1 and total_changes = 3 and completed_by = '00000000-0000-4000-9200-000000000001' and completed_by_name = 'Local Admin' and purged_at is not null)
   from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'),
  true, 'the audit row keeps who decided, when, and the counts'
);
select is((select count(*)::int from public.content_revision_changes c join public.content_revisions r on r.id = c.revision_id where r.submitted_by = '00000000-0000-4000-9200-000000000002'), 0, 'the proposed and original wording is deleted once the revision is finished');

-- Reject All
select lives_ok($$ select public.review_all_teaching_revision_changes((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000003'), 'reject') $$, 'an Administrator can reject all remaining changes');
select is((select status from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000003'), 'completed', 'rejecting everything finishes the revision');
select is((select rejected_count from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000003'), 1, 'the rejection is counted');
select is((select title from public.teachings where id = '00000000-0000-4000-9200-0000000000a1'), 'Original Better Title', 'Reject All did not change the teaching');

-- Finished history is not editable by editors
reset role;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9200-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok($$ update public.content_revisions set accepted_count = 99 $$, '42501', null, 'an editor cannot edit finished audit history');
select throws_ok($$ delete from public.content_revisions $$, '42501', null, 'an editor cannot delete finished audit history');
select is((select count(*)::int from public.content_revisions where status = 'completed'), 1, 'an editor sees only their own finished revision');

-- ===========================================================================
-- Formatting survives an accepted change (bold and link markers are kept as written)
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9200-000000000002', true); end $$;
select lives_ok($$ select public.create_teaching_revision('00000000-0000-4000-9200-0000000000a1') $$, 'a co-editor can start another revision');
select lives_ok($$
  select public.save_teaching_revision_draft(
    (select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002' and status = 'draft'),
    jsonb_build_array(jsonb_build_object('target_kind','section','target_id','00000000-0000-4000-9200-0000000000b1','field_key','text',
      'base_value','The Lord is faithful. See **grace** and [a link](https://example.com).',
      'proposed_value','The Lord remains faithful. See **grace** and *mercy* and [a link](https://example.com).'))) $$,
  'a proposal containing bold, italic and a link is saved');
select is((select public.submit_teaching_revision((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002' and status = 'draft'))), 1, 'it is submitted');

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9200-000000000001', true); end $$;
select lives_ok(
  $$ select public.review_teaching_revision_change((select c.id from public.content_revision_changes c join public.content_revisions r on r.id = c.revision_id where r.status = 'submitted'), 'accept') $$,
  'the Administrator accepts it'
);
select is(
  (select content ->> 'text' from public.teaching_sections where id = '00000000-0000-4000-9200-0000000000b1'),
  'The Lord remains faithful. See **grace** and *mercy* and [a link](https://example.com).',
  'bold, italic and link markers are stored exactly as proposed'
);
select is((select content ->> 'format' from public.teaching_sections where id = '00000000-0000-4000-9200-0000000000b1'), 'paragraph', 'the section format is untouched by a text change');
select is((select (content ->> 'showTitle')::boolean from public.teaching_sections where id = '00000000-0000-4000-9200-0000000000b1'), true, 'other section settings are untouched by a text change');

-- ===========================================================================
-- Publishing clears review text; cleanup; cancel
-- ===========================================================================

reset role;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9200-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select lives_ok($$ select public.create_teaching_revision('00000000-0000-4000-9200-0000000000a3') $$, 'a co-editor can start a revision on another draft teaching');
select lives_ok($$
  select public.save_teaching_revision_draft(
    (select id from public.content_revisions where teaching_id = '00000000-0000-4000-9200-0000000000a3'),
    jsonb_build_array(jsonb_build_object('target_kind','category','target_id','00000000-0000-4000-9200-0000000000c3','field_key','title','base_value','Category Three','proposed_value','Category 3'))) $$,
  'a category title proposal is saved');
select is((select public.submit_teaching_revision((select id from public.content_revisions where teaching_id = '00000000-0000-4000-9200-0000000000a3'))), 1, 'and submitted');
reset role;
select is((select count(*)::int from public.content_revision_changes c join public.content_revisions r on r.id = c.revision_id where r.teaching_id = '00000000-0000-4000-9200-0000000000a3'), 1, 'its wording is held while it awaits review');

update public.teachings set status = 'published', published_at = now() where id = '00000000-0000-4000-9200-0000000000a3';

select is((select count(*)::int from public.content_revision_changes c join public.content_revisions r on r.id = c.revision_id where r.teaching_id = '00000000-0000-4000-9200-0000000000a3'), 0, 'publishing the teaching deletes the temporary wording');
select is((select status from public.content_revisions where teaching_id = '00000000-0000-4000-9200-0000000000a3'), 'cancelled', 'an unreviewed revision is closed when its teaching is published');
select is((select (total_changes = 1 and purged_at is not null and subject_title = 'Third Draft') from public.content_revisions where teaching_id = '00000000-0000-4000-9200-0000000000a3'), true, 'only a small audit row remains');
select is((select title from public.teaching_categories where id = '00000000-0000-4000-9200-0000000000c3'), 'Category Three', 'the unreviewed proposal was never applied');

-- Cleanup of old audit rows
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9200-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select public.purge_revision_history(30)), 0, 'recent audit rows are kept when clearing history older than 30 days');
reset role;
update public.content_revisions set completed_at = now() - interval '40 days' where status in ('completed', 'cancelled');
set local role authenticated;
select throws_ok($$ select public.purge_revision_history(-1) $$, '22023', null, 'a negative number of days is refused');
-- This test makes four finished revisions; the count is "at least four" so it also passes on a database that
-- already holds other finished revisions.
select cmp_ok((select public.purge_revision_history(30)), '>=', 4, 'old finished audit rows can be cleared (at least the four made here)');
select is((select count(*)::int from public.content_revisions where status in ('completed', 'cancelled')), 0, 'no finished audit rows remain after clearing');

-- Cancel an abandoned submitted revision
reset role;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9200-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select lives_ok($$ select public.create_teaching_revision('00000000-0000-4000-9200-0000000000a1') $$, 'a co-editor starts one more revision');
select lives_ok($$
  select public.save_teaching_revision_draft(
    (select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002' and status = 'draft'),
    jsonb_build_array(jsonb_build_object('target_kind','teaching','target_id',null,'field_key','central_theme','base_value','Original theme','proposed_value','A new theme'))) $$,
  'with a proposal');
select lives_ok($$ select public.discard_teaching_revision((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002' and status = 'draft')) $$, 'an editor can discard their own draft');
select is((select count(*)::int from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'), 0, 'a discarded draft is deleted outright');

select lives_ok($$ select public.create_teaching_revision('00000000-0000-4000-9200-0000000000a1') $$, 'a co-editor starts a revision to be cancelled');
select lives_ok($$
  select public.save_teaching_revision_draft(
    (select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002' and status = 'draft'),
    jsonb_build_array(jsonb_build_object('target_kind','teaching','target_id',null,'field_key','central_theme','base_value','Original theme','proposed_value','Cancelled theme'))) $$,
  'with a proposal');
select lives_ok($$ select public.submit_teaching_revision((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002' and status = 'draft')) $$, 'and submits it');
reset role;
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9200-000000000001', true); end $$;
set local role authenticated;
select lives_ok($$ select public.cancel_teaching_revision((select id from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002' and status = 'submitted'), 'Not needed') $$, 'an Administrator can close an abandoned revision');
select is((select (status = 'cancelled' and review_note = 'Not needed' and purged_at is not null) from public.content_revisions where submitted_by = '00000000-0000-4000-9200-000000000002'), true, 'it is closed, with the note, and its wording is gone');
select is((select central_theme from public.teachings where id = '00000000-0000-4000-9200-0000000000a1'), 'Original theme', 'a cancelled revision never changes the teaching');

reset role;
select * from finish();
rollback;
