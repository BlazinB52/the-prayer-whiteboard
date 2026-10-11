begin;

select * from no_plan();

-- admin ...9800-01   editor ...02   other editor ...03
-- T1 draft teaching (a1)   D1 draft devotional (d1) with a day (e1)   W1 draft weekly update (b1)

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9800-000000000001', 'authenticated', 'authenticated', 'admin@gate.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9800-000000000002', 'authenticated', 'authenticated', 'editor@gate.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9800-000000000003', 'authenticated', 'authenticated', 'other@gate.local', 'x', now(), now(), now());

insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ('00000000-0000-4000-9800-000000000001', 'admin', true, null, 'Admin', 'admin@gate.local'),
  ('00000000-0000-4000-9800-000000000002', 'content_manager', true, null, 'Editor', 'editor@gate.local'),
  ('00000000-0000-4000-9800-000000000003', 'content_manager', true, null, 'Other', 'other@gate.local');

insert into public.teachings (id, slug, title, status) values ('00000000-0000-4000-9800-0000000000a1', 'gate-teaching', 'Gate Teaching', 'draft');
insert into public.teaching_categories (id, teaching_id, slug, title, sort_order, status) values ('00000000-0000-4000-9800-0000000000c1', '00000000-0000-4000-9800-0000000000a1', 'gate-cat', 'Category', 1, 'draft');
insert into public.teaching_sections (id, teaching_id, category_id, slug, title, content, sort_order, status)
values ('00000000-0000-4000-9800-0000000000b2', '00000000-0000-4000-9800-0000000000a1', '00000000-0000-4000-9800-0000000000c1', 'gate-sec', 'Section', '{"version":1,"format":"paragraph","text":"Hello."}'::jsonb, 1, 'draft');

insert into public.teaching_devotionals (id, teaching_id, slug, title, status) values ('00000000-0000-4000-9800-0000000000d1', '00000000-0000-4000-9800-0000000000a1', 'gate-devotional', 'Gate Devotional', 'draft');
insert into public.teaching_devotional_days (id, devotional_id, day_number, title) values ('00000000-0000-4000-9800-0000000000e1', '00000000-0000-4000-9800-0000000000d1', 1, 'Day 1');

insert into public.weekly_updates (id, title, body_markdown, converted_content, status)
values ('00000000-0000-4000-9800-0000000000f1', 'Gate Weekly', 'body', '[{"type":"paragraph","children":[{"text":"Hi."}]}]'::jsonb, 'draft');

-- ===========================================================================
-- Nothing is sent yet: a Content Manager sees nothing and can start nothing
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9800-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

select is((select count(*)::int from public.teachings where id = '00000000-0000-4000-9800-0000000000a1'), 0, 'an unsent draft teaching is invisible to a Content Manager');
select is((select count(*)::int from public.teaching_sections where teaching_id = '00000000-0000-4000-9800-0000000000a1'), 0, 'and so are its sections');
select is((select count(*)::int from public.teaching_devotionals where id = '00000000-0000-4000-9800-0000000000d1'), 0, 'an unsent draft devotional is invisible');
select is((select count(*)::int from public.teaching_devotional_days where devotional_id = '00000000-0000-4000-9800-0000000000d1'), 0, 'and so are its days');
select is((select count(*)::int from public.weekly_updates where id = '00000000-0000-4000-9800-0000000000f1'), 0, 'an unsent draft weekly update is invisible');

select throws_ok($$ select public.create_teaching_revision('00000000-0000-4000-9800-0000000000a1') $$, '42501', null, 'a revision cannot be started on an unsent teaching');
select throws_ok($$ select public.create_devotional_revision('00000000-0000-4000-9800-0000000000d1') $$, '42501', null, 'a revision cannot be started on an unsent devotional');
select throws_ok($$ select public.create_weekly_update_revision('00000000-0000-4000-9800-0000000000f1') $$, '42501', null, 'a revision cannot be started on an unsent weekly update');
select throws_ok($$ select * from public.weekly_update_review_fields('00000000-0000-4000-9800-0000000000f1') $$, '42501', null, 'the weekly update fields are not handed out');
reset role;

-- An Administrator is never blocked.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9800-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select lives_ok($$ select public.create_teaching_revision('00000000-0000-4000-9800-0000000000a1') $$, 'an Administrator can still use the review functions on an unsent draft');
reset role;
delete from public.content_revisions where subject_type = 'teaching' and teaching_id = '00000000-0000-4000-9800-0000000000a1';

-- ===========================================================================
-- Sent: visible, and proposals work
-- ===========================================================================

update public.teachings set sent_for_review_at = now() where id = '00000000-0000-4000-9800-0000000000a1';
update public.teaching_devotionals set sent_for_review_at = now() where id = '00000000-0000-4000-9800-0000000000d1';
insert into public.weekly_update_proofings (weekly_update_id, user_id, user_name) values ('00000000-0000-4000-9800-0000000000f1', '00000000-0000-4000-9800-000000000002', 'Editor');

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9800-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.teachings where id = '00000000-0000-4000-9800-0000000000a1'), 1, 'a sent teaching is visible');
select is((select count(*)::int from public.teaching_sections where teaching_id = '00000000-0000-4000-9800-0000000000a1'), 1, 'with its sections');
select is((select count(*)::int from public.teaching_devotional_days where devotional_id = '00000000-0000-4000-9800-0000000000d1'), 1, 'a sent devotional shows its days');
select is((select count(*)::int from public.weekly_updates where id = '00000000-0000-4000-9800-0000000000f1'), 1, 'a weekly update sent to this person is visible');
select lives_ok($$ select * from public.weekly_update_review_fields('00000000-0000-4000-9800-0000000000f1') $$, 'and its fields are available');

create temp table gate_rev (key text primary key, id uuid);
grant all on gate_rev to authenticated;
insert into gate_rev values ('t', public.create_teaching_revision('00000000-0000-4000-9800-0000000000a1'));
select is(
  public.save_teaching_revision_draft((select id from gate_rev where key = 't'), jsonb_build_array(
    jsonb_build_object('target_kind', 'section', 'target_id', '00000000-0000-4000-9800-0000000000b2', 'field_key', 'text', 'base_value', 'Hello.', 'proposed_value', 'Hello there.')
  )),
  1, 'a change can be proposed on a sent teaching'
);
reset role;

-- The other Content Manager was not sent the weekly update.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9800-000000000003', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.weekly_updates where id = '00000000-0000-4000-9800-0000000000f1'), 0, 'a weekly update sent to someone else is not visible to this person');
reset role;

-- ===========================================================================
-- Taken back: hidden again, and saving or submitting stops
-- ===========================================================================

update public.teachings set sent_for_review_at = null where id = '00000000-0000-4000-9800-0000000000a1';

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9800-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.teachings where id = '00000000-0000-4000-9800-0000000000a1'), 0, 'a teaching taken back is hidden again');
select throws_ok(
  $$ select public.save_teaching_revision_draft((select id from gate_rev where key = 't'), jsonb_build_array(jsonb_build_object('target_kind', 'section', 'target_id', '00000000-0000-4000-9800-0000000000b2', 'field_key', 'text', 'base_value', 'Hello.', 'proposed_value', 'Hello again.'))) $$,
  '42501', null, 'the Content Manager can no longer save changes to it'
);
select throws_ok($$ select public.submit_teaching_revision((select id from gate_rev where key = 't')) $$, '42501', null, 'or submit them');
reset role;

-- ===========================================================================
-- Publishing closes the gate
-- ===========================================================================

update public.teachings set sent_for_review_at = now() where id = '00000000-0000-4000-9800-0000000000a1';
update public.teachings set status = 'published', published_at = now() where id = '00000000-0000-4000-9800-0000000000a1';
select is((select sent_for_review_at from public.teachings where id = '00000000-0000-4000-9800-0000000000a1'), null, 'publishing clears the sent mark');

select * from finish();
rollback;
