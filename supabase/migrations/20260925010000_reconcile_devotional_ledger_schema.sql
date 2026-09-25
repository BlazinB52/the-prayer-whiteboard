-- Reconciles email_devotional_broadcast_ledger with two constraints that were
-- already live in production but were never captured in a migration file —
-- discovered on 2026-09-25 when a fully successful run's completion update
-- (error: null) was silently rejected, leaving the row stuck on 'sending'
-- forever and blocking every future day sharing its day_number.
--
-- Both statements are idempotent so this applies cleanly regardless of the
-- exact drifted state: a fresh database that only ever ran the original
-- 20260922050000 migration, and the actual production database, which
-- somewhere along the way picked up a not-null constraint (and a default,
-- inferred from claimDay's insert never setting error yet reading back {})
-- without a migration recording it.

update public.email_devotional_broadcast_ledger
set error = '{}'::jsonb
where error is null;

alter table public.email_devotional_broadcast_ledger
  alter column error set default '{}'::jsonb;

alter table public.email_devotional_broadcast_ledger
  alter column error set not null;

-- 20260923010000 intended to retire this index in favor of the devotional_id
-- guard below, but it apparently never actually dropped in production —
-- confirmed on 2026-09-25 when clearing only devotional_id on a stale row
-- was not enough to unblock a legitimate same-day-number claim; teaching_id
-- had to be cleared too.
drop index if exists public.email_devotional_broadcast_ledger_teaching_day_idx;

-- Re-assert defensively in case it was likewise never fully applied.
create unique index if not exists email_devotional_broadcast_ledger_devotional_day_idx
  on public.email_devotional_broadcast_ledger (devotional_id, day_number)
  where devotional_id is not null;
