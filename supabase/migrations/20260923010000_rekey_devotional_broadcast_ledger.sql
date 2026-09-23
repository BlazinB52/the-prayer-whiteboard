-- Re-keys the devotional broadcast ledger on the devotional instead of the
-- teaching.
--
-- 20260922050000 created the ledger with a unique (teaching_id, day_number)
-- guard. That was sound while `unique (teaching_id)` on teaching_devotionals
-- capped a teaching at exactly one devotional, so "teaching T, day 3" and
-- "series S, day 3" named the same blast.
--
-- 20260923000000 removed that cap. A teaching can now carry a different series
-- over time, and one series can be shared by several teachings, so keying on
-- the teaching is wrong in both directions:
--
--   * assigning a NEW devotional to a teaching that has already mailed its
--     seven days collides with the old ledger rows, and the new series silently
--     never mails at all, and
--   * the ledger cannot record a blast for a devotional with no teaching.
--
-- The blast belongs to the series, so key it on the series.

alter table public.email_devotional_broadcast_ledger
  add column if not exists devotional_id uuid references public.teaching_devotionals(id) on delete cascade;

-- Backfill through the assignment table first, since that is the authoritative
-- mapping, then fall back to the legacy owner column for any row whose
-- assignment has since been removed.
update public.email_devotional_broadcast_ledger l
set devotional_id = a.devotional_id
from public.teaching_devotional_assignments a
where a.teaching_id = l.teaching_id
  and l.devotional_id is null;

update public.email_devotional_broadcast_ledger l
set devotional_id = d.id
from public.teaching_devotionals d
where d.teaching_id = l.teaching_id
  and l.devotional_id is null;

-- The teaching becomes optional history. A row whose series can no longer be
-- resolved keeps devotional_id null rather than being deleted, because this is
-- append-only send history and discarding it is not recoverable.
alter table public.email_devotional_broadcast_ledger
  alter column teaching_id drop not null;

-- Deleting a teaching used to cascade its send history away. Now that the
-- history is owned by the series, clear the reference and keep the row.
alter table public.email_devotional_broadcast_ledger
  drop constraint if exists email_devotional_broadcast_ledger_teaching_id_fkey;

alter table public.email_devotional_broadcast_ledger
  add constraint email_devotional_broadcast_ledger_teaching_id_fkey
    foreign key (teaching_id) references public.teachings(id) on delete set null;

-- Swap the idempotency guard over to the series. The index is partial so the
-- unresolvable legacy rows above cannot block a live series; every row the
-- application writes carries a devotional_id.
drop index if exists public.email_devotional_broadcast_ledger_teaching_day_idx;

create unique index if not exists email_devotional_broadcast_ledger_devotional_day_idx
  on public.email_devotional_broadcast_ledger (devotional_id, day_number)
  where devotional_id is not null;

create index if not exists email_devotional_broadcast_ledger_devotional_idx
  on public.email_devotional_broadcast_ledger (devotional_id);

comment on column public.email_devotional_broadcast_ledger.teaching_id is
  'Historical context only. The blast is keyed on devotional_id; this records '
  'which teaching the series was mailing under at the time, when there was one.';
