-- Proofing step for weekly updates.
--
-- Workflow for a draft: the Administrator uploads it and reviews it, then sends it to the Content
-- Managers for proofing (sent_to_proofing_at). A Content Manager reads it, proposes any corrections
-- through the existing revisions, and marks it OK to publish (proofed_ok_at). The Administrator sees
-- the OK, handles any proposed changes, marks it ready to publish (ready_to_publish_at, which already
-- exists), and finally publishes it, which is what emails it to subscribers.
--
-- These columns are only notes about where the draft is in that process. None of them publishes or
-- emails anything. They are left in place after publishing as a record of who proofed it.

alter table public.weekly_updates
  add column if not exists sent_to_proofing_at timestamptz,
  add column if not exists sent_to_proofing_by_name text,
  add column if not exists proofed_ok_at timestamptz,
  add column if not exists proofed_ok_by uuid references auth.users(id) on delete set null,
  add column if not exists proofed_ok_by_name text;

alter table public.weekly_updates
  drop constraint if exists weekly_updates_proofed_after_sent_check,
  add constraint weekly_updates_proofed_after_sent_check
    check (proofed_ok_at is null or sent_to_proofing_at is not null);

-- A Content Manager marks a draft OK to publish, or withdraws that. They have no write access to the
-- table, so this function is the only way in: it checks who is calling and that the draft has been
-- sent for proofing. Withdrawing the OK also removes the Administrator's ready mark, since that was
-- based on the OK.
create or replace function public.set_weekly_update_proofed_ok(p_weekly_update_id uuid, p_ok boolean)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_name text;
begin
  if v_user is null or not public.is_content_manager_or_admin() then
    raise exception 'Only a Content Manager or Administrator can do this.';
  end if;

  -- Proposed changes that were never submitted would be left behind, so ask for them to be dealt
  -- with first rather than let the OK be given on an unfinished review.
  if p_ok and exists (
    select 1 from public.content_revisions r
    where r.subject_type = 'weekly_update'
      and r.weekly_update_id = p_weekly_update_id
      and r.submitted_by = v_user
      and r.status = 'draft'
  ) then
    raise exception 'Submit or discard your proposed changes first.';
  end if;

  v_name := coalesce(
    (select nullif(trim(aa.display_name), '') from public.admin_authorizations aa where aa.user_id = v_user),
    (select u.email from auth.users u where u.id = v_user)
  );

  update public.weekly_updates
  set proofed_ok_at = case when p_ok then now() else null end,
      proofed_ok_by = case when p_ok then v_user else null end,
      proofed_ok_by_name = case when p_ok then v_name else null end,
      ready_to_publish_at = case when p_ok then ready_to_publish_at else null end
  where id = p_weekly_update_id
    and status = 'draft'
    and sent_to_proofing_at is not null;

  if not found then
    raise exception 'This weekly update is not waiting for proofing.';
  end if;
end;
$$;

revoke all on function public.set_weekly_update_proofed_ok(uuid, boolean) from public;
grant execute on function public.set_weekly_update_proofed_ok(uuid, boolean) to authenticated;
