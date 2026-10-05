alter table public.teaching_devotionals
  add column if not exists language text not null default 'en';

alter table public.teaching_devotionals
  drop constraint if exists teaching_devotionals_language_check,
  add constraint teaching_devotionals_language_check
    check (language in ('en', 'es'));

-- Series already assigned to an Español teaching are Español.
update public.teaching_devotionals d
  set language = 'es'
  from public.teaching_devotional_assignments a
  join public.teachings t on t.id = a.teaching_id
  where a.devotional_id = d.id
    and t.language = 'es';
