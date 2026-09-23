-- Decouples devotional records from teaching ownership.
--
-- 20260919010000 introduced public.teaching_devotional_assignments as the real
-- teaching -> devotional mapping, but left the original ownership column on
-- public.teaching_devotionals untouched. That column is still
-- `teaching_id uuid not null` with a table-level `unique (teaching_id)`, so the
-- schema has carried two competing relationship layers ever since:
--
--   * the assignments table, which allows one devotional to serve many
--     teachings, and
--   * the legacy owner column, which forbids a devotional from existing
--     without exactly one teaching that no other devotional has claimed.
--
-- This migration retires the legacy column as a constraint while keeping it as
-- an optional backup reference, so a devotional can be authored standalone and
-- assigned to a teaching later (or to several, or to none).
--
-- Deliberately NOT changed here: the assignments table, every RLS policy, and
-- the public read path. An unassigned devotional is simply invisible to the
-- public, because the public select policies on teaching_devotionals and
-- teaching_devotional_days already require a published teaching reached
-- *through* teaching_devotional_assignments.

-- 1. The legacy owner column becomes optional.
alter table public.teaching_devotionals
  alter column teaching_id drop not null;

-- 2. Retire `unique (teaching_id)` so a teaching is no longer capped at one
--    owned devotional and standalone rows may leave the column null.
--    The constraint was declared inline in 20260907020000, so Postgres named it
--    automatically. Drop the expected name, then sweep for any unique
--    constraint still covering exactly (teaching_id) in case an environment
--    generated a different name.
alter table public.teaching_devotionals
  drop constraint if exists teaching_devotionals_teaching_id_key;

do $$
declare
  legacy_constraint text;
begin
  for legacy_constraint in
    select con.conname
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
    where nsp.nspname = 'public'
      and rel.relname = 'teaching_devotionals'
      and con.contype = 'u'
      and con.conkey = array[
        (
          select att.attnum
          from pg_attribute att
          where att.attrelid = con.conrelid
            and att.attname = 'teaching_id'
            and att.attnum > 0
            and not att.attisdropped
        )
      ]::smallint[]
  loop
    execute format(
      'alter table public.teaching_devotionals drop constraint %I',
      legacy_constraint
    );
  end loop;
end $$;

-- Also drop a bare unique index on (teaching_id) if one exists without a
-- backing constraint. The non-unique teaching_devotionals_teaching_idx from
-- 20260907020000 is intentionally left in place so lookups by teaching stay
-- indexed.
do $$
declare
  legacy_index text;
begin
  for legacy_index in
    select cls.relname
    from pg_index idx
    join pg_class cls on cls.oid = idx.indexrelid
    join pg_class tbl on tbl.oid = idx.indrelid
    join pg_namespace nsp on nsp.oid = tbl.relnamespace
    where nsp.nspname = 'public'
      and tbl.relname = 'teaching_devotionals'
      and idx.indisunique
      and not idx.indisprimary
      and idx.indexprs is null
      and idx.indpred is null
      and idx.indnatts = 1
      and idx.indkey[0] = (
        select att.attnum
        from pg_attribute att
        where att.attrelid = idx.indrelid
          and att.attname = 'teaching_id'
          and att.attnum > 0
          and not att.attisdropped
      )
      and not exists (
        select 1 from pg_constraint con where con.conindid = idx.indexrelid
      )
  loop
    execute format('drop index public.%I', legacy_index);
  end loop;
end $$;

-- 3. Loosen the slug index so unslugged drafts never collide.
--
--    The partial index from 20260910010000 already excluded empty slugs, but
--    the column itself was `not null default ''`, so "no slug yet" could only
--    ever be the empty string. A standalone devotional has no teaching to
--    borrow a slug from, so allow null and drop the '' default; both null and
--    '' stay outside the unique index, and any number of them may coexist.
alter table public.teaching_devotionals
  alter column slug drop not null;

alter table public.teaching_devotionals
  alter column slug drop default;

drop index if exists public.teaching_devotionals_slug_idx;

create unique index teaching_devotionals_slug_idx
  on public.teaching_devotionals (slug)
  where slug is not null and length(trim(slug)) > 0;

-- A now-nullable slug would silently satisfy the old published-slug check,
-- because `false or null` is null and a check constraint passes on null. Make
-- it null-safe so publishing still requires a real public slug.
alter table public.teaching_devotionals
  drop constraint if exists teaching_devotionals_published_slug_check;

alter table public.teaching_devotionals
  add constraint teaching_devotionals_published_slug_check
    check (status <> 'published' or length(trim(coalesce(slug, ''))) > 0);

-- 4. Stop teaching deletion from destroying shared devotional content.
--
--    NOTE: this goes beyond making the column nullable, and is separable from
--    the rest of this migration. It is included because steps 1-3 would
--    otherwise leave a live data-loss path: the legacy column's foreign key is
--    `on delete cascade`, so deleting the one teaching that happens to sit in
--    teaching_id would delete the devotional outright -- even when other
--    teachings still reference it through teaching_devotional_assignments.
--    Now the backup reference simply clears and the devotional survives as a
--    standalone record. Assignment rows still cascade on their own side.
alter table public.teaching_devotionals
  drop constraint if exists teaching_devotionals_teaching_id_fkey;

alter table public.teaching_devotionals
  add constraint teaching_devotionals_teaching_id_fkey
    foreign key (teaching_id) references public.teachings(id) on delete set null;

comment on column public.teaching_devotionals.teaching_id is
  'Legacy/backup origin teaching. Optional and non-unique. The authoritative '
  'teaching mapping lives in public.teaching_devotional_assignments; read and '
  'write that table instead of this column.';
