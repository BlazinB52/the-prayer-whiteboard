-- Subscribers choose a language when they sign up. Every send filters on it, so English
-- emails only go to English subscribers and Español emails only to Español subscribers.
alter table public.email_subscribers
  add column if not exists language text not null default 'en';

alter table public.email_subscribers
  drop constraint if exists email_subscribers_language_check,
  add constraint email_subscribers_language_check
    check (language in ('en', 'es'));

-- A confirmed subscriber who signs up in the other language keeps their current language until
-- they click the confirmation link in the new language; the request waits here until then.
alter table public.email_subscribers
  add column if not exists pending_language text;

alter table public.email_subscribers
  drop constraint if exists email_subscribers_pending_language_check,
  add constraint email_subscribers_pending_language_check
    check (pending_language is null or pending_language in ('en', 'es'));

create index if not exists email_subscribers_language_idx
  on public.email_subscribers (language);
