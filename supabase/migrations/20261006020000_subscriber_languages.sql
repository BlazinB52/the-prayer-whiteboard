-- A subscriber chooses which language(s) of content they want: English, Español, or both.
-- `languages` is what every send and every Sender.net group is built from. The older single
-- `language` column stays as the subscriber's primary language, which decides the language of the
-- confirmation and preference-link emails and pages.
alter table public.email_subscribers
  add column if not exists languages text[] not null default array['en']::text[];

alter table public.email_subscribers
  drop constraint if exists email_subscribers_languages_check,
  add constraint email_subscribers_languages_check
    check (languages <@ array['en', 'es']::text[] and cardinality(languages) between 1 and 2);

-- A confirmed subscriber who signs up again with a different language choice keeps their current
-- languages until they click the confirmation link; the requested choice waits here until then.
alter table public.email_subscribers
  add column if not exists pending_languages text[];

alter table public.email_subscribers
  drop constraint if exists email_subscribers_pending_languages_check,
  add constraint email_subscribers_pending_languages_check
    check (pending_languages is null or (pending_languages <@ array['en', 'es']::text[] and cardinality(pending_languages) between 1 and 2));

-- Existing subscribers keep exactly the language they have today.
update public.email_subscribers
  set languages = array[language]::text[]
  where language in ('en', 'es');

-- A language switch that was waiting on a confirmation click becomes a pending language choice.
update public.email_subscribers
  set pending_languages = array[pending_language]::text[]
  where pending_language in ('en', 'es') and pending_languages is null;

create index if not exists email_subscribers_languages_idx
  on public.email_subscribers using gin (languages);
