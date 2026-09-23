begin;

select plan(18);

-- NOTE: this file previously ran `create table public.teaching_devotional_assignments (...)`
-- inline, duplicating the DDL from 20260919010000. Because `supabase test db`
-- runs against a database with every migration already applied, that statement
-- could only ever raise "relation already exists". The table is now taken from
-- the migration, as it should be, and the rows below are ordinary seed data.

insert into public.teachings (id, slug, title, status)
values
  ('00000000-0000-4000-b000-000000000101', 'assignment-teaching-one', 'Assignment Teaching One', 'draft'),
  ('00000000-0000-4000-b000-000000000102', 'assignment-teaching-two', 'Assignment Teaching Two', 'draft');

insert into public.teaching_devotionals (id, teaching_id, slug, title, status)
values
  ('00000000-0000-4000-b000-000000000111', '00000000-0000-4000-b000-000000000101', 'shared-assignment-devotional', 'Shared Assignment Devotional', 'draft'),
  ('00000000-0000-4000-b000-000000000112', '00000000-0000-4000-b000-000000000102', 'replacement-assignment-devotional', 'Replacement Assignment Devotional', 'draft');

insert into public.teaching_devotional_days (devotional_id, day_number, title)
values ('00000000-0000-4000-b000-000000000111', 1, 'Shared Day One');

insert into public.teaching_devotional_assignments (teaching_id, devotional_id)
select teaching_id, id from public.teaching_devotionals
where teaching_id is not null;

-- ---------------------------------------------------------------------------
-- Assignment mapping behaviour (unchanged by the decoupling migration)
-- ---------------------------------------------------------------------------

select is(
  (select count(*) from public.teaching_devotional_assignments),
  2::bigint,
  'existing devotional ownership is backfilled as assignments'
);

update public.teaching_devotional_assignments
set devotional_id = '00000000-0000-4000-b000-000000000111'
where teaching_id = '00000000-0000-4000-b000-000000000102';

select is(
  (select count(*) from public.teaching_devotional_assignments where devotional_id = '00000000-0000-4000-b000-000000000111'),
  2::bigint,
  'one devotional may be assigned to multiple teachings'
);

update public.teaching_devotional_assignments
set devotional_id = '00000000-0000-4000-b000-000000000112'
where teaching_id = '00000000-0000-4000-b000-000000000102';

select is(
  (select devotional_id from public.teaching_devotional_assignments where teaching_id = '00000000-0000-4000-b000-000000000101'),
  '00000000-0000-4000-b000-000000000111'::uuid,
  'changing one teaching does not move the devotional away from another teaching'
);

select is(
  (select devotional_id from public.teaching_devotional_assignments where teaching_id = '00000000-0000-4000-b000-000000000102'),
  '00000000-0000-4000-b000-000000000112'::uuid,
  'a teaching assignment may be changed independently'
);

delete from public.teaching_devotional_assignments
where teaching_id = '00000000-0000-4000-b000-000000000102';

select is(
  (select count(*) from public.teaching_devotional_assignments where teaching_id = '00000000-0000-4000-b000-000000000102'),
  0::bigint,
  'an assignment may be removed'
);

select is(
  (select count(*) from public.teaching_devotionals where id in ('00000000-0000-4000-b000-000000000111', '00000000-0000-4000-b000-000000000112')),
  2::bigint,
  'removing an assignment does not delete devotional records'
);

select is(
  (select count(*) from public.teaching_devotional_days where devotional_id = '00000000-0000-4000-b000-000000000111'),
  1::bigint,
  'changing and removing assignments do not alter devotional days'
);

-- ---------------------------------------------------------------------------
-- Standalone devotionals (20260923000000_decouple_devotional_ownership)
-- ---------------------------------------------------------------------------

-- Requirement 1: the legacy owner column is nullable.
select lives_ok(
  $$insert into public.teaching_devotionals (id, teaching_id, title, status)
    values ('00000000-0000-4000-b000-000000000121', null, 'Standalone Devotional', 'draft')$$,
  'a devotional may be inserted with a null teaching_id'
);

select is(
  (select teaching_id from public.teaching_devotionals where id = '00000000-0000-4000-b000-000000000121'),
  null::uuid,
  'the standalone devotional stores no teaching association'
);

select lives_ok(
  $$insert into public.teaching_devotionals (id, teaching_id, title, status)
    values ('00000000-0000-4000-b000-000000000122', null, 'Second Standalone Devotional', 'draft')$$,
  'a second standalone devotional does not collide with the first'
);

select is(
  (select count(*) from public.teaching_devotionals where teaching_id is null),
  2::bigint,
  'multiple devotionals may exist with no teaching association at all'
);

-- Requirement 2: unique (teaching_id) is gone.
select lives_ok(
  $$insert into public.teaching_devotionals (id, teaching_id, slug, title, status)
    values ('00000000-0000-4000-b000-000000000131', '00000000-0000-4000-b000-000000000101', 'second-devotional-for-teaching-one', 'Second Devotional For Teaching One', 'draft')$$,
  'two devotionals may share the same legacy teaching_id'
);

select is(
  (select count(*) from public.teaching_devotionals where teaching_id = '00000000-0000-4000-b000-000000000101'),
  2::bigint,
  'the legacy teaching_id column no longer caps a teaching at one devotional'
);

-- Requirement 3: the slug index tolerates repeated null and empty slugs.
select lives_ok(
  $$insert into public.teaching_devotionals (id, teaching_id, slug, title, status)
    values
      ('00000000-0000-4000-b000-000000000141', null, '', 'Empty Slug One', 'draft'),
      ('00000000-0000-4000-b000-000000000142', null, '', 'Empty Slug Two', 'draft'),
      ('00000000-0000-4000-b000-000000000143', null, null, 'Null Slug One', 'draft')$$,
  'repeated empty and null slugs coexist without a duplicate key error'
);

-- ...but real slugs are still unique.
select throws_ok(
  $$insert into public.teaching_devotionals (id, teaching_id, slug, title, status)
    values ('00000000-0000-4000-b000-000000000151', null, 'shared-assignment-devotional', 'Duplicate Slug', 'draft')$$,
  '23505',
  null::text,
  'a duplicate non-empty slug is still rejected'
);

-- ...and a slugless devotional still cannot be published.
select throws_ok(
  $$update public.teaching_devotionals
    set status = 'published', published_at = now()
    where id = '00000000-0000-4000-b000-000000000121'$$,
  '23514',
  null::text,
  'publishing a devotional with no slug is still rejected'
);

-- A standalone devotional can be adopted by a teaching afterwards.
select lives_ok(
  $$insert into public.teaching_devotional_assignments (teaching_id, devotional_id)
    values ('00000000-0000-4000-b000-000000000102', '00000000-0000-4000-b000-000000000121')$$,
  'a standalone devotional may be assigned to a teaching later'
);

-- Deleting a teaching clears the backup reference instead of destroying content.
delete from public.teachings where id = '00000000-0000-4000-b000-000000000101';

select is(
  (select count(*) from public.teaching_devotionals where id = '00000000-0000-4000-b000-000000000111'),
  1::bigint,
  'deleting the legacy owner teaching preserves the devotional record'
);

select * from finish();
rollback;
