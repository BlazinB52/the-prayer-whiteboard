-- Weekly updates get a gathering date, a link to the English original they were translated from, and a way to
-- record a letter that already went out.
--
--   * gathering_date is the gathering the letter is for. A letter is written before its teaching exists, so the
--     date is what ties it to the teaching later (the Title Collections report matches on it).
--   * translation_of links an Español weekly update to the English one it translates, like teachings, devotionals
--     and handouts already do. Deleting the English one only clears the link.
--   * recorded_sent_on marks a letter that went out before it was entered here. It is recorded, not published:
--     nothing is emailed, the current update on the website does not change, and it never shows publicly.
--
-- Existing weekly updates that are linked to a teaching take that teaching's gathering date.

alter table public.weekly_updates
  add column if not exists gathering_date date,
  add column if not exists translation_of uuid references public.weekly_updates(id) on delete set null,
  add column if not exists recorded_sent_on date;

update public.weekly_updates update_row
set gathering_date = teaching.gathering_date
from public.teachings teaching
where update_row.gathering_date is null
  and update_row.teaching_id = teaching.id
  and teaching.gathering_date is not null;

-- A recorded letter is only ever kept out of sight: it is archived, never current.
alter table public.weekly_updates
  drop constraint if exists weekly_updates_recorded_sent_archived_check,
  add constraint weekly_updates_recorded_sent_archived_check check (recorded_sent_on is null or (status = 'archived' and is_current = false));

alter table public.weekly_updates
  drop constraint if exists weekly_updates_not_own_translation_check,
  add constraint weekly_updates_not_own_translation_check check (translation_of is null or translation_of <> id);

create index if not exists weekly_updates_gathering_date_idx
  on public.weekly_updates (gathering_date desc nulls last);
create index if not exists weekly_updates_translation_of_idx
  on public.weekly_updates (translation_of);
