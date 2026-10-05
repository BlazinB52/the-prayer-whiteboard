alter table public.content_footers
  add column if not exists language text not null default 'en';

alter table public.content_footers
  drop constraint if exists content_footers_language_check,
  add constraint content_footers_language_check
    check (language in ('en', 'es'));
