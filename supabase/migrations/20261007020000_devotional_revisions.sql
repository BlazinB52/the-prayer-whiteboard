-- Word-style review for devotionals.
--
-- Same rules as the teaching review (20261006030000_content_revisions.sql): a co-editor (the content
-- manager role) proposes text changes to a DRAFT devotional, an Administrator accepts or rejects each
-- change, and only an accepted change is written to the devotional, in the same transaction as the
-- decision. Proposals live only in content_revisions / content_revision_changes and are never read by
-- a public page. When a review is finished, closed, or its devotional is published, the proposed and
-- original wording is deleted and only the small audit row stays.
--
-- What a co-editor can propose: the devotional's title and introduction, and for each of its seven
-- days the title, anchor scriptures (one per line), devotional reading, confession, journal prompt and
-- prayer activation. Everything else (publishing, language, slug, which teaching it belongs to, adding
-- or removing days) stays Administrator-only.
--
-- The generic functions from the teaching review keep working for devotional revisions where they do
-- not depend on the subject: discard_teaching_revision (the editor's own draft),
-- cancel_teaching_revision (Administrator closes without deciding) and purge_revision_history.

-- ---------------------------------------------------------------------------
-- Tables: allow devotional targets
-- ---------------------------------------------------------------------------

alter table public.content_revision_changes
  drop constraint if exists content_revision_changes_target_kind_check,
  add constraint content_revision_changes_target_kind_check
    check (target_kind in ('teaching', 'category', 'section', 'devotional', 'day'));

alter table public.content_revision_changes
  drop constraint if exists content_revision_changes_target_check,
  add constraint content_revision_changes_target_check
    check (
      (target_kind in ('teaching', 'devotional') and target_id is null)
      or (target_kind in ('category', 'section', 'day') and target_id is not null)
    );

-- One open draft per editor per devotional.
create unique index if not exists content_revisions_one_devotional_draft_per_editor_idx
  on public.content_revisions (devotional_id, submitted_by)
  where status = 'draft' and subject_type = 'devotional';

create index if not exists content_revisions_devotional_idx
  on public.content_revisions (devotional_id);

-- Co-editors read draft devotionals (and nothing else) so they can see the wording they are
-- reviewing. This adds read access only; they still cannot write to these tables.
drop policy if exists "Content managers read draft devotionals" on public.teaching_devotionals;
create policy "Content managers read draft devotionals"
on public.teaching_devotionals
for select
to authenticated
using (public.is_content_manager_or_admin() and status = 'draft');

drop policy if exists "Content managers read draft devotional days" on public.teaching_devotional_days;
create policy "Content managers read draft devotional days"
on public.teaching_devotional_days
for select
to authenticated
using (
  public.is_content_manager_or_admin()
  and exists (select 1 from public.teaching_devotionals d where d.id = teaching_devotional_days.devotional_id and d.status = 'draft')
);

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by the app roles)
-- ---------------------------------------------------------------------------

-- Describes one editable field of a draft devotional: whether it exists for this target, its current
-- wording, and its length limit. The limits match the ones the admin devotional editor enforces.
create or replace function public.revision_devotional_field_info(
  p_devotional_id uuid,
  p_kind text,
  p_target_id uuid,
  p_field text,
  out valid boolean,
  out current_value text,
  out max_length integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_title text;
  v_intro text;
  v_day public.teaching_devotional_days%rowtype;
begin
  valid := false;
  current_value := null;
  max_length := 0;

  if p_kind = 'devotional' then
    if p_target_id is not null or p_field not in ('title', 'introduction') then return; end if;
    select d.title, d.introduction into v_title, v_intro
    from public.teaching_devotionals d
    where d.id = p_devotional_id and d.status = 'draft';
    if not found then return; end if;
    valid := true;
    current_value := case p_field when 'title' then v_title else v_intro end;
    max_length := case p_field when 'title' then 180 else 8000 end;
    return;
  end if;

  if p_kind = 'day' then
    if p_target_id is null then return; end if;
    select dd.* into v_day
    from public.teaching_devotional_days dd
    join public.teaching_devotionals d on d.id = dd.devotional_id
    where dd.id = p_target_id and dd.devotional_id = p_devotional_id and d.status = 'draft';
    if not found then return; end if;

    if p_field = 'title' then
      valid := true; current_value := v_day.title; max_length := 180; return;
    elsif p_field = 'anchor_scriptures' then
      valid := true; current_value := array_to_string(v_day.anchor_scriptures, E'\n'); max_length := 20019; return;
    elsif p_field = 'devotional_reading' then
      valid := true; current_value := v_day.devotional_reading; max_length := 12000; return;
    elsif p_field = 'confession' then
      valid := true; current_value := v_day.confession; max_length := 3000; return;
    elsif p_field = 'journal_prompt' then
      valid := true; current_value := v_day.journal_prompt; max_length := 3000; return;
    elsif p_field = 'prayer_activation' then
      valid := true; current_value := v_day.prayer_activation; max_length := 3000; return;
    end if;
  end if;
end;
$$;

-- Writes one approved value into the devotional. Every branch writes exactly one known column, so
-- nothing the caller supplies is ever used as a column name.
create or replace function public.revision_devotional_apply_value(
  p_devotional_id uuid,
  p_kind text,
  p_target_id uuid,
  p_field text,
  p_value text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_value text := public.revision_normalize_text(p_value);
  v_rows integer;
  v_scriptures text[];
begin
  if p_kind = 'devotional' then
    if p_field = 'title' then
      if v_value = '' then raise exception 'The devotional title cannot be empty.'; end if;
      update public.teaching_devotionals set title = v_value where id = p_devotional_id and status = 'draft';
    elsif p_field = 'introduction' then
      update public.teaching_devotionals set introduction = nullif(v_value, '') where id = p_devotional_id and status = 'draft';
    else
      raise exception 'That devotional field cannot be changed through review.';
    end if;
    get diagnostics v_rows = row_count;
  elsif p_kind = 'day' then
    if p_field = 'title' then
      update public.teaching_devotional_days dd set title = v_value
      from public.teaching_devotionals d
      where dd.id = p_target_id and dd.devotional_id = p_devotional_id and d.id = dd.devotional_id and d.status = 'draft';
    elsif p_field = 'anchor_scriptures' then
      select coalesce(array_agg(trim(line)) filter (where trim(line) <> ''), array[]::text[])
      into v_scriptures
      from unnest(string_to_array(v_value, E'\n')) as line;
      if cardinality(v_scriptures) > 20 then raise exception 'Anchor Scriptures must include 20 references or fewer.'; end if;
      if exists (select 1 from unnest(v_scriptures) s where char_length(s) > 1000) then
        raise exception 'Each anchor Scripture must be 1,000 characters or fewer.';
      end if;
      update public.teaching_devotional_days dd set anchor_scriptures = v_scriptures
      from public.teaching_devotionals d
      where dd.id = p_target_id and dd.devotional_id = p_devotional_id and d.id = dd.devotional_id and d.status = 'draft';
    elsif p_field = 'devotional_reading' then
      update public.teaching_devotional_days dd set devotional_reading = nullif(v_value, '')
      from public.teaching_devotionals d
      where dd.id = p_target_id and dd.devotional_id = p_devotional_id and d.id = dd.devotional_id and d.status = 'draft';
    elsif p_field = 'confession' then
      update public.teaching_devotional_days dd set confession = nullif(v_value, '')
      from public.teaching_devotionals d
      where dd.id = p_target_id and dd.devotional_id = p_devotional_id and d.id = dd.devotional_id and d.status = 'draft';
    elsif p_field = 'journal_prompt' then
      update public.teaching_devotional_days dd set journal_prompt = nullif(v_value, '')
      from public.teaching_devotionals d
      where dd.id = p_target_id and dd.devotional_id = p_devotional_id and d.id = dd.devotional_id and d.status = 'draft';
    elsif p_field = 'prayer_activation' then
      update public.teaching_devotional_days dd set prayer_activation = nullif(v_value, '')
      from public.teaching_devotionals d
      where dd.id = p_target_id and dd.devotional_id = p_devotional_id and d.id = dd.devotional_id and d.status = 'draft';
    else
      raise exception 'That day field cannot be changed through review.';
    end if;
    get diagnostics v_rows = row_count;
  else
    raise exception 'Unknown revision target.';
  end if;

  if v_rows is distinct from 1 then
    raise exception 'The text to change could not be found.';
  end if;
end;
$$;

revoke all on function public.revision_devotional_field_info(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.revision_devotional_apply_value(uuid, text, uuid, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Co-editor actions
-- ---------------------------------------------------------------------------

-- Starts (or returns the caller's existing) draft revision for a draft devotional.
create or replace function public.create_devotional_revision(p_devotional_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_title text;
  v_status text;
  v_id uuid;
  v_name text;
begin
  if v_user is null or not public.is_content_manager_or_admin() then
    raise exception 'You are not allowed to propose devotional changes.' using errcode = '42501';
  end if;

  select title, status into v_title, v_status from public.teaching_devotionals where id = p_devotional_id;
  if not found then
    raise exception 'That devotional could not be found.' using errcode = 'P0002';
  end if;
  if v_status <> 'draft' then
    raise exception 'Changes can only be proposed to a draft devotional.' using errcode = 'P0001';
  end if;

  select id into v_id
  from public.content_revisions
  where subject_type = 'devotional' and devotional_id = p_devotional_id and submitted_by = v_user and status = 'draft';
  if found then
    return v_id;
  end if;

  v_name := coalesce(
    (select nullif(trim(aa.display_name), '') from public.admin_authorizations aa where aa.user_id = v_user),
    (select u.email from auth.users u where u.id = v_user)
  );

  insert into public.content_revisions (subject_type, devotional_id, subject_title, status, submitted_by, submitted_by_name)
  values ('devotional', p_devotional_id, coalesce(nullif(trim(v_title), ''), 'Untitled devotional'), 'draft', v_user, v_name)
  returning id into v_id;
  return v_id;
end;
$$;

-- Replaces the caller's draft proposals with the given list. Each item is
--   { target_kind, target_id, field_key, base_value, proposed_value }
-- base_value is the wording the editor started from; if the devotional has changed since, the save is
-- refused so an editor can never silently overwrite newer work. The stored "original" comes from the
-- database, not from the browser.
create or replace function public.save_devotional_revision_draft(p_revision_id uuid, p_changes jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_rev public.content_revisions%rowtype;
  v_item jsonb;
  v_kind text;
  v_target uuid;
  v_field text;
  v_info record;
  v_base text;
  v_proposed text;
  v_original text;
  v_count integer := 0;
  v_conflicts text[] := '{}';
begin
  if v_user is null or not public.is_content_manager_or_admin() then
    raise exception 'You are not allowed to propose devotional changes.' using errcode = '42501';
  end if;

  select * into v_rev from public.content_revisions where id = p_revision_id for update;
  if not found or v_rev.subject_type <> 'devotional' then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.submitted_by is distinct from v_user then
    raise exception 'Only the person who started a revision can change it.' using errcode = '42501';
  end if;
  if v_rev.status <> 'draft' then
    raise exception 'This revision was already submitted and can no longer be edited.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.teaching_devotionals where id = v_rev.devotional_id and status = 'draft') then
    raise exception 'This devotional is no longer a draft, so it can no longer be reviewed.' using errcode = 'P0001';
  end if;
  if jsonb_typeof(p_changes) is distinct from 'array' or jsonb_array_length(p_changes) > 500 then
    raise exception 'The list of changes is not valid.' using errcode = '22023';
  end if;

  delete from public.content_revision_changes where revision_id = p_revision_id;

  for v_item in select * from jsonb_array_elements(p_changes) loop
    v_kind := v_item ->> 'target_kind';
    v_target := nullif(v_item ->> 'target_id', '')::uuid;
    v_field := v_item ->> 'field_key';
    v_proposed := public.revision_normalize_text(v_item ->> 'proposed_value');
    v_base := public.revision_normalize_text(v_item ->> 'base_value');

    select * into v_info from public.revision_devotional_field_info(v_rev.devotional_id, v_kind, v_target, v_field);
    if not coalesce(v_info.valid, false) then
      raise exception 'A field in this proposal cannot be changed through review (%).', coalesce(v_field, '?') using errcode = '22023';
    end if;
    if char_length(v_proposed) > v_info.max_length then
      raise exception 'The text for % is longer than % characters.', v_field, v_info.max_length using errcode = '22023';
    end if;

    v_original := public.revision_normalize_text(v_info.current_value);
    if v_proposed = v_original then
      continue;
    end if;
    if v_base is distinct from v_original then
      v_conflicts := v_conflicts || (v_kind || ':' || v_field);
      continue;
    end if;

    insert into public.content_revision_changes (revision_id, target_kind, target_id, field_key, original_value, proposed_value, display_order)
    values (p_revision_id, v_kind, v_target, v_field, v_original, v_proposed, v_count);
    v_count := v_count + 1;
  end loop;

  if cardinality(v_conflicts) > 0 then
    raise exception 'conflict: % changed after you opened this page. Reload to see the current wording.', array_to_string(v_conflicts, ', ')
      using errcode = 'P0001';
  end if;

  update public.content_revisions set updated_at = now() where id = p_revision_id;
  return v_count;
end;
$$;

create or replace function public.submit_devotional_revision(p_revision_id uuid)
returns integer
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
  if v_user is null or not public.is_content_manager_or_admin() then
    raise exception 'You are not allowed to submit devotional changes.' using errcode = '42501';
  end if;

  select * into v_rev from public.content_revisions where id = p_revision_id for update;
  if not found or v_rev.subject_type <> 'devotional' then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.submitted_by is distinct from v_user then
    raise exception 'Only the person who started a revision can submit it.' using errcode = '42501';
  end if;
  if v_rev.status <> 'draft' then
    raise exception 'This revision was already submitted.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.teaching_devotionals where id = v_rev.devotional_id and status = 'draft') then
    raise exception 'This devotional is no longer a draft, so it can no longer be reviewed.' using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.content_revision_changes where revision_id = p_revision_id;
  if v_count = 0 then
    raise exception 'There are no changes to submit.' using errcode = 'P0001';
  end if;

  update public.content_revisions
  set status = 'submitted',
      submitted_at = now(),
      total_changes = v_count,
      subject_title = coalesce((select nullif(trim(title), '') from public.teaching_devotionals where id = v_rev.devotional_id), subject_title)
  where id = p_revision_id;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Administrator actions
-- ---------------------------------------------------------------------------

-- Accepts or rejects one change, with the same "accept anyway" option as the teaching review.
create or replace function public.review_devotional_revision_change(
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
  if v_rev.subject_type <> 'devotional' then
    raise exception 'That change does not belong to a devotional.' using errcode = 'P0001';
  end if;
  if v_rev.status <> 'submitted' then
    raise exception 'This revision is not waiting for review.' using errcode = 'P0001';
  end if;
  if v_change.change_status <> 'pending' then
    raise exception 'That change was already decided.' using errcode = 'P0001';
  end if;

  if p_decision = 'accept' then
    if not exists (select 1 from public.teaching_devotionals where id = v_rev.devotional_id and status = 'draft') then
      raise exception 'This devotional is no longer a draft, so changes can no longer be applied.' using errcode = 'P0001';
    end if;
    select * into v_info from public.revision_devotional_field_info(v_rev.devotional_id, v_change.target_kind, v_change.target_id, v_change.field_key);
    if not coalesce(v_info.valid, false) then
      raise exception 'stale: The part of the devotional this refers to no longer exists. Reject it.' using errcode = 'P0001';
    end if;
    v_stale := public.revision_normalize_text(v_info.current_value) is distinct from v_change.original_value;
    if v_stale and not coalesce(p_accept_anyway, false) then
      raise exception 'stale: This text changed after the proposal was made. Reject it, accept it anyway to replace the current wording, or ask the editor to submit a new revision.' using errcode = 'P0001';
    end if;
    perform public.revision_devotional_apply_value(v_rev.devotional_id, v_change.target_kind, v_change.target_id, v_change.field_key, v_change.proposed_value);
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

-- Accepts or rejects every change still waiting. Accepting skips (and leaves pending) any change
-- whose text moved since it was proposed, and reports how many it skipped.
create or replace function public.review_all_devotional_revision_changes(p_revision_id uuid, p_decision text)
returns jsonb
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_rev public.content_revisions%rowtype;
  v_change public.content_revision_changes%rowtype;
  v_info record;
  v_applied integer := 0;
  v_skipped integer := 0;
  v_finished boolean;
begin
  if v_user is null or not public.is_authenticated_admin() then
    raise exception 'Only an Administrator can review proposed changes.' using errcode = '42501';
  end if;
  if p_decision not in ('accept', 'reject') then
    raise exception 'The decision must be accept or reject.' using errcode = '22023';
  end if;

  select * into v_rev from public.content_revisions where id = p_revision_id for update;
  if not found or v_rev.subject_type <> 'devotional' then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.status <> 'submitted' then
    raise exception 'This revision is not waiting for review.' using errcode = 'P0001';
  end if;

  if p_decision = 'accept'
     and not exists (select 1 from public.teaching_devotionals where id = v_rev.devotional_id and status = 'draft') then
    raise exception 'This devotional is no longer a draft, so changes can no longer be applied.' using errcode = 'P0001';
  end if;

  for v_change in
    select * from public.content_revision_changes
    where revision_id = p_revision_id and change_status = 'pending'
    order by display_order
    for update
  loop
    if p_decision = 'accept' then
      select * into v_info from public.revision_devotional_field_info(v_rev.devotional_id, v_change.target_kind, v_change.target_id, v_change.field_key);
      if not coalesce(v_info.valid, false)
         or public.revision_normalize_text(v_info.current_value) is distinct from v_change.original_value then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      perform public.revision_devotional_apply_value(v_rev.devotional_id, v_change.target_kind, v_change.target_id, v_change.field_key, v_change.proposed_value);
    end if;

    update public.content_revision_changes
    set change_status = case when p_decision = 'accept' then 'accepted' else 'rejected' end,
        reviewed_by = v_user,
        reviewed_at = now()
    where id = v_change.id;
    v_applied := v_applied + 1;
  end loop;

  v_finished := public.revision_finish_if_done(p_revision_id, v_user);
  return jsonb_build_object('decided', v_applied, 'skipped_stale', v_skipped, 'finished', v_finished);
end;
$$;

-- ---------------------------------------------------------------------------
-- Publishing a devotional clears its review text
-- ---------------------------------------------------------------------------

create or replace function public.close_devotional_revisions_on_publish()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  if new.status = 'published' and old.status is distinct from 'published' then
    update public.content_revisions r
    set status = 'cancelled',
        completed_at = now(),
        review_note = coalesce(r.review_note, 'Closed when the devotional was published.'),
        total_changes = (select count(*) from public.content_revision_changes c where c.revision_id = r.id),
        purged_at = now()
    where r.subject_type = 'devotional' and r.devotional_id = new.id and r.status in ('draft', 'submitted');

    delete from public.content_revision_changes c
    using public.content_revisions r
    where c.revision_id = r.id and r.subject_type = 'devotional' and r.devotional_id = new.id;

    update public.content_revisions
    set purged_at = coalesce(purged_at, now())
    where subject_type = 'devotional' and devotional_id = new.id and purged_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists teaching_devotionals_close_revisions_on_publish on public.teaching_devotionals;
create trigger teaching_devotionals_close_revisions_on_publish
after update of status on public.teaching_devotionals
for each row
when (new.status = 'published' and old.status is distinct from 'published')
execute function public.close_devotional_revisions_on_publish();

-- ---------------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------------

revoke all on function public.close_devotional_revisions_on_publish() from public, anon, authenticated;

revoke all on function public.create_devotional_revision(uuid) from public, anon;
revoke all on function public.save_devotional_revision_draft(uuid, jsonb) from public, anon;
revoke all on function public.submit_devotional_revision(uuid) from public, anon;
revoke all on function public.review_devotional_revision_change(uuid, text, text, boolean) from public, anon;
revoke all on function public.review_all_devotional_revision_changes(uuid, text) from public, anon;

grant execute on function public.create_devotional_revision(uuid) to authenticated;
grant execute on function public.save_devotional_revision_draft(uuid, jsonb) to authenticated;
grant execute on function public.submit_devotional_revision(uuid) to authenticated;
grant execute on function public.review_devotional_revision_change(uuid, text, text, boolean) to authenticated;
grant execute on function public.review_all_devotional_revision_changes(uuid, text) to authenticated;
