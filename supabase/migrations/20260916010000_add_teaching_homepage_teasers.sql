alter table public.teachings
  add column if not exists teaser_1_heading text,
  add column if not exists teaser_1_text text,
  add column if not exists teaser_2_heading text,
  add column if not exists teaser_2_text text;

alter table public.teachings
  drop constraint if exists teachings_teaser_1_heading_length_check,
  add constraint teachings_teaser_1_heading_length_check
    check (teaser_1_heading is null or char_length(teaser_1_heading) <= 100),
  drop constraint if exists teachings_teaser_1_text_length_check,
  add constraint teachings_teaser_1_text_length_check
    check (teaser_1_text is null or char_length(teaser_1_text) <= 300),
  drop constraint if exists teachings_teaser_2_heading_length_check,
  add constraint teachings_teaser_2_heading_length_check
    check (teaser_2_heading is null or char_length(teaser_2_heading) <= 100),
  drop constraint if exists teachings_teaser_2_text_length_check,
  add constraint teachings_teaser_2_text_length_check
    check (teaser_2_text is null or char_length(teaser_2_text) <= 300),
  drop constraint if exists teachings_teaser_2_completeness_check,
  add constraint teachings_teaser_2_completeness_check
    check (
      (nullif(trim(coalesce(teaser_2_heading, '')), '') is null and nullif(trim(coalesce(teaser_2_text, '')), '') is null)
      or
      (nullif(trim(coalesce(teaser_2_heading, '')), '') is not null and nullif(trim(coalesce(teaser_2_text, '')), '') is not null)
    );

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

  if nullif(trim(coalesce(v_teaching.teaser_1_heading, '')), '') is null then
    raise exception 'Teaser 1 heading is required before publishing.';
  end if;

  if nullif(trim(coalesce(v_teaching.teaser_1_text, '')), '') is null then
    raise exception 'Teaser 1 text is required before publishing.';
  end if;

  if char_length(v_teaching.teaser_1_heading) > 100
    or char_length(v_teaching.teaser_1_text) > 300
    or char_length(coalesce(v_teaching.teaser_2_heading, '')) > 100
    or char_length(coalesce(v_teaching.teaser_2_text, '')) > 300 then
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
        or coalesce(content->>'format', '') not in ('paragraph', 'takeaway', 'bullets', 'scripture')
        or (
          content->>'format' in ('paragraph', 'takeaway')
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

  update public.teachings
    set is_featured = false
    where is_featured = true
      and id <> p_teaching_id;

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
        is_featured = true,
        published_at = coalesce(published_at, now())
    where id = p_teaching_id
      and status in ('draft', 'published');
end;
$$;

revoke all on function public.publish_and_feature_teaching(uuid) from public;
grant execute on function public.publish_and_feature_teaching(uuid) to authenticated;
