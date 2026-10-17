begin;

select * from no_plan();

-- admin ...9801-01   editor A ...02   editor B ...03
-- T1 draft teaching (a1) with a section (b2)   D1 draft devotional (d1) with a day (e1)   T2 published teaching (a2)   W1 draft weekly update (f1)

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9801-000000000001', 'authenticated', 'authenticated', 'admin@recipients.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9801-000000000002', 'authenticated', 'authenticated', 'a@recipients.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9801-000000000003', 'authenticated', 'authenticated', 'b@recipients.local', 'x', now(), now(), now());

insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ('00000000-0000-4000-9801-000000000001', 'admin', true, null, 'Admin', 'admin@recipients.local'),
  ('00000000-0000-4000-9801-000000000002', 'content_manager', true, null, 'Editor A', 'a@recipients.local'),
  ('00000000-0000-4000-9801-000000000003', 'content_manager', true, null, 'Editor B', 'b@recipients.local');

insert into public.teachings (id, slug, title, status) values ('00000000-0000-4000-9801-0000000000a1', 'recip-teaching', 'Recipients Teaching', 'draft');
insert into public.teaching_categories (id, teaching_id, slug, title, sort_order, status) values ('00000000-0000-4000-9801-0000000000c1', '00000000-0000-4000-9801-0000000000a1', 'recip-cat', 'Category', 1, 'draft');
insert into public.teaching_sections (id, teaching_id, category_id, slug, title, content, sort_order, status)
values ('00000000-0000-4000-9801-0000000000b2', '00000000-0000-4000-9801-0000000000a1', '00000000-0000-4000-9801-0000000000c1', 'recip-sec', 'Section', '{"version":1,"format":"paragraph","text":"Hello."}'::jsonb, 1, 'draft');
insert into public.teaching_devotionals (id, teaching_id, slug, title, status) values ('00000000-0000-4000-9801-0000000000d1', '00000000-0000-4000-9801-0000000000a1', 'recip-devotional', 'Recipients Devotional', 'draft');
insert into public.teaching_devotional_days (id, devotional_id, day_number, title) values ('00000000-0000-4000-9801-0000000000e1', '00000000-0000-4000-9801-0000000000d1', 1, 'Day 1');
insert into public.teachings (id, slug, title, status, published_at) values ('00000000-0000-4000-9801-0000000000a2', 'recip-published', 'Recipients Published', 'published', now());
insert into public.weekly_updates (id, title, body_markdown, converted_content, status)
values ('00000000-0000-4000-9801-0000000000f1', 'Recipients Weekly', 'body', '[{"type":"paragraph","children":[{"text":"Hi."}]}]'::jsonb, 'draft');

-- ===========================================================================
-- Sent to editor A only: A sees and can propose; B sees nothing and can start nothing
-- ===========================================================================

insert into public.content_review_recipients (subject_type, subject_id, user_id, user_name) values ('teaching', '00000000-0000-4000-9801-0000000000a1', '00000000-0000-4000-9801-000000000002', 'Editor A');
update public.teachings set sent_for_review_at = now() where id = '00000000-0000-4000-9801-0000000000a1';

select is((select count(*)::int from public.content_review_recipients where subject_type = 'teaching' and subject_id = '00000000-0000-4000-9801-0000000000a1'), 1, 'opening the gate with a person named does not add everyone else');

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9801-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.teachings where id = '00000000-0000-4000-9801-0000000000a1'), 1, 'the person it was sent to sees the teaching');
select is((select count(*)::int from public.teaching_sections where teaching_id = '00000000-0000-4000-9801-0000000000a1'), 1, 'and its sections');
select lives_ok($$ select public.create_teaching_revision('00000000-0000-4000-9801-0000000000a1') $$, 'and can start a proposal');
reset role;
delete from public.content_revisions where subject_type = 'teaching' and teaching_id = '00000000-0000-4000-9801-0000000000a1';

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9801-000000000003', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.teachings where id = '00000000-0000-4000-9801-0000000000a1'), 0, 'a Content Manager it was not sent to does not see the teaching');
select is((select count(*)::int from public.teaching_sections where teaching_id = '00000000-0000-4000-9801-0000000000a1'), 0, 'nor its sections');
select is((select count(*)::int from public.teaching_categories where teaching_id = '00000000-0000-4000-9801-0000000000a1'), 0, 'nor its categories');
select throws_ok($$ select public.create_teaching_revision('00000000-0000-4000-9801-0000000000a1') $$, '42501', null, 'and cannot start a proposal on it');
select is((select count(*)::int from public.teachings where id = '00000000-0000-4000-9801-0000000000a2'), 1, 'a published teaching is still visible to everyone');
select is((select count(*)::int from public.content_review_recipients), 0, 'a Content Manager cannot read other people''s recipient rows');
reset role;

-- An Administrator sees everything, sent or not.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9801-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.teaching_sections where teaching_id = '00000000-0000-4000-9801-0000000000a1'), 1, 'an Administrator still sees the sections');
select is((select count(*)::int from public.content_review_recipients where subject_id = '00000000-0000-4000-9801-0000000000a1'), 1, 'and can read who it was sent to');
reset role;

-- ===========================================================================
-- Sent to B later: now B sees it, A is unaffected
-- ===========================================================================

insert into public.content_review_recipients (subject_type, subject_id, user_id, user_name) values ('teaching', '00000000-0000-4000-9801-0000000000a1', '00000000-0000-4000-9801-000000000003', 'Editor B');

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9801-000000000003', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.teachings where id = '00000000-0000-4000-9801-0000000000a1'), 1, 'sent to the second person later, they see it');
select lives_ok($$ select public.create_teaching_revision('00000000-0000-4000-9801-0000000000a1') $$, 'and can start a proposal');
reset role;
delete from public.content_revisions where subject_type = 'teaching' and teaching_id = '00000000-0000-4000-9801-0000000000a1';

-- ===========================================================================
-- Taking it back closes it for everybody and clears the list
-- ===========================================================================

update public.teachings set sent_for_review_at = null where id = '00000000-0000-4000-9801-0000000000a1';
select is((select count(*)::int from public.content_review_recipients where subject_type = 'teaching' and subject_id = '00000000-0000-4000-9801-0000000000a1'), 0, 'taking it back clears who it was sent to');

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9801-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.teachings where id = '00000000-0000-4000-9801-0000000000a1'), 0, 'after the take-back nobody sees it');
reset role;

-- ===========================================================================
-- Opening the gate without naming anyone sends it to every active Content Manager (the old behaviour)
-- ===========================================================================

update public.teaching_devotionals set sent_for_review_at = now() where id = '00000000-0000-4000-9801-0000000000d1';
select is((select count(*)::int from public.content_review_recipients where subject_type = 'devotional' and subject_id = '00000000-0000-4000-9801-0000000000d1'), 2, 'with no one named, both Content Managers get it');

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9801-000000000003', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.teaching_devotional_days where devotional_id = '00000000-0000-4000-9801-0000000000d1'), 1, 'and either one sees the devotional days');
reset role;

-- A deactivated Content Manager is not given it by default.
update public.teaching_devotionals set sent_for_review_at = null where id = '00000000-0000-4000-9801-0000000000d1';
update public.admin_authorizations set is_active = false where user_id = '00000000-0000-4000-9801-000000000003';
update public.teaching_devotionals set sent_for_review_at = now() where id = '00000000-0000-4000-9801-0000000000d1';
select is((select count(*)::int from public.content_review_recipients where subject_type = 'devotional' and subject_id = '00000000-0000-4000-9801-0000000000d1'), 1, 'a deactivated Content Manager is not included by default');
update public.admin_authorizations set is_active = true where user_id = '00000000-0000-4000-9801-000000000003';

-- ===========================================================================
-- Weekly updates: send to chosen people, then to others
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9801-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok($$ select public.send_weekly_update_for_proofing('00000000-0000-4000-9801-0000000000f1', false, '{}'::uuid[]) $$, null, 'Choose at least one Content Manager to send it to.', 'sending to nobody is refused');
select is(public.send_weekly_update_for_proofing('00000000-0000-4000-9801-0000000000f1', false, array['00000000-0000-4000-9801-000000000002'::uuid]), 1, 'a weekly update can be sent to one person');
select is((select count(*)::int from public.weekly_update_proofings where weekly_update_id = '00000000-0000-4000-9801-0000000000f1'), 1, 'only that person has a proof');
select is(public.send_weekly_update_for_proofing('00000000-0000-4000-9801-0000000000f1', false, array['00000000-0000-4000-9801-000000000002'::uuid, '00000000-0000-4000-9801-000000000003'::uuid]), 2, 'sending again with someone new adds them');
select is((select count(*)::int from public.weekly_update_proofings where weekly_update_id = '00000000-0000-4000-9801-0000000000f1'), 2, 'and nobody is given a second proof');
reset role;

-- Not listed in the choice means not sent, and an outsider cannot send at all.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9801-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok($$ select public.send_weekly_update_for_proofing('00000000-0000-4000-9801-0000000000f1', false, null) $$, null, 'Only an Administrator can send a weekly update for proofing.', 'a Content Manager cannot send a weekly update');
reset role;

select * from finish();
rollback;
