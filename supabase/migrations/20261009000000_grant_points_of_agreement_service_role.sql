-- Same missing-default-grant pattern as copyright_disclaimers, teaching_sections,
-- teaching_devotional_days and content_footers: service_role has no SELECT/UPDATE
-- on points_of_agreement (only authenticated, behind admin RLS). Needed so the
-- translation-tag fix and scripts/verify-quote-translations.mjs can read and
-- correct the scripture lines. Narrow on purpose: no insert or delete.
grant select, update on public.points_of_agreement to service_role;
