-- "Accept anyway" for teaching revisions.
--
-- A proposal is stale when the teaching's wording changed after it was written. Normally that blocks
-- acceptance so newer work is never overwritten. An Administrator can now accept a stale change on
-- purpose, replacing the current wording with the proposal. Only the Administrator-only review
-- function can do this, only for one change at a time (Accept All never does), and only while the
-- teaching is still a draft. The override is recorded on the change, and the count is kept in the
-- audit row after the wording is deleted.

alter table public.content_revision_changes
  add column if not exists accepted_anyway boolean not null default false;

alter table public.content_revision_changes
  drop constraint if exists content_revision_changes_accepted_anyway_check,
  add constraint content_revision_changes_accepted_anyway_check
    check (accepted_anyway = false or change_status = 'accepted');

alter table public.content_revisions
  add column if not exists overridden_count integer not null default 0;

alter table public.content_revisions
  drop constraint if exists content_revisions_overridden_count_check,
  add constraint content_revisions_overridden_count_check
    check (overridden_count >= 0 and overridden_count <= accepted_count);

-- Same as before, plus the number of changes that were accepted anyway.
create or replace function public.revision_finish_if_done(p_revision_id uuid, p_user_id uuid)
returns boolean
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_pending integer;
  v_accepted integer;
  v_rejected integer;
  v_overridden integer;
  v_name text;
begin
  select count(*) filter (where change_status = 'pending'),
         count(*) filter (where change_status = 'accepted'),
         count(*) filter (where change_status = 'rejected'),
         count(*) filter (where change_status = 'accepted' and accepted_anyway)
  into v_pending, v_accepted, v_rejected, v_overridden
  from public.content_revision_changes
  where revision_id = p_revision_id;

  if v_pending > 0 then
    return false;
  end if;

  v_name := coalesce(
    (select nullif(trim(aa.display_name), '') from public.admin_authorizations aa where aa.user_id = p_user_id),
    (select u.email from auth.users u where u.id = p_user_id)
  );

  update public.content_revisions
  set status = 'completed',
      completed_at = now(),
      completed_by = p_user_id,
      completed_by_name = v_name,
      accepted_count = v_accepted,
      rejected_count = v_rejected,
      overridden_count = v_overridden,
      total_changes = v_accepted + v_rejected,
      purged_at = now()
  where id = p_revision_id;

  delete from public.content_revision_changes where revision_id = p_revision_id;
  return true;
end;
$$;

revoke all on function public.revision_finish_if_done(uuid, uuid) from public, anon, authenticated;

-- The review function gains one optional argument. The old three-argument version is dropped so a
-- call with three arguments can never be ambiguous.
drop function if exists public.review_teaching_revision_change(uuid, text, text);

create or replace function public.review_teaching_revision_change(
  p_change_id uuid,
  p_decision text,
  p_note text default null,
  p_accept_anyway boolean default false
)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_change public.content_revision_changes%rowtype;
  v_rev public.content_revisions%rowtype;
  v_info record;
  v_stale boolean := false;
  v_finished boolean;
begin
  if v_user is null or not public.is_authenticated_admin() then
    raise exception 'Only an Administrator can review proposed changes.' using errcode = '42501';
  end if;
  if p_decision not in ('accept', 'reject') then
    raise exception 'The decision must be accept or reject.' using errcode = '22023';
  end if;
  if p_note is not null and char_length(p_note) > 1000 then
    raise exception 'The note is too long.' using errcode = '22023';
  end if;

  select * into v_change from public.content_revision_changes where id = p_change_id for update;
  if not found then
    raise exception 'That change could not be found.' using errcode = 'P0002';
  end if;
  select * into v_rev from public.content_revisions where id = v_change.revision_id for update;
  if v_rev.status <> 'submitted' then
    raise exception 'This revision is not waiting for review.' using errcode = 'P0001';
  end if;
  if v_change.change_status <> 'pending' then
    raise exception 'That change was already decided.' using errcode = 'P0001';
  end if;

  if p_decision = 'accept' then
    if not exists (select 1 from public.teachings where id = v_rev.teaching_id and status = 'draft') then
      raise exception 'This teaching is no longer a draft, so changes can no longer be applied.' using errcode = 'P0001';
    end if;
    select * into v_info from public.revision_field_info(v_rev.teaching_id, v_change.target_kind, v_change.target_id, v_change.field_key);
    -- Even accepting anyway cannot write into something that no longer exists.
    if not coalesce(v_info.valid, false) then
      raise exception 'stale: The part of the teaching this refers to no longer exists. Reject it.' using errcode = 'P0001';
    end if;
    v_stale := public.revision_normalize_text(v_info.current_value) is distinct from v_change.original_value;
    if v_stale and not coalesce(p_accept_anyway, false) then
      raise exception 'stale: This text changed after the proposal was made. Reject it, accept it anyway to replace the current wording, or ask the editor to submit a new revision.' using errcode = 'P0001';
    end if;
    perform public.revision_apply_value(v_rev.teaching_id, v_change.target_kind, v_change.target_id, v_change.field_key, v_change.proposed_value);
  end if;

  update public.content_revision_changes
  set change_status = case when p_decision = 'accept' then 'accepted' else 'rejected' end,
      accepted_anyway = (p_decision = 'accept' and v_stale),
      reviewed_by = v_user,
      reviewed_at = now(),
      admin_note = nullif(trim(p_note), '')
  where id = p_change_id;

  v_finished := public.revision_finish_if_done(v_rev.id, v_user);
  return jsonb_build_object('revision_id', v_rev.id, 'finished', v_finished, 'accepted_anyway', (p_decision = 'accept' and v_stale));
end;
$$;

revoke all on function public.review_teaching_revision_change(uuid, text, text, boolean) from public, anon;
grant execute on function public.review_teaching_revision_change(uuid, text, text, boolean) to authenticated;
