-- Allow trusted server-only code to read private chalkboard metadata so it can
-- create signed URLs after verifying the parent teaching is published.
grant select on public.chalkboard_assets to service_role;
