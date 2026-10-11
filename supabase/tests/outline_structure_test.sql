begin;

select * from no_plan();

-- Adding and removing paragraphs in a draft outline (20261011040000_outline_add_remove_paragraphs.sql).
-- admin ...9910-01   editor ...02

insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9910-000000000001', 'authenticated', 'authenticated', 'admin@struct.local', 'x', now(), now(), now()),
  ('00000000-0000-0000-0000-000000000000', '00000000-0000-4000-9910-000000000002', 'authenticated', 'authenticated', 'editor@struct.local', 'x', now(), now(), now());

insert into public.admin_authorizations (user_id, role, is_active, revoked_at, display_name, email)
values
  ('00000000-0000-4000-9910-000000000001', 'admin', true, null, 'Admin', 'admin@struct.local'),
  ('00000000-0000-4000-9910-000000000002', 'content_manager', true, null, 'Editor', 'editor@struct.local');

insert into public.outline_categories (id, name, slug, sort_order) values ('00000000-0000-4000-9910-0000000000c1', 'Structure Test Category', 'structure-test-category', 998);

insert into public.teaching_outlines (id, slug, title, category_id, status, sent_for_review_at, content, source_path)
values (
  '00000000-0000-4000-9910-0000000000a1', 'outline-structure-test', 'Structure Test', '00000000-0000-4000-9910-0000000000c1', 'draft', now(),
  $json$[
    {"type":"heading","level":1,"inlines":[{"text":"Heading"}]},
    {"type":"paragraph","inlines":[{"text":"One"}]},
    {"type":"paragraph","inlines":[{"text":"Two"}]},
    {"type":"list","items":[{"level":1,"ordered":true,"inlines":[{"text":"A"}]},{"level":1,"ordered":true,"inlines":[{"text":"B"}]}]},
    {"type":"table","rows":[[[{"text":"Cell"}]]]}
  ]$json$::jsonb,
  '00000000-0000-4000-9910-0000000000f1.docx'
);

-- A Content Manager cannot do it.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok($$ select public.admin_outline_structure('00000000-0000-4000-9910-0000000000a1', 'delete', 'block_2') $$, '42501', null, 'a Content Manager cannot remove a paragraph');
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;

-- Insert and delete a paragraph.
select lives_ok($$ select public.admin_outline_structure('00000000-0000-4000-9910-0000000000a1', 'insert', 'block_2') $$, 'the Administrator adds a paragraph after block 2');
select is((select jsonb_array_length(content) from public.teaching_outlines where id = '00000000-0000-4000-9910-0000000000a1'), 6, 'there is one more block');
select is((select content -> 2 from public.teaching_outlines where id = '00000000-0000-4000-9910-0000000000a1'), '{"type":"paragraph","inlines":[{"text":"New paragraph"}]}'::jsonb, 'it sits right after block 2');
select is((select content -> 3 -> 'inlines' -> 0 ->> 'text' from public.teaching_outlines where id = '00000000-0000-4000-9910-0000000000a1'), 'Two', 'and the next paragraph moved down');
select lives_ok($$ select public.admin_outline_structure('00000000-0000-4000-9910-0000000000a1', 'delete', 'block_3') $$, 'the Administrator deletes it again');
select is((select jsonb_array_length(content) from public.teaching_outlines where id = '00000000-0000-4000-9910-0000000000a1'), 5, 'back to five blocks');
select lives_ok($$ select public.admin_outline_structure('00000000-0000-4000-9910-0000000000a1', 'delete', 'block_2') $$, 'a paragraph can be deleted');
select is((select content -> 1 -> 'inlines' -> 0 ->> 'text' from public.teaching_outlines where id = '00000000-0000-4000-9910-0000000000a1'), 'Two', 'and the next one takes its place');

-- Lists: items keep their level and kind, and the list goes with its last item.
select lives_ok($$ select public.admin_outline_structure('00000000-0000-4000-9910-0000000000a1', 'insert', 'block_3_item_1') $$, 'a list item is added after item 1');
select is((select content -> 2 -> 'items' -> 1 from public.teaching_outlines where id = '00000000-0000-4000-9910-0000000000a1'), '{"level":1,"ordered":true,"inlines":[{"text":"New item"}]}'::jsonb, 'with the same level and numbering');
select lives_ok($$ select public.admin_outline_structure('00000000-0000-4000-9910-0000000000a1', 'delete', 'block_3_item_2') $$, 'and deleted');
select lives_ok($$ select public.admin_outline_structure('00000000-0000-4000-9910-0000000000a1', 'delete', 'block_3_item_1') $$, 'items can be deleted one by one');
select lives_ok($$ select public.admin_outline_structure('00000000-0000-4000-9910-0000000000a1', 'delete', 'block_3_item_1') $$, 'down to the last one');
select is((select content -> 2 ->> 'type' from public.teaching_outlines where id = '00000000-0000-4000-9910-0000000000a1'), 'table', 'which removes the empty list');

-- What cannot be done.
select throws_ok($$ select public.admin_outline_structure('00000000-0000-4000-9910-0000000000a1', 'delete', 'block_3_cell_1_1') $$, '22023', null, 'a table cell cannot be removed this way');
select throws_ok($$ select public.admin_outline_structure('00000000-0000-4000-9910-0000000000a1', 'delete', 'title') $$, '22023', null, 'neither can the title');
select throws_ok($$ select public.admin_outline_structure('00000000-0000-4000-9910-0000000000a1', 'delete', 'block_9') $$, 'P0001', null, 'a block that is not there is reported');
select throws_ok($$ select public.admin_outline_structure('00000000-0000-4000-9910-0000000000a1', 'rename', 'block_1') $$, '22023', null, 'an unknown action is refused');
reset role;

-- Not while a Content Manager proposal is open.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000002', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select public.create_outline_revision('00000000-0000-4000-9910-0000000000a1');
reset role;

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok($$ select public.admin_outline_structure('00000000-0000-4000-9910-0000000000a1', 'insert', 'block_1') $$, 'P0001', null, 'adding is refused while a proposal is open, because it would move the text it points at');
reset role;
delete from public.content_revisions where subject_type = 'outline' and outline_id = '00000000-0000-4000-9910-0000000000a1';

-- Published outlines are not touched, and the last block cannot be deleted.
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select lives_ok($$ select public.admin_outline_structure('00000000-0000-4000-9910-0000000000a1', 'delete', 'block_2') $$, 'with no proposal open it works again');
select lives_ok($$ select public.admin_outline_structure('00000000-0000-4000-9910-0000000000a1', 'delete', 'block_1') $$, 'down to the table');
reset role;
update public.teaching_outlines set content = '[{"type":"paragraph","inlines":[{"text":"Only"}]}]'::jsonb where id = '00000000-0000-4000-9910-0000000000a1';

do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok($$ select public.admin_outline_structure('00000000-0000-4000-9910-0000000000a1', 'delete', 'block_1') $$, 'P0001', null, 'the last paragraph cannot be deleted');
reset role;

update public.teaching_outlines set status = 'published', published_at = now() where id = '00000000-0000-4000-9910-0000000000a1';
do $$ begin perform set_config('request.jwt.claim.sub', '00000000-0000-4000-9910-000000000001', true); perform set_config('request.jwt.claim.role', 'authenticated', true); end $$;
set local role authenticated;
select throws_ok($$ select public.admin_outline_structure('00000000-0000-4000-9910-0000000000a1', 'insert', 'block_1') $$, 'P0001', null, 'a published outline cannot be changed this way');
reset role;

select * from finish();
rollback;
