-- Keep the wording of finished revisions until the Administrator clears the history.
--
-- Until now the proposed and original wording of a revision was deleted the moment its last change was
-- decided, when it was closed, or when its content was published, and only the counts were kept. The
-- Administrator wants to open a finished record and see what was accepted and rejected, so the wording
-- now stays with the record. It goes away when the history is cleared: purge_revision_history deletes the
-- revision rows, and the changes go with them (content_revision_changes.revision_id is on delete cascade).
--
-- One thing is still deleted straight away: the unsubmitted draft of a Content Manager who never sent it.
-- That was private scratch work that the Administrator never saw, so there is nothing to keep.
--
-- purged_at keeps its meaning of "the wording has been deleted". It is no longer set for records whose
-- wording is kept, which is also how older records (already purged) are told apart from newer ones.

-- When the last change is decided, the revision is finished but keeps its changes.
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
      total_changes = v_accepted + v_rejected
  where id = p_revision_id;

  return true;
end;
$$;

revoke all on function public.revision_finish_if_done(uuid, uuid) from public, anon, authenticated;

-- The Administrator closes a revision without deciding it. The changes are kept, except for a draft the
-- editor never submitted.
create or replace function public.cancel_teaching_revision(p_revision_id uuid, p_note text default null)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_rev public.content_revisions%rowtype;
  v_count integer;
begin
  if v_user is null or not public.is_authenticated_admin() then
    raise exception 'Only an Administrator can close a revision.' using errcode = '42501';
  end if;
  select * into v_rev from public.content_revisions where id = p_revision_id for update;
  if not found then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.status not in ('draft', 'submitted') then
    raise exception 'This revision is already closed.' using errcode = 'P0001';
  end if;
  select count(*) into v_count from public.content_revision_changes where revision_id = p_revision_id;
  if v_rev.status = 'draft' then
    delete from public.content_revision_changes where revision_id = p_revision_id;
  end if;
  update public.content_revisions
  set status = 'cancelled',
      completed_at = now(),
      completed_by = v_user,
      completed_by_name = coalesce(
        (select nullif(trim(aa.display_name), '') from public.admin_authorizations aa where aa.user_id = v_user),
        (select u.email from auth.users u where u.id = v_user)
      ),
      review_note = nullif(trim(p_note), ''),
      total_changes = v_count,
      purged_at = case when v_rev.status = 'draft' then now() else purged_at end
  where id = p_revision_id;
end;
$$;

revoke all on function public.cancel_teaching_revision(uuid, text) from public, anon;
grant execute on function public.cancel_teaching_revision(uuid, text) to authenticated;

-- Publishing closes whatever is still open. A revision that was submitted keeps its changes (decided
-- or not) for the record; an unsubmitted draft is discarded.
create or replace function public.close_teaching_revisions_on_publish()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    delete from public.content_revision_changes c
    using public.content_revisions r
    where c.revision_id = r.id and r.subject_type = 'teaching' and r.teaching_id = new.id and r.status = 'draft';

    update public.content_revisions r
    set status = 'cancelled',
        completed_at = now(),
        review_note = coalesce(r.review_note, 'Closed when the teaching was published.'),
        total_changes = (select count(*) from public.content_revision_changes c where c.revision_id = r.id),
        purged_at = case when r.status = 'draft' then now() else r.purged_at end
    where r.subject_type = 'teaching' and r.teaching_id = new.id and r.status in ('draft', 'submitted');
  end if;
  return new;
end;
$$;

create or replace function public.close_devotional_revisions_on_publish()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    delete from public.content_revision_changes c
    using public.content_revisions r
    where c.revision_id = r.id and r.subject_type = 'devotional' and r.devotional_id = new.id and r.status = 'draft';

    update public.content_revisions r
    set status = 'cancelled',
        completed_at = now(),
        review_note = coalesce(r.review_note, 'Closed when the devotional was published.'),
        total_changes = (select count(*) from public.content_revision_changes c where c.revision_id = r.id),
        purged_at = case when r.status = 'draft' then now() else r.purged_at end
    where r.subject_type = 'devotional' and r.devotional_id = new.id and r.status in ('draft', 'submitted');
  end if;
  return new;
end;
$$;

create or replace function public.close_weekly_update_revisions_on_publish()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    delete from public.content_revision_changes c
    using public.content_revisions r
    where c.revision_id = r.id and r.subject_type = 'weekly_update' and r.weekly_update_id = new.id and r.status = 'draft';

    update public.content_revisions r
    set status = 'cancelled',
        completed_at = now(),
        review_note = coalesce(r.review_note, 'Closed when the weekly update was published.'),
        total_changes = (select count(*) from public.content_revision_changes c where c.revision_id = r.id),
        purged_at = case when r.status = 'draft' then now() else r.purged_at end
    where r.subject_type = 'weekly_update' and r.weekly_update_id = new.id and r.status in ('draft', 'submitted');
  end if;
  return new;
end;
$$;

revoke all on function public.close_teaching_revisions_on_publish() from public, anon, authenticated;
revoke all on function public.close_devotional_revisions_on_publish() from public, anon, authenticated;
revoke all on function public.close_weekly_update_revisions_on_publish() from public, anon, authenticated;
