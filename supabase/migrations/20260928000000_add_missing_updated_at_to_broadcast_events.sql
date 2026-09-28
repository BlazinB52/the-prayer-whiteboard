-- email_broadcast_events was created with an updated_at column and a
-- before-update trigger that stamps it (20260922010000), but the live table
-- is missing the column — schema drift never captured in a migration.
-- Every update silently failed with "record 'new' has no field 'updated_at'",
-- which meant a weekly update's broadcast never advanced past status
-- 'sending' even when the send itself succeeded, discovered 2026-09-27 when
-- a genuinely successful send (14/14 recipients) left no usable ledger row.

alter table public.email_broadcast_events
  add column if not exists updated_at timestamptz not null default now();
