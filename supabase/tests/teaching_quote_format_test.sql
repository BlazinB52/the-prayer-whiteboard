begin;

select * from no_plan();

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9700-000000000001', 'authenticated', 'authenticated', 'admin@quotefmt.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9700-000000000002', 'authenticated', 'authenticated', 'editor@quotefmt.local', 'x', now(), now(), now());

insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ('00000000-0000-4000-9700-000000000001', 'admin', true, null, 'Admin', 'admin@quotefmt.local'),
  ('00000000-0000-4000-9700-000000000002', 'content_manager', true, null, 'Editor', 'editor@quotefmt.local');

-- Two draft Deep Dive teachings (no homepage teasers needed), each with one section.
insert into public.teachings (id, slug, title, summary, gathering_date, teaching_type, status, language)
values
  ('00000000-0000-4000-9700-0000000000a1', 'quotefmt-good', 'Quote Teaching', 'A summary.', '2026-10-10', 'deep_dive', 'draft', 'en'),
  ('00000000-0000-4000-9700-0000000000a2', 'quotefmt-bad', 'Unknown Format Teaching', 'A summary.', '2026-10-10', 'deep_dive', 'draft', 'en');

insert into public.teaching_categories (id, teaching_id, slug, title, sort_order, status)
values
  ('00000000-0000-4000-9700-0000000000c1', '00000000-0000-4000-9700-0000000000a1', 'cat-good', 'Category', 1, 'draft'),
  ('00000000-0000-4000-9700-0000000000c2', '00000000-0000-4000-9700-0000000000a2', 'cat-bad', 'Category', 1, 'draft');

insert into public.teaching_sections (id, teaching_id, category_id, slug, title, content, sort_order, status)
values
  ('00000000-0000-4000-9700-0000000000b1', '00000000-0000-4000-9700-0000000000a1', '00000000-0000-4000-9700-0000000000c1', 'sec-quote', 'Set apart',
    '{"version":1,"format":"quote","text":"A quoted line.","showTitle":false}'::jsonb, 1, 'draft'),
  ('00000000-0000-4000-9700-0000000000b2', '00000000-0000-4000-9700-0000000000a2', '00000000-0000-4000-9700-0000000000c2', 'sec-bogus', 'Mystery',
    '{"version":1,"format":"bogus","text":"x"}'::jsonb, 1, 'draft');

-- ===========================================================================
-- Publishing
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9700-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

select lives_ok($$ select public.publish_and_feature_teaching('00000000-0000-4000-9700-0000000000a1') $$, 'a teaching whose section is a Quote can be published');
select is((select status from public.teachings where id = '00000000-0000-4000-9700-0000000000a1'), 'published', 'and it is published');
select throws_ok($$ select public.publish_and_feature_teaching('00000000-0000-4000-9700-0000000000a2') $$, 'P0001', null, 'a section with an unknown format still blocks publishing');
reset role;

-- An empty Quote is refused like an empty paragraph.
update public.teaching_sections set content = '{"version":1,"format":"quote","text":"   "}'::jsonb where id = '00000000-0000-4000-9700-0000000000b2';
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9700-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok($$ select public.publish_and_feature_teaching('00000000-0000-4000-9700-0000000000a2') $$, 'P0001', null, 'a Quote with no text blocks publishing');
reset role;

-- ===========================================================================
-- Review: a co-editor can propose wording changes to a Quote's text
-- ===========================================================================

update public.teachings set status = 'draft', published_at = null where id = '00000000-0000-4000-9700-0000000000a1';
update public.teaching_sections set status = 'draft' where id = '00000000-0000-4000-9700-0000000000b1';

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9700-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
create temp table qrev (id uuid);
grant all on qrev to authenticated;
insert into qrev select public.create_teaching_revision('00000000-0000-4000-9700-0000000000a1');
select is(
  public.save_teaching_revision_draft((select id from qrev), jsonb_build_array(
    jsonb_build_object('target_kind', 'section', 'target_id', '00000000-0000-4000-9700-0000000000b1', 'field_key', 'text', 'base_value', 'A quoted line.', 'proposed_value', 'A better quoted line.')
  )),
  1, 'a change to a Quote''s text can be proposed'
);
reset role;

select * from finish();
rollback;
