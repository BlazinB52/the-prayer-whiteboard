begin;

select * from no_plan();

-- admin ...9400-000000000001   editor (content manager) ...9400-000000000002
-- draft teaching ...a1, published teaching ...a2

create temp table ready_marker_ids (key text primary key, id uuid not null) on commit drop;
insert into ready_marker_ids values
  ('admin', '00000000-0000-4000-9400-000000000001'),
  ('editor', '00000000-0000-4000-9400-000000000002');
grant select on ready_marker_ids to anon, authenticated;

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
select '00000000-0000-0000-0000-000000000000', id, 'authenticated', 'authenticated', key || '@ready-marker.local', 'local-regression-placeholder', now(), now(), now()
from ready_marker_ids;
insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ('00000000-0000-4000-9400-000000000001', 'admin', true, null, 'Local Admin', 'admin@ready-marker.local'),
  ('00000000-0000-4000-9400-000000000002', 'content_manager', true, null, 'Local Editor', 'editor@ready-marker.local');

insert into public.teachings (id, slug, title, central_theme, introduction, summary, status, published_at)
values
  ('00000000-0000-4000-9400-0000000000a1', 'ready-t1', 'Draft Ready Test', 'Theme', 'Intro.', 'Summary.', 'draft', null),
  ('00000000-0000-4000-9400-0000000000a2', 'ready-t2', 'Already Published', 'Theme', 'Intro.', 'Summary.', 'published', now());

select is((select ready_to_publish_at from public.teachings where id = '00000000-0000-4000-9400-0000000000a1'), null, 'a new draft is not marked ready');

-- ---------------------------------------------------------------------------
-- Only an Administrator can set it
-- ---------------------------------------------------------------------------

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9400-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select lives_ok($$ update public.teachings set ready_to_publish_at = now() where id = '00000000-0000-4000-9400-0000000000a1' $$, 'a co-editor''s attempt to mark a teaching ready runs without error...');
reset role;
select is((select ready_to_publish_at from public.teachings where id = '00000000-0000-4000-9400-0000000000a1'), null, '...but changes nothing');

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9400-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select lives_ok($$ update public.teachings set ready_to_publish_at = now() where id = '00000000-0000-4000-9400-0000000000a1' $$, 'an Administrator can mark a draft ready');
reset role;
select isnt((select ready_to_publish_at from public.teachings where id = '00000000-0000-4000-9400-0000000000a1'), null, 'the marker is stored');

-- ---------------------------------------------------------------------------
-- It is only a note: nothing is published, nothing is queued for email
-- ---------------------------------------------------------------------------

select is((select status from public.teachings where id = '00000000-0000-4000-9400-0000000000a1'), 'draft', 'marking ready leaves the teaching a draft');
select is((select published_at from public.teachings where id = '00000000-0000-4000-9400-0000000000a1'), null, 'and it has no published date');
select is((select is_featured from public.teachings where id = '00000000-0000-4000-9400-0000000000a1'), false, 'and it is not featured');
select is((select count(*)::int from public.email_teaching_broadcast_events where teaching_id = '00000000-0000-4000-9400-0000000000a1'), 0, 'and no email is recorded for it');

-- A draft that is marked ready is still invisible to the public (a real visitor carries no sign-in)
do $$ begin perform set_config('request.jwt.claim.sub', '', true); perform set_config('request.jwt.claim.role', 'anon', true); end $$;
set local role anon;
select is((select count(*)::int from public.teachings where id = '00000000-0000-4000-9400-0000000000a1'), 0, 'the public cannot see a draft marked ready');
reset role;

-- ---------------------------------------------------------------------------
-- It can only exist on a draft, and leaving draft clears it
-- ---------------------------------------------------------------------------

select throws_ok(
  $$ update public.teachings set ready_to_publish_at = now() where id = '00000000-0000-4000-9400-0000000000a2' $$,
  '23514', null, 'a published teaching cannot be marked ready'
);

update public.teachings set status = 'published', published_at = now() where id = '00000000-0000-4000-9400-0000000000a1';
select is((select ready_to_publish_at from public.teachings where id = '00000000-0000-4000-9400-0000000000a1'), null, 'publishing clears the ready marker');
select is((select status from public.teachings where id = '00000000-0000-4000-9400-0000000000a1'), 'published', 'and the publish itself still goes through');

update public.teachings set status = 'draft', published_at = null where id = '00000000-0000-4000-9400-0000000000a1';
select is((select ready_to_publish_at from public.teachings where id = '00000000-0000-4000-9400-0000000000a1'), null, 'an unpublished teaching comes back as an unmarked draft');

update public.teachings set ready_to_publish_at = now() where id = '00000000-0000-4000-9400-0000000000a1';
update public.teachings set status = 'archived', archived_at = now() where id = '00000000-0000-4000-9400-0000000000a1';
select is((select ready_to_publish_at from public.teachings where id = '00000000-0000-4000-9400-0000000000a1'), null, 'archiving a marked draft clears the marker too, instead of failing');

select * from finish();
rollback;
