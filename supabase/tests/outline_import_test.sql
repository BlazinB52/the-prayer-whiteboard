begin;

select * from no_plan();

-- Replacing a draft outline's text from an exported Word file (20261017020000_outline_import.sql).
-- admin ...9911-01   editor ...02   outline ...9911-a1 (draft)

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9911-000000000001', 'authenticated', 'authenticated', 'admin@import.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9911-000000000002', 'authenticated', 'authenticated', 'editor@import.local', 'x', now(), now(), now());

insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ('00000000-0000-4000-9911-000000000001', 'admin', true, null, 'Admin', 'admin@import.local'),
  ('00000000-0000-4000-9911-000000000002', 'content_manager', true, null, 'Editor', 'editor@import.local');

insert into public.outline_categories (id, name, slug, sort_order) values ('00000000-0000-4000-9911-0000000000c1', 'Import Test Category', 'import-test-category', 997);

insert into public.teaching_outlines (id, slug, title, subtitle, category_id, status, content, source_path)
values (
  '00000000-0000-4000-9911-0000000000a1', 'outline-import-test', 'Import Test', 'Week 1', '00000000-0000-4000-9911-0000000000c1', 'draft',
  '[{"type":"heading","level":1,"inlines":[{"text":"Heading"}]},{"type":"paragraph","inlines":[{"text":"One"}]}]'::jsonb,
  '00000000-0000-4000-9911-0000000000f1.docx'
);

-- A Content Manager can neither fingerprint nor import.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9911-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok($$ select public.outline_content_hash('00000000-0000-4000-9911-0000000000a1') $$, '42501', null, 'a Content Manager cannot fingerprint an outline');
select throws_ok($$ select public.admin_import_outline('00000000-0000-4000-9911-0000000000a1', 'x', 'T', null, '[{"type":"paragraph","inlines":[{"text":"Hi"}]}]'::jsonb) $$, '42501', null, 'a Content Manager cannot import');
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9911-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

create temp table import_hash (value text);
grant all on import_hash to authenticated;
insert into import_hash select public.outline_content_hash('00000000-0000-4000-9911-0000000000a1');
select is((select length(value) from import_hash), 32, 'the Administrator gets a fingerprint');
select is(public.outline_content_hash('00000000-0000-4000-9911-0000000000a1'), (select value from import_hash), 'and it is stable while nothing changes');

-- Checks that refuse before anything is written.
select throws_ok($$ select public.admin_import_outline('00000000-0000-4000-9911-0000000000a1', 'not-the-fingerprint', 'New Title', 'Week 1', '[{"type":"paragraph","inlines":[{"text":"Changed"}]}]'::jsonb) $$, 'P0001', null, 'a wrong fingerprint is refused');
select throws_ok(format($$ select public.admin_import_outline('00000000-0000-4000-9911-0000000000a1', %L, 'New Title', 'Week 1', '[]'::jsonb) $$, (select value from import_hash)), '22023', null, 'empty content is refused');
select throws_ok(format($$ select public.admin_import_outline('00000000-0000-4000-9911-0000000000a1', %L, 'New Title', 'Week 1', '[{"type":"script","inlines":[]}]'::jsonb) $$, (select value from import_hash)), '22023', null, 'an unknown block type is refused');
select throws_ok(format($$ select public.admin_import_outline('00000000-0000-4000-9911-0000000000a1', %L, '   ', 'Week 1', '[{"type":"paragraph","inlines":[{"text":"Hi"}]}]'::jsonb) $$, (select value from import_hash)), '22023', null, 'a blank title is refused');
select is((select content -> 1 -> 'inlines' -> 0 ->> 'text' from public.teaching_outlines where id = '00000000-0000-4000-9911-0000000000a1'), 'One', 'nothing was written by the refused imports');
select is((select title from public.teaching_outlines where id = '00000000-0000-4000-9911-0000000000a1'), 'Import Test', 'including the title');

-- An open Content Manager proposal blocks it.
reset role;
insert into public.content_revisions (id, subject_type, outline_id, status, submitted_by, subject_title)
values ('00000000-0000-4000-9911-0000000000b1', 'outline', '00000000-0000-4000-9911-0000000000a1', 'draft', '00000000-0000-4000-9911-000000000002', 'Import Test');
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9911-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok(format($$ select public.admin_import_outline('00000000-0000-4000-9911-0000000000a1', %L, 'New Title', 'Week 1', '[{"type":"paragraph","inlines":[{"text":"Changed"}]}]'::jsonb) $$, (select value from import_hash)), 'P0001', null, 'an open proposal blocks the import');
reset role;
delete from public.content_revisions where id = '00000000-0000-4000-9911-0000000000b1';

-- The real thing.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9911-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select lives_ok(format($$ select public.admin_import_outline('00000000-0000-4000-9911-0000000000a1', %L, 'New Title', null, '[{"type":"heading","level":1,"inlines":[{"text":"Heading"}]},{"type":"paragraph","inlines":[{"text":"Changed"}]}]'::jsonb) $$, (select value from import_hash)), 'with every check passing the import goes through');
select is((select title from public.teaching_outlines where id = '00000000-0000-4000-9911-0000000000a1'), 'New Title', 'the title is replaced');
select is((select subtitle from public.teaching_outlines where id = '00000000-0000-4000-9911-0000000000a1'), null, 'the subtitle is replaced');
select is((select content -> 1 -> 'inlines' -> 0 ->> 'text' from public.teaching_outlines where id = '00000000-0000-4000-9911-0000000000a1'), 'Changed', 'and so is the text');
select throws_ok(format($$ select public.admin_import_outline('00000000-0000-4000-9911-0000000000a1', %L, 'Again', null, '[{"type":"paragraph","inlines":[{"text":"Twice"}]}]'::jsonb) $$, (select value from import_hash)), 'P0001', null, 'the same file cannot be imported twice, because the outline has changed since the export');
reset role;

-- Published outlines cannot be replaced.
update public.teaching_outlines set status = 'published', published_at = now() where id = '00000000-0000-4000-9911-0000000000a1';
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9911-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok($$ select public.admin_import_outline('00000000-0000-4000-9911-0000000000a1', 'x', 'T', null, '[{"type":"paragraph","inlines":[{"text":"Hi"}]}]'::jsonb) $$, 'P0001', null, 'a published outline cannot be replaced');
reset role;

select * from finish();
rollback;
