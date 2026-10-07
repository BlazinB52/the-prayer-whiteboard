-- Word-style review for teachings (Phase 1).
--
-- A co-editor (the existing content_manager role) proposes text changes to a DRAFT teaching. The
-- teaching tables stay the only source of approved content; proposals live only in the two tables
-- below and are never read by any public page. An Admin accepts or rejects each change, and only an
-- accepted change is written to the teaching, inside one transaction with the decision record.
--
-- Nothing is written to these tables directly. The tables have no insert/update/delete privileges
-- for the app roles; every write goes through the functions at the bottom, which check who is
-- calling and what state the revision is in.
--
-- Temporary text is not kept. When a revision is finished (every change decided), cancelled, or its
-- teaching is published, the original and proposed wording is deleted and only a small audit row is
-- left (who proposed, who decided, when, how many changes were accepted or rejected). An Admin can
-- clear old audit rows at any time with purge_revision_history().
--
-- The subject columns (devotional_id, weekly_update_id) are in place so Devotionals and Weekly
-- Updates can use the same tables later; Phase 1 only creates and reviews teaching revisions.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.content_revisions (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null default 'teaching',
  teaching_id uuid references public.teachings(id) on delete cascade,
  devotional_id uuid references public.teaching_devotionals(id) on delete cascade,
  weekly_update_id uuid references public.weekly_updates(id) on delete cascade,
  -- The title is copied so the audit row stays readable after the text is deleted.
  subject_title text not null,
  status text not null default 'draft',
  submitted_by uuid references auth.users(id) on delete set null,
  submitted_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  completed_by uuid references auth.users(id) on delete set null,
  completed_by_name text,
  review_note text,
  total_changes integer not null default 0,
  accepted_count integer not null default 0,
  rejected_count integer not null default 0,
  -- Set when the original/proposed wording has been deleted.
  purged_at timestamptz,
  constraint content_revisions_subject_type_check
    check (subject_type in ('teaching', 'devotional', 'weekly_update')),
  constraint content_revisions_subject_check check (
    (subject_type = 'teaching' and teaching_id is not null and devotional_id is null and weekly_update_id is null)
    or (subject_type = 'devotional' and devotional_id is not null and teaching_id is null and weekly_update_id is null)
    or (subject_type = 'weekly_update' and weekly_update_id is not null and teaching_id is null and devotional_id is null)
  ),
  constraint content_revisions_status_check
    check (status in ('draft', 'submitted', 'completed', 'cancelled')),
  constraint content_revisions_finished_check
    check (status not in ('completed', 'cancelled') or completed_at is not null),
  constraint content_revisions_submitted_check
    check (status = 'draft' or submitted_at is not null or status = 'cancelled'),
  constraint content_revisions_counts_check
    check (total_changes >= 0 and accepted_count >= 0 and rejected_count >= 0 and accepted_count + rejected_count <= total_changes),
  constraint content_revisions_subject_title_check
    check (length(trim(subject_title)) > 0)
);

-- One open draft per editor per teaching.
create unique index if not exists content_revisions_one_draft_per_editor_idx
  on public.content_revisions (teaching_id, submitted_by)
  where status = 'draft' and subject_type = 'teaching';

create index if not exists content_revisions_status_idx
  on public.content_revisions (status, submitted_at desc);
create index if not exists content_revisions_teaching_idx
  on public.content_revisions (teaching_id);
create index if not exists content_revisions_submitted_by_idx
  on public.content_revisions (submitted_by);

drop trigger if exists content_revisions_set_updated_at on public.content_revisions;
create trigger content_revisions_set_updated_at
before update on public.content_revisions
for each row execute function public.set_updated_at();

create table if not exists public.content_revision_changes (
  id uuid primary key default gen_random_uuid(),
  revision_id uuid not null references public.content_revisions(id) on delete cascade,
  -- 'teaching' (the teaching's own fields), 'category', or 'section'.
  target_kind text not null,
  -- The category or section id; null for the teaching's own fields.
  target_id uuid,
  field_key text not null,
  -- The wording when the proposal was saved, read from the database, never from the browser.
  original_value text not null default '',
  proposed_value text not null default '',
  change_status text not null default 'pending',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  admin_note text,
  display_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint content_revision_changes_target_kind_check
    check (target_kind in ('teaching', 'category', 'section')),
  constraint content_revision_changes_target_check
    check ((target_kind = 'teaching' and target_id is null) or (target_kind <> 'teaching' and target_id is not null)),
  constraint content_revision_changes_status_check
    check (change_status in ('pending', 'accepted', 'rejected')),
  constraint content_revision_changes_decision_check
    check (change_status = 'pending' or (reviewed_by is not null and reviewed_at is not null)),
  constraint content_revision_changes_note_check
    check (admin_note is null or length(admin_note) <= 1000)
);

create unique index if not exists content_revision_changes_one_per_field_idx
  on public.content_revision_changes (revision_id, target_kind, coalesce(target_id, '00000000-0000-0000-0000-000000000000'::uuid), field_key);

create index if not exists content_revision_changes_revision_idx
  on public.content_revision_changes (revision_id, display_order);

-- ---------------------------------------------------------------------------
-- Access: read-only for the app roles, and only the rows they are entitled to see.
-- ---------------------------------------------------------------------------

alter table public.content_revisions enable row level security;
alter table public.content_revision_changes enable row level security;

revoke all on public.content_revisions from public, anon, authenticated;
revoke all on public.content_revision_changes from public, anon, authenticated;
grant select on public.content_revisions to authenticated;
grant select on public.content_revision_changes to authenticated;
grant select, insert, update, delete on public.content_revisions to service_role;
grant select, insert, update, delete on public.content_revision_changes to service_role;

drop policy if exists "Admins read content revisions" on public.content_revisions;
create policy "Admins read content revisions"
on public.content_revisions
for select
to authenticated
using (public.is_authenticated_admin());

drop policy if exists "Editors read their own content revisions" on public.content_revisions;
create policy "Editors read their own content revisions"
on public.content_revisions
for select
to authenticated
using (submitted_by = auth.uid() and public.is_content_manager_or_admin());

drop policy if exists "Admins read content revision changes" on public.content_revision_changes;
create policy "Admins read content revision changes"
on public.content_revision_changes
for select
to authenticated
using (public.is_authenticated_admin());

drop policy if exists "Editors read changes of their own revisions" on public.content_revision_changes;
create policy "Editors read changes of their own revisions"
on public.content_revision_changes
for select
to authenticated
using (
  public.is_content_manager_or_admin()
  and exists (
    select 1
    from public.content_revisions r
    where r.id = content_revision_changes.revision_id
      and r.submitted_by = auth.uid()
  )
);

-- Co-editors read draft teachings (and nothing else) so they can see the wording they are
-- reviewing. This adds read access only; they still have no way to write to these tables.
drop policy if exists "Content managers read draft teachings" on public.teachings;
create policy "Content managers read draft teachings"
on public.teachings
for select
to authenticated
using (public.is_content_manager_or_admin() and status = 'draft');

drop policy if exists "Content managers read draft teaching categories" on public.teaching_categories;
create policy "Content managers read draft teaching categories"
on public.teaching_categories
for select
to authenticated
using (
  public.is_content_manager_or_admin()
  and status = 'draft'
  and exists (select 1 from public.teachings t where t.id = teaching_categories.teaching_id and t.status = 'draft')
);

drop policy if exists "Content managers read draft teaching sections" on public.teaching_sections;
create policy "Content managers read draft teaching sections"
on public.teaching_sections
for select
to authenticated
using (
  public.is_content_manager_or_admin()
  and status = 'draft'
  and exists (select 1 from public.teachings t where t.id = teaching_sections.teaching_id and t.status = 'draft')
);

-- ---------------------------------------------------------------------------
-- Internal helpers (not callable by the app roles)
-- ---------------------------------------------------------------------------

create or replace function public.revision_normalize_text(p_value text)
returns text
language sql
immutable
set search_path = public
as $$
  select trim(replace(replace(coalesce(p_value, ''), E'\r\n', E'\n'), E'\r', E'\n'));
$$;

-- Describes one editable field of a draft teaching: whether it exists for this target, its current
-- wording, and its length limit. The limits match the ones the admin editor enforces.
--
-- Editable by a co-editor: the teaching's title, central theme, introduction, short summary and
-- teaser text; a category's title; a section's title and its wording (text, introduction, bullets,
-- conclusion, quotation, reference).
-- Admin only (never editable here): gathering date, teaching type, language, slug, chalkboards,
-- footer, devotional links, publish status, section format, callouts, show-title, alignment, order,
-- adding or removing sections, and a scripture's translation (it decides the copyright notice).
create or replace function public.revision_field_info(
  p_teaching_id uuid,
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
  v_format text;
  v_content jsonb;
  v_text text;
begin
  valid := false;
  current_value := null;
  max_length := 0;

  if p_kind = 'teaching' then
    if p_target_id is not null then return; end if;
    select
      case p_field
        when 'title' then t.title
        when 'central_theme' then t.central_theme
        when 'introduction' then t.introduction
        when 'summary' then t.summary
        when 'teaser_1_heading' then t.teaser_1_heading
        when 'teaser_1_text' then t.teaser_1_text
        when 'teaser_2_heading' then t.teaser_2_heading
        when 'teaser_2_text' then t.teaser_2_text
      end
    into v_text
    from public.teachings t
    where t.id = p_teaching_id and t.status = 'draft';
    if not found then return; end if;
    max_length := case p_field
      when 'title' then 160
      when 'central_theme' then 400
      when 'introduction' then 5000
      when 'summary' then 500
      when 'teaser_1_heading' then 100
      when 'teaser_2_heading' then 100
      when 'teaser_1_text' then 300
      when 'teaser_2_text' then 300
      else 0
    end;
    if max_length = 0 then return; end if;
    valid := true;
    current_value := v_text;
    return;
  end if;

  if p_kind = 'category' then
    if p_field <> 'title' or p_target_id is null then return; end if;
    select c.title into v_title
    from public.teaching_categories c
    join public.teachings t on t.id = c.teaching_id
    where c.id = p_target_id and c.teaching_id = p_teaching_id and c.status = 'draft' and t.status = 'draft';
    if not found then return; end if;
    valid := true;
    current_value := v_title;
    max_length := 160;
    return;
  end if;

  if p_kind = 'section' then
    if p_target_id is null then return; end if;
    select s.title, s.content into v_title, v_content
    from public.teaching_sections s
    join public.teachings t on t.id = s.teaching_id
    where s.id = p_target_id and s.teaching_id = p_teaching_id and s.status = 'draft' and t.status = 'draft';
    if not found then return; end if;
    v_format := v_content ->> 'format';

    if p_field = 'title' then
      valid := true; current_value := v_title; max_length := 160; return;
    end if;

    -- Wording fields exist only for the formats that use them.
    if p_field = 'text' and v_format in ('paragraph', 'takeaway') then
      valid := true; current_value := v_content ->> 'text'; max_length := 12000; return;
    end if;
    if p_field in ('introduction', 'conclusion') and v_format = 'bullets' then
      valid := true; current_value := v_content ->> p_field; max_length := 12000; return;
    end if;
    if p_field = 'bullets' and v_format = 'bullets' and jsonb_typeof(v_content -> 'bullets') = 'array' then
      valid := true;
      select string_agg(b, E'\n' order by ord) into current_value
      from jsonb_array_elements_text(v_content -> 'bullets') with ordinality as t(b, ord);
      max_length := 12000;
      return;
    end if;
    if p_field = 'introduction' and v_format = 'scripture' then
      valid := true; current_value := v_content ->> 'introduction'; max_length := 12000; return;
    end if;
    if p_field = 'quotation' and v_format = 'scripture' then
      valid := true; current_value := v_content ->> 'quotation'; max_length := 12000; return;
    end if;
    if p_field = 'reference' and v_format = 'scripture' then
      valid := true; current_value := v_content ->> 'reference'; max_length := 240; return;
    end if;
    return;
  end if;
end;
$$;

-- Writes one approved value into the teaching. Every branch writes exactly one known column or one
-- known key, so nothing the caller supplies is ever used as a column or key name.
create or replace function public.revision_apply_value(
  p_teaching_id uuid,
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
  v_bullets jsonb;
begin
  if p_kind = 'teaching' then
    if p_field = 'title' then
      if v_value = '' then raise exception 'The title cannot be empty.'; end if;
      update public.teachings set title = v_value where id = p_teaching_id and status = 'draft';
    elsif p_field = 'central_theme' then
      update public.teachings set central_theme = nullif(v_value, '') where id = p_teaching_id and status = 'draft';
    elsif p_field = 'introduction' then
      update public.teachings set introduction = nullif(v_value, '') where id = p_teaching_id and status = 'draft';
    elsif p_field = 'summary' then
      update public.teachings set summary = nullif(v_value, '') where id = p_teaching_id and status = 'draft';
    elsif p_field = 'teaser_1_heading' then
      update public.teachings set teaser_1_heading = nullif(v_value, '') where id = p_teaching_id and status = 'draft';
    elsif p_field = 'teaser_1_text' then
      update public.teachings set teaser_1_text = nullif(v_value, '') where id = p_teaching_id and status = 'draft';
    elsif p_field = 'teaser_2_heading' then
      update public.teachings set teaser_2_heading = nullif(v_value, '') where id = p_teaching_id and status = 'draft';
    elsif p_field = 'teaser_2_text' then
      update public.teachings set teaser_2_text = nullif(v_value, '') where id = p_teaching_id and status = 'draft';
    else
      raise exception 'That teaching field cannot be changed through review.';
    end if;
    get diagnostics v_rows = row_count;
  elsif p_kind = 'category' then
    if p_field <> 'title' then raise exception 'That category field cannot be changed through review.'; end if;
    if v_value = '' then raise exception 'A category title cannot be empty.'; end if;
    update public.teaching_categories set title = v_value
    where id = p_target_id and teaching_id = p_teaching_id and status = 'draft';
    get diagnostics v_rows = row_count;
  elsif p_kind = 'section' then
    if p_field = 'title' then
      if v_value = '' then raise exception 'A section title cannot be empty.'; end if;
      update public.teaching_sections set title = v_value
      where id = p_target_id and teaching_id = p_teaching_id and status = 'draft';
    elsif p_field in ('text', 'quotation', 'reference') then
      if v_value = '' then raise exception 'That section text cannot be empty.'; end if;
      update public.teaching_sections set content = jsonb_set(content, array[p_field], to_jsonb(v_value))
      where id = p_target_id and teaching_id = p_teaching_id and status = 'draft';
    elsif p_field in ('introduction', 'conclusion') then
      -- Optional wording: emptying it removes the key, as the admin editor does.
      update public.teaching_sections
      set content = case when v_value = '' then content - p_field else jsonb_set(content, array[p_field], to_jsonb(v_value)) end
      where id = p_target_id and teaching_id = p_teaching_id and status = 'draft';
    elsif p_field = 'bullets' then
      select coalesce(jsonb_agg(trim(line)) filter (where trim(line) <> ''), '[]'::jsonb)
      into v_bullets
      from unnest(string_to_array(v_value, E'\n')) as line;
      if jsonb_array_length(v_bullets) = 0 then raise exception 'A bullet list needs at least one bullet.'; end if;
      update public.teaching_sections set content = jsonb_set(content, array['bullets'], v_bullets)
      where id = p_target_id and teaching_id = p_teaching_id and status = 'draft';
    else
      raise exception 'That section field cannot be changed through review.';
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

-- Closes a revision once nothing is waiting on a decision: records the counts, then deletes the
-- wording so only the small audit row remains.
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
  v_name text;
begin
  select count(*) filter (where change_status = 'pending'),
         count(*) filter (where change_status = 'accepted'),
         count(*) filter (where change_status = 'rejected')
  into v_pending, v_accepted, v_rejected
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
      total_changes = v_accepted + v_rejected,
      purged_at = now()
  where id = p_revision_id;

  delete from public.content_revision_changes where revision_id = p_revision_id;
  return true;
end;
$$;

revoke all on function public.revision_normalize_text(text) from public, anon, authenticated;
revoke all on function public.revision_field_info(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.revision_apply_value(uuid, text, uuid, text, text) from public, anon, authenticated;
revoke all on function public.revision_finish_if_done(uuid, uuid) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Co-editor actions
-- ---------------------------------------------------------------------------

-- Starts (or returns the caller's existing) draft revision for a draft teaching.
create or replace function public.create_teaching_revision(p_teaching_id uuid)
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
    raise exception 'You are not allowed to propose teaching changes.' using errcode = '42501';
  end if;

  select title, status into v_title, v_status from public.teachings where id = p_teaching_id;
  if not found then
    raise exception 'That teaching could not be found.' using errcode = 'P0002';
  end if;
  if v_status <> 'draft' then
    raise exception 'Changes can only be proposed to a draft teaching.' using errcode = 'P0001';
  end if;

  select id into v_id
  from public.content_revisions
  where subject_type = 'teaching' and teaching_id = p_teaching_id and submitted_by = v_user and status = 'draft';
  if found then
    return v_id;
  end if;

  v_name := coalesce(
    (select nullif(trim(aa.display_name), '') from public.admin_authorizations aa where aa.user_id = v_user),
    (select u.email from auth.users u where u.id = v_user)
  );

  insert into public.content_revisions (subject_type, teaching_id, subject_title, status, submitted_by, submitted_by_name)
  values ('teaching', p_teaching_id, v_title, 'draft', v_user, v_name)
  returning id into v_id;
  return v_id;
end;
$$;

-- Replaces the caller's draft proposals with the given list. Each item is
--   { target_kind, target_id, field_key, base_value, proposed_value }
-- base_value is the wording the editor started from. If the teaching's wording has changed since
-- then, the save is refused so an editor can never silently overwrite newer work. The "original" that
-- is stored comes from the database, not from the browser.
create or replace function public.save_teaching_revision_draft(p_revision_id uuid, p_changes jsonb)
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
    raise exception 'You are not allowed to propose teaching changes.' using errcode = '42501';
  end if;

  select * into v_rev from public.content_revisions where id = p_revision_id for update;
  if not found or v_rev.subject_type <> 'teaching' then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.submitted_by is distinct from v_user then
    raise exception 'Only the person who started a revision can change it.' using errcode = '42501';
  end if;
  if v_rev.status <> 'draft' then
    raise exception 'This revision was already submitted and can no longer be edited.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.teachings where id = v_rev.teaching_id and status = 'draft') then
    raise exception 'This teaching is no longer a draft, so it can no longer be reviewed.' using errcode = 'P0001';
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

    select * into v_info from public.revision_field_info(v_rev.teaching_id, v_kind, v_target, v_field);
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

create or replace function public.submit_teaching_revision(p_revision_id uuid)
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
    raise exception 'You are not allowed to submit teaching changes.' using errcode = '42501';
  end if;

  select * into v_rev from public.content_revisions where id = p_revision_id for update;
  if not found or v_rev.subject_type <> 'teaching' then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.submitted_by is distinct from v_user then
    raise exception 'Only the person who started a revision can submit it.' using errcode = '42501';
  end if;
  if v_rev.status <> 'draft' then
    raise exception 'This revision was already submitted.' using errcode = 'P0001';
  end if;
  if not exists (select 1 from public.teachings where id = v_rev.teaching_id and status = 'draft') then
    raise exception 'This teaching is no longer a draft, so it can no longer be reviewed.' using errcode = 'P0001';
  end if;

  select count(*) into v_count from public.content_revision_changes where revision_id = p_revision_id;
  if v_count = 0 then
    raise exception 'There are no changes to submit.' using errcode = 'P0001';
  end if;

  update public.content_revisions
  set status = 'submitted',
      submitted_at = now(),
      total_changes = v_count,
      subject_title = coalesce((select title from public.teachings where id = v_rev.teaching_id), subject_title)
  where id = p_revision_id;
  return v_count;
end;
$$;

-- An editor can throw away their own draft. A draft has nothing to audit, so it is deleted outright.
create or replace function public.discard_teaching_revision(p_revision_id uuid)
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
    raise exception 'You are not allowed to change teaching revisions.' using errcode = '42501';
  end if;
  select * into v_rev from public.content_revisions where id = p_revision_id for update;
  if not found then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.submitted_by is distinct from v_user then
    raise exception 'Only the person who started a revision can discard it.' using errcode = '42501';
  end if;
  if v_rev.status <> 'draft' then
    raise exception 'A submitted revision can only be closed by an Administrator.' using errcode = 'P0001';
  end if;
  delete from public.content_revisions where id = p_revision_id;
end;
$$;

-- ---------------------------------------------------------------------------
-- Administrator actions
-- ---------------------------------------------------------------------------

-- Accepts or rejects one change. An accepted change is written to the teaching in the same
-- transaction that records the decision. If the wording changed after the proposal was made, an
-- acceptance is refused (the Admin can reject it; the editor can submit a new revision).
create or replace function public.review_teaching_revision_change(p_change_id uuid, p_decision text, p_note text default null)
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
    if not coalesce(v_info.valid, false)
       or public.revision_normalize_text(v_info.current_value) is distinct from v_change.original_value then
      raise exception 'stale: This text changed after the proposal was made. Reject it, or ask the editor to submit a new revision.' using errcode = 'P0001';
    end if;
    perform public.revision_apply_value(v_rev.teaching_id, v_change.target_kind, v_change.target_id, v_change.field_key, v_change.proposed_value);
  end if;

  update public.content_revision_changes
  set change_status = case when p_decision = 'accept' then 'accepted' else 'rejected' end,
      reviewed_by = v_user,
      reviewed_at = now(),
      admin_note = nullif(trim(p_note), '')
  where id = p_change_id;

  v_finished := public.revision_finish_if_done(v_rev.id, v_user);
  return jsonb_build_object('revision_id', v_rev.id, 'finished', v_finished);
end;
$$;

-- Accepts or rejects every change still waiting. Accepting skips (and leaves pending) any change
-- whose text moved since it was proposed, and reports how many it skipped.
create or replace function public.review_all_teaching_revision_changes(p_revision_id uuid, p_decision text)
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
  if not found or v_rev.subject_type <> 'teaching' then
    raise exception 'That revision could not be found.' using errcode = 'P0002';
  end if;
  if v_rev.status <> 'submitted' then
    raise exception 'This revision is not waiting for review.' using errcode = 'P0001';
  end if;

  if p_decision = 'accept'
     and not exists (select 1 from public.teachings where id = v_rev.teaching_id and status = 'draft') then
    raise exception 'This teaching is no longer a draft, so changes can no longer be applied.' using errcode = 'P0001';
  end if;

  for v_change in
    select * from public.content_revision_changes
    where revision_id = p_revision_id and change_status = 'pending'
    order by display_order
    for update
  loop
    if p_decision = 'accept' then
      select * into v_info from public.revision_field_info(v_rev.teaching_id, v_change.target_kind, v_change.target_id, v_change.field_key);
      if not coalesce(v_info.valid, false)
         or public.revision_normalize_text(v_info.current_value) is distinct from v_change.original_value then
        v_skipped := v_skipped + 1;
        continue;
      end if;
      perform public.revision_apply_value(v_rev.teaching_id, v_change.target_kind, v_change.target_id, v_change.field_key, v_change.proposed_value);
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

-- An Administrator can close a revision without deciding it (for example an abandoned one).
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
  delete from public.content_revision_changes where revision_id = p_revision_id;
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
      purged_at = now()
  where id = p_revision_id;
end;
$$;

-- Deletes finished audit rows older than the given number of days. Revisions still waiting on a
-- decision are never deleted. Returns how many rows were removed.
create or replace function public.purge_revision_history(p_older_than_days integer default 30)
returns integer
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  if auth.uid() is null or not public.is_authenticated_admin() then
    raise exception 'Only an Administrator can clear revision history.' using errcode = '42501';
  end if;
  if p_older_than_days is null or p_older_than_days < 0 or p_older_than_days > 3650 then
    raise exception 'Choose a number of days between 0 and 3650.' using errcode = '22023';
  end if;
  delete from public.content_revisions
  where status in ('completed', 'cancelled')
    and completed_at < now() - make_interval(days => p_older_than_days);
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

-- ---------------------------------------------------------------------------
-- Publishing a teaching clears its review text
-- ---------------------------------------------------------------------------

-- Once a teaching is published, a review against its draft is over: close anything still open and
-- delete the temporary wording. This only reacts to the status change; it does not alter how
-- publishing works.
create or replace function public.close_teaching_revisions_on_publish()
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
        review_note = coalesce(r.review_note, 'Closed when the teaching was published.'),
        total_changes = (select count(*) from public.content_revision_changes c where c.revision_id = r.id),
        purged_at = now()
    where r.subject_type = 'teaching' and r.teaching_id = new.id and r.status in ('draft', 'submitted');

    delete from public.content_revision_changes c
    using public.content_revisions r
    where c.revision_id = r.id and r.subject_type = 'teaching' and r.teaching_id = new.id;

    update public.content_revisions
    set purged_at = coalesce(purged_at, now())
    where subject_type = 'teaching' and teaching_id = new.id and purged_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists teachings_close_revisions_on_publish on public.teachings;
create trigger teachings_close_revisions_on_publish
after update of status on public.teachings
for each row
when (new.status = 'published' and old.status is distinct from 'published')
execute function public.close_teaching_revisions_on_publish();

-- ---------------------------------------------------------------------------
-- Who can call what
-- ---------------------------------------------------------------------------

revoke all on function public.close_teaching_revisions_on_publish() from public, anon, authenticated;

revoke all on function public.create_teaching_revision(uuid) from public, anon;
revoke all on function public.save_teaching_revision_draft(uuid, jsonb) from public, anon;
revoke all on function public.submit_teaching_revision(uuid) from public, anon;
revoke all on function public.discard_teaching_revision(uuid) from public, anon;
revoke all on function public.review_teaching_revision_change(uuid, text, text) from public, anon;
revoke all on function public.review_all_teaching_revision_changes(uuid, text) from public, anon;
revoke all on function public.cancel_teaching_revision(uuid, text) from public, anon;
revoke all on function public.purge_revision_history(integer) from public, anon;

grant execute on function public.create_teaching_revision(uuid) to authenticated;
grant execute on function public.save_teaching_revision_draft(uuid, jsonb) to authenticated;
grant execute on function public.submit_teaching_revision(uuid) to authenticated;
grant execute on function public.discard_teaching_revision(uuid) to authenticated;
grant execute on function public.review_teaching_revision_change(uuid, text, text) to authenticated;
grant execute on function public.review_all_teaching_revision_changes(uuid, text) to authenticated;
grant execute on function public.cancel_teaching_revision(uuid, text) to authenticated;
grant execute on function public.purge_revision_history(integer) to authenticated;
