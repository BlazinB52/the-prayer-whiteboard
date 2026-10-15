-- A devotional can have its own gathering date.
--
-- Until now a devotional carried only the date of the teaching it was assigned to, so one that was created but not yet
-- assigned (or assigned to a teaching with no date) showed "No gathering date" and there was nowhere to enter one.
-- gathering_date is the date of the teaching the devotional goes with. When it is empty the lists fall back to the date of
-- the teaching it is assigned to, so nothing that worked before changes.
--
-- Devotionals already assigned to a teaching are filled from that teaching here (the latest date, if more than one).

alter table public.teaching_devotionals add column if not exists gathering_date date;

update public.teaching_devotionals devotional
set gathering_date = dated.latest
from (
  select assignment.devotional_id, max(teaching.gathering_date) as latest
  from public.teaching_devotional_assignments assignment
  join public.teachings teaching on teaching.id = assignment.teaching_id
  where teaching.gathering_date is not null
  group by assignment.devotional_id
) dated
where dated.devotional_id = devotional.id
  and devotional.gathering_date is null;

-- The older owner link, for a devotional with no assignment.
update public.teaching_devotionals devotional
set gathering_date = teaching.gathering_date
from public.teachings teaching
where devotional.gathering_date is null
  and devotional.teaching_id = teaching.id
  and teaching.gathering_date is not null;

create index if not exists teaching_devotionals_gathering_date_idx
  on public.teaching_devotionals (gathering_date desc nulls last);
