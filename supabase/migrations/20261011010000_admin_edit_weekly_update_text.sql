-- Administrator edits to the text of a draft weekly update.
--
-- Until now the text of a weekly update could only change by replacing the whole Word document, or by
-- accepting a Content Manager's proposed change. After accepting a proposal there was no way to correct it.
-- This lets the Administrator edit the wording of a draft directly, paragraph by paragraph, using the same
-- field rules the review editor uses (so bold, italic and links in the converted document are preserved).
--
-- It is Administrator-only and draft-only. Each edit carries the wording it was written against, and is
-- refused if that paragraph has changed since, so two people editing at once cannot overwrite each other.
-- All the edits in one save succeed or fail together.

create or replace function public.admin_edit_weekly_update_text(p_weekly_update_id uuid, p_changes jsonb)
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
    raise exception 'Only an Administrator can edit the weekly update text.' using errcode = '42501';
  end if;

  if not exists (select 1 from public.weekly_updates where id = p_weekly_update_id and status = 'draft') then
    raise exception 'Only a draft weekly update can be edited.' using errcode = 'P0001';
  end if;

  if p_changes is null or jsonb_typeof(p_changes) <> 'array' then
    raise exception 'There is nothing to save.' using errcode = '22023';
  end if;

  for v_change in select value from jsonb_array_elements(p_changes) loop
    v_key := v_change ->> 'field_key';
    v_base := v_change ->> 'base_value';
    v_value := v_change ->> 'value';

    select f.current_value into v_current
    from public.revision_weekly_fields(p_weekly_update_id) f
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

    perform public.revision_weekly_apply_value(p_weekly_update_id, 'weekly_update', null, v_key, v_value);
    v_count := v_count + 1;
  end loop;

  return v_count;
end;
$$;

revoke all on function public.admin_edit_weekly_update_text(uuid, jsonb) from public, anon;
grant execute on function public.admin_edit_weekly_update_text(uuid, jsonb) to authenticated;
