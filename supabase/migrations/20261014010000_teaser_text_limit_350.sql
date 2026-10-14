-- The homepage teaser text limit goes from 300 to 350 characters (teaser headings stay at 100).
--
-- Three places enforce it in the database: the two column checks, the publish function, and the review function
-- that lets a co-editor propose teaser wording. The two functions are copied unchanged from their latest versions
-- (20261010030000) except for the limit.

alter table public.teachings
  drop constraint if exists teachings_teaser_1_text_length_check,
  add constraint teachings_teaser_1_text_length_check
    check (teaser_1_text is null or char_length(teaser_1_text) <= 350),
  drop constraint if exists teachings_teaser_2_text_length_check,
  add constraint teachings_teaser_2_text_length_check
    check (teaser_2_text is null or char_length(teaser_2_text) <= 350);

create or replace function public.publish_and_feature_teaching(p_teaching_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_teaching public.teachings%rowtype;
  v_category_count integer;
  v_invalid_category_count integer;
  v_section_count integer;
  v_invalid_section_count integer;
begin
  if not public.is_authenticated_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.publish_and_feature_teaching'));

  select *
    into v_teaching
    from public.teachings
    where id = p_teaching_id
    for update;

  if not found then
    raise exception 'Teaching could not be found.' using errcode = 'P0002';
  end if;

  if v_teaching.status not in ('draft', 'published') then
    raise exception 'Only draft or published teachings can be published and featured.';
  end if;

  if v_teaching.teaching_type not in ('standard', 'deep_dive') then
    raise exception 'Teaching type is invalid.';
  end if;

  if nullif(trim(v_teaching.slug), '') is null then
    raise exception 'Teaching slug is required before publishing.';
  end if;

  if nullif(trim(v_teaching.title), '') is null then
    raise exception 'Teaching title is required before publishing.';
  end if;

  if v_teaching.gathering_date is null then
    raise exception 'Gathering date is required before publishing.';
  end if;

  if nullif(trim(coalesce(v_teaching.summary, '')), '') is null then
    raise exception 'Short summary is required before publishing.';
  end if;

  if v_teaching.teaching_type = 'standard' then
    if nullif(trim(coalesce(v_teaching.teaser_1_heading, '')), '') is null then
      raise exception 'Teaser 1 heading is required before publishing.';
    end if;

    if nullif(trim(coalesce(v_teaching.teaser_1_text, '')), '') is null then
      raise exception 'Teaser 1 text is required before publishing.';
    end if;
  end if;

  if char_length(coalesce(v_teaching.teaser_1_heading, '')) > 100
    or char_length(coalesce(v_teaching.teaser_1_text, '')) > 350
    or char_length(coalesce(v_teaching.teaser_2_heading, '')) > 100
    or char_length(coalesce(v_teaching.teaser_2_text, '')) > 350 then
    raise exception 'Homepage teaser fields exceed the allowed length.';
  end if;

  if (
    nullif(trim(coalesce(v_teaching.teaser_2_heading, '')), '') is null
    and nullif(trim(coalesce(v_teaching.teaser_2_text, '')), '') is not null
  ) or (
    nullif(trim(coalesce(v_teaching.teaser_2_heading, '')), '') is not null
    and nullif(trim(coalesce(v_teaching.teaser_2_text, '')), '') is null
  ) then
    raise exception 'Teaser 2 heading and text must be completed together.';
  end if;

  select count(*)
    into v_category_count
    from public.teaching_categories
    where teaching_id = p_teaching_id
      and status in ('draft', 'published')
      and nullif(trim(title), '') is not null;

  if v_category_count = 0 then
    raise exception 'At least one category is required before publishing.';
  end if;

  select count(*)
    into v_invalid_category_count
    from public.teaching_categories
    where teaching_id = p_teaching_id
      and status in ('draft', 'published')
      and nullif(trim(title), '') is null;

  if v_invalid_category_count > 0 then
    raise exception 'Every category must have a title before publishing.';
  end if;

  select count(*)
    into v_section_count
    from public.teaching_sections
    where teaching_id = p_teaching_id
      and status in ('draft', 'published')
      and nullif(trim(title), '') is not null;

  if v_section_count = 0 then
    raise exception 'At least one section is required before publishing.';
  end if;

  select count(*)
    into v_invalid_section_count
    from public.teaching_sections
    where teaching_id = p_teaching_id
      and status in ('draft', 'published')
      and (
        nullif(trim(title), '') is null
        or jsonb_typeof(content) <> 'object'
        or coalesce(content->>'format', '') not in ('paragraph', 'takeaway', 'quote', 'bullets', 'scripture')
        or (
          content->>'format' in ('paragraph', 'takeaway', 'quote')
          and nullif(trim(coalesce(content->>'text', '')), '') is null
        )
        or (
          content->>'format' = 'bullets'
          and (
            jsonb_typeof(content->'bullets') is distinct from 'array'
            or not exists (
              select 1
              from jsonb_array_elements_text(
                case
                  when jsonb_typeof(content->'bullets') = 'array' then content->'bullets'
                  else '[]'::jsonb
                end
              ) as bullet(value)
              where nullif(trim(bullet.value), '') is not null
            )
          )
        )
        or (
          content->>'format' = 'scripture'
          and (
            nullif(trim(coalesce(content->>'reference', '')), '') is null
            or nullif(trim(coalesce(content->>'quotation', '')), '') is null
          )
        )
      );

  if v_invalid_section_count > 0 then
    raise exception 'Every section must have valid publishable content.';
  end if;

  if v_teaching.teaching_type = 'standard' then
    -- Featuring is per language: publishing an Español teaching features it on the
    -- Español homepage and leaves the English featured teaching alone, and vice versa.
    update public.teachings
      set is_featured = false
      where is_featured = true
        and language = v_teaching.language
        and id <> p_teaching_id;
  end if;

  update public.teaching_categories
    set status = 'published',
        published_at = coalesce(published_at, now())
    where teaching_id = p_teaching_id
      and status in ('draft', 'published');

  update public.teaching_sections
    set status = 'published',
        published_at = coalesce(published_at, now())
    where teaching_id = p_teaching_id
      and status in ('draft', 'published');

  update public.teachings
    set status = 'published',
        is_featured = case when v_teaching.teaching_type = 'standard' then true else false end,
        published_at = coalesce(published_at, now())
    where id = p_teaching_id
      and status in ('draft', 'published');
end;
$$;

revoke all on function public.publish_and_feature_teaching(uuid) from public;
grant execute on function public.publish_and_feature_teaching(uuid) to authenticated;

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
      when 'teaser_1_text' then 350
      when 'teaser_2_text' then 350
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
    if p_field = 'text' and v_format in ('paragraph', 'takeaway', 'quote') then
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
