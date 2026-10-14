-- Handouts and weekly updates can be linked to the teaching they go with, so the
-- Title Collections report can show everything that belongs to a teaching.
-- The link is optional: unlinked items are listed under "Not linked to a teaching".
alter table public.teaching_handouts
  add column if not exists teaching_id uuid references public.teachings(id) on delete set null;

alter table public.weekly_updates
  add column if not exists teaching_id uuid references public.teachings(id) on delete set null;

create index if not exists teaching_handouts_teaching_idx
  on public.teaching_handouts (teaching_id);

create index if not exists weekly_updates_teaching_idx
  on public.weekly_updates (teaching_id);
