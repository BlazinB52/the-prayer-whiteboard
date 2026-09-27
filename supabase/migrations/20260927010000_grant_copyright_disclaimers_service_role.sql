-- Fixes a gap in 20260927000000: that migration granted select on
-- copyright_disclaimers to authenticated and anon but never to service_role.
-- lib/copyright-disclaimers.ts reads this table with the service-role client
-- from every content-email send path (devotional, teaching, weekly update
-- broadcasts and their admin test-send routes), and getCopyrightDisclaimer()
-- throws on a Postgres error rather than swallowing it, so the missing grant
-- took down all three test-send routes with a bare 500 ("permission denied
-- for table copyright_disclaimers", verified via a direct REST call against
-- production).
grant select on public.copyright_disclaimers to service_role;
