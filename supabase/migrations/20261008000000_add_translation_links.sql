-- Links a teaching or devotional to its translation (English <-> Español).
-- The link is stored on one side only; readers look in both directions, and the
-- unique index guarantees each item has at most one translation pointing at it.
alter table public.teachings
  add column if not exists translation_of uuid references public.teachings(id) on delete set null;
alter table public.teaching_devotionals
  add column if not exists translation_of uuid references public.teaching_devotionals(id) on delete set null;

alter table public.teachings
  drop constraint if exists teachings_translation_not_self,
  add constraint teachings_translation_not_self check (translation_of is null or translation_of <> id);
alter table public.teaching_devotionals
  drop constraint if exists teaching_devotionals_translation_not_self,
  add constraint teaching_devotionals_translation_not_self check (translation_of is null or translation_of <> id);

create unique index if not exists teachings_translation_of_idx
  on public.teachings (translation_of) where translation_of is not null;
create unique index if not exists teaching_devotionals_translation_of_idx
  on public.teaching_devotionals (translation_of) where translation_of is not null;

-- Link the existing Español pair to its English original.
update public.teachings es
set translation_of = en.id
from public.teachings en
where es.slug = 'cerrar-el-pasado-y-avanzar-en-amor'
  and en.slug = 'shuttering-the-past-and-moving-forward-in-love'
  and es.translation_of is null
  and not exists (select 1 from public.teachings t where t.translation_of = en.id);

update public.teaching_devotionals es
set translation_of = en.id
from public.teaching_devotionals en
where es.slug = 'devocional-de-7-dias-cerrar-el-pasado-y-avanzar-en-amor'
  and en.slug = 'shuttering-the-past-and-moving-forward-in-love'
  and es.translation_of is null
  and not exists (select 1 from public.teaching_devotionals d where d.translation_of = en.id);
