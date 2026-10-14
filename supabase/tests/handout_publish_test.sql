begin;

select * from no_plan();

-- Creating, publishing and unpublishing a handout (20261015000000_handout_publish.sql).
-- admin ...9920-01   editor ...02
-- Handout P1 (b1) starts as a blank draft, like the one "Create new handout" makes.

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9920-000000000001', 'authenticated', 'authenticated', 'admin@handoutpub.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9920-000000000002', 'authenticated', 'authenticated', 'editor@handoutpub.local', 'x', now(), now(), now());

insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ('00000000-0000-4000-9920-000000000001', 'admin', true, null, 'Admin', 'admin@handoutpub.local'),
  ('00000000-0000-4000-9920-000000000002', 'content_manager', true, null, 'Editor', 'editor@handoutpub.local');

create temp table prev (key text primary key, id uuid);
grant all on prev to authenticated;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9920-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

-- ===========================================================================
-- A blank draft
-- ===========================================================================

select lives_ok(
  $$ insert into public.teaching_handouts (id, title, language, status, content, original_content) values ('00000000-0000-4000-9920-0000000000b1', 'Untitled handout', 'en', 'draft', '[]'::jsonb, '[]'::jsonb) $$,
  'an Administrator can create a blank handout with no date and no text'
);
select is((select gathering_date from public.teaching_handouts where id = '00000000-0000-4000-9920-0000000000b1'), null, 'it has no date yet');
select throws_ok(
  $$ update public.teaching_handouts set sent_for_review_at = now() where id = '00000000-0000-4000-9920-0000000000b1' $$,
  '23514', null, 'a blank handout cannot be sent for review'
);
update public.teaching_handouts set gathering_date = '2026-10-17' where id = '00000000-0000-4000-9920-0000000000b1';
select throws_ok(
  $$ update public.teaching_handouts set sent_for_review_at = now() where id = '00000000-0000-4000-9920-0000000000b1' $$,
  '23514', null, 'a date alone is not enough: there is no draft text to review'
);
update public.teaching_handouts
set content = '[{"type":"section_title","inlines":[{"text":"Glory"}]},{"type":"paragraph","inlines":[{"text":"Body."}]}]'::jsonb,
    original_content = '[{"type":"section_title","inlines":[{"text":"Glory"}]},{"type":"paragraph","inlines":[{"text":"Body."}]}]'::jsonb
where id = '00000000-0000-4000-9920-0000000000b1';
select lives_ok(
  $$ update public.teaching_handouts set sent_for_review_at = now() where id = '00000000-0000-4000-9920-0000000000b1' $$,
  'with a date and a draft it can be sent'
);
reset role;

-- ===========================================================================
-- Content Managers have an open proposal when the handout is published
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9920-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.teaching_handouts where id = '00000000-0000-4000-9920-0000000000b1'), 1, 'a sent draft is visible to a Content Manager');
insert into prev values ('draft', public.create_handout_revision('00000000-0000-4000-9920-0000000000b1'));
select public.save_handout_revision_draft((select id from prev where key = 'draft'), jsonb_build_array(
  jsonb_build_object('target_kind', 'handout', 'field_key', 'block_2', 'base_value', 'Body.', 'proposed_value', 'Body text.')));
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9920-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

-- Publishing is the PDF going into Printable PDF Links and the handout pointing at it.
insert into public.printable_pdf_links (id, title, storage_path, language)
values ('00000000-0000-4000-9920-0000000000d1', 'Glory', '00000000-0000-4000-9920-0000000000f1.pdf', 'en');

select throws_ok(
  $$ update public.teaching_handouts set status = 'published', published_at = now() where id = '00000000-0000-4000-9920-0000000000b1' $$,
  '23514', null, 'a handout cannot be published without pointing at its PDF'
);
select lives_ok(
  $$ update public.teaching_handouts set status = 'published', published_at = now(), printable_pdf_id = '00000000-0000-4000-9920-0000000000d1' where id = '00000000-0000-4000-9920-0000000000b1' $$,
  'a handout is published by pointing it at its PDF'
);
select is((select sent_for_review_at from public.teaching_handouts where id = '00000000-0000-4000-9920-0000000000b1'), null, 'publishing clears the sent mark');
select is((select status from public.content_revisions where id = (select id from prev where key = 'draft')), 'cancelled', 'and closes the Content Manager revision that was still open');
select is((select count(*)::int from public.content_revision_changes where revision_id = (select id from prev where key = 'draft')), 0, 'discarding the unsubmitted draft wording');

select throws_ok(
  $$ select public.admin_edit_handout_text('00000000-0000-4000-9920-0000000000b1', jsonb_build_array(jsonb_build_object('field_key', 'block_2', 'base_value', 'Body.', 'value', 'Changed'))) $$,
  'P0001', null, 'a published handout cannot be edited'
);
select throws_ok(
  $$ select public.admin_handout_structure('00000000-0000-4000-9920-0000000000b1', 'delete', 'block_2') $$,
  'P0001', null, 'or have paragraphs added or removed'
);
select throws_ok(
  $$ update public.teaching_handouts set sent_for_review_at = now() where id = '00000000-0000-4000-9920-0000000000b1' $$,
  '23514', null, 'and it cannot be sent for review again'
);
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9920-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select is((select count(*)::int from public.teaching_handouts where id = '00000000-0000-4000-9920-0000000000b1'), 0, 'a published handout is hidden from Content Managers');
reset role;

-- ===========================================================================
-- Removing the PDF from Printable PDF Links takes the handout back to a draft
-- ===========================================================================

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9920-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select lives_ok($$ delete from public.printable_pdf_links where id = '00000000-0000-4000-9920-0000000000d1' $$, 'the PDF can be removed from Printable PDF Links');
select is((select status from public.teaching_handouts where id = '00000000-0000-4000-9920-0000000000b1'), 'draft', 'and the handout is a draft again');
select is((select printable_pdf_id from public.teaching_handouts where id = '00000000-0000-4000-9920-0000000000b1'), null, 'with no PDF');
select is((select published_at from public.teaching_handouts where id = '00000000-0000-4000-9920-0000000000b1'), null, 'and no published date');
select is(
  public.admin_edit_handout_text('00000000-0000-4000-9920-0000000000b1', jsonb_build_array(jsonb_build_object('field_key', 'block_2', 'base_value', 'Body.', 'value', 'Changed'))),
  1, 'and it can be edited again'
);
reset role;

select * from finish();
rollback;
