-- Let an editor take a submitted revision back to continue working on it, as long as no Administrator
-- has started reviewing it.
--
-- "Started reviewing" means an Administrator opened the revision page. That is recorded once in
-- admin_opened_at by mark_revision_opened(). A recall is refused when admin_opened_at is set, or when
-- any change already has a decision, so the database is the guard even if the button is still on screen.
--
-- These two functions work on any subject type (teaching, devotional, weekly update), because all of
-- them share content_revisions.

alter table public.content_revisions
  add column if not exists admin_opened_at timestamptz;

-- Called when an Administrator opens a submitted revision. Only the first call is recorded.
create or replace function public.mark_revision_opened(p_revision_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_authenticated_admin() then
    raise exception 'Only an Administrator can open a revision for review.' using errcode = '42501';
  end if;
  update public.content_revisions
  set admin_opened_at = now()
  where id = p_revision_id and status = 'submitted' and admin_opened_at is null;
end;
$$;

-- Turns the caller's own submitted revision back into a draft, with every saved change kept.
create or replace function public.recall_revision(p_revision_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_rev public.content_revisions%rowtype;
begin
  if v_user is null or not public.is_content_manager_or_admin() then
    raise exception 'You are not allowed to change revisions.' using errcode = '42501';
  end if;

  select * into v_rev from public.content_revisions where id = p_revision_id for update;
  if not found then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.submitted_by is distinct from v_user then
    raise exception 'Only the person who submitted a revision can take it back.' using errcode = '42501';
  end if;
  if v_rev.status <> 'submitted' then
    raise exception 'Only a revision that is waiting for review can be taken back.' using errcode = 'P0001';
  end if;
  if v_rev.admin_opened_at is not null
     or exists (select 1 from public.content_revision_changes where revision_id = p_revision_id and change_status <> 'pending') then
    raise exception 'An Administrator has already started reviewing this, so it can no longer be taken back.' using errcode = 'P0001';
  end if;
  if exists (
    select 1 from public.content_revisions r
    where r.status = 'draft'
      and r.submitted_by = v_user
      and r.subject_type = v_rev.subject_type
      and r.teaching_id is not distinct from v_rev.teaching_id
      and r.devotional_id is not distinct from v_rev.devotional_id
      and r.weekly_update_id is not distinct from v_rev.weekly_update_id
  ) then
    raise exception 'You already have a newer draft of this. Submit or discard it first, then take this one back.' using errcode = 'P0001';
  end if;

  update public.content_revisions
  set status = 'draft', submitted_at = null, total_changes = 0
  where id = p_revision_id;
end;
$$;

revoke all on function public.mark_revision_opened(uuid) from public, anon;
revoke all on function public.recall_revision(uuid) from public, anon;
grant execute on function public.mark_revision_opened(uuid) to authenticated;
grant execute on function public.recall_revision(uuid) to authenticated;
