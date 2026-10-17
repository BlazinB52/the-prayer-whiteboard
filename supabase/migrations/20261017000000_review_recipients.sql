-- Send for review to chosen Content Managers, and to more of them later.
--
-- Until now the gate (sent_for_review_at on a teaching, devotional, outline or handout) was all or nothing: once the
-- Administrator pressed Send, every active Content Manager could see the item. Now the Administrator chooses who it
-- goes to, and can send it to others later, all before it is published. (Weekly updates already did this with one
-- weekly_update_proofings row per person; they only get the choice of people, below.)
--
--   * content_review_recipients: one row per item and Content Manager it was sent to.
--   * sent_for_review_at stays the item-level "out for review" flag. A Content Manager sees an item only if the flag is
--     set AND they have a row here. The flag is still what closes the round: taking back or publishing clears it, and
--     the rows go with it, so "Take back" is still one action for everybody.
--   * Opening the gate without naming anyone (any other code path, an old test) defaults to every active Content
--     Manager, which is exactly what the gate did before.
--   * Items that are already out for review are given a row for every active Content Manager, so nothing disappears.

-- ---------------------------------------------------------------------------
-- Who an item was sent to
-- ---------------------------------------------------------------------------

create table if not exists public.content_review_recipients (
  subject_type text not null,
  subject_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text,
  sent_at timestamptz not null default now(),
  primary key (subject_type, subject_id, user_id),
  constraint content_review_recipients_subject_type_check check (subject_type in ('teaching', 'devotional', 'outline', 'handout'))
);

create index if not exists content_review_recipients_user_idx on public.content_review_recipients (user_id);

alter table public.content_review_recipients enable row level security;

drop policy if exists "Administrators manage review recipients" on public.content_review_recipients;
create policy "Administrators manage review recipients"
on public.content_review_recipients
for all
to authenticated
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

drop policy if exists "People read their own review recipient rows" on public.content_review_recipients;
create policy "People read their own review recipient rows"
on public.content_review_recipients
for select
to authenticated
using (user_id = auth.uid());

revoke all on public.content_review_recipients from public, anon, authenticated;
grant select, insert, delete on public.content_review_recipients to authenticated;
grant select, insert, delete on public.content_review_recipients to service_role;

-- True for an Administrator, or for a Content Manager the item was sent to.
create or replace function public.review_sent_to_me(p_subject_type text, p_subject_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_authenticated_admin()
    or exists (
      select 1 from public.content_review_recipients r
      where r.subject_type = p_subject_type and r.subject_id = p_subject_id and r.user_id = auth.uid()
    );
$$;

revoke all on function public.review_sent_to_me(text, uuid) from public, anon;
grant execute on function public.review_sent_to_me(text, uuid) to authenticated;

-- True when the item is a draft this person may not see. Security definer so it can look at the item itself, which
-- the caller may not be allowed to read; used by the policies on an item's child rows.
create or replace function public.review_item_hidden_from_me(p_subject_type text, p_subject_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_draft boolean;
begin
  if p_subject_type = 'teaching' then
    select (status = 'draft') into v_draft from public.teachings where id = p_subject_id;
  elsif p_subject_type = 'devotional' then
    select (status = 'draft') into v_draft from public.teaching_devotionals where id = p_subject_id;
  else
    return false;
  end if;
  return coalesce(v_draft, false) and not public.review_sent_to_me(p_subject_type, p_subject_id);
end;
$$;

revoke all on function public.review_item_hidden_from_me(text, uuid) from public, anon;
grant execute on function public.review_item_hidden_from_me(text, uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- A Content Manager reads a draft only if it was sent to them
--
-- These are restrictive policies: they narrow what the existing "Content managers read ..." policies allow, and
-- never widen it. Published items, and everything an Administrator reads, are untouched. Only signed-in users are
-- affected; the public site reads as anon.
-- ---------------------------------------------------------------------------

drop policy if exists "Review recipients only: teachings" on public.teachings;
create policy "Review recipients only: teachings" on public.teachings
as restrictive for select to authenticated
using (status is distinct from 'draft' or public.review_sent_to_me('teaching', id));

drop policy if exists "Review recipients only: devotionals" on public.teaching_devotionals;
create policy "Review recipients only: devotionals" on public.teaching_devotionals
as restrictive for select to authenticated
using (status is distinct from 'draft' or public.review_sent_to_me('devotional', id));

drop policy if exists "Review recipients only: outlines" on public.teaching_outlines;
create policy "Review recipients only: outlines" on public.teaching_outlines
as restrictive for select to authenticated
using (status is distinct from 'draft' or public.review_sent_to_me('outline', id));

drop policy if exists "Review recipients only: handouts" on public.teaching_handouts;
create policy "Review recipients only: handouts" on public.teaching_handouts
as restrictive for select to authenticated
using (status is distinct from 'draft' or public.review_sent_to_me('handout', id));

drop policy if exists "Review recipients only: teaching categories" on public.teaching_categories;
create policy "Review recipients only: teaching categories" on public.teaching_categories
as restrictive for select to authenticated
using (not public.review_item_hidden_from_me('teaching', teaching_id));

drop policy if exists "Review recipients only: teaching sections" on public.teaching_sections;
create policy "Review recipients only: teaching sections" on public.teaching_sections
as restrictive for select to authenticated
using (not public.review_item_hidden_from_me('teaching', teaching_id));

drop policy if exists "Review recipients only: devotional days" on public.teaching_devotional_days;
create policy "Review recipients only: devotional days" on public.teaching_devotional_days
as restrictive for select to authenticated
using (not public.review_item_hidden_from_me('devotional', devotional_id));

-- ---------------------------------------------------------------------------
-- Proposals and "reviewed, no changes needed" also need the item to have been sent to the caller
-- ---------------------------------------------------------------------------

create or replace function public.review_is_open(p_subject_type text, p_teaching_id uuid, p_devotional_id uuid, p_weekly_update_id uuid, p_outline_id uuid, p_handout_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if public.is_authenticated_admin() then
    return true;
  end if;
  if p_subject_type = 'teaching' then
    return exists (select 1 from public.teachings where id = p_teaching_id and status = 'draft' and sent_for_review_at is not null)
      and public.review_sent_to_me('teaching', p_teaching_id);
  elsif p_subject_type = 'devotional' then
    return exists (select 1 from public.teaching_devotionals where id = p_devotional_id and status = 'draft' and sent_for_review_at is not null)
      and public.review_sent_to_me('devotional', p_devotional_id);
  elsif p_subject_type = 'weekly_update' then
    return exists (
      select 1
      from public.weekly_update_proofings p
      join public.weekly_updates w on w.id = p.weekly_update_id
      where p.weekly_update_id = p_weekly_update_id and p.user_id = auth.uid() and w.status = 'draft'
    );
  elsif p_subject_type = 'outline' then
    return exists (select 1 from public.teaching_outlines where id = p_outline_id and status = 'draft' and sent_for_review_at is not null)
      and public.review_sent_to_me('outline', p_outline_id);
  elsif p_subject_type = 'handout' then
    return exists (select 1 from public.teaching_handouts where id = p_handout_id and status = 'draft' and sent_for_review_at is not null)
      and public.review_sent_to_me('handout', p_handout_id);
  end if;
  return false;
end;
$$;

revoke all on function public.review_is_open(text, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.review_subject_is_sent_draft(p_subject_type text, p_subject_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_subject_type = 'teaching' then
    return exists (select 1 from public.teachings where id = p_subject_id and status = 'draft' and sent_for_review_at is not null)
      and public.review_sent_to_me('teaching', p_subject_id);
  elsif p_subject_type = 'devotional' then
    return exists (select 1 from public.teaching_devotionals where id = p_subject_id and status = 'draft' and sent_for_review_at is not null)
      and public.review_sent_to_me('devotional', p_subject_id);
  elsif p_subject_type = 'outline' then
    return exists (select 1 from public.teaching_outlines where id = p_subject_id and status = 'draft' and sent_for_review_at is not null)
      and public.review_sent_to_me('outline', p_subject_id);
  elsif p_subject_type = 'handout' then
    return exists (select 1 from public.teaching_handouts where id = p_subject_id and status = 'draft' and sent_for_review_at is not null)
      and public.review_sent_to_me('handout', p_subject_id);
  end if;
  return false;
end;
$$;

-- ---------------------------------------------------------------------------
-- The rows follow the round
-- ---------------------------------------------------------------------------

-- When the gate opens and nobody was named, send it to every active Content Manager (what the gate always did).
create or replace function public.default_review_recipients_when_gate_opens()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status = 'draft' and new.sent_for_review_at is not null
     and not exists (select 1 from public.content_review_recipients r where r.subject_type = tg_argv[0] and r.subject_id = new.id) then
    insert into public.content_review_recipients (subject_type, subject_id, user_id, user_name, sent_at)
    select tg_argv[0], new.id, aa.user_id,
           coalesce(nullif(trim(aa.display_name), ''), (select u.email from auth.users u where u.id = aa.user_id)),
           new.sent_for_review_at
    from public.admin_authorizations aa
    where aa.role = 'content_manager' and aa.is_active = true and aa.revoked_at is null
    on conflict do nothing;
  end if;
  return new;
end;
$$;

-- The rows end with the round: when the item is no longer a draft that is out for review, or is deleted.
create or replace function public.clear_review_recipients_when_round_ends()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.content_review_recipients where subject_type = tg_argv[0] and subject_id = old.id;
    return old;
  end if;
  if new.status <> 'draft' or new.sent_for_review_at is null then
    delete from public.content_review_recipients where subject_type = tg_argv[0] and subject_id = new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.default_review_recipients_when_gate_opens() from public, anon, authenticated;
revoke all on function public.clear_review_recipients_when_round_ends() from public, anon, authenticated;

drop trigger if exists teachings_default_review_recipients on public.teachings;
create trigger teachings_default_review_recipients
after insert or update of sent_for_review_at on public.teachings
for each row when (new.sent_for_review_at is not null)
execute function public.default_review_recipients_when_gate_opens('teaching');

drop trigger if exists teaching_devotionals_default_review_recipients on public.teaching_devotionals;
create trigger teaching_devotionals_default_review_recipients
after insert or update of sent_for_review_at on public.teaching_devotionals
for each row when (new.sent_for_review_at is not null)
execute function public.default_review_recipients_when_gate_opens('devotional');

drop trigger if exists teaching_outlines_default_review_recipients on public.teaching_outlines;
create trigger teaching_outlines_default_review_recipients
after insert or update of sent_for_review_at on public.teaching_outlines
for each row when (new.sent_for_review_at is not null)
execute function public.default_review_recipients_when_gate_opens('outline');

drop trigger if exists teaching_handouts_default_review_recipients on public.teaching_handouts;
create trigger teaching_handouts_default_review_recipients
after insert or update of sent_for_review_at on public.teaching_handouts
for each row when (new.sent_for_review_at is not null)
execute function public.default_review_recipients_when_gate_opens('handout');

drop trigger if exists teachings_clear_review_recipients on public.teachings;
create trigger teachings_clear_review_recipients
after update of status, sent_for_review_at or delete on public.teachings
for each row execute function public.clear_review_recipients_when_round_ends('teaching');

drop trigger if exists teaching_devotionals_clear_review_recipients on public.teaching_devotionals;
create trigger teaching_devotionals_clear_review_recipients
after update of status, sent_for_review_at or delete on public.teaching_devotionals
for each row execute function public.clear_review_recipients_when_round_ends('devotional');

drop trigger if exists teaching_outlines_clear_review_recipients on public.teaching_outlines;
create trigger teaching_outlines_clear_review_recipients
after update of status, sent_for_review_at or delete on public.teaching_outlines
for each row execute function public.clear_review_recipients_when_round_ends('outline');

drop trigger if exists teaching_handouts_clear_review_recipients on public.teaching_handouts;
create trigger teaching_handouts_clear_review_recipients
after update of status, sent_for_review_at or delete on public.teaching_handouts
for each row execute function public.clear_review_recipients_when_round_ends('handout');

-- Everything already out for review stays visible to every active Content Manager.
insert into public.content_review_recipients (subject_type, subject_id, user_id, user_name, sent_at)
select s.subject_type, s.id, aa.user_id,
       coalesce(nullif(trim(aa.display_name), ''), (select u.email from auth.users u where u.id = aa.user_id)),
       s.sent_at
from (
  select 'teaching'::text as subject_type, id, sent_for_review_at as sent_at from public.teachings where status = 'draft' and sent_for_review_at is not null
  union all
  select 'devotional', id, sent_for_review_at from public.teaching_devotionals where status = 'draft' and sent_for_review_at is not null
  union all
  select 'outline', id, sent_for_review_at from public.teaching_outlines where status = 'draft' and sent_for_review_at is not null
  union all
  select 'handout', id, sent_for_review_at from public.teaching_handouts where status = 'draft' and sent_for_review_at is not null
) s
cross join public.admin_authorizations aa
where aa.role = 'content_manager' and aa.is_active = true and aa.revoked_at is null
on conflict do nothing;

-- ---------------------------------------------------------------------------
-- Weekly updates: send to chosen people
--
-- The new optional list names who to send to; leaving it out sends to every active Content Manager, as before.
-- Sending again with other people adds them and never gives anyone a second pass.
-- ---------------------------------------------------------------------------

drop function if exists public.send_weekly_update_for_proofing(uuid, boolean);

create or replace function public.send_weekly_update_for_proofing(p_weekly_update_id uuid, p_restart boolean default false, p_user_ids uuid[] default null)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_admin_name text;
  v_total integer;
begin
  if v_user is null or not public.is_authenticated_admin() then
    raise exception 'Only an Administrator can send a weekly update for proofing.';
  end if;

  if not exists (select 1 from public.weekly_updates where id = p_weekly_update_id and status = 'draft') then
    raise exception 'Only a draft can be sent for proofing.';
  end if;

  if p_user_ids is not null and coalesce(array_length(p_user_ids, 1), 0) = 0 then
    raise exception 'Choose at least one Content Manager to send it to.';
  end if;

  if not exists (
    select 1 from public.admin_authorizations aa
    where aa.role = 'content_manager' and aa.is_active = true and aa.revoked_at is null
      and (p_user_ids is null or aa.user_id = any(p_user_ids))
  ) then
    raise exception 'There are no Content Managers to send it to.';
  end if;

  v_admin_name := coalesce(
    (select nullif(trim(aa.display_name), '') from public.admin_authorizations aa where aa.user_id = v_user),
    (select u.email from auth.users u where u.id = v_user)
  );

  update public.weekly_updates
  set sent_to_proofing_at = coalesce(sent_to_proofing_at, now()),
      sent_to_proofing_by_name = coalesce(sent_to_proofing_by_name, v_admin_name)
  where id = p_weekly_update_id;

  if p_restart then
    update public.weekly_update_proofings
    set submitted_at = null, sent_at = now()
    where weekly_update_id = p_weekly_update_id;
  end if;

  insert into public.weekly_update_proofings (weekly_update_id, user_id, user_name)
  select p_weekly_update_id, aa.user_id,
         coalesce(nullif(trim(aa.display_name), ''), (select u.email from auth.users u where u.id = aa.user_id))
  from public.admin_authorizations aa
  where aa.role = 'content_manager' and aa.is_active = true and aa.revoked_at is null
    and (p_user_ids is null or aa.user_id = any(p_user_ids))
  on conflict (weekly_update_id, user_id) do nothing;

  select count(*) into v_total from public.weekly_update_proofings where weekly_update_id = p_weekly_update_id;
  return v_total;
end;
$$;

revoke all on function public.send_weekly_update_for_proofing(uuid, boolean, uuid[]) from public, anon;
grant execute on function public.send_weekly_update_for_proofing(uuid, boolean, uuid[]) to authenticated;
