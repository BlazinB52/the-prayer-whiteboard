-- Broadcast routes re-read the published row with the service role rather than
-- trusting the webhook payload, but service_role had no select privilege on the
-- content tables, so every broadcast would fail at the content lookup.
--
-- Read-only: broadcasts never write to content tables.

grant select on public.weekly_updates to service_role;
grant select on public.teachings to service_role;
