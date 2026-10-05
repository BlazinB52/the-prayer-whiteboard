alter table public.chalkboard_assets
  add column if not exists language text not null default 'en';

alter table public.chalkboard_assets
  drop constraint if exists chalkboard_assets_language_check,
  add constraint chalkboard_assets_language_check
    check (language in ('en', 'es'));
