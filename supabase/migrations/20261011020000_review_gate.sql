-- The review gate: Content Managers see nothing until the Administrator sends it.
--
-- Until now every draft teaching, devotional and weekly update was visible to Content Managers the moment
-- it existed, so they could open (and start proposing changes to) something the Administrator was still
-- working on. Now a draft is invisible to them until the Administrator presses "Send to Content Managers
-- for review", and it can be taken back again.
--
--   * teachings and devotionals get sent_for_review_at (null = not sent). It is cleared when the item
--     leaves draft, so publishing closes the gate.
--   * weekly updates already have their own per-person gate (sent_to_proofing_at and one row per Content
--     Manager in weekly_update_proofings, 20261010020000). This migration only makes the database enforce
--     it, so a Content Manager can no longer read a weekly update that was not sent to them.
--
-- Nothing a Content Manager can reach (reading the draft, starting a proposal, saving changes, submitting)
-- works on an item that is not currently sent to them. Administrators are never affected.

-- ---------------------------------------------------------------------------
-- The gate on teachings and devotionals
-- ---------------------------------------------------------------------------

alter table public.teachings add column if not exists sent_for_review_at timestamptz;
alter table public.teaching_devotionals add column if not exists sent_for_review_at timestamptz;

create or replace function public.clear_review_gate_when_published()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.sent_for_review_at := null;
  return new;
end;
$$;

drop trigger if exists teachings_clear_review_gate on public.teachings;
create trigger teachings_clear_review_gate
before update of status on public.teachings
for each row
when (new.status <> 'draft' and new.sent_for_review_at is not null)
execute function public.clear_review_gate_when_published();

drop trigger if exists teaching_devotionals_clear_review_gate on public.teaching_devotionals;
create trigger teaching_devotionals_clear_review_gate
before update of status on public.teaching_devotionals
for each row
when (new.status <> 'draft' and new.sent_for_review_at is not null)
execute function public.clear_review_gate_when_published();

alter table public.teachings
  drop constraint if exists teachings_review_gate_drafts_only_check,
  add constraint teachings_review_gate_drafts_only_check check (sent_for_review_at is null or status = 'draft');
alter table public.teaching_devotionals
  drop constraint if exists teaching_devotionals_review_gate_drafts_only_check,
  add constraint teaching_devotionals_review_gate_drafts_only_check check (sent_for_review_at is null or status = 'draft');

-- Work a Content Manager has already started must not vanish when the gate arrives, so anything with an
-- open proposal counts as already sent. Everything else starts hidden.
update public.teachings t
set sent_for_review_at = now()
where t.status = 'draft'
  and t.sent_for_review_at is null
  and exists (select 1 from public.content_revisions r where r.subject_type = 'teaching' and r.teaching_id = t.id and r.status in ('draft', 'submitted'));

update public.teaching_devotionals d
set sent_for_review_at = now()
where d.status = 'draft'
  and d.sent_for_review_at is null
  and exists (select 1 from public.content_revisions r where r.subject_type = 'devotional' and r.devotional_id = d.id and r.status in ('draft', 'submitted'));

-- ---------------------------------------------------------------------------
-- What a Content Manager may read: only drafts that were sent
-- ---------------------------------------------------------------------------

drop policy if exists "Content managers read draft teachings" on public.teachings;
create policy "Content managers read draft teachings"
on public.teachings
for select
to authenticated
using (public.is_content_manager_or_admin() and status = 'draft' and sent_for_review_at is not null);

drop policy if exists "Content managers read draft teaching categories" on public.teaching_categories;
create policy "Content managers read draft teaching categories"
on public.teaching_categories
for select
to authenticated
using (
  public.is_content_manager_or_admin()
  and status = 'draft'
  and exists (select 1 from public.teachings t where t.id = teaching_categories.teaching_id and t.status = 'draft' and t.sent_for_review_at is not null)
);

drop policy if exists "Content managers read draft teaching sections" on public.teaching_sections;
create policy "Content managers read draft teaching sections"
on public.teaching_sections
for select
to authenticated
using (
  public.is_content_manager_or_admin()
  and status = 'draft'
  and exists (select 1 from public.teachings t where t.id = teaching_sections.teaching_id and t.status = 'draft' and t.sent_for_review_at is not null)
);

drop policy if exists "Content managers read draft devotionals" on public.teaching_devotionals;
create policy "Content managers read draft devotionals"
on public.teaching_devotionals
for select
to authenticated
using (public.is_content_manager_or_admin() and status = 'draft' and sent_for_review_at is not null);

drop policy if exists "Content managers read draft devotional days" on public.teaching_devotional_days;
create policy "Content managers read draft devotional days"
on public.teaching_devotional_days
for select
to authenticated
using (
  public.is_content_manager_or_admin()
  and exists (select 1 from public.teaching_devotionals d where d.id = teaching_devotional_days.devotional_id and d.status = 'draft' and d.sent_for_review_at is not null)
);

-- A weekly update is readable by a Content Manager only if it was sent to that person.
drop policy if exists "Content managers read draft weekly updates" on public.weekly_updates;
create policy "Content managers read draft weekly updates"
on public.weekly_updates
for select
to authenticated
using (
  public.is_content_manager_or_admin()
  and status = 'draft'
  and exists (select 1 from public.weekly_update_proofings p where p.weekly_update_id = weekly_updates.id and p.user_id = auth.uid())
);

-- ---------------------------------------------------------------------------
-- The gate on proposals: nothing can be started, saved or submitted on something not sent
-- ---------------------------------------------------------------------------

create or replace function public.review_is_open(p_subject_type text, p_teaching_id uuid, p_devotional_id uuid, p_weekly_update_id uuid)
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
    return exists (select 1 from public.teachings where id = p_teaching_id and status = 'draft' and sent_for_review_at is not null);
  elsif p_subject_type = 'devotional' then
    return exists (select 1 from public.teaching_devotionals where id = p_devotional_id and status = 'draft' and sent_for_review_at is not null);
  elsif p_subject_type = 'weekly_update' then
    return exists (
      select 1
      from public.weekly_update_proofings p
      join public.weekly_updates w on w.id = p.weekly_update_id
      where p.weekly_update_id = p_weekly_update_id and p.user_id = auth.uid() and w.status = 'draft'
    );
  end if;
  return false;
end;
$$;

revoke all on function public.review_is_open(text, uuid, uuid, uuid) from public, anon, authenticated;

create or replace function public.revision_require_open_review()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_rev public.content_revisions%rowtype;
begin
  if tg_table_name = 'content_revision_changes' then
    select * into v_rev from public.content_revisions where id = new.revision_id;
  else
    v_rev := new;
  end if;

  if not public.review_is_open(v_rev.subject_type, v_rev.teaching_id, v_rev.devotional_id, v_rev.weekly_update_id) then
    raise exception 'This has not been sent to you for review, or was taken back by the Administrator.' using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists content_revisions_require_open_review on public.content_revisions;
create trigger content_revisions_require_open_review
before insert on public.content_revisions
for each row execute function public.revision_require_open_review();

drop trigger if exists content_revisions_require_open_review_on_submit on public.content_revisions;
create trigger content_revisions_require_open_review_on_submit
before update of status on public.content_revisions
for each row
when (new.status = 'submitted' and old.status is distinct from 'submitted')
execute function public.revision_require_open_review();

drop trigger if exists content_revision_changes_require_open_review on public.content_revision_changes;
create trigger content_revision_changes_require_open_review
before insert on public.content_revision_changes
for each row execute function public.revision_require_open_review();

-- The weekly update editor reads its fields through this function; it must not hand out a draft that was
-- not sent to the caller.
create or replace function public.weekly_update_review_fields(p_weekly_update_id uuid)
returns table (
  field_key text,
  label text,
  context text,
  current_value text,
  max_length integer,
  multiline boolean,
  field_rows integer,
  formatted boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if auth.uid() is null or not public.is_content_manager_or_admin() then
    raise exception 'You are not allowed to review weekly updates.' using errcode = '42501';
  end if;
  if not public.review_is_open('weekly_update', null, null, p_weekly_update_id) then
    raise exception 'This weekly update has not been sent to you for review.' using errcode = '42501';
  end if;
  return query select * from public.revision_weekly_fields(p_weekly_update_id);
end;
$$;

revoke all on function public.weekly_update_review_fields(uuid) from public, anon;
grant execute on function public.weekly_update_review_fields(uuid) to authenticated;
