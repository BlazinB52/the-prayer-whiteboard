-- The email-footer summary sentence listed "NIV, ESV, NKJV, and AMP Bibles"
-- but never mentioned AMPC (Amplified Bible, Classic Edition), even though
-- AMPC is the translation actually quoted most often across teachings and
-- devotionals -- the same omission already found and fixed on the full-page
-- disclaimer. Flagged by the user reviewing a live sent email.

update public.copyright_disclaimers
set content = 'Scripture quotations are from the NIV, ESV, NKJV, AMP, and AMPC Bibles. Complete copyright acknowledgments and permissions can be viewed here.

Original Content © 2026 The Prayer Whiteboard. All rights reserved.'
where disclaimer_key = 'email_short';
