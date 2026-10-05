alter table public.teachings
  add column if not exists language text not null default 'en';

alter table public.teachings
  drop constraint if exists teachings_language_check,
  add constraint teachings_language_check
    check (language in ('en', 'es'));
