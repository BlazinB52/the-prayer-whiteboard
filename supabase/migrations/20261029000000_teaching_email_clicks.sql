-- Who clicked "Read the Full Teaching" in a teaching email.
--
-- The teaching email carries a teaser and a button. The button points at a signed per-subscriber link
-- (/api/email/teaching-click) that records the click here and then sends the reader to the teaching.
-- Unlike an open pixel, a row exists only when a person followed the link. One row per subscriber per
-- teaching: later clicks only bump click_count and last_clicked_at.

create table if not exists public.email_teaching_clicks (
  teaching_id uuid not null references public.teachings(id) on delete cascade,
  subscriber_id uuid not null references public.email_subscribers(id) on delete cascade,
  click_count integer not null default 1,
  first_clicked_at timestamptz not null default now(),
  last_clicked_at timestamptz not null default now(),
  primary key (teaching_id, subscriber_id),
  constraint email_teaching_clicks_click_count_check check (click_count >= 1)
);

alter table public.email_teaching_clicks enable row level security;

drop policy if exists "Admins read teaching email clicks" on public.email_teaching_clicks;
create policy "Admins read teaching email clicks"
on public.email_teaching_clicks
for select
using (public.is_authenticated_admin());

grant select on public.email_teaching_clicks to authenticated;
grant select, insert, update on public.email_teaching_clicks to service_role;

-- One atomic upsert, so two quick clicks from the same subscriber cannot lose a count.
create or replace function public.record_teaching_email_click(p_teaching_id uuid, p_subscriber_id uuid)
returns void
language sql
security invoker
set search_path = public
as $$
  insert into public.email_teaching_clicks (teaching_id, subscriber_id)
  values (p_teaching_id, p_subscriber_id)
  on conflict (teaching_id, subscriber_id) do update
    set click_count = public.email_teaching_clicks.click_count + 1,
        last_clicked_at = now();
$$;

revoke all on function public.record_teaching_email_click(uuid, uuid) from public;
grant execute on function public.record_teaching_email_click(uuid, uuid) to service_role;
