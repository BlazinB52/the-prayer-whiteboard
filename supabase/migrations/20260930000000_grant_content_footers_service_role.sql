-- Same missing-default-grant pattern already hit and fixed for
-- copyright_disclaimers, teaching_sections, and teaching_devotional_days:
-- service_role has no SELECT/UPDATE grant on content_footers. Needed for the
-- one-time fix adding a missing (NKJV) tag to the reusable footer text
-- shared across several teaching pages.
grant select, update on public.content_footers to service_role;
