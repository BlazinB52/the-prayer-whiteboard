-- Per-Content-Manager proofing for weekly updates.
--
-- 20261010010000 gave a draft ONE shared "OK to publish", so the first Content Manager to submit would
-- have marked it done for everyone and locked the others out. The workflow is really: the Administrator
-- sends the draft to every registered Content Manager, each one gets their own single pass (their own
-- proposed changes through the existing revisions, then a submit that means "OK to publish"), and the
-- Administrator reviews every proof, accepting or rejecting changes from each, then publishes. The
-- Content Managers do not have to approve anything for the Administrator to publish, and once it is
-- published they are out of the loop.
--
-- One row here per Content Manager per draft records that they were sent it and whether they have
-- submitted. Nothing is written to the table directly; every change goes through the functions below.

create table if not exists public.weekly_update_proofings (
  weekly_update_id uuid not null references public.weekly_updates(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text,
  sent_at timestamptz not null default now(),
  submitted_at timestamptz,
  primary key (weekly_update_id, user_id)
);

alter table public.weekly_update_proofings enable row level security;

drop policy if exists "Admins read weekly update proofings" on public.weekly_update_proofings;
create policy "Admins read weekly update proofings"
on public.weekly_update_proofings
for select
using (public.is_authenticated_admin());

drop policy if exists "Content managers read their own weekly update proofings" on public.weekly_update_proofings;
create policy "Content managers read their own weekly update proofings"
on public.weekly_update_proofings
for select
using (user_id = auth.uid() and public.is_content_manager_or_admin());

grant select on public.weekly_update_proofings to authenticated;

-- The shared OK from the first version is replaced by the per-person rows above.
drop function if exists public.set_weekly_update_proofed_ok(uuid, boolean);

alter table public.weekly_updates drop constraint if exists weekly_updates_proofed_after_sent_check;
alter table public.weekly_updates
  drop column if exists proofed_ok_at,
  drop column if exists proofed_ok_by,
  drop column if exists proofed_ok_by_name;

-- Administrator: send the draft to every active Content Manager. Anyone already sent it is left as they
-- are, so this can be run again to reach a Content Manager added later without giving the others a second
-- pass. With p_restart, everyone is given a fresh pass (used when the document itself was replaced).
-- Returns how many Content Managers were sent the draft in total.
create or replace function public.send_weekly_update_for_proofing(p_weekly_update_id uuid, p_restart boolean default false)
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

  if not exists (
    select 1 from public.admin_authorizations aa
    where aa.role = 'content_manager' and aa.is_active = true and aa.revoked_at is null
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
  on conflict (weekly_update_id, user_id) do nothing;

  select count(*) into v_total from public.weekly_update_proofings where weekly_update_id = p_weekly_update_id;
  return v_total;
end;
$$;

-- Administrator: take the draft back from every Content Manager.
create or replace function public.take_back_weekly_update_from_proofing(p_weekly_update_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_authenticated_admin() then
    raise exception 'Only an Administrator can take a weekly update back from proofing.';
  end if;

  delete from public.weekly_update_proofings where weekly_update_id = p_weekly_update_id;
  update public.weekly_updates
  set sent_to_proofing_at = null, sent_to_proofing_by_name = null
  where id = p_weekly_update_id and status = 'draft';
end;
$$;

-- Administrator: when the document itself is replaced, what the Content Managers already proofed is
-- out of date, so everyone who was sent it gets a fresh pass. Does nothing if it was never sent.
create or replace function public.restart_weekly_update_proofing(p_weekly_update_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_authenticated_admin() then
    raise exception 'Only an Administrator can restart proofing.';
  end if;

  update public.weekly_update_proofings
  set submitted_at = null, sent_at = now()
  where weekly_update_id = p_weekly_update_id;
end;
$$;

-- Content Manager: submit your one pass. Submitting is also your OK to publish. It is refused if you
-- were not sent this draft, if you already submitted, or if you still have proposed changes that were not
-- submitted (those are submitted first, through the revision functions).
create or replace function public.submit_weekly_update_proof(p_weekly_update_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not public.is_content_manager_or_admin() then
    raise exception 'Only a Content Manager can submit a proof.';
  end if;

  if exists (
    select 1 from public.content_revisions r
    where r.subject_type = 'weekly_update'
      and r.weekly_update_id = p_weekly_update_id
      and r.submitted_by = v_user
      and r.status = 'draft'
  ) then
    raise exception 'Submit or discard your proposed changes first.';
  end if;

  update public.weekly_update_proofings p
  set submitted_at = now()
  where p.weekly_update_id = p_weekly_update_id
    and p.user_id = v_user
    and p.submitted_at is null
    and exists (select 1 from public.weekly_updates w where w.id = p_weekly_update_id and w.status = 'draft');

  if not found then
    raise exception 'This weekly update is not waiting for your proof.';
  end if;
end;
$$;

revoke all on function public.send_weekly_update_for_proofing(uuid, boolean) from public, anon;
revoke all on function public.take_back_weekly_update_from_proofing(uuid) from public, anon;
revoke all on function public.restart_weekly_update_proofing(uuid) from public, anon;
revoke all on function public.submit_weekly_update_proof(uuid) from public, anon;
grant execute on function public.send_weekly_update_for_proofing(uuid, boolean) to authenticated;
grant execute on function public.take_back_weekly_update_from_proofing(uuid) to authenticated;
grant execute on function public.restart_weekly_update_proofing(uuid) to authenticated;
grant execute on function public.submit_weekly_update_proof(uuid) to authenticated;

-- A draft that was already sent for proofing under the first version has no per-person rows yet. Give
-- every active Content Manager a row for it so it does not disappear from their list.
insert into public.weekly_update_proofings (weekly_update_id, user_id, user_name)
select w.id, aa.user_id,
       coalesce(nullif(trim(aa.display_name), ''), (select u.email from auth.users u where u.id = aa.user_id))
from public.weekly_updates w
cross join public.admin_authorizations aa
where w.status = 'draft'
  and w.sent_to_proofing_at is not null
  and aa.role = 'content_manager' and aa.is_active = true and aa.revoked_at is null
on conflict (weekly_update_id, user_id) do nothing;
