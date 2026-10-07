begin;

select * from no_plan();

-- Fixed ids so every step below is readable.
--   admin ...9300-000000000001   editor A ...02   editor B ...03   nobody ...04
--   D1 (draft devotional) ...d1   D2 (published devotional) ...d2   D3 (draft, for the publish test) ...d3
--   days of D1: ...e1 (day 1), ...e2 (day 2)    day of D3: ...e3

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9300-000000000001', 'authenticated', 'authenticated', 'admin@devrev.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9300-000000000002', 'authenticated', 'authenticated', 'editor_a@devrev.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9300-000000000003', 'authenticated', 'authenticated', 'editor_b@devrev.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9300-000000000004', 'authenticated', 'authenticated', 'nobody@devrev.local', 'x', now(), now(), now());

insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ('00000000-0000-4000-9300-000000000001', 'admin', true, null, 'Local Admin', 'admin@devrev.local'),
  ('00000000-0000-4000-9300-000000000002', 'content_manager', true, null, 'Editor A', 'editor_a@devrev.local'),
  ('00000000-0000-4000-9300-000000000003', 'content_manager', true, null, 'Editor B', 'editor_b@devrev.local');

insert into public.teachings (id, slug, title, status, published_at)
values ('00000000-0000-4000-9300-0000000000a1', 'devrev-teaching', 'Devrev Teaching', 'draft', null);

insert into public.teaching_devotionals (id, teaching_id, slug, title, introduction, status, published_at)
values
  ('00000000-0000-4000-9300-0000000000d1', '00000000-0000-4000-9300-0000000000a1', 'devrev-one', 'Original Series', 'Original intro.', 'draft', null),
  ('00000000-0000-4000-9300-0000000000d2', '00000000-0000-4000-9300-0000000000a1', 'devrev-two', 'Published Series', 'Published intro.', 'published', now()),
  ('00000000-0000-4000-9300-0000000000d3', '00000000-0000-4000-9300-0000000000a1', 'devrev-three', 'Third Series', 'Third intro.', 'draft', null);

insert into public.teaching_devotional_days (id, devotional_id, day_number, title, anchor_scriptures, devotional_reading, confession, journal_prompt, prayer_activation)
values
  ('00000000-0000-4000-9300-0000000000e1', '00000000-0000-4000-9300-0000000000d1', 1, 'Day 1: Camp', array['Eph 5:11 — "darkness"', 'John 3:16'], 'Original reading.', 'Original confession.', 'Original prompt.', 'Original activation.'),
  ('00000000-0000-4000-9300-0000000000e2', '00000000-0000-4000-9300-0000000000d1', 2, 'Day 2: Light', array['Ps 27:1'], 'Reading two.', null, null, null),
  ('00000000-0000-4000-9300-0000000000e3', '00000000-0000-4000-9300-0000000000d3', 1, 'Third day', array[]::text[], 'Third reading.', null, null, null);

-- ===========================================================================
-- Who can start a revision
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9300-000000000004', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok($$ select public.create_devotional_revision('00000000-0000-4000-9300-0000000000d1') $$, '42501', null, 'a signed-in user with no staff role cannot start a devotional revision');
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9300-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

select throws_ok($$ select public.create_devotional_revision('00000000-0000-4000-9300-0000000000d2') $$, 'P0001', null, 'a published devotional cannot be revised');

select ok((select count(*) from public.teaching_devotionals where id = '00000000-0000-4000-9300-0000000000d1') = 1, 'an editor can read a draft devotional');
select ok((select count(*) from public.teaching_devotional_days where devotional_id = '00000000-0000-4000-9300-0000000000d1') = 2, 'an editor can read the days of a draft devotional');
update public.teaching_devotionals set title = 'Hacked' where id = '00000000-0000-4000-9300-0000000000d1';
select is((select title from public.teaching_devotionals where id = '00000000-0000-4000-9300-0000000000d1'), 'Original Series', 'an editor cannot write to a devotional directly');

create temp table rev_ids (key text primary key, id uuid);
grant all on rev_ids to authenticated;
insert into rev_ids values ('a', public.create_devotional_revision('00000000-0000-4000-9300-0000000000d1'));
select is(public.create_devotional_revision('00000000-0000-4000-9300-0000000000d1'), (select id from rev_ids where key = 'a'), 'starting again returns the same draft');

-- ===========================================================================
-- Saving a proposal
-- ===========================================================================

select is(
  public.save_devotional_revision_draft((select id from rev_ids where key = 'a'), jsonb_build_array(
    jsonb_build_object('target_kind', 'devotional', 'target_id', null, 'field_key', 'title', 'base_value', 'Original Series', 'proposed_value', 'Better Series'),
    jsonb_build_object('target_kind', 'day', 'target_id', '00000000-0000-4000-9300-0000000000e1', 'field_key', 'devotional_reading', 'base_value', 'Original reading.', 'proposed_value', 'Better **reading**.'),
    jsonb_build_object('target_kind', 'day', 'target_id', '00000000-0000-4000-9300-0000000000e1', 'field_key', 'anchor_scriptures', 'base_value', E'Eph 5:11 — "darkness"\nJohn 3:16', 'proposed_value', E'Eph 5:11 — "darkness"\nJohn 3:16\nPs 91:2'),
    jsonb_build_object('target_kind', 'day', 'target_id', '00000000-0000-4000-9300-0000000000e1', 'field_key', 'confession', 'base_value', 'Original confession.', 'proposed_value', 'Original confession.')
  )),
  3, 'three real changes are saved (an unchanged field is ignored)'
);

select throws_ok(
  $$ select public.save_devotional_revision_draft((select id from rev_ids where key = 'a'), jsonb_build_array(jsonb_build_object('target_kind', 'devotional', 'target_id', null, 'field_key', 'slug', 'base_value', 'x', 'proposed_value', 'y'))) $$,
  '22023', null, 'a field that is not editable through review is refused'
);
select throws_ok(
  $$ select public.save_devotional_revision_draft((select id from rev_ids where key = 'a'), jsonb_build_array(jsonb_build_object('target_kind', 'day', 'target_id', '00000000-0000-4000-9300-0000000000e3', 'field_key', 'title', 'base_value', 'Third day', 'proposed_value', 'x'))) $$,
  '22023', null, 'a day of a different devotional is refused'
);

-- Re-save the good proposal (a refused save above removed the earlier rows first).
select is(
  public.save_devotional_revision_draft((select id from rev_ids where key = 'a'), jsonb_build_array(
    jsonb_build_object('target_kind', 'devotional', 'target_id', null, 'field_key', 'title', 'base_value', 'Original Series', 'proposed_value', 'Better Series'),
    jsonb_build_object('target_kind', 'day', 'target_id', '00000000-0000-4000-9300-0000000000e1', 'field_key', 'devotional_reading', 'base_value', 'Original reading.', 'proposed_value', 'Better **reading**.'),
    jsonb_build_object('target_kind', 'day', 'target_id', '00000000-0000-4000-9300-0000000000e1', 'field_key', 'anchor_scriptures', 'base_value', E'Eph 5:11 — "darkness"\nJohn 3:16', 'proposed_value', E'Eph 5:11 — "darkness"\nJohn 3:16\nPs 91:2')
  )),
  3, 'the proposal is saved again'
);

select is(public.submit_devotional_revision((select id from rev_ids where key = 'a')), 3, 'submitting reports three changes');
select is((select title from public.teaching_devotionals where id = '00000000-0000-4000-9300-0000000000d1'), 'Original Series', 'nothing in the devotional changed by proposing');
select is((select devotional_reading from public.teaching_devotional_days where id = '00000000-0000-4000-9300-0000000000e1'), 'Original reading.', 'the day is unchanged until a decision');

-- An editor cannot decide anything.
select throws_ok(
  $$ select public.review_devotional_revision_change((select id from public.content_revision_changes where revision_id = (select id from rev_ids where key = 'a') order by display_order limit 1), 'accept') $$,
  '42501', null, 'an editor cannot accept a change'
);
reset role;

-- Editor B cannot see or change editor A's revision.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9300-000000000003', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.content_revisions), 0, 'editor B cannot see editor A''s revision');
select throws_ok($$ select public.submit_devotional_revision((select id from rev_ids where key = 'a')) $$, '42501', null, 'editor B cannot submit editor A''s revision');
reset role;

-- ===========================================================================
-- The Administrator decides
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9300-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

select is(
  (select (public.review_devotional_revision_change(c.id, 'accept'))->>'finished' from public.content_revision_changes c where c.revision_id = (select id from rev_ids where key = 'a') and c.field_key = 'title'),
  'false', 'accepting the title is not the last decision'
);
select is((select title from public.teaching_devotionals where id = '00000000-0000-4000-9300-0000000000d1'), 'Better Series', 'the accepted title is applied');

-- Someone changes the reading after it was proposed: accepting is refused as stale.
reset role;
update public.teaching_devotional_days set devotional_reading = 'Newer reading by someone else.' where id = '00000000-0000-4000-9300-0000000000e1';
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9300-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

select throws_ok(
  $$ select public.review_devotional_revision_change((select id from public.content_revision_changes where revision_id = (select id from rev_ids where key = 'a') and field_key = 'devotional_reading'), 'accept') $$,
  'P0001', null, 'a stale change cannot be accepted normally'
);
select is(
  (select (public.review_devotional_revision_change(c.id, 'accept', null, true))->>'accepted_anyway' from public.content_revision_changes c where c.revision_id = (select id from rev_ids where key = 'a') and c.field_key = 'devotional_reading'),
  'true', 'accept anyway replaces the newer wording'
);
select is((select devotional_reading from public.teaching_devotional_days where id = '00000000-0000-4000-9300-0000000000e1'), 'Better **reading**.', 'the reading now holds the proposal');

-- Accept the last one (the anchor scriptures): it becomes three separate lines in the array.
select is(
  (select (public.review_devotional_revision_change(c.id, 'accept'))->>'finished' from public.content_revision_changes c where c.revision_id = (select id from rev_ids where key = 'a') and c.field_key = 'anchor_scriptures'),
  'true', 'the last decision finishes the review'
);
select is((select anchor_scriptures from public.teaching_devotional_days where id = '00000000-0000-4000-9300-0000000000e1'), array['Eph 5:11 — "darkness"', 'John 3:16', 'Ps 91:2'], 'anchor scriptures are stored one per line');

reset role;
select is((select count(*)::int from public.content_revision_changes where revision_id = (select id from rev_ids where key = 'a')), 0, 'the proposed wording is deleted when the review finishes');
select is((select status from public.content_revisions where id = (select id from rev_ids where key = 'a')), 'completed', 'the audit row is kept and completed');
select is((select accepted_count || '/' || rejected_count || '/' || overridden_count from public.content_revisions where id = (select id from rev_ids where key = 'a')), '3/0/1', 'counts: 3 accepted, 0 rejected, 1 accepted anyway');

-- ===========================================================================
-- Publishing a devotional closes its open revisions and deletes the text
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9300-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
insert into rev_ids values ('c', public.create_devotional_revision('00000000-0000-4000-9300-0000000000d3'));
select public.save_devotional_revision_draft((select id from rev_ids where key = 'c'), jsonb_build_array(
  jsonb_build_object('target_kind', 'day', 'target_id', '00000000-0000-4000-9300-0000000000e3', 'field_key', 'title', 'base_value', 'Third day', 'proposed_value', 'Renamed day')
));
select public.submit_devotional_revision((select id from rev_ids where key = 'c'));
reset role;

update public.teaching_devotionals set status = 'published', published_at = now() where id = '00000000-0000-4000-9300-0000000000d3';

select is((select status from public.content_revisions where id = (select id from rev_ids where key = 'c')), 'cancelled', 'publishing closes the open revision');
select is((select count(*)::int from public.content_revision_changes where revision_id = (select id from rev_ids where key = 'c')), 0, 'publishing deletes the proposed wording');
select is((select title from public.teaching_devotional_days where id = '00000000-0000-4000-9300-0000000000e3'), 'Third day', 'the unaccepted proposal never reached the devotional');

select * from finish();
rollback;
