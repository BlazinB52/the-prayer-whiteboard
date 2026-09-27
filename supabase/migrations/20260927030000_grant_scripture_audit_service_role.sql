-- service_role has no default SELECT/UPDATE grant on teaching_sections or
-- teaching_devotional_days in this project (same gap pattern already hit and
-- fixed for copyright_disclaimers in 20260927010000). Needed for the
-- one-time Scripture-translation backfill and the read-only audit script
-- (scripts/audit-scripture-translations.mjs) to run with the service key.
grant select, update on public.teaching_sections to service_role;
grant select, update on public.teaching_devotional_days to service_role;
