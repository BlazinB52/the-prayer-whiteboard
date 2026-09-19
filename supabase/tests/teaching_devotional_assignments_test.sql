begin;

select plan(7);

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

create table public.teaching_devotional_assignments (
  teaching_id uuid primary key references public.teachings(id) on delete cascade,
  devotional_id uuid not null references public.teaching_devotionals(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.teaching_devotional_assignments (teaching_id, devotional_id)
select teaching_id, id from public.teaching_devotionals;

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

select * from finish();
rollback;
