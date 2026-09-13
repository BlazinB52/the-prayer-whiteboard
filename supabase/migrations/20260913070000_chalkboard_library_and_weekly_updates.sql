-- Convert chalkboards into an independent library and add weekly updates.

alter table public.chalkboard_assets
  add column if not exists chalkboard_date date,
  add column if not exists canonical_name text;

update public.chalkboard_assets
set
  chalkboard_date = coalesce(chalkboard_date, uploaded_at::date, current_date),
  canonical_name = coalesce(
    nullif(trim(canonical_name), ''),
    to_char(coalesce(uploaded_at::date, current_date), 'YYYYMMDD') || '_' ||
      nullif(trim(regexp_replace(coalesce(title, 'Chalkboard'), '[\/\\]+', ' ', 'g')), '')
  );

alter table public.chalkboard_assets
  alter column chalkboard_date set not null,
  alter column canonical_name set not null;

alter table public.chalkboard_assets
  drop constraint if exists chalkboard_assets_canonical_name_check,
  add constraint chalkboard_assets_canonical_name_check
    check (canonical_name ~ '^[0-9]{8}_.+');

do $$
begin
  if exists (
    select 1
    from (
      select teaching_id
      from public.chalkboard_assets
      where teaching_id is not null
        and is_current_version = true
        and status = 'active'
        and category_id is null
        and section_id is null
      group by teaching_id
      having count(*) > 1
    ) duplicates
  ) then
    raise exception 'Cannot migrate chalkboard library: at least one teaching has multiple current active entire-teaching chalkboards.';
  end if;
end;
$$;

alter table public.teachings
  add column if not exists chalkboard_asset_id uuid;

update public.teachings teaching
set chalkboard_asset_id = asset.id
from public.chalkboard_assets asset
where teaching.chalkboard_asset_id is null
  and asset.teaching_id = teaching.id
  and asset.is_current_version = true
  and asset.status = 'active'
  and asset.category_id is null
  and asset.section_id is null;

create unique index if not exists teachings_chalkboard_asset_unique_idx
  on public.teachings (chalkboard_asset_id)
  where chalkboard_asset_id is not null;

alter table public.teachings
  drop constraint if exists teachings_chalkboard_asset_id_fkey,
  add constraint teachings_chalkboard_asset_id_fkey
    foreign key (chalkboard_asset_id)
    references public.chalkboard_assets(id)
    on delete set null;

alter table public.chalkboard_assets
  drop constraint if exists chalkboard_assets_teaching_id_fkey,
  alter column teaching_id drop not null,
  add constraint chalkboard_assets_teaching_id_fkey
    foreign key (teaching_id)
    references public.teachings(id)
    on delete set null;

alter table public.chalkboard_assets
  drop constraint if exists chalkboard_assets_category_teaching_fk,
  add constraint chalkboard_assets_category_teaching_fk
    foreign key (category_id, teaching_id)
    references public.teaching_categories(id, teaching_id)
    on delete set null;

alter table public.chalkboard_assets
  drop constraint if exists chalkboard_assets_section_category_teaching_fk,
  add constraint chalkboard_assets_section_category_teaching_fk
    foreign key (section_id, category_id, teaching_id)
    references public.teaching_sections(id, category_id, teaching_id)
    on delete set null;

drop index if exists public.chalkboard_assets_one_current_version_per_group_idx;
create unique index if not exists chalkboard_assets_one_current_version_per_group_idx
  on public.chalkboard_assets (asset_group_id)
  where is_current_version = true and status = 'active';

create index if not exists chalkboard_assets_library_lookup_idx
  on public.chalkboard_assets (status, is_current_version, chalkboard_date desc, canonical_name);

create table if not exists public.weekly_updates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body_markdown text not null,
  converted_content jsonb not null default '[]'::jsonb,
  source_document_storage_path text,
  source_document_file_name text,
  status text not null default 'draft',
  is_current boolean not null default false,
  published_at timestamptz,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint weekly_updates_title_check check (length(trim(title)) > 0 and length(title) <= 180),
  constraint weekly_updates_body_check check (length(trim(body_markdown)) > 0 and length(body_markdown) <= 50000),
  constraint weekly_updates_converted_content_check check (jsonb_typeof(converted_content) = 'array'),
  constraint weekly_updates_source_document_path_check check (
    source_document_storage_path is null
    or source_document_storage_path ~ '^weekly-updates/source-documents/[0-9a-f-]{36}/[a-z0-9][a-z0-9._-]*\.docx$'
  ),
  constraint weekly_updates_status_check check (status in ('draft', 'published', 'archived')),
  constraint weekly_updates_current_status_check check (is_current = false or status = 'published'),
  constraint weekly_updates_published_at_check check (status <> 'published' or published_at is not null),
  constraint weekly_updates_archived_at_check check (status <> 'archived' or archived_at is not null)
);

create unique index if not exists weekly_updates_one_current_idx
  on public.weekly_updates (is_current)
  where is_current = true;

create index if not exists weekly_updates_admin_order_idx
  on public.weekly_updates (status, is_current desc, updated_at desc);

drop trigger if exists weekly_updates_set_updated_at on public.weekly_updates;
create trigger weekly_updates_set_updated_at
before update on public.weekly_updates
for each row execute function public.set_updated_at();

alter table public.weekly_updates enable row level security;

drop policy if exists "Public can read current weekly update" on public.weekly_updates;
create policy "Public can read current weekly update"
on public.weekly_updates
for select
using (
  (status = 'published' and is_current = true)
  or public.is_authenticated_admin()
);

drop policy if exists "Admins manage weekly updates" on public.weekly_updates;
create policy "Admins manage weekly updates"
on public.weekly_updates
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

create or replace view public.public_current_weekly_update
as
select
  id,
  title,
  body_markdown,
  converted_content,
  published_at
from public.weekly_updates
where status = 'published'
  and is_current = true;

create or replace function public.publish_weekly_update(p_weekly_update_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_update public.weekly_updates%rowtype;
begin
  if not public.is_authenticated_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.publish_weekly_update'));

  select *
    into v_update
    from public.weekly_updates
    where id = p_weekly_update_id
      and status in ('draft', 'published')
    for update;

  if not found then
    raise exception 'Weekly update could not be found.' using errcode = 'P0002';
  end if;

  if nullif(trim(v_update.title), '') is null or nullif(trim(v_update.body_markdown), '') is null then
    raise exception 'Weekly update title and body are required.';
  end if;

  update public.weekly_updates
    set is_current = false
    where is_current = true
      and id <> p_weekly_update_id;

  update public.weekly_updates
    set status = 'published',
        is_current = true,
        published_at = coalesce(published_at, now()),
        archived_at = null
    where id = p_weekly_update_id;
end;
$$;

revoke all on function public.publish_weekly_update(uuid) from public;
grant execute on function public.publish_weekly_update(uuid) to authenticated;

grant select on public.public_current_weekly_update to anon, authenticated;
grant select on public.weekly_updates to authenticated;
grant insert, update, delete on public.weekly_updates to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'weekly-update-documents',
  'weekly-update-documents',
  false,
  8388608,
  array[
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/octet-stream'
  ]
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins can manage weekly update documents" on storage.objects;
create policy "Admins can manage weekly update documents"
on storage.objects
for all
to authenticated
using (
  bucket_id = 'weekly-update-documents'
  and public.is_authenticated_admin()
)
with check (
  bucket_id = 'weekly-update-documents'
  and public.is_authenticated_admin()
);

-- No anonymous grant or policy exposes the private weekly-update-documents bucket.

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

  select count(*)
    into v_chalkboard_count
    from public.chalkboard_assets
    where id = v_teaching.chalkboard_asset_id
      and is_current_version = true
      and status = 'active'
      and coalesce(website_storage_path, storage_path) is not null;

  if v_chalkboard_count = 0 then
    raise exception 'A current active chalkboard is required before publishing.';
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
