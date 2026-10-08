-- Raises the teaching "Short summary" limit from 500 to 600 characters for content-manager
-- revisions. This is the same function as in 20261006030000_content_revisions.sql with only the
-- summary limit changed; the app (teaching form, DOCX importer, revision screens) is raised to 600
-- together with this.
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
      when 'summary' then 600
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

revoke all on function public.revision_field_info(uuid, text, uuid, text) from public, anon, authenticated;
