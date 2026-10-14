-- Español handouts.
--
-- A handout can now be in Español. It is made from an English handout ("Translate to Español" on the English
-- handout's page), so it points back at it (translation_of), the same way an Español teaching or devotional
-- points at its English original. One English handout has at most one Español version.
--
-- Handouts also get their own footer: the small credits block at the bottom of the printed handout. It is
-- chosen from the existing footers (content_footers); an Español handout uses an Español footer, which is
-- written for it and is not a translation of the English one. Removing a footer clears the choice.

alter table public.teaching_handouts
  add column if not exists translation_of uuid references public.teaching_handouts(id) on delete set null,
  add column if not exists footer_id uuid references public.content_footers(id) on delete set null;

alter table public.teaching_handouts
  drop constraint if exists teaching_handouts_translation_not_self_check,
  add constraint teaching_handouts_translation_not_self_check check (translation_of is null or translation_of <> id);

create unique index if not exists teaching_handouts_translation_of_idx
  on public.teaching_handouts (translation_of) where translation_of is not null;

create index if not exists teaching_handouts_footer_idx
  on public.teaching_handouts (footer_id) where footer_id is not null;
