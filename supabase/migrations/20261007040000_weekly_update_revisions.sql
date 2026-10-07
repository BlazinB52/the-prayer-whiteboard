-- Word-style review for weekly updates.
--
-- Same rules as the teaching and devotional reviews (20261006030000_content_revisions.sql and
-- 20261007020000_devotional_revisions.sql): a co-editor (the content manager role) proposes text
-- changes to a DRAFT weekly update, an Administrator accepts or rejects each change, and only an
-- accepted change is written to the weekly update, in the same transaction as the decision. Proposals
-- live only in content_revisions / content_revision_changes. When a review is finished, closed, or its
-- weekly update is published, the original and proposed wording is deleted and only the small audit
-- row stays.
--
-- What a co-editor can propose: the title, and the wording of each heading, paragraph, quote and
-- bulleted list in the converted document. Bold and italic are written as **bold** and *italic*, and a
-- link as [label](https://address), the same way the other editors do. Everything else (the source
-- document, chalkboards, footer, which update is current, publishing, and adding or removing blocks)
-- stays Administrator-only. A block's position is its identity, so if the Administrator replaces the
-- document, older proposals are seen as out of date and cannot be accepted by accident.
--
-- The generic functions keep working for weekly update revisions where they do not depend on the
-- subject: discard_teaching_revision, cancel_teaching_revision and purge_revision_history.

-- ---------------------------------------------------------------------------
-- Tables: allow weekly update targets
-- ---------------------------------------------------------------------------

alter table public.content_revision_changes
  drop constraint if exists content_revision_changes_target_kind_check,
  add constraint content_revision_changes_target_kind_check
    check (target_kind in ('teaching', 'category', 'section', 'devotional', 'day', 'weekly_update'));

alter table public.content_revision_changes
  drop constraint if exists content_revision_changes_target_check,
  add constraint content_revision_changes_target_check
    check (
      (target_kind in ('teaching', 'devotional', 'weekly_update') and target_id is null)
      or (target_kind in ('category', 'section', 'day') and target_id is not null)
    );

-- One open draft per editor per weekly update.
create unique index if not exists content_revisions_one_weekly_update_draft_per_editor_idx
  on public.content_revisions (weekly_update_id, submitted_by)
  where status = 'draft' and subject_type = 'weekly_update';

create index if not exists content_revisions_weekly_update_idx
  on public.content_revisions (weekly_update_id);

-- Co-editors read draft weekly updates (and nothing else) so they can see the wording they are
-- reviewing. This adds read access only; they still cannot write to this table.
drop policy if exists "Content managers read draft weekly updates" on public.weekly_updates;
create policy "Content managers read draft weekly updates"
on public.weekly_updates
for select
to authenticated
using (public.is_content_manager_or_admin() and status = 'draft');

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by the app roles)
-- ---------------------------------------------------------------------------

-- A block's children as editable text: **bold**, *italic*, ***both***. Returns null when the text
-- cannot be written this way without changing it (it already contains an asterisk, or a child is
-- empty), in which case that block is left out of the review rather than risk altering it.
create or replace function public.revision_weekly_children_to_markup(p_children jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_child jsonb;
  v_text text;
  v_bold boolean;
  v_italic boolean;
  v_out text := '';
begin
  if jsonb_typeof(p_children) is distinct from 'array' then return null; end if;
  for v_child in select value from jsonb_array_elements(p_children) loop
    v_text := v_child ->> 'text';
    if v_text is null or v_text = '' or position('*' in v_text) > 0 then return null; end if;
    v_bold := coalesce((v_child ->> 'bold')::boolean, false);
    v_italic := coalesce((v_child ->> 'italic')::boolean, false);
    v_out := v_out || case
      when v_bold and v_italic then '***' || v_text || '***'
      when v_bold then '**' || v_text || '**'
      when v_italic then '*' || v_text || '*'
      else v_text
    end;
  end loop;
  return v_out;
end;
$$;

-- The reverse: edited text back into children.
create or replace function public.revision_weekly_markup_to_children(p_markup text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_match text[];
  v_children jsonb := '[]'::jsonb;
  v_text text;
  v_bold boolean;
  v_italic boolean;
begin
  for v_match in
    select m from regexp_matches(coalesce(p_markup, ''), '\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|([^*]+)|(\*)', 'g') as m
  loop
    v_bold := false;
    v_italic := false;
    if v_match[1] is not null then v_text := v_match[1]; v_bold := true; v_italic := true;
    elsif v_match[2] is not null then v_text := v_match[2]; v_bold := true;
    elsif v_match[3] is not null then v_text := v_match[3]; v_italic := true;
    elsif v_match[4] is not null then v_text := v_match[4];
    else v_text := v_match[5];
    end if;
    v_children := v_children || jsonb_build_array(
      jsonb_build_object('text', v_text)
      || case when v_bold then jsonb_build_object('bold', true) else '{}'::jsonb end
      || case when v_italic then jsonb_build_object('italic', true) else '{}'::jsonb end
    );
  end loop;
  return v_children;
end;
$$;

-- The plain-text copy kept in body_markdown (used for the text version of the email): links written
-- as "label (address)", no bold or italic marks, bullets as "- ", blocks separated by a blank line.
create or replace function public.revision_weekly_plain_text(p_blocks jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_block jsonb;
  v_parts text[] := '{}';
  v_item jsonb;
  v_items text[];
  v_type text;
begin
  for v_block in select value from jsonb_array_elements(p_blocks) loop
    v_type := v_block ->> 'type';
    if v_type = 'divider' then
      v_parts := v_parts || '---'::text;
    elsif v_type = 'list' then
      v_items := '{}';
      for v_item in select value from jsonb_array_elements(coalesce(v_block -> 'items', '[]'::jsonb)) loop
        v_items := v_items || ('- ' || regexp_replace(
          coalesce((select string_agg(c ->> 'text', '' order by ord) from jsonb_array_elements(v_item) with ordinality as t(c, ord)), ''),
          '\[([^\]\n]+)\]\(([^\s)]+)\)', '\1 (\2)', 'g'));
      end loop;
      v_parts := v_parts || array_to_string(v_items, E'\n');
    else
      v_parts := v_parts || regexp_replace(
        coalesce((select string_agg(c ->> 'text', '' order by ord) from jsonb_array_elements(coalesce(v_block -> 'children', '[]'::jsonb)) with ordinality as t(c, ord)), ''),
        '\[([^\]\n]+)\]\(([^\s)]+)\)', '\1 (\2)', 'g');
    end if;
  end loop;
  return array_to_string(v_parts, E'\n\n');
end;
$$;

-- Every field of a draft weekly update that a co-editor may propose changes to, in reading order.
create or replace function public.revision_weekly_fields(p_weekly_update_id uuid)
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
declare
  v_update public.weekly_updates%rowtype;
  v_block jsonb;
  v_pos integer;
  v_type text;
  v_markup text;
  v_items text[];
  v_item jsonb;
  v_item_text text;
  v_ok boolean;
begin
  select * into v_update from public.weekly_updates where id = p_weekly_update_id and status = 'draft';
  if not found then return; end if;

  field_key := 'title'; label := 'Title'; context := 'Weekly update details';
  current_value := v_update.title; max_length := 180; multiline := false; field_rows := 1; formatted := false;
  return next;

  for v_block, v_pos in
    select value, ord::integer from jsonb_array_elements(v_update.converted_content) with ordinality as t(value, ord)
  loop
    v_type := v_block ->> 'type';
    if v_type in ('heading', 'paragraph', 'quote') then
      v_markup := public.revision_weekly_children_to_markup(v_block -> 'children');
      if v_markup is null or trim(v_markup) = '' then continue; end if;
      field_key := 'block_' || v_pos;
      label := case v_type when 'heading' then 'Heading ' else case v_type when 'quote' then 'Quote ' else 'Paragraph ' end end || v_pos;
      context := 'Weekly update content';
      current_value := v_markup;
      max_length := 12000;
      multiline := v_type <> 'heading';
      field_rows := case v_type when 'heading' then 1 when 'quote' then 3 else 5 end;
      formatted := v_type <> 'heading';
      return next;
    elsif v_type = 'list' then
      v_items := '{}';
      v_ok := true;
      for v_item in select value from jsonb_array_elements(coalesce(v_block -> 'items', '[]'::jsonb)) loop
        v_item_text := public.revision_weekly_children_to_markup(v_item);
        if v_item_text is null or position(E'\n' in v_item_text) > 0 then v_ok := false; exit; end if;
        v_items := v_items || v_item_text;
      end loop;
      if not v_ok or cardinality(v_items) = 0 then continue; end if;
      field_key := 'block_' || v_pos;
      label := 'Bulleted list ' || v_pos || ' (one item per line)';
      context := 'Weekly update content';
      current_value := array_to_string(v_items, E'\n');
      max_length := 12000;
      multiline := true;
      field_rows := greatest(3, cardinality(v_items) + 1);
      formatted := true;
      return next;
    end if;
  end loop;
end;
$$;

create or replace function public.revision_weekly_field_info(
  p_weekly_update_id uuid,
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
  v_row record;
begin
  valid := false;
  current_value := null;
  max_length := 0;
  if p_kind <> 'weekly_update' or p_target_id is not null then return; end if;
  select f.current_value as value, f.max_length as max_len into v_row
  from public.revision_weekly_fields(p_weekly_update_id) f
  where f.field_key = p_field;
  if not found then return; end if;
  valid := true;
  current_value := v_row.value;
  max_length := v_row.max_len;
end;
$$;

-- Writes one approved value into the weekly update. Every branch writes exactly one known column or
-- one block, so nothing the caller supplies is ever used as a column name.
create or replace function public.revision_weekly_apply_value(
  p_weekly_update_id uuid,
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
  v_content jsonb;
  v_pos integer;
  v_block jsonb;
  v_type text;
  v_items jsonb;
  v_line text;
  v_children jsonb;
  v_body text;
begin
  if p_kind <> 'weekly_update' or p_target_id is not null then
    raise exception 'Unknown revision target.';
  end if;

  if p_field = 'title' then
    if v_value = '' then raise exception 'The title cannot be empty.'; end if;
    update public.weekly_updates set title = v_value where id = p_weekly_update_id and status = 'draft';
    if not found then raise exception 'The text to change could not be found.'; end if;
    return;
  end if;

  if p_field !~ '^block_[0-9]+$' then
    raise exception 'That weekly update field cannot be changed through review.';
  end if;
  v_pos := substring(p_field from 7)::integer;

  select converted_content into v_content from public.weekly_updates where id = p_weekly_update_id and status = 'draft' for update;
  if not found or v_pos < 1 or v_pos > jsonb_array_length(v_content) then
    raise exception 'The text to change could not be found.';
  end if;
  v_block := v_content -> (v_pos - 1);
  v_type := v_block ->> 'type';

  if v_type in ('heading', 'paragraph', 'quote') then
    if v_value = '' then raise exception 'That text cannot be empty.'; end if;
    v_children := public.revision_weekly_markup_to_children(v_value);
    v_block := jsonb_set(v_block, array['children'], v_children);
  elsif v_type = 'list' then
    v_items := '[]'::jsonb;
    for v_line in select trim(l) from unnest(string_to_array(v_value, E'\n')) as l loop
      if v_line <> '' then
        v_items := v_items || jsonb_build_array(public.revision_weekly_markup_to_children(v_line));
      end if;
    end loop;
    if jsonb_array_length(v_items) = 0 then raise exception 'A list needs at least one item.'; end if;
    v_block := jsonb_set(v_block, array['items'], v_items);
  else
    raise exception 'That weekly update field cannot be changed through review.';
  end if;

  v_content := jsonb_set(v_content, array[(v_pos - 1)::text], v_block);
  v_body := public.revision_weekly_plain_text(v_content);
  if length(trim(v_body)) = 0 or length(v_body) > 50000 then
    raise exception 'The weekly update text is too long or empty.';
  end if;

  update public.weekly_updates
  set converted_content = v_content, body_markdown = v_body
  where id = p_weekly_update_id and status = 'draft';
  if not found then raise exception 'The text to change could not be found.'; end if;
end;
$$;

revoke all on function public.revision_weekly_children_to_markup(jsonb) from public, anon, authenticated;
revoke all on function public.revision_weekly_markup_to_children(text) from public, anon, authenticated;
revoke all on function public.revision_weekly_plain_text(jsonb) from public, anon, authenticated;
revoke all on function public.revision_weekly_fields(uuid) from public, anon, authenticated;
revoke all on function public.revision_weekly_field_info(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.revision_weekly_apply_value(uuid, text, uuid, text, text) from public, anon, authenticated;

-- What the review screens show: the editable fields of a draft weekly update and their current
-- wording. Only staff can ask, and only a draft is ever returned.
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
  return query select * from public.revision_weekly_fields(p_weekly_update_id);
end;
$$;

revoke all on function public.weekly_update_review_fields(uuid) from public, anon;
grant execute on function public.weekly_update_review_fields(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Co-editor actions
-- ---------------------------------------------------------------------------

create or replace function public.create_weekly_update_revision(p_weekly_update_id uuid)
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
    raise exception 'You are not allowed to propose weekly update changes.' using errcode = '42501';
  end if;

  select title, status into v_title, v_status from public.weekly_updates where id = p_weekly_update_id;
  if not found then
    raise exception 'That weekly update could not be found.' using errcode = 'P0002';
  end if;
  if v_status <> 'draft' then
    raise exception 'Changes can only be proposed to a draft weekly update.' using errcode = 'P0001';
  end if;

  select id into v_id
  from public.content_revisions
  where subject_type = 'weekly_update' and weekly_update_id = p_weekly_update_id and submitted_by = v_user and status = 'draft';
  if found then
    return v_id;
  end if;

  v_name := coalesce(
    (select nullif(trim(aa.display_name), '') from public.admin_authorizations aa where aa.user_id = v_user),
    (select u.email from auth.users u where u.id = v_user)
  );

  insert into public.content_revisions (subject_type, weekly_update_id, subject_title, status, submitted_by, submitted_by_name)
  values ('weekly_update', p_weekly_update_id, coalesce(nullif(trim(v_title), ''), 'Untitled weekly update'), 'draft', v_user, v_name)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.save_weekly_update_revision_draft(p_revision_id uuid, p_changes jsonb)
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
    raise exception 'You are not allowed to propose weekly update changes.' using errcode = '42501';
  end if;

  select * into v_rev from public.content_revisions where id = p_revision_id for update;
  if not found or v_rev.subject_type <> 'weekly_update' then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.submitted_by is distinct from v_user then
    raise exception 'Only the person who started a revision can change it.' using errcode = '42501';
  end if;
  if v_rev.status <> 'draft' then
    raise exception 'This revision was already submitted and can no longer be edited.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.weekly_updates where id = v_rev.weekly_update_id and status = 'draft') then
    raise exception 'This weekly update is no longer a draft, so it can no longer be reviewed.' using errcode = 'P0001';
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

    select * into v_info from public.revision_weekly_field_info(v_rev.weekly_update_id, v_kind, v_target, v_field);
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

create or replace function public.submit_weekly_update_revision(p_revision_id uuid)
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
    raise exception 'You are not allowed to submit weekly update changes.' using errcode = '42501';
  end if;

  select * into v_rev from public.content_revisions where id = p_revision_id for update;
  if not found or v_rev.subject_type <> 'weekly_update' then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.submitted_by is distinct from v_user then
    raise exception 'Only the person who started a revision can submit it.' using errcode = '42501';
  end if;
  if v_rev.status <> 'draft' then
    raise exception 'This revision was already submitted.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.weekly_updates where id = v_rev.weekly_update_id and status = 'draft') then
    raise exception 'This weekly update is no longer a draft, so it can no longer be reviewed.' using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.content_revision_changes where revision_id = p_revision_id;
  if v_count = 0 then
    raise exception 'There are no changes to submit.' using errcode = 'P0001';
  end if;

  update public.content_revisions
  set status = 'submitted',
      submitted_at = now(),
      total_changes = v_count,
      subject_title = coalesce((select nullif(trim(title), '') from public.weekly_updates where id = v_rev.weekly_update_id), subject_title)
  where id = p_revision_id;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Administrator actions
-- ---------------------------------------------------------------------------

create or replace function public.review_weekly_update_revision_change(
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
  if v_rev.subject_type <> 'weekly_update' then
    raise exception 'That change does not belong to a weekly update.' using errcode = 'P0001';
  end if;
  if v_rev.status <> 'submitted' then
    raise exception 'This revision is not waiting for review.' using errcode = 'P0001';
  end if;
  if v_change.change_status <> 'pending' then
    raise exception 'That change was already decided.' using errcode = 'P0001';
  end if;

  if p_decision = 'accept' then
    if not exists (select 1 from public.weekly_updates where id = v_rev.weekly_update_id and status = 'draft') then
      raise exception 'This weekly update is no longer a draft, so changes can no longer be applied.' using errcode = 'P0001';
    end if;
    select * into v_info from public.revision_weekly_field_info(v_rev.weekly_update_id, v_change.target_kind, v_change.target_id, v_change.field_key);
    if not coalesce(v_info.valid, false) then
      raise exception 'stale: The part of the weekly update this refers to no longer exists. Reject it.' using errcode = 'P0001';
    end if;
    v_stale := public.revision_normalize_text(v_info.current_value) is distinct from v_change.original_value;
    if v_stale and not coalesce(p_accept_anyway, false) then
      raise exception 'stale: This text changed after the proposal was made. Reject it, accept it anyway to replace the current wording, or ask the editor to submit a new revision.' using errcode = 'P0001';
    end if;
    perform public.revision_weekly_apply_value(v_rev.weekly_update_id, v_change.target_kind, v_change.target_id, v_change.field_key, v_change.proposed_value);
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

create or replace function public.review_all_weekly_update_revision_changes(p_revision_id uuid, p_decision text)
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
  if not found or v_rev.subject_type <> 'weekly_update' then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.status <> 'submitted' then
    raise exception 'This revision is not waiting for review.' using errcode = 'P0001';
  end if;

  if p_decision = 'accept'
     and not exists (select 1 from public.weekly_updates where id = v_rev.weekly_update_id and status = 'draft') then
    raise exception 'This weekly update is no longer a draft, so changes can no longer be applied.' using errcode = 'P0001';
  end if;

  for v_change in
    select * from public.content_revision_changes
    where revision_id = p_revision_id and change_status = 'pending'
    order by display_order
    for update
  loop
    if p_decision = 'accept' then
      select * into v_info from public.revision_weekly_field_info(v_rev.weekly_update_id, v_change.target_kind, v_change.target_id, v_change.field_key);
      if not coalesce(v_info.valid, false)
         or public.revision_normalize_text(v_info.current_value) is distinct from v_change.original_value then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      perform public.revision_weekly_apply_value(v_rev.weekly_update_id, v_change.target_kind, v_change.target_id, v_change.field_key, v_change.proposed_value);
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
-- Publishing a weekly update clears its review text
-- ---------------------------------------------------------------------------

create or replace function public.close_weekly_update_revisions_on_publish()
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
        review_note = coalesce(r.review_note, 'Closed when the weekly update was published.'),
        total_changes = (select count(*) from public.content_revision_changes c where c.revision_id = r.id),
        purged_at = now()
    where r.subject_type = 'weekly_update' and r.weekly_update_id = new.id and r.status in ('draft', 'submitted');

    delete from public.content_revision_changes c
    using public.content_revisions r
    where c.revision_id = r.id and r.subject_type = 'weekly_update' and r.weekly_update_id = new.id;

    update public.content_revisions
    set purged_at = coalesce(purged_at, now())
    where subject_type = 'weekly_update' and weekly_update_id = new.id and purged_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists weekly_updates_close_revisions_on_publish on public.weekly_updates;
create trigger weekly_updates_close_revisions_on_publish
after update of status on public.weekly_updates
for each row
when (new.status = 'published' and old.status is distinct from 'published')
execute function public.close_weekly_update_revisions_on_publish();

-- ---------------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------------

revoke all on function public.close_weekly_update_revisions_on_publish() from public, anon, authenticated;

revoke all on function public.create_weekly_update_revision(uuid) from public, anon;
revoke all on function public.save_weekly_update_revision_draft(uuid, jsonb) from public, anon;
revoke all on function public.submit_weekly_update_revision(uuid) from public, anon;
revoke all on function public.review_weekly_update_revision_change(uuid, text, text, boolean) from public, anon;
revoke all on function public.review_all_weekly_update_revision_changes(uuid, text) from public, anon;

grant execute on function public.create_weekly_update_revision(uuid) to authenticated;
grant execute on function public.save_weekly_update_revision_draft(uuid, jsonb) to authenticated;
grant execute on function public.submit_weekly_update_revision(uuid) to authenticated;
grant execute on function public.review_weekly_update_revision_change(uuid, text, text, boolean) to authenticated;
grant execute on function public.review_all_weekly_update_revision_changes(uuid, text) to authenticated;
