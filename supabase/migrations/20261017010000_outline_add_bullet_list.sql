-- The Administrator can start a new bullet list in a draft outline.
--
-- "Add below" already adds a paragraph after a paragraph, and an item after a list item, but there was no way to
-- begin a list. The new action insert_list adds a one-item bullet list ("New item") after the block, which the
-- Administrator then edits and extends with "Add below" on its items. Same rules as the other structure changes:
-- Administrator only, draft only, and refused while a Content Manager proposal on the outline is still open.

create or replace function public.admin_outline_structure(p_outline_id uuid, p_action text, p_field text)
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
  if p_action not in ('insert', 'delete', 'insert_list') then
    raise exception 'The action must be insert, delete or insert_list.' using errcode = '22023';
  end if;

  select content into v_content from public.teaching_outlines where id = p_outline_id and status = 'draft' for update;
  if not found then
    raise exception 'Only a draft outline can be edited.' using errcode = 'P0001';
  end if;

  if exists (
    select 1 from public.content_revisions
    where subject_type = 'outline' and outline_id = p_outline_id and status in ('draft', 'submitted')
  ) then
    raise exception 'Close or decide the open Content Manager proposals on this outline first (see Revisions). Adding or removing a paragraph moves everything below it, so a proposal written before would land in the wrong place.' using errcode = 'P0001';
  end if;

  v_match := regexp_match(p_field, '^block_([0-9]+)(?:_item_([0-9]+))?$');
  if v_match is null then
    raise exception 'That part of the outline cannot be added to or removed.' using errcode = '22023';
  end if;
  v_pos := v_match[1]::integer;
  if v_pos < 1 or v_pos > jsonb_array_length(v_content) then
    raise exception 'The text to change could not be found.' using errcode = 'P0001';
  end if;
  v_block := v_content -> (v_pos - 1);

  -- A new bullet list goes after the whole block: after a paragraph or heading, or after the list the item is in.
  if p_action = 'insert_list' then
    if v_block ->> 'type' not in ('heading', 'paragraph', 'list') or (v_match[2] is not null and v_block ->> 'type' <> 'list') then
      raise exception 'That part of the outline cannot be added to or removed.' using errcode = '22023';
    end if;
    v_new := jsonb_build_object(
      'type', 'list',
      'items', jsonb_build_array(jsonb_build_object('level', 0, 'ordered', false, 'inlines', jsonb_build_array(jsonb_build_object('text', 'New item'))))
    );
    v_content := jsonb_insert(v_content, array[(v_pos - 1)::text], v_new, true);
    update public.teaching_outlines set content = v_content where id = p_outline_id and status = 'draft';
    return;
  end if;

  if v_match[2] is null then
    if v_block ->> 'type' not in ('heading', 'paragraph') then
      raise exception 'That part of the outline cannot be added to or removed.' using errcode = '22023';
    end if;
    if p_action = 'delete' then
      if jsonb_array_length(v_content) <= 1 then
        raise exception 'An outline needs at least one paragraph.' using errcode = 'P0001';
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
          raise exception 'An outline needs at least one paragraph.' using errcode = 'P0001';
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

  update public.teaching_outlines set content = v_content where id = p_outline_id and status = 'draft';
end;
$$;

revoke all on function public.admin_outline_structure(uuid, text, text) from public, anon;
grant execute on function public.admin_outline_structure(uuid, text, text) to authenticated;

revoke all on function public.admin_outline_structure(uuid, text, text) from public, anon;
grant execute on function public.admin_outline_structure(uuid, text, text) to authenticated;
