-- Handouts can now be created blank, filled in on their own page, and published.
--
-- Until now a handout was uploaded in one step and could only ever be proofed. The new flow follows the
-- teaching and devotional flow:
--
--   1. "Create new handout" makes a blank draft. On its page the Administrator enters the title, the
--      teaching date and the teaching it goes with, and uploads the Word draft.
--   2. From that page the draft is sent to the Content Managers for review (needs a date and a draft), or
--   3. published: the Administrator uploads the final PDF, which is added to Printable PDF Links
--      (printable_pdf_links) and so appears in the public PDF library. printable_pdf_id points at that row.
--
-- Publishing clears the review gate and closes any review still open, as it does for the other kinds. Only a
-- draft can be reviewed or edited. Removing the PDF from Printable PDF Links (or unpublishing here) puts the
-- handout back to a draft.

alter table public.teaching_handouts alter column gathering_date drop not null;
alter table public.teaching_handouts alter column content set default '[]'::jsonb;
alter table public.teaching_handouts alter column original_content set default '[]'::jsonb;

alter table public.teaching_handouts
  add column if not exists published_at timestamptz,
  add column if not exists printable_pdf_id uuid references public.printable_pdf_links(id) on delete set null;

create unique index if not exists teaching_handouts_printable_pdf_idx
  on public.teaching_handouts (printable_pdf_id) where printable_pdf_id is not null;

alter table public.teaching_handouts
  drop constraint if exists teaching_handouts_status_check,
  add constraint teaching_handouts_status_check check (status in ('draft', 'published'));

alter table public.teaching_handouts
  drop constraint if exists teaching_handouts_content_check,
  add constraint teaching_handouts_content_check check (jsonb_typeof(content) = 'array' and jsonb_array_length(content) <= 3000);

-- A published handout has its date and its PDF. The review gate is only ever open on a draft, and only once
-- the handout has a date and some text to review.
alter table public.teaching_handouts
  drop constraint if exists teaching_handouts_published_check,
  add constraint teaching_handouts_published_check check (
    status = 'draft' or (gathering_date is not null and printable_pdf_id is not null and published_at is not null)
  );

alter table public.teaching_handouts
  drop constraint if exists teaching_handouts_review_gate_drafts_only_check,
  add constraint teaching_handouts_review_gate_drafts_only_check check (sent_for_review_at is null or status = 'draft');

alter table public.teaching_handouts
  drop constraint if exists teaching_handouts_ready_to_send_check,
  add constraint teaching_handouts_ready_to_send_check check (
    sent_for_review_at is null or (gathering_date is not null and jsonb_array_length(content) > 0)
  );

-- Publishing empties the gate (clear_review_gate_when_published() already exists).
drop trigger if exists teaching_handouts_clear_review_gate on public.teaching_handouts;
create trigger teaching_handouts_clear_review_gate
before update of status on public.teaching_handouts
for each row
when (new.status <> 'draft' and new.sent_for_review_at is not null)
execute function public.clear_review_gate_when_published();

-- Content Managers read a handout only while it is a draft the Administrator has sent.
drop policy if exists "Content managers read sent teaching handouts" on public.teaching_handouts;
create policy "Content managers read sent teaching handouts"
on public.teaching_handouts
for select
to authenticated
using (public.is_content_manager_or_admin() and status = 'draft' and sent_for_review_at is not null);

-- The gate check: a handout is open for review only while it is a sent draft.
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
    return exists (select 1 from public.teaching_handouts where id = p_handout_id and status = 'draft' and sent_for_review_at is not null);
  end if;
  return false;
end;
$$;

revoke all on function public.review_is_open(text, uuid, uuid, uuid, uuid, uuid) from public, anon, authenticated;

-- The revision heading carries the teaching date when the handout has one.
create or replace function public.revision_handout_subject_title(p_handout_id uuid)
returns text
language sql
stable
set search_path = public
as $$
  select coalesce(nullif(trim(title), ''), 'Untitled handout')
    || case when gathering_date is null then '' else ' (' || to_char(gathering_date, 'FMMon FMDD, YYYY') || ')' end
  from public.teaching_handouts where id = p_handout_id;
$$;

revoke all on function public.revision_handout_subject_title(uuid) from public, anon, authenticated;

-- Direct editing and adding or removing paragraphs are for drafts only.
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

  if not exists (select 1 from public.teaching_handouts where id = p_handout_id and status = 'draft') then
    raise exception 'Only a draft handout can be edited.' using errcode = 'P0001';
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

  select content into v_content from public.teaching_handouts where id = p_handout_id and status = 'draft' for update;
  if not found then
    raise exception 'Only a draft handout can be edited.' using errcode = 'P0001';
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
-- Publishing closes what is still open
-- ---------------------------------------------------------------------------

-- Same rule as the other kinds: a submitted revision keeps its changes (decided or not) for the record; an
-- unsubmitted draft is discarded.
create or replace function public.close_handout_revisions_on_publish()
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
    where c.revision_id = r.id and r.subject_type = 'handout' and r.handout_id = new.id and r.status = 'draft';

    update public.content_revisions r
    set status = 'cancelled',
        completed_at = now(),
        review_note = coalesce(r.review_note, 'Closed when the handout was published.'),
        total_changes = (select count(*) from public.content_revision_changes c where c.revision_id = r.id),
        purged_at = case when r.status = 'draft' then now() else r.purged_at end
    where r.subject_type = 'handout' and r.handout_id = new.id and r.status in ('draft', 'submitted');
  end if;
  return new;
end;
$$;

drop trigger if exists teaching_handouts_close_revisions_on_publish on public.teaching_handouts;
create trigger teaching_handouts_close_revisions_on_publish
after update of status on public.teaching_handouts
for each row
when (new.status = 'published' and old.status is distinct from 'published')
execute function public.close_handout_revisions_on_publish();

revoke all on function public.close_handout_revisions_on_publish() from public, anon, authenticated;

-- Removing the PDF from Printable PDF Links takes the handout back to a draft, so a handout never says it is
-- published when its PDF is gone. This runs before the delete, ahead of the foreign key's own clean-up.
create or replace function public.handout_unpublish_when_pdf_removed()
returns trigger
language plpgsql
volatile
security definer
set search_path = public
as $$
begin
  update public.teaching_handouts
  set status = 'draft', published_at = null, printable_pdf_id = null
  where printable_pdf_id = old.id;
  return old;
end;
$$;

drop trigger if exists printable_pdf_links_unpublish_handout on public.printable_pdf_links;
create trigger printable_pdf_links_unpublish_handout
before delete on public.printable_pdf_links
for each row execute function public.handout_unpublish_when_pdf_removed();

revoke all on function public.handout_unpublish_when_pdf_removed() from public, anon, authenticated;
