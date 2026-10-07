begin;

select * from no_plan();

-- Fixed ids: admin ...9500-01   editor A ...02   editor B ...03   W1 (draft) ...a1   W2 (published) ...a2   W3 (draft, publish test) ...a3

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9500-000000000001', 'authenticated', 'authenticated', 'admin@wkrev.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9500-000000000002', 'authenticated', 'authenticated', 'editor_a@wkrev.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9500-000000000003', 'authenticated', 'authenticated', 'editor_b@wkrev.local', 'x', now(), now(), now());

insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ('00000000-0000-4000-9500-000000000001', 'admin', true, null, 'Local Admin', 'admin@wkrev.local'),
  ('00000000-0000-4000-9500-000000000002', 'content_manager', true, null, 'Editor A', 'editor_a@wkrev.local'),
  ('00000000-0000-4000-9500-000000000003', 'content_manager', true, null, 'Editor B', 'editor_b@wkrev.local');

insert into public.weekly_updates (id, title, body_markdown, converted_content, status, is_current, published_at)
values
  ('00000000-0000-4000-9500-0000000000a1', 'Original Title', 'placeholder body',
   '[
     {"type":"heading","level":2,"children":[{"text":"Prayer Focus"}]},
     {"type":"paragraph","children":[{"text":"Please pray for "},{"text":"the harvest","bold":true},{"text":" and read [this](https://example.com/a)."}]},
     {"type":"divider"},
     {"type":"list","items":[[{"text":"First item"}],[{"text":"Second "},{"text":"item","italic":true}]]},
     {"type":"quote","children":[{"text":"A quoted line."}]},
     {"type":"paragraph","children":[{"text":"Has a literal * asterisk."}]}
   ]'::jsonb, 'draft', false, null),
  ('00000000-0000-4000-9500-0000000000a2', 'Published Update', 'published body', '[{"type":"paragraph","children":[{"text":"Live."}]}]'::jsonb, 'published', true, now()),
  ('00000000-0000-4000-9500-0000000000a3', 'Third Draft', 'third body', '[{"type":"paragraph","children":[{"text":"Third."}]}]'::jsonb, 'draft', false, null);

-- ===========================================================================
-- Which fields exist
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9500-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

select is(
  (select array_agg(field_key order by field_key) from public.weekly_update_review_fields('00000000-0000-4000-9500-0000000000a1')),
  array['block_1', 'block_2', 'block_4', 'block_5', 'title'],
  'title, heading, paragraph, list and quote are editable; the divider and the block with a literal asterisk are left out'
);
select is((select current_value from public.weekly_update_review_fields('00000000-0000-4000-9500-0000000000a1') where field_key = 'block_2'), 'Please pray for **the harvest** and read [this](https://example.com/a).', 'bold and links are written as editable text');
select is((select current_value from public.weekly_update_review_fields('00000000-0000-4000-9500-0000000000a1') where field_key = 'block_4'), E'First item\nSecond *item*', 'a list is one item per line');
select is((select count(*)::int from public.weekly_update_review_fields('00000000-0000-4000-9500-0000000000a2')), 0, 'a published weekly update has nothing to review');
select throws_ok($$ select public.create_weekly_update_revision('00000000-0000-4000-9500-0000000000a2') $$, 'P0001', null, 'a published weekly update cannot be revised');

create temp table rev_ids (key text primary key, id uuid);
grant all on rev_ids to authenticated;
insert into rev_ids values ('a', public.create_weekly_update_revision('00000000-0000-4000-9500-0000000000a1'));

-- ===========================================================================
-- Saving, submitting, and who can do what
-- ===========================================================================

select throws_ok(
  $$ select public.save_weekly_update_revision_draft((select id from rev_ids where key = 'a'), jsonb_build_array(jsonb_build_object('target_kind', 'weekly_update', 'target_id', null, 'field_key', 'block_3', 'base_value', '', 'proposed_value', 'x'))) $$,
  '22023', null, 'the divider cannot be edited'
);

select is(
  public.save_weekly_update_revision_draft((select id from rev_ids where key = 'a'), jsonb_build_array(
    jsonb_build_object('target_kind', 'weekly_update', 'target_id', null, 'field_key', 'title', 'base_value', 'Original Title', 'proposed_value', 'Better Title'),
    jsonb_build_object('target_kind', 'weekly_update', 'target_id', null, 'field_key', 'block_2', 'base_value', 'Please pray for **the harvest** and read [this](https://example.com/a).', 'proposed_value', 'Please pray for ***the whole harvest*** and read [this](https://example.com/b).'),
    jsonb_build_object('target_kind', 'weekly_update', 'target_id', null, 'field_key', 'block_4', 'base_value', E'First item\nSecond *item*', 'proposed_value', E'First item\nSecond *item*\nThird **item**')
  )),
  3, 'three changes are saved'
);
select is(public.submit_weekly_update_revision((select id from rev_ids where key = 'a')), 3, 'submitting reports three changes');
select is((select title from public.weekly_updates where id = '00000000-0000-4000-9500-0000000000a1'), 'Original Title', 'proposing changes nothing');
select throws_ok(
  $$ select public.review_weekly_update_revision_change((select id from public.content_revision_changes where revision_id = (select id from rev_ids where key = 'a') limit 1), 'accept') $$,
  '42501', null, 'an editor cannot accept a change'
);
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9500-000000000003', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.content_revisions), 0, 'editor B cannot see editor A''s revision');
select throws_ok($$ select public.submit_weekly_update_revision((select id from rev_ids where key = 'a')) $$, '42501', null, 'editor B cannot submit editor A''s revision');
reset role;

-- ===========================================================================
-- The Administrator decides
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9500-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

select is(
  (select (public.review_weekly_update_revision_change(c.id, 'accept'))->>'finished' from public.content_revision_changes c where c.revision_id = (select id from rev_ids where key = 'a') and c.field_key = 'title'),
  'false', 'accepting the title is not the last decision'
);
select is((select title from public.weekly_updates where id = '00000000-0000-4000-9500-0000000000a1'), 'Better Title', 'the title is applied');

select is(
  (select (public.review_weekly_update_revision_change(c.id, 'accept'))->>'finished' from public.content_revision_changes c where c.revision_id = (select id from rev_ids where key = 'a') and c.field_key = 'block_2'),
  'false', 'accepting the paragraph'
);
select is(
  (select converted_content -> 1 -> 'children' from public.weekly_updates where id = '00000000-0000-4000-9500-0000000000a1'),
  '[{"text":"Please pray for "},{"text":"the whole harvest","bold":true,"italic":true},{"text":" and read [this](https://example.com/b)."}]'::jsonb,
  'the paragraph is rebuilt with bold and italic, and the link stays in its stored form'
);
select ok((select body_markdown from public.weekly_updates where id = '00000000-0000-4000-9500-0000000000a1') like '%Please pray for the whole harvest and read this (https://example.com/b).%', 'the plain-text copy is rebuilt with the link written out');
select ok((select body_markdown from public.weekly_updates where id = '00000000-0000-4000-9500-0000000000a1') like E'%---\n\n- First item%', 'the divider and list keep their places in the plain-text copy');

-- Someone changes the list after it was proposed: accepting is refused, accept anyway works.
reset role;
update public.weekly_updates set converted_content = jsonb_set(converted_content, '{3,items}', '[[{"text":"Newer only"}]]'::jsonb) where id = '00000000-0000-4000-9500-0000000000a1';
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9500-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok(
  $$ select public.review_weekly_update_revision_change((select id from public.content_revision_changes where revision_id = (select id from rev_ids where key = 'a') and field_key = 'block_4'), 'accept') $$,
  'P0001', null, 'a stale change cannot be accepted normally'
);
select is(
  (select (public.review_weekly_update_revision_change(c.id, 'accept', null, true))->>'finished' from public.content_revision_changes c where c.revision_id = (select id from rev_ids where key = 'a') and c.field_key = 'block_4'),
  'true', 'accept anyway applies it and finishes the review'
);
select is(
  (select converted_content -> 3 -> 'items' from public.weekly_updates where id = '00000000-0000-4000-9500-0000000000a1'),
  '[[{"text":"First item"}],[{"text":"Second "},{"text":"item","italic":true}],[{"text":"Third "},{"text":"item","bold":true}]]'::jsonb,
  'the list now holds three items with their formatting'
);
reset role;
select is((select count(*)::int from public.content_revision_changes where revision_id = (select id from rev_ids where key = 'a')), 0, 'the proposed wording is deleted when the review finishes');
select is((select accepted_count || '/' || rejected_count || '/' || overridden_count from public.content_revisions where id = (select id from rev_ids where key = 'a')), '3/0/1', 'the audit row keeps the counts');

-- ===========================================================================
-- Publishing closes open revisions and deletes the text
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9500-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
insert into rev_ids values ('c', public.create_weekly_update_revision('00000000-0000-4000-9500-0000000000a3'));
select public.save_weekly_update_revision_draft((select id from rev_ids where key = 'c'), jsonb_build_array(
  jsonb_build_object('target_kind', 'weekly_update', 'target_id', null, 'field_key', 'title', 'base_value', 'Third Draft', 'proposed_value', 'Renamed')
));
select public.submit_weekly_update_revision((select id from rev_ids where key = 'c'));
reset role;

update public.weekly_updates set status = 'published', published_at = now() where id = '00000000-0000-4000-9500-0000000000a3';

select is((select status from public.content_revisions where id = (select id from rev_ids where key = 'c')), 'cancelled', 'publishing closes the open revision');
select is((select count(*)::int from public.content_revision_changes where revision_id = (select id from rev_ids where key = 'c')), 0, 'publishing deletes the proposed wording');
select is((select title from public.weekly_updates where id = '00000000-0000-4000-9500-0000000000a3'), 'Third Draft', 'the unaccepted proposal never reached the weekly update');

select * from finish();
rollback;
