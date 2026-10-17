-- Replace a draft outline's text from an edited Word file that was exported from it.
--
-- The Administrator exports the outline to a styled Word file, edits the wording in Word, and imports it again. The app
-- checks the file before it asks the database to change anything (it came from this outline, the outline has not changed
-- since, the structure is identical). This function is the last guard and the only write, and it refuses on its own:
--
--   * Administrator only, and only a draft outline.
--   * Refused while any Content Manager proposal on the outline is still open (a draft or a submission waiting for a
--     decision), because their changes point at positions in the text being replaced.
--   * Refused unless the fingerprint of the outline's title, subtitle and text is the one the Word file was exported
--     from, so an import can never overwrite changes made after the export.
--   * The new text has to be a plain list of blocks (headings, paragraphs, lists, tables), and the title is required.
--
-- Nothing is written unless every check passes; it is one statement in one transaction.

-- The fingerprint of an outline's editable text, taken when the Word file is exported and checked again on import.
create or replace function public.outline_content_hash(p_outline_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_hash text;
begin
  if auth.uid() is null or not public.is_authenticated_admin() then
    raise exception 'Only an Administrator can export an outline.' using errcode = '42501';
  end if;
  select md5(coalesce(title, '') || E'\n' || coalesce(subtitle, '') || E'\n' || content::text)
  into v_hash
  from public.teaching_outlines
  where id = p_outline_id;
  if v_hash is null then
    raise exception 'That outline could not be found.' using errcode = 'P0001';
  end if;
  return v_hash;
end;
$$;

create or replace function public.admin_import_outline(p_outline_id uuid, p_expected_hash text, p_title text, p_subtitle text, p_content jsonb)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_current text;
  v_block jsonb;
begin
  if auth.uid() is null or not public.is_authenticated_admin() then
    raise exception 'Only an Administrator can import an outline.' using errcode = '42501';
  end if;

  select md5(coalesce(title, '') || E'\n' || coalesce(subtitle, '') || E'\n' || content::text)
  into v_current
  from public.teaching_outlines
  where id = p_outline_id and status = 'draft'
  for update;
  if v_current is null then
    raise exception 'Only a draft outline can be replaced.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.content_revisions
    where subject_type = 'outline' and outline_id = p_outline_id and status in ('draft', 'submitted')
  ) then
    raise exception 'Close or decide the open Content Manager proposals on this outline first (see Revisions). Replacing the text would leave them pointing at the wrong place.' using errcode = 'P0001';
  end if;

  if p_expected_hash is distinct from v_current then
    raise exception 'The outline has changed since this Word file was exported. Export it again so nothing made since then is overwritten.' using errcode = 'P0001';
  end if;

  if p_content is null or jsonb_typeof(p_content) <> 'array' or jsonb_array_length(p_content) = 0 or jsonb_array_length(p_content) > 3000 then
    raise exception 'The document has no usable content.' using errcode = '22023';
  end if;
  for v_block in select value from jsonb_array_elements(p_content) loop
    if jsonb_typeof(v_block) <> 'object' or (v_block ->> 'type') not in ('heading', 'paragraph', 'list', 'table') then
      raise exception 'The document has content the outline cannot hold.' using errcode = '22023';
    end if;
  end loop;

  if p_title is null or length(trim(p_title)) = 0 or length(trim(p_title)) > 200 then
    raise exception 'The title must be between 1 and 200 characters.' using errcode = '22023';
  end if;
  if p_subtitle is not null and (length(trim(p_subtitle)) = 0 or length(trim(p_subtitle)) > 300) then
    raise exception 'The subtitle must be between 1 and 300 characters.' using errcode = '22023';
  end if;

  update public.teaching_outlines
  set title = trim(p_title), subtitle = nullif(trim(coalesce(p_subtitle, '')), ''), content = p_content
  where id = p_outline_id and status = 'draft';
end;
$$;

revoke all on function public.outline_content_hash(uuid) from public, anon;
revoke all on function public.admin_import_outline(uuid, text, text, text, jsonb) from public, anon;
grant execute on function public.outline_content_hash(uuid) to authenticated;
grant execute on function public.admin_import_outline(uuid, text, text, text, jsonb) to authenticated;
