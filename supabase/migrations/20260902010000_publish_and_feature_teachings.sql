-- Adds the atomic admin workflow for publishing a structured teaching
-- and making it the single featured homepage teaching.

create unique index if not exists teachings_single_featured_published_idx
  on public.teachings ((is_featured))
  where is_featured = true and status = 'published';

drop index if exists public.teachings_one_featured_published_idx;

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
  v_chalkboard_count integer;
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

  if v_teaching.status <> 'draft' then
    raise exception 'Only draft teachings can be published and featured.';
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

  select count(*)
    into v_category_count
    from public.teaching_categories
    where teaching_id = p_teaching_id
      and status = 'draft'
      and nullif(trim(title), '') is not null;

  if v_category_count = 0 then
    raise exception 'At least one draft category is required before publishing.';
  end if;

  select count(*)
    into v_invalid_category_count
    from public.teaching_categories
    where teaching_id = p_teaching_id
      and status = 'draft'
      and nullif(trim(title), '') is null;

  if v_invalid_category_count > 0 then
    raise exception 'Every draft category must have a title before publishing.';
  end if;

  select count(*)
    into v_section_count
    from public.teaching_sections
    where teaching_id = p_teaching_id
      and status = 'draft'
      and nullif(trim(title), '') is not null;

  if v_section_count = 0 then
    raise exception 'At least one draft section is required before publishing.';
  end if;

  select count(*)
    into v_invalid_section_count
    from public.teaching_sections
    where teaching_id = p_teaching_id
      and status = 'draft'
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
    raise exception 'Every draft section must have valid publishable content.';
  end if;

  select count(*)
    into v_chalkboard_count
    from public.chalkboard_assets
    where teaching_id = p_teaching_id
      and category_id is null
      and section_id is null
      and is_current_version = true
      and status = 'active'
      and coalesce(website_storage_path, storage_path) is not null;

  if v_chalkboard_count = 0 then
    raise exception 'A current active entire-teaching chalkboard is required before publishing.';
  end if;

  update public.teachings
    set is_featured = false
    where is_featured = true
      and id <> p_teaching_id;

  update public.teaching_categories
    set status = 'published',
        published_at = coalesce(published_at, now())
    where teaching_id = p_teaching_id
      and status = 'draft';

  update public.teaching_sections
    set status = 'published',
        published_at = coalesce(published_at, now())
    where teaching_id = p_teaching_id
      and status = 'draft';

  update public.teachings
    set status = 'published',
        is_featured = true,
        published_at = coalesce(published_at, now())
    where id = p_teaching_id
      and status = 'draft';
end;
$$;

revoke all on function public.publish_and_feature_teaching(uuid) from public;
grant execute on function public.publish_and_feature_teaching(uuid) to authenticated;
