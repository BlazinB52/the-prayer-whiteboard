-- A gathering can have more than one version of the same handout, for example one for Honduras and one for the US.
--
-- Each version is its own handout (its own text, footer and final PDF) that shares the gathering date, teaching and
-- language with the one it was made from.
--
--   * version_label names the version ("Honduras", "US"). It is empty for an ordinary handout.
--   * version_of points at the handout this one was made from, so the pages can list the other versions together.
--     Deleting that handout only clears the link.
--
-- A version does not take over translation_of: an English handout has one Español translation, and a version of the
-- Español handout is not a second translation of the English one.

alter table public.teaching_handouts
  add column if not exists version_label text,
  add column if not exists version_of uuid references public.teaching_handouts(id) on delete set null;

alter table public.teaching_handouts
  drop constraint if exists teaching_handouts_version_label_check,
  add constraint teaching_handouts_version_label_check check (version_label is null or length(trim(version_label)) between 1 and 60);

alter table public.teaching_handouts
  drop constraint if exists teaching_handouts_version_not_self_check,
  add constraint teaching_handouts_version_not_self_check check (version_of is null or version_of <> id);

create index if not exists teaching_handouts_version_of_idx
  on public.teaching_handouts (version_of) where version_of is not null;
