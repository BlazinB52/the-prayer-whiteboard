-- Teaching outlines join the same review cycle as teachings and devotionals.
--
-- Before this, a Content Manager could upload outlines, saw every outline (draft or not), and could only
-- move one between categories. There was no text editing and no proofing. Now an outline works like a
-- teaching or a devotional:
--
--   1. The Administrator uploads the Word file. It is a draft, and Content Managers cannot see it.
--   2. The Administrator presses "Send to Content Managers for review" (sent_for_review_at). Content
--      Managers can then read the draft and propose text changes. They are emailed.
--   3. Each proposal is a row in content_revisions / content_revision_changes (the same tables every
--      reviewed item uses). Nothing a Content Manager does touches the outline itself.
--   4. The Administrator accepts or rejects each change; an accepted change is written to the outline in
--      the same transaction as the decision. Publishing closes anything still open.
--
-- Content Managers no longer upload, move or delete outlines: like teachings, creating and filing content
-- is the Administrator's job. Their part is proofing.
--
-- What a Content Manager may propose: the title, the subtitle, and the wording of every heading,
-- paragraph, list item and table cell, with **bold**, *italic* and [label](https://address) links. A
-- block's position is its identity, so a paragraph that can't be written this way without changing it
-- (it contains an asterisk, or a link that is also bold) is left out rather than risk altering it.
-- Everything else (category, language, date, related teaching, publishing, adding or removing blocks,
-- the stored Word file) stays Administrator-only.

-- ---------------------------------------------------------------------------
-- The gate on outlines
-- ---------------------------------------------------------------------------

alter table public.teaching_outlines add column if not exists sent_for_review_at timestamptz;

-- clear_review_gate_when_published() already exists (20261011020000_review_gate.sql): it empties the gate
-- when the row leaves draft.
drop trigger if exists teaching_outlines_clear_review_gate on public.teaching_outlines;
create trigger teaching_outlines_clear_review_gate
before update of status on public.teaching_outlines
for each row
when (new.status <> 'draft' and new.sent_for_review_at is not null)
execute function public.clear_review_gate_when_published();

alter table public.teaching_outlines
  drop constraint if exists teaching_outlines_review_gate_drafts_only_check,
  add constraint teaching_outlines_review_gate_drafts_only_check check (sent_for_review_at is null or status = 'draft');

-- Content Managers read an outline only once it is published (everyone can) or the Administrator sent it.
drop policy if exists "Staff read teaching outlines" on public.teaching_outlines;
drop policy if exists "Content managers read sent draft teaching outlines" on public.teaching_outlines;
create policy "Content managers read sent draft teaching outlines"
on public.teaching_outlines
for select
to authenticated
using (public.is_content_manager_or_admin() and status = 'draft' and sent_for_review_at is not null);

-- Content Managers no longer add, edit, or clear up outlines or their stored Word files.
drop policy if exists "Staff add draft teaching outlines" on public.teaching_outlines;
drop policy if exists "Staff edit draft teaching outlines" on public.teaching_outlines;
drop policy if exists "Staff add teaching outline files" on storage.objects;
drop policy if exists "Staff remove unused teaching outline files" on storage.objects;

-- ---------------------------------------------------------------------------
-- The shared tables learn about outlines
-- ---------------------------------------------------------------------------

alter table public.content_revisions
  add column if not exists outline_id uuid references public.teaching_outlines(id) on delete cascade;

alter table public.content_revisions
  drop constraint if exists content_revisions_subject_type_check,
  add constraint content_revisions_subject_type_check
    check (subject_type in ('teaching', 'devotional', 'weekly_update', 'outline'));

alter table public.content_revisions
  drop constraint if exists content_revisions_subject_check,
  add constraint content_revisions_subject_check check (
    (subject_type = 'teaching' and teaching_id is not null and devotional_id is null and weekly_update_id is null and outline_id is null)
    or (subject_type = 'devotional' and devotional_id is not null and teaching_id is null and weekly_update_id is null and outline_id is null)
    or (subject_type = 'weekly_update' and weekly_update_id is not null and teaching_id is null and devotional_id is null and outline_id is null)
    or (subject_type = 'outline' and outline_id is not null and teaching_id is null and devotional_id is null and weekly_update_id is null)
  );

alter table public.content_revision_changes
  drop constraint if exists content_revision_changes_target_kind_check,
  add constraint content_revision_changes_target_kind_check
    check (target_kind in ('teaching', 'category', 'section', 'devotional', 'day', 'weekly_update', 'outline'));

alter table public.content_revision_changes
  drop constraint if exists content_revision_changes_target_check,
  add constraint content_revision_changes_target_check
    check (
      (target_kind in ('teaching', 'devotional', 'weekly_update', 'outline') and target_id is null)
      or (target_kind in ('category', 'section', 'day') and target_id is not null)
    );

-- One open draft per editor per outline.
create unique index if not exists content_revisions_one_outline_draft_per_editor_idx
  on public.content_revisions (outline_id, submitted_by)
  where status = 'draft' and subject_type = 'outline';

create index if not exists content_revisions_outline_idx
  on public.content_revisions (outline_id);

-- ---------------------------------------------------------------------------
-- The gate check, now aware of outlines
-- ---------------------------------------------------------------------------

create or replace function public.review_is_open(p_subject_type text, p_teaching_id uuid, p_devotional_id uuid, p_weekly_update_id uuid, p_outline_id uuid)
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
  elsif p_subject_type = 'outline' then
    return exists (select 1 from public.teaching_outlines where id = p_outline_id and status = 'draft' and sent_for_review_at is not null);
  end if;
  return false;
end;
$$;

-- The four-argument form keeps working for everything written before outlines existed.
create or replace function public.review_is_open(p_subject_type text, p_teaching_id uuid, p_devotional_id uuid, p_weekly_update_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.review_is_open(p_subject_type, p_teaching_id, p_devotional_id, p_weekly_update_id, null::uuid);
$$;

revoke all on function public.review_is_open(text, uuid, uuid, uuid, uuid) from public, anon, authenticated;
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

  if not public.review_is_open(v_rev.subject_type, v_rev.teaching_id, v_rev.devotional_id, v_rev.weekly_update_id, v_rev.outline_id) then
    raise exception 'This has not been sent to you for review, or was taken back by the Administrator.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Taking a submitted revision back must not collide with a newer draft of the same outline.
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
      and r.outline_id is not distinct from v_rev.outline_id
  ) then
    raise exception 'You already have a newer draft of this. Submit or discard it first, then take this one back.' using errcode = 'P0001';
  end if;

  update public.content_revisions
  set status = 'draft', submitted_at = null, total_changes = 0
  where id = p_revision_id;
end;
$$;

revoke all on function public.recall_revision(uuid) from public, anon;
grant execute on function public.recall_revision(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by the app roles)
-- ---------------------------------------------------------------------------

create or replace function public.revision_outline_plain_text(p_inlines jsonb)
returns text
language sql
immutable
set search_path = public
as $$
  select coalesce(string_agg(c ->> 'text', '' order by ord), '')
  from jsonb_array_elements(case when jsonb_typeof(p_inlines) = 'array' then p_inlines else '[]'::jsonb end) with ordinality as t(c, ord);
$$;

-- A run of text as editable wording: **bold**, *italic*, ***both***, [label](https://address). Returns null
-- when it cannot be written this way without changing it.
create or replace function public.revision_outline_inlines_to_markup(p_inlines jsonb)
returns text
language plpgsql
immutable
set search_path = public
as $$
declare
  v_child jsonb;
  v_text text;
  v_href text;
  v_bold boolean;
  v_italic boolean;
  v_out text := '';
begin
  if jsonb_typeof(p_inlines) is distinct from 'array' then return null; end if;
  for v_child in select value from jsonb_array_elements(p_inlines) loop
    v_text := v_child ->> 'text';
    v_href := v_child ->> 'href';
    v_bold := coalesce((v_child ->> 'bold')::boolean, false);
    v_italic := coalesce((v_child ->> 'italic')::boolean, false);
    if v_text is null or v_text = '' or position('*' in v_text) > 0 then return null; end if;
    if v_href is not null then
      if v_bold or v_italic or v_href !~ '^https?://[^\s()]+$'
         or position('[' in v_text) > 0 or position(']' in v_text) > 0 or position(E'\n' in v_text) > 0 then
        return null;
      end if;
      v_out := v_out || '[' || v_text || '](' || v_href || ')';
    else
      v_out := v_out || case
        when v_bold and v_italic then '***' || v_text || '***'
        when v_bold then '**' || v_text || '**'
        when v_italic then '*' || v_text || '*'
        else v_text
      end;
    end if;
  end loop;
  return v_out;
end;
$$;

-- The reverse. Only http(s) addresses become links. Neighbouring pieces that look the same are joined,
-- exactly as the Word converter joins them, so the result can be compared with what was stored.
create or replace function public.revision_outline_markup_to_inlines(p_markup text)
returns jsonb
language plpgsql
immutable
set search_path = public
as $$
declare
  v_match text[];
  v_out jsonb := '[]'::jsonb;
  v_child jsonb;
  v_last jsonb;
  v_text text;
  v_bold boolean;
  v_italic boolean;
  v_href text;
  v_n integer;
begin
  for v_match in
    select m from regexp_matches(
      coalesce(p_markup, ''),
      '\[([^][*]+)\]\((https?://[^\s()]+)\)|\*\*\*([^*]+)\*\*\*|\*\*([^*]+)\*\*|\*([^*]+)\*|([^*[]+|\[|\*)',
      'g'
    ) as m
  loop
    v_bold := false;
    v_italic := false;
    v_href := null;
    if v_match[1] is not null then v_text := v_match[1]; v_href := v_match[2];
    elsif v_match[3] is not null then v_text := v_match[3]; v_bold := true; v_italic := true;
    elsif v_match[4] is not null then v_text := v_match[4]; v_bold := true;
    elsif v_match[5] is not null then v_text := v_match[5]; v_italic := true;
    else v_text := v_match[6];
    end if;

    v_child := jsonb_build_object('text', v_text)
      || case when v_bold then jsonb_build_object('bold', true) else '{}'::jsonb end
      || case when v_italic then jsonb_build_object('italic', true) else '{}'::jsonb end
      || case when v_href is not null then jsonb_build_object('href', v_href) else '{}'::jsonb end;

    v_n := jsonb_array_length(v_out);
    if v_n > 0 then
      v_last := v_out -> (v_n - 1);
      if (v_last - 'text') = (v_child - 'text') then
        v_out := jsonb_set(v_out, array[(v_n - 1)::text], jsonb_set(v_last, '{text}', to_jsonb((v_last ->> 'text') || v_text)));
        continue;
      end if;
    end if;
    v_out := v_out || jsonb_build_array(v_child);
  end loop;
  return v_out;
end;
$$;

-- Every field of a draft outline that a Content Manager may propose changes to, in reading order. A piece
-- of text is offered only if writing it as markup and reading it back gives exactly what is stored.
-- The context groups fields under the heading they sit below, so the review screen shows one card per
-- section of the outline.
create or replace function public.revision_outline_fields(p_outline_id uuid)
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
  v_outline public.teaching_outlines%rowtype;
  v_block jsonb;
  v_pos integer;
  v_type text;
  v_level integer;
  v_h text[] := array['', '', ''];
  v_i integer;
  v_markup text;
  v_item jsonb;
  v_idx integer;
  v_row jsonb;
  v_cell jsonb;
  v_r integer;
  v_c integer;
  v_path text;
begin
  select * into v_outline from public.teaching_outlines where id = p_outline_id and status = 'draft';
  if not found then return; end if;

  field_key := 'title'; label := 'Title'; context := 'Outline details';
  current_value := v_outline.title; max_length := 200; multiline := false; field_rows := 1; formatted := false;
  return next;

  if v_outline.subtitle is not null then
    field_key := 'subtitle'; label := 'Subtitle'; context := 'Outline details';
    current_value := v_outline.subtitle; max_length := 300; multiline := false; field_rows := 1; formatted := false;
    return next;
  end if;

  for v_block, v_pos in
    select value, ord::integer from jsonb_array_elements(v_outline.content) with ordinality as t(value, ord)
  loop
    v_type := v_block ->> 'type';
    v_path := array_to_string(array_remove(v_h, ''), ' › ');
    if v_path = '' then v_path := 'Beginning of the outline'; end if;

    if v_type = 'heading' then
      v_level := least(greatest(coalesce((v_block ->> 'level')::integer, 1), 1), 3);
      v_h[v_level] := public.revision_outline_plain_text(v_block -> 'inlines');
      for v_i in (v_level + 1)..3 loop v_h[v_i] := ''; end loop;
      v_path := array_to_string(array_remove(v_h, ''), ' › ');
      if v_path = '' then v_path := 'Beginning of the outline'; end if;

      v_markup := public.revision_outline_inlines_to_markup(v_block -> 'inlines');
      if v_markup is null or trim(v_markup) = '' or public.revision_outline_markup_to_inlines(v_markup) is distinct from (v_block -> 'inlines') then continue; end if;
      field_key := 'block_' || v_pos; label := 'Heading ' || v_level; context := v_path;
      current_value := v_markup; max_length := 400; multiline := false; field_rows := 1; formatted := false;
      return next;

    elsif v_type = 'paragraph' then
      v_markup := public.revision_outline_inlines_to_markup(v_block -> 'inlines');
      if v_markup is null or trim(v_markup) = '' or public.revision_outline_markup_to_inlines(v_markup) is distinct from (v_block -> 'inlines') then continue; end if;
      field_key := 'block_' || v_pos; label := 'Paragraph ' || v_pos; context := v_path;
      current_value := v_markup; max_length := 12000; multiline := true;
      field_rows := least(10, greatest(2, ceil(char_length(v_markup) / 80.0)::integer + 1)); formatted := true;
      return next;

    elsif v_type = 'list' then
      for v_item, v_idx in
        select value, ord::integer from jsonb_array_elements(coalesce(v_block -> 'items', '[]'::jsonb)) with ordinality as t(value, ord)
      loop
        v_markup := public.revision_outline_inlines_to_markup(v_item -> 'inlines');
        if v_markup is null or trim(v_markup) = '' or public.revision_outline_markup_to_inlines(v_markup) is distinct from (v_item -> 'inlines') then continue; end if;
        field_key := 'block_' || v_pos || '_item_' || v_idx;
        label := case when coalesce((v_item ->> 'ordered')::boolean, false) then 'Numbered item ' else 'Bullet ' end || v_idx || ' (list ' || v_pos || ')';
        context := v_path;
        current_value := v_markup; max_length := 2000; multiline := true;
        field_rows := least(8, greatest(2, ceil(char_length(v_markup) / 80.0)::integer + 1)); formatted := true;
        return next;
      end loop;

    elsif v_type = 'table' then
      for v_row, v_r in
        select value, ord::integer from jsonb_array_elements(coalesce(v_block -> 'rows', '[]'::jsonb)) with ordinality as t(value, ord)
      loop
        for v_cell, v_c in
          select value, ord::integer from jsonb_array_elements(case when jsonb_typeof(v_row) = 'array' then v_row else '[]'::jsonb end) with ordinality as t(value, ord)
        loop
          v_markup := public.revision_outline_inlines_to_markup(v_cell);
          if v_markup is null or trim(v_markup) = '' or public.revision_outline_markup_to_inlines(v_markup) is distinct from v_cell then continue; end if;
          field_key := 'block_' || v_pos || '_cell_' || v_r || '_' || v_c;
          label := 'Table row ' || v_r || ', column ' || v_c || ' (table ' || v_pos || ')';
          context := v_path;
          current_value := v_markup; max_length := 2000; multiline := true;
          field_rows := least(8, greatest(2, ceil(char_length(v_markup) / 60.0)::integer + 1)); formatted := true;
          return next;
        end loop;
      end loop;
    end if;
  end loop;
end;
$$;

create or replace function public.revision_outline_field_info(
  p_outline_id uuid,
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
  if p_kind <> 'outline' or p_target_id is not null then return; end if;
  select f.current_value as value, f.max_length as max_len into v_row
  from public.revision_outline_fields(p_outline_id) f
  where f.field_key = p_field;
  if not found then return; end if;
  valid := true;
  current_value := v_row.value;
  max_length := v_row.max_len;
end;
$$;

-- Writes one approved value into the outline. Every branch writes exactly one known column or one
-- known place inside the stored content, so nothing the caller supplies is used as a column or key name.
create or replace function public.revision_outline_apply_value(
  p_outline_id uuid,
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
  v_oneline text;
  v_content jsonb;
  v_match text[];
  v_pos integer;
  v_block jsonb;
  v_type text;
  v_path text[];
  v_inlines jsonb;
begin
  if p_kind <> 'outline' or p_target_id is not null then
    raise exception 'Unknown revision target.';
  end if;
  -- A heading, title, list item or cell is a single line: line breaks become spaces.
  v_oneline := regexp_replace(v_value, '[[:space:]]*\n[[:space:]]*', ' ', 'g');

  if p_field = 'title' then
    if v_oneline = '' then raise exception 'The title cannot be empty.'; end if;
    update public.teaching_outlines set title = v_oneline where id = p_outline_id and status = 'draft';
    if not found then raise exception 'The text to change could not be found.'; end if;
    return;
  end if;
  if p_field = 'subtitle' then
    update public.teaching_outlines set subtitle = nullif(v_oneline, '') where id = p_outline_id and status = 'draft';
    if not found then raise exception 'The text to change could not be found.'; end if;
    return;
  end if;

  v_match := regexp_match(p_field, '^block_([0-9]+)(?:_item_([0-9]+)|_cell_([0-9]+)_([0-9]+))?$');
  if v_match is null then
    raise exception 'That outline field cannot be changed through review.';
  end if;
  if v_value = '' then raise exception 'That text cannot be empty.'; end if;

  select content into v_content from public.teaching_outlines where id = p_outline_id and status = 'draft' for update;
  v_pos := v_match[1]::integer;
  if not found or v_pos < 1 or v_pos > jsonb_array_length(v_content) then
    raise exception 'The text to change could not be found.';
  end if;
  v_block := v_content -> (v_pos - 1);
  v_type := v_block ->> 'type';

  if v_match[2] is not null then
    if v_type <> 'list' or v_match[2]::integer < 1 then raise exception 'The text to change could not be found.'; end if;
    v_path := array['items', (v_match[2]::integer - 1)::text, 'inlines'];
    v_inlines := public.revision_outline_markup_to_inlines(v_oneline);
  elsif v_match[3] is not null then
    if v_type <> 'table' or v_match[3]::integer < 1 or v_match[4]::integer < 1 then raise exception 'The text to change could not be found.'; end if;
    v_path := array['rows', (v_match[3]::integer - 1)::text, (v_match[4]::integer - 1)::text];
    v_inlines := public.revision_outline_markup_to_inlines(v_oneline);
  elsif v_type = 'heading' then
    v_path := array['inlines'];
    v_inlines := public.revision_outline_markup_to_inlines(v_oneline);
  elsif v_type = 'paragraph' then
    v_path := array['inlines'];
    v_inlines := public.revision_outline_markup_to_inlines(v_value);
  else
    raise exception 'That outline field cannot be changed through review.';
  end if;

  if jsonb_typeof(v_block #> v_path) is distinct from 'array' then
    raise exception 'The text to change could not be found.';
  end if;
  if jsonb_array_length(v_inlines) = 0 then
    raise exception 'That text cannot be empty.';
  end if;

  v_block := jsonb_set(v_block, v_path, v_inlines);
  update public.teaching_outlines
  set content = jsonb_set(v_content, array[(v_pos - 1)::text], v_block)
  where id = p_outline_id and status = 'draft';
  if not found then raise exception 'The text to change could not be found.'; end if;
end;
$$;

revoke all on function public.revision_outline_plain_text(jsonb) from public, anon, authenticated;
revoke all on function public.revision_outline_inlines_to_markup(jsonb) from public, anon, authenticated;
revoke all on function public.revision_outline_markup_to_inlines(text) from public, anon, authenticated;
revoke all on function public.revision_outline_fields(uuid) from public, anon, authenticated;
revoke all on function public.revision_outline_field_info(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.revision_outline_apply_value(uuid, text, uuid, text, text) from public, anon, authenticated;

-- What the review screens show: the editable fields of a draft outline and their current wording. Only
-- staff can ask, and a Content Manager only for an outline that was sent to them.
create or replace function public.outline_review_fields(p_outline_id uuid)
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
    raise exception 'You are not allowed to review outlines.' using errcode = '42501';
  end if;
  if not public.review_is_open('outline', null, null, null, p_outline_id) then
    raise exception 'This outline has not been sent to you for review.' using errcode = '42501';
  end if;
  return query select * from public.revision_outline_fields(p_outline_id);
end;
$$;

revoke all on function public.outline_review_fields(uuid) from public, anon;
grant execute on function public.outline_review_fields(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Content Manager actions
-- ---------------------------------------------------------------------------

create or replace function public.create_outline_revision(p_outline_id uuid)
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
    raise exception 'You are not allowed to propose outline changes.' using errcode = '42501';
  end if;

  select title, status into v_title, v_status from public.teaching_outlines where id = p_outline_id;
  if not found then
    raise exception 'That outline could not be found.' using errcode = 'P0002';
  end if;
  if v_status <> 'draft' then
    raise exception 'Changes can only be proposed to a draft outline.' using errcode = 'P0001';
  end if;

  select id into v_id
  from public.content_revisions
  where subject_type = 'outline' and outline_id = p_outline_id and submitted_by = v_user and status = 'draft';
  if found then
    return v_id;
  end if;

  v_name := coalesce(
    (select nullif(trim(aa.display_name), '') from public.admin_authorizations aa where aa.user_id = v_user),
    (select u.email from auth.users u where u.id = v_user)
  );

  insert into public.content_revisions (subject_type, outline_id, subject_title, status, submitted_by, submitted_by_name)
  values ('outline', p_outline_id, coalesce(nullif(trim(v_title), ''), 'Untitled outline'), 'draft', v_user, v_name)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.save_outline_revision_draft(p_revision_id uuid, p_changes jsonb)
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
    raise exception 'You are not allowed to propose outline changes.' using errcode = '42501';
  end if;

  select * into v_rev from public.content_revisions where id = p_revision_id for update;
  if not found or v_rev.subject_type <> 'outline' then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.submitted_by is distinct from v_user then
    raise exception 'Only the person who started a revision can change it.' using errcode = '42501';
  end if;
  if v_rev.status <> 'draft' then
    raise exception 'This revision was already submitted and can no longer be edited.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.teaching_outlines where id = v_rev.outline_id and status = 'draft') then
    raise exception 'This outline is no longer a draft, so it can no longer be reviewed.' using errcode = 'P0001';
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

    select * into v_info from public.revision_outline_field_info(v_rev.outline_id, v_kind, v_target, v_field);
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

create or replace function public.submit_outline_revision(p_revision_id uuid)
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
    raise exception 'You are not allowed to submit outline changes.' using errcode = '42501';
  end if;

  select * into v_rev from public.content_revisions where id = p_revision_id for update;
  if not found or v_rev.subject_type <> 'outline' then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.submitted_by is distinct from v_user then
    raise exception 'Only the person who started a revision can submit it.' using errcode = '42501';
  end if;
  if v_rev.status <> 'draft' then
    raise exception 'This revision was already submitted.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.teaching_outlines where id = v_rev.outline_id and status = 'draft') then
    raise exception 'This outline is no longer a draft, so it can no longer be reviewed.' using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.content_revision_changes where revision_id = p_revision_id;
  if v_count = 0 then
    raise exception 'There are no changes to submit.' using errcode = 'P0001';
  end if;

  update public.content_revisions
  set status = 'submitted',
      submitted_at = now(),
      total_changes = v_count,
      subject_title = coalesce((select nullif(trim(title), '') from public.teaching_outlines where id = v_rev.outline_id), subject_title)
  where id = p_revision_id;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Administrator actions
-- ---------------------------------------------------------------------------

create or replace function public.review_outline_revision_change(
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
  if v_rev.subject_type <> 'outline' then
    raise exception 'That change does not belong to an outline.' using errcode = 'P0001';
  end if;
  if v_rev.status <> 'submitted' then
    raise exception 'This revision is not waiting for review.' using errcode = 'P0001';
  end if;
  if v_change.change_status <> 'pending' then
    raise exception 'That change was already decided.' using errcode = 'P0001';
  end if;

  if p_decision = 'accept' then
    if not exists (select 1 from public.teaching_outlines where id = v_rev.outline_id and status = 'draft') then
      raise exception 'This outline is no longer a draft, so changes can no longer be applied.' using errcode = 'P0001';
    end if;
    select * into v_info from public.revision_outline_field_info(v_rev.outline_id, v_change.target_kind, v_change.target_id, v_change.field_key);
    if not coalesce(v_info.valid, false) then
      raise exception 'stale: The part of the outline this refers to no longer exists. Reject it.' using errcode = 'P0001';
    end if;
    v_stale := public.revision_normalize_text(v_info.current_value) is distinct from v_change.original_value;
    if v_stale and not coalesce(p_accept_anyway, false) then
      raise exception 'stale: This text changed after the proposal was made. Reject it, accept it anyway to replace the current wording, or ask the editor to submit a new revision.' using errcode = 'P0001';
    end if;
    perform public.revision_outline_apply_value(v_rev.outline_id, v_change.target_kind, v_change.target_id, v_change.field_key, v_change.proposed_value);
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

create or replace function public.review_all_outline_revision_changes(p_revision_id uuid, p_decision text)
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
  if not found or v_rev.subject_type <> 'outline' then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.status <> 'submitted' then
    raise exception 'This revision is not waiting for review.' using errcode = 'P0001';
  end if;

  if p_decision = 'accept'
     and not exists (select 1 from public.teaching_outlines where id = v_rev.outline_id and status = 'draft') then
    raise exception 'This outline is no longer a draft, so changes can no longer be applied.' using errcode = 'P0001';
  end if;

  for v_change in
    select * from public.content_revision_changes
    where revision_id = p_revision_id and change_status = 'pending'
    order by display_order
    for update
  loop
    if p_decision = 'accept' then
      select * into v_info from public.revision_outline_field_info(v_rev.outline_id, v_change.target_kind, v_change.target_id, v_change.field_key);
      if not coalesce(v_info.valid, false)
         or public.revision_normalize_text(v_info.current_value) is distinct from v_change.original_value then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      perform public.revision_outline_apply_value(v_rev.outline_id, v_change.target_kind, v_change.target_id, v_change.field_key, v_change.proposed_value);
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

-- The Administrator edits the wording of a draft outline directly (for example to put right something
-- that came in with an accepted change). Draft-only, and each edit carries the wording it was written
-- against so two people editing at once cannot overwrite each other. All edits in one save succeed or
-- fail together.
create or replace function public.admin_edit_outline_text(p_outline_id uuid, p_changes jsonb)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_change jsonb;
  v_key text;
  v_base text;
  v_value text;
  v_current text;
  v_count integer := 0;
begin
  if auth.uid() is null or not public.is_authenticated_admin() then
    raise exception 'Only an Administrator can edit the outline text.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.teaching_outlines where id = p_outline_id and status = 'draft') then
    raise exception 'Only a draft outline can be edited.' using errcode = 'P0001';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'There is nothing to save.' using errcode = '22023';
  end if;

  for v_change in select value from jsonb_array_elements(p_changes) loop
    v_key := v_change ->> 'field_key';
    v_base := v_change ->> 'base_value';
    v_value := v_change ->> 'value';

    select f.current_value into v_current
    from public.revision_outline_fields(p_outline_id) f
    where f.field_key = v_key;
    if not found then
      raise exception 'conflict: A paragraph you edited no longer exists. Reload the page.' using errcode = 'P0001';
    end if;

    if public.revision_normalize_text(coalesce(v_current, '')) is distinct from public.revision_normalize_text(coalesce(v_base, '')) then
      raise exception 'conflict: A paragraph was changed by someone else while you were editing.' using errcode = 'P0001';
    end if;

    if public.revision_normalize_text(coalesce(v_value, '')) = public.revision_normalize_text(coalesce(v_current, '')) then
      continue;
    end if;

    perform public.revision_outline_apply_value(p_outline_id, 'outline', null, v_key, v_value);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Publishing closes what is still open
-- ---------------------------------------------------------------------------

-- Same rule as teachings: a submitted revision keeps its changes (decided or not) for the record; an
-- unsubmitted draft is discarded.
create or replace function public.close_outline_revisions_on_publish()
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
    where c.revision_id = r.id and r.subject_type = 'outline' and r.outline_id = new.id and r.status = 'draft';

    update public.content_revisions r
    set status = 'cancelled',
        completed_at = now(),
        review_note = coalesce(r.review_note, 'Closed when the outline was published.'),
        total_changes = (select count(*) from public.content_revision_changes c where c.revision_id = r.id),
        purged_at = case when r.status = 'draft' then now() else r.purged_at end
    where r.subject_type = 'outline' and r.outline_id = new.id and r.status in ('draft', 'submitted');
  end if;
  return new;
end;
$$;

drop trigger if exists teaching_outlines_close_revisions_on_publish on public.teaching_outlines;
create trigger teaching_outlines_close_revisions_on_publish
after update of status on public.teaching_outlines
for each row
when (new.status = 'published' and old.status is distinct from 'published')
execute function public.close_outline_revisions_on_publish();

-- ---------------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------------

revoke all on function public.close_outline_revisions_on_publish() from public, anon, authenticated;

revoke all on function public.create_outline_revision(uuid) from public, anon;
revoke all on function public.save_outline_revision_draft(uuid, jsonb) from public, anon;
revoke all on function public.submit_outline_revision(uuid) from public, anon;
revoke all on function public.review_outline_revision_change(uuid, text, text, boolean) from public, anon;
revoke all on function public.review_all_outline_revision_changes(uuid, text) from public, anon;
revoke all on function public.admin_edit_outline_text(uuid, jsonb) from public, anon;

grant execute on function public.create_outline_revision(uuid) to authenticated;
grant execute on function public.save_outline_revision_draft(uuid, jsonb) to authenticated;
grant execute on function public.submit_outline_revision(uuid) to authenticated;
grant execute on function public.review_outline_revision_change(uuid, text, text, boolean) to authenticated;
grant execute on function public.review_all_outline_revision_changes(uuid, text) to authenticated;
grant execute on function public.admin_edit_outline_text(uuid, jsonb) to authenticated;
