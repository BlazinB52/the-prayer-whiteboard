-- Handouts: a Word handout the Administrator sends to the Content Managers for proofing.
--
-- A handout is the printed sheet that goes with a teaching. It is never published on the site; it only
-- goes through the review cycle (docs/review-standard.md). The Administrator uploads the Word file, which
-- is converted to a small block structure, and presses "Send to Content Managers for review". Each
-- Content Manager proposes wording changes (the same tables every reviewed item uses); the Administrator
-- accepts or rejects each one, and an accepted change is written into the handout in the same
-- transaction as the decision. The Administrator then copies the final text into the Word handout by hand.
--
-- Every handout belongs to a teaching date (gathering_date, required) so it can be found by the date of
-- the teaching it goes with.
--
-- Block types in content: section_title, subtitle, paragraph_title, paragraph, tagline (each with
-- "inlines"), and list (with "items", each with level, ordered and inlines). Wording is addressed by
-- position: block_5, block_6_item_2. Content Managers may propose the wording of every block, with
-- **bold**, *italic* and [label](https://address) links. A block that cannot be written that way
-- without changing it (it contains an asterisk, or a link that is also bold) is left out.
--
-- The text/markup helpers are the ones teaching outlines already use (20261011030000_outline_review.sql).

-- ---------------------------------------------------------------------------
-- The table
-- ---------------------------------------------------------------------------

create table if not exists public.teaching_handouts (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  gathering_date date not null,
  language text not null default 'en',
  status text not null default 'draft',
  sent_for_review_at timestamptz,
  content jsonb not null,
  original_content jsonb not null,
  source_file_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teaching_handouts_title_check check (length(trim(title)) between 1 and 200),
  constraint teaching_handouts_language_check check (language in ('en', 'es')),
  -- A handout is never published; the column exists so it fits the same gate code as the other kinds.
  constraint teaching_handouts_status_check check (status = 'draft'),
  constraint teaching_handouts_content_check check (jsonb_typeof(content) = 'array' and jsonb_array_length(content) between 1 and 3000),
  constraint teaching_handouts_original_check check (jsonb_typeof(original_content) = 'array')
);

create index if not exists teaching_handouts_date_idx on public.teaching_handouts (gathering_date desc);

drop trigger if exists teaching_handouts_set_updated_at on public.teaching_handouts;
create trigger teaching_handouts_set_updated_at
before update on public.teaching_handouts
for each row execute function public.set_updated_at();

alter table public.teaching_handouts enable row level security;

drop policy if exists "Admins manage teaching handouts" on public.teaching_handouts;
create policy "Admins manage teaching handouts"
on public.teaching_handouts
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

-- Content Managers read a handout only once the Administrator has sent it. They never write one.
drop policy if exists "Content managers read sent teaching handouts" on public.teaching_handouts;
create policy "Content managers read sent teaching handouts"
on public.teaching_handouts
for select
to authenticated
using (public.is_content_manager_or_admin() and sent_for_review_at is not null);

revoke all on public.teaching_handouts from anon;
grant select, insert, update, delete on public.teaching_handouts to authenticated;
grant all on public.teaching_handouts to service_role;

-- ---------------------------------------------------------------------------
-- The shared tables learn about handouts
-- ---------------------------------------------------------------------------

alter table public.content_revisions
  add column if not exists handout_id uuid references public.teaching_handouts(id) on delete cascade;

alter table public.content_revisions
  drop constraint if exists content_revisions_subject_type_check,
  add constraint content_revisions_subject_type_check
    check (subject_type in ('teaching', 'devotional', 'weekly_update', 'outline', 'handout'));

alter table public.content_revisions
  drop constraint if exists content_revisions_subject_check,
  add constraint content_revisions_subject_check check (
    (subject_type = 'teaching' and teaching_id is not null and devotional_id is null and weekly_update_id is null and outline_id is null and handout_id is null)
    or (subject_type = 'devotional' and devotional_id is not null and teaching_id is null and weekly_update_id is null and outline_id is null and handout_id is null)
    or (subject_type = 'weekly_update' and weekly_update_id is not null and teaching_id is null and devotional_id is null and outline_id is null and handout_id is null)
    or (subject_type = 'outline' and outline_id is not null and teaching_id is null and devotional_id is null and weekly_update_id is null and handout_id is null)
    or (subject_type = 'handout' and handout_id is not null and teaching_id is null and devotional_id is null and weekly_update_id is null and outline_id is null)
  );

alter table public.content_revision_changes
  drop constraint if exists content_revision_changes_target_kind_check,
  add constraint content_revision_changes_target_kind_check
    check (target_kind in ('teaching', 'category', 'section', 'devotional', 'day', 'weekly_update', 'outline', 'handout'));

alter table public.content_revision_changes
  drop constraint if exists content_revision_changes_target_check,
  add constraint content_revision_changes_target_check
    check (
      (target_kind in ('teaching', 'devotional', 'weekly_update', 'outline', 'handout') and target_id is null)
      or (target_kind in ('category', 'section', 'day') and target_id is not null)
    );

-- One open draft per editor per handout.
create unique index if not exists content_revisions_one_handout_draft_per_editor_idx
  on public.content_revisions (handout_id, submitted_by)
  where status = 'draft' and subject_type = 'handout';

create index if not exists content_revisions_handout_idx
  on public.content_revisions (handout_id);

-- ---------------------------------------------------------------------------
-- The gate check, now aware of handouts
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
  elsif p_subject_type = 'handout' then
    return exists (select 1 from public.teaching_handouts where id = p_handout_id and sent_for_review_at is not null);
  end if;
  return false;
end;
$$;

-- The five-argument form keeps working for everything written before handouts existed.
create or replace function public.review_is_open(p_subject_type text, p_teaching_id uuid, p_devotional_id uuid, p_weekly_update_id uuid, p_outline_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.review_is_open(p_subject_type, p_teaching_id, p_devotional_id, p_weekly_update_id, p_outline_id, null::uuid);
$$;

revoke all on function public.review_is_open(text, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.review_is_open(text, uuid, uuid, uuid, uuid) from public, anon, authenticated;

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

  if not public.review_is_open(v_rev.subject_type, v_rev.teaching_id, v_rev.devotional_id, v_rev.weekly_update_id, v_rev.outline_id, v_rev.handout_id) then
    raise exception 'This has not been sent to you for review, or was taken back by the Administrator.' using errcode = '42501';
  end if;
  return new;
end;
$$;

-- Taking a submitted revision back must not collide with a newer draft of the same handout.
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
      and r.handout_id is not distinct from v_rev.handout_id
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
-- Editable fields
-- ---------------------------------------------------------------------------

-- The heading a revision carries: the handout's title and its teaching date, so the Revisions page
-- shows which teaching it goes with.
create or replace function public.revision_handout_subject_title(p_handout_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(nullif(trim(title), ''), 'Untitled handout') || ' (' || to_char(gathering_date, 'FMMon FMDD, YYYY') || ')'
  from public.teaching_handouts where id = p_handout_id;
$$;

-- Every field of a handout that a Content Manager may propose changes to, in reading order. A piece of
-- text is offered only if writing it as markup and reading it back gives exactly what is stored. The
-- context groups fields under the section and paragraph title they sit below, so the review screen shows
-- one card per titled paragraph.
create or replace function public.revision_handout_fields(p_handout_id uuid)
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
  v_handout public.teaching_handouts%rowtype;
  v_block jsonb;
  v_pos integer;
  v_type text;
  v_sec integer := 0;
  v_sec_title text := '';
  v_ptitle text := '';
  v_markup text;
  v_item jsonb;
  v_idx integer;
  v_path text;
begin
  select * into v_handout from public.teaching_handouts where id = p_handout_id;
  if not found then return; end if;

  for v_block, v_pos in
    select value, ord::integer from jsonb_array_elements(v_handout.content) with ordinality as t(value, ord)
  loop
    v_type := v_block ->> 'type';

    if v_type = 'section_title' then
      v_sec := v_sec + 1;
      v_sec_title := public.revision_outline_plain_text(v_block -> 'inlines');
      v_ptitle := '';
    elsif v_type = 'paragraph_title' then
      v_ptitle := public.revision_outline_plain_text(v_block -> 'inlines');
    end if;

    if v_sec = 0 then
      v_path := 'Before the first section';
    else
      v_path := 'Section ' || v_sec || case when v_sec_title <> '' then ': ' || v_sec_title else '' end
        || case when v_ptitle <> '' then ' › ' || v_ptitle else '' end;
    end if;

    if v_type in ('section_title', 'subtitle', 'paragraph_title', 'tagline', 'paragraph') then
      v_markup := public.revision_outline_inlines_to_markup(v_block -> 'inlines');
      if v_markup is null or trim(v_markup) = '' or public.revision_outline_markup_to_inlines(v_markup) is distinct from (v_block -> 'inlines') then continue; end if;
      field_key := 'block_' || v_pos;
      context := v_path;
      if v_type = 'paragraph' then
        label := case when v_ptitle = '' then 'Opening paragraph' else 'Paragraph' end;
        current_value := v_markup; max_length := 12000; multiline := true;
        field_rows := least(10, greatest(2, ceil(char_length(v_markup) / 80.0)::integer + 1)); formatted := true;
      else
        label := case v_type when 'section_title' then 'Section title' when 'subtitle' then 'Section subtitle' when 'paragraph_title' then 'Paragraph title' else 'Closing line' end;
        current_value := v_markup; max_length := 600; multiline := false; field_rows := 1; formatted := false;
      end if;
      return next;

    elsif v_type = 'list' then
      for v_item, v_idx in
        select value, ord::integer from jsonb_array_elements(coalesce(v_block -> 'items', '[]'::jsonb)) with ordinality as t(value, ord)
      loop
        v_markup := public.revision_outline_inlines_to_markup(v_item -> 'inlines');
        if v_markup is null or trim(v_markup) = '' or public.revision_outline_markup_to_inlines(v_markup) is distinct from (v_item -> 'inlines') then continue; end if;
        field_key := 'block_' || v_pos || '_item_' || v_idx;
        label := 'Bullet ' || v_idx;
        context := v_path;
        current_value := v_markup; max_length := 2000; multiline := true;
        field_rows := least(8, greatest(2, ceil(char_length(v_markup) / 80.0)::integer + 1)); formatted := true;
        return next;
      end loop;
    end if;
  end loop;
end;
$$;

create or replace function public.revision_handout_field_info(
  p_handout_id uuid,
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
  if p_kind <> 'handout' or p_target_id is not null then return; end if;
  select f.current_value as value, f.max_length as max_len into v_row
  from public.revision_handout_fields(p_handout_id) f
  where f.field_key = p_field;
  if not found then return; end if;
  valid := true;
  current_value := v_row.value;
  max_length := v_row.max_len;
end;
$$;

-- Writes one approved value into the handout. Every branch writes exactly one known place inside the
-- stored content, so nothing the caller supplies is used as a column or key name.
create or replace function public.revision_handout_apply_value(
  p_handout_id uuid,
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
  if p_kind <> 'handout' or p_target_id is not null then
    raise exception 'Unknown revision target.';
  end if;
  -- Titles, closing lines and list items are a single line: line breaks become spaces.
  v_oneline := regexp_replace(v_value, '[[:space:]]*\n[[:space:]]*', ' ', 'g');

  v_match := regexp_match(p_field, '^block_([0-9]+)(?:_item_([0-9]+))?$');
  if v_match is null then
    raise exception 'That handout field cannot be changed through review.';
  end if;
  if v_value = '' then raise exception 'That text cannot be empty.'; end if;

  select content into v_content from public.teaching_handouts where id = p_handout_id for update;
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
  elsif v_type in ('section_title', 'subtitle', 'paragraph_title', 'tagline') then
    v_path := array['inlines'];
    v_inlines := public.revision_outline_markup_to_inlines(v_oneline);
  elsif v_type = 'paragraph' then
    v_path := array['inlines'];
    v_inlines := public.revision_outline_markup_to_inlines(v_value);
  else
    raise exception 'That handout field cannot be changed through review.';
  end if;

  if jsonb_typeof(v_block #> v_path) is distinct from 'array' then
    raise exception 'The text to change could not be found.';
  end if;
  if jsonb_array_length(v_inlines) = 0 then
    raise exception 'That text cannot be empty.';
  end if;

  v_block := jsonb_set(v_block, v_path, v_inlines);
  update public.teaching_handouts
  set content = jsonb_set(v_content, array[(v_pos - 1)::text], v_block)
  where id = p_handout_id;
  if not found then raise exception 'The text to change could not be found.'; end if;
end;
$$;

revoke all on function public.revision_handout_subject_title(uuid) from public, anon, authenticated;
revoke all on function public.revision_handout_fields(uuid) from public, anon, authenticated;
revoke all on function public.revision_handout_field_info(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.revision_handout_apply_value(uuid, text, uuid, text, text) from public, anon, authenticated;

-- What the review screens show: the editable fields of a handout and their current wording. Only staff
-- can ask, and a Content Manager only for a handout that was sent to them.
create or replace function public.handout_review_fields(p_handout_id uuid)
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
    raise exception 'You are not allowed to review handouts.' using errcode = '42501';
  end if;
  if not public.review_is_open('handout', null, null, null, null, p_handout_id) then
    raise exception 'This handout has not been sent to you for review.' using errcode = '42501';
  end if;
  return query select * from public.revision_handout_fields(p_handout_id);
end;
$$;

revoke all on function public.handout_review_fields(uuid) from public, anon;
grant execute on function public.handout_review_fields(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- Content Manager actions
-- ---------------------------------------------------------------------------

create or replace function public.create_handout_revision(p_handout_id uuid)
returns uuid
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
  v_id uuid;
  v_name text;
begin
  if v_user is null or not public.is_content_manager_or_admin() then
    raise exception 'You are not allowed to propose handout changes.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.teaching_handouts where id = p_handout_id) then
    raise exception 'That handout could not be found.' using errcode = 'P0002';
  end if;

  select id into v_id
  from public.content_revisions
  where subject_type = 'handout' and handout_id = p_handout_id and submitted_by = v_user and status = 'draft';
  if found then
    return v_id;
  end if;

  v_name := coalesce(
    (select nullif(trim(aa.display_name), '') from public.admin_authorizations aa where aa.user_id = v_user),
    (select u.email from auth.users u where u.id = v_user)
  );

  insert into public.content_revisions (subject_type, handout_id, subject_title, status, submitted_by, submitted_by_name)
  values ('handout', p_handout_id, public.revision_handout_subject_title(p_handout_id), 'draft', v_user, v_name)
  returning id into v_id;
  return v_id;
end;
$$;

create or replace function public.save_handout_revision_draft(p_revision_id uuid, p_changes jsonb)
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
    raise exception 'You are not allowed to propose handout changes.' using errcode = '42501';
  end if;

  select * into v_rev from public.content_revisions where id = p_revision_id for update;
  if not found or v_rev.subject_type <> 'handout' then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.submitted_by is distinct from v_user then
    raise exception 'Only the person who started a revision can change it.' using errcode = '42501';
  end if;
  if v_rev.status <> 'draft' then
    raise exception 'This revision was already submitted and can no longer be edited.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.teaching_handouts where id = v_rev.handout_id) then
    raise exception 'This handout no longer exists.' using errcode = 'P0001';
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

    select * into v_info from public.revision_handout_field_info(v_rev.handout_id, v_kind, v_target, v_field);
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

create or replace function public.submit_handout_revision(p_revision_id uuid)
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
    raise exception 'You are not allowed to submit handout changes.' using errcode = '42501';
  end if;

  select * into v_rev from public.content_revisions where id = p_revision_id for update;
  if not found or v_rev.subject_type <> 'handout' then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.submitted_by is distinct from v_user then
    raise exception 'Only the person who started a revision can submit it.' using errcode = '42501';
  end if;
  if v_rev.status <> 'draft' then
    raise exception 'This revision was already submitted.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.teaching_handouts where id = v_rev.handout_id) then
    raise exception 'This handout no longer exists.' using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.content_revision_changes where revision_id = p_revision_id;
  if v_count = 0 then
    raise exception 'There are no changes to submit.' using errcode = 'P0001';
  end if;

  update public.content_revisions
  set status = 'submitted',
      submitted_at = now(),
      total_changes = v_count,
      subject_title = coalesce(public.revision_handout_subject_title(v_rev.handout_id), subject_title)
  where id = p_revision_id;
  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Administrator actions
-- ---------------------------------------------------------------------------

create or replace function public.review_handout_revision_change(
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
  if v_rev.subject_type <> 'handout' then
    raise exception 'That change does not belong to a handout.' using errcode = 'P0001';
  end if;
  if v_rev.status <> 'submitted' then
    raise exception 'This revision is not waiting for review.' using errcode = 'P0001';
  end if;
  if v_change.change_status <> 'pending' then
    raise exception 'That change was already decided.' using errcode = 'P0001';
  end if;

  if p_decision = 'accept' then
    select * into v_info from public.revision_handout_field_info(v_rev.handout_id, v_change.target_kind, v_change.target_id, v_change.field_key);
    if not coalesce(v_info.valid, false) then
      raise exception 'stale: The part of the handout this refers to no longer exists. Reject it.' using errcode = 'P0001';
    end if;
    v_stale := public.revision_normalize_text(v_info.current_value) is distinct from v_change.original_value;
    if v_stale and not coalesce(p_accept_anyway, false) then
      raise exception 'stale: This text changed after the proposal was made. Reject it, accept it anyway to replace the current wording, or ask the editor to submit a new revision.' using errcode = 'P0001';
    end if;
    perform public.revision_handout_apply_value(v_rev.handout_id, v_change.target_kind, v_change.target_id, v_change.field_key, v_change.proposed_value);
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

create or replace function public.review_all_handout_revision_changes(p_revision_id uuid, p_decision text)
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
  if not found or v_rev.subject_type <> 'handout' then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.status <> 'submitted' then
    raise exception 'This revision is not waiting for review.' using errcode = 'P0001';
  end if;

  for v_change in
    select * from public.content_revision_changes
    where revision_id = p_revision_id and change_status = 'pending'
    order by display_order
    for update
  loop
    if p_decision = 'accept' then
      select * into v_info from public.revision_handout_field_info(v_rev.handout_id, v_change.target_kind, v_change.target_id, v_change.field_key);
      if not coalesce(v_info.valid, false)
         or public.revision_normalize_text(v_info.current_value) is distinct from v_change.original_value then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      perform public.revision_handout_apply_value(v_rev.handout_id, v_change.target_kind, v_change.target_id, v_change.field_key, v_change.proposed_value);
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

-- The Administrator edits the wording of a handout directly. Each edit carries the wording it was written
-- against so two people editing at once cannot overwrite each other. All edits in one save succeed or
-- fail together.
create or replace function public.admin_edit_handout_text(p_handout_id uuid, p_changes jsonb)
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
    raise exception 'Only an Administrator can edit the handout text.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.teaching_handouts where id = p_handout_id) then
    raise exception 'That handout could not be found.' using errcode = 'P0001';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'There is nothing to save.' using errcode = '22023';
  end if;

  for v_change in select value from jsonb_array_elements(p_changes) loop
    v_key := v_change ->> 'field_key';
    v_base := v_change ->> 'base_value';
    v_value := v_change ->> 'value';

    select f.current_value into v_current
    from public.revision_handout_fields(p_handout_id) f
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

    perform public.revision_handout_apply_value(p_handout_id, 'handout', null, v_key, v_value);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

-- The Administrator can add and remove paragraphs (and bullets). Refused while any Content Manager
-- proposal on the handout is still open, because a block's position is its identity in a review and
-- adding or removing one moves everything below it.
--
--   delete: a title, subtitle, paragraph or closing line (the whole block), or one bullet (the list goes
--           when its last bullet does)
--   insert: a new paragraph after a block, or a new bullet after a bullet
create or replace function public.admin_handout_structure(p_handout_id uuid, p_action text, p_field text)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_content jsonb;
  v_match text[];
  v_pos integer;
  v_item integer;
  v_block jsonb;
  v_items jsonb;
  v_new jsonb;
begin
  if auth.uid() is null or not public.is_authenticated_admin() then
    raise exception 'Only an Administrator can add or remove paragraphs.' using errcode = '42501';
  end if;
  if p_action not in ('insert', 'delete') then
    raise exception 'The action must be insert or delete.' using errcode = '22023';
  end if;

  select content into v_content from public.teaching_handouts where id = p_handout_id for update;
  if not found then
    raise exception 'That handout could not be found.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.content_revisions
    where subject_type = 'handout' and handout_id = p_handout_id and status in ('draft', 'submitted')
  ) then
    raise exception 'Close or decide the open Content Manager proposals on this handout first (see Revisions). Adding or removing a paragraph moves everything below it, so a proposal written before would land in the wrong place.' using errcode = 'P0001';
  end if;

  v_match := regexp_match(p_field, '^block_([0-9]+)(?:_item_([0-9]+))?$');
  if v_match is null then
    raise exception 'That part of the handout cannot be added to or removed.' using errcode = '22023';
  end if;
  v_pos := v_match[1]::integer;
  if v_pos < 1 or v_pos > jsonb_array_length(v_content) then
    raise exception 'The text to change could not be found.' using errcode = 'P0001';
  end if;
  v_block := v_content -> (v_pos - 1);

  if v_match[2] is null then
    if v_block ->> 'type' not in ('section_title', 'subtitle', 'paragraph_title', 'paragraph', 'tagline') then
      raise exception 'That part of the handout cannot be added to or removed.' using errcode = '22023';
    end if;
    if p_action = 'delete' then
      if jsonb_array_length(v_content) <= 1 then
        raise exception 'A handout needs at least one paragraph.' using errcode = 'P0001';
      end if;
      v_content := v_content - (v_pos - 1);
    else
      v_new := jsonb_build_object('type', 'paragraph', 'inlines', jsonb_build_array(jsonb_build_object('text', 'New paragraph')));
      v_content := jsonb_insert(v_content, array[(v_pos - 1)::text], v_new, true);
    end if;
  else
    v_item := v_match[2]::integer;
    v_items := v_block -> 'items';
    if v_block ->> 'type' <> 'list' or jsonb_typeof(v_items) is distinct from 'array' or v_item < 1 or v_item > jsonb_array_length(v_items) then
      raise exception 'The text to change could not be found.' using errcode = 'P0001';
    end if;
    if p_action = 'delete' then
      v_items := v_items - (v_item - 1);
      if jsonb_array_length(v_items) = 0 then
        if jsonb_array_length(v_content) <= 1 then
          raise exception 'A handout needs at least one paragraph.' using errcode = 'P0001';
        end if;
        v_content := v_content - (v_pos - 1);
      else
        v_content := jsonb_set(v_content, array[(v_pos - 1)::text], jsonb_set(v_block, '{items}', v_items));
      end if;
    else
      v_new := jsonb_build_object(
        'level', coalesce(v_items -> (v_item - 1) -> 'level', '0'::jsonb),
        'ordered', coalesce(v_items -> (v_item - 1) -> 'ordered', 'false'::jsonb),
        'inlines', jsonb_build_array(jsonb_build_object('text', 'New item'))
      );
      v_items := jsonb_insert(v_items, array[(v_item - 1)::text], v_new, true);
      v_content := jsonb_set(v_content, array[(v_pos - 1)::text], jsonb_set(v_block, '{items}', v_items));
    end if;
  end if;

  update public.teaching_handouts set content = v_content where id = p_handout_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------------

revoke all on function public.create_handout_revision(uuid) from public, anon;
revoke all on function public.save_handout_revision_draft(uuid, jsonb) from public, anon;
revoke all on function public.submit_handout_revision(uuid) from public, anon;
revoke all on function public.review_handout_revision_change(uuid, text, text, boolean) from public, anon;
revoke all on function public.review_all_handout_revision_changes(uuid, text) from public, anon;
revoke all on function public.admin_edit_handout_text(uuid, jsonb) from public, anon;
revoke all on function public.admin_handout_structure(uuid, text, text) from public, anon;

grant execute on function public.create_handout_revision(uuid) to authenticated;
grant execute on function public.save_handout_revision_draft(uuid, jsonb) to authenticated;
grant execute on function public.submit_handout_revision(uuid) to authenticated;
grant execute on function public.review_handout_revision_change(uuid, text, text, boolean) to authenticated;
grant execute on function public.review_all_handout_revision_changes(uuid, text) to authenticated;
grant execute on function public.admin_edit_handout_text(uuid, jsonb) to authenticated;
grant execute on function public.admin_handout_structure(uuid, text, text) to authenticated;
