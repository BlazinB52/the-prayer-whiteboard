-- Extend chalkboard assets for multiple logical assets, placements, and versions.
-- This migration preserves storage_path and the existing private bucket policies.

alter table public.chalkboard_assets
  add column if not exists asset_group_id uuid,
  add column if not exists category_id uuid,
  add column if not exists section_id uuid,
  add column if not exists title text,
  add column if not exists caption text,
  add column if not exists website_storage_path text,
  add column if not exists download_storage_path text,
  add column if not exists tv_storage_path text,
  add column if not exists display_order integer,
  add column if not exists include_in_print boolean,
  add column if not exists allow_download boolean;

-- The original model allowed only one logical chalkboard per teaching. Grouping
-- legacy rows by teaching preserves any existing version history as one lineage.
update public.chalkboard_assets
set
  asset_group_id = md5('chalkboard-asset-group:' || teaching_id::text)::uuid,
  title = coalesce(nullif(title, ''), 'Chalkboard'),
  alt_text = coalesce(nullif(alt_text, ''), 'Chalkboard teaching asset'),
  website_storage_path = coalesce(nullif(website_storage_path, ''), storage_path),
  download_storage_path = coalesce(
    nullif(download_storage_path, ''),
    case
      when storage_path ~* '\\.(jpe?g)$' then storage_path
      else null
    end
  ),
  display_order = coalesce(display_order, 1),
  include_in_print = coalesce(include_in_print, true),
  allow_download = coalesce(
    allow_download,
    storage_path ~* '\\.(jpe?g)$'
  )
where
  asset_group_id is null
  or nullif(title, '') is null
  or nullif(alt_text, '') is null
  or nullif(website_storage_path, '') is null
  or display_order is null
  or include_in_print is null
  or allow_download is null;

alter table public.chalkboard_assets
  alter column asset_group_id set not null,
  alter column title set not null,
  alter column alt_text set not null,
  alter column website_storage_path set not null,
  alter column display_order set not null,
  alter column include_in_print set not null,
  alter column allow_download set not null;

alter table public.chalkboard_assets
  alter column display_order set default 1,
  alter column include_in_print set default true,
  alter column allow_download set default false;

-- A section placement must carry its owning category. The composite foreign
-- keys below also enforce that category, section, and teaching belong together.
alter table public.teaching_sections
  add constraint teaching_sections_id_teaching_id_category_id_key
  unique (id, teaching_id, category_id);

alter table public.chalkboard_assets
  add constraint chalkboard_assets_category_teaching_fk
  foreign key (category_id, teaching_id)
  references public.teaching_categories (id, teaching_id)
  on delete restrict,
  add constraint chalkboard_assets_section_category_teaching_fk
  foreign key (section_id, teaching_id, category_id)
  references public.teaching_sections (id, teaching_id, category_id)
  on delete restrict,
  add constraint chalkboard_assets_section_requires_category_check
  check (section_id is null or category_id is not null),
  add constraint chalkboard_assets_display_order_check
  check (display_order > 0),
  add constraint chalkboard_assets_download_path_check
  check (allow_download = false or download_storage_path is not null),
  add constraint chalkboard_assets_website_path_check
  check (length(trim(website_storage_path)) > 0),
  add constraint chalkboard_assets_title_check
  check (length(trim(title)) > 0),
  add constraint chalkboard_assets_alt_text_check
  check (length(trim(alt_text)) > 0),
  add constraint chalkboard_assets_website_storage_path_key
  unique (website_storage_path),
  add constraint chalkboard_assets_download_storage_path_key
  unique (download_storage_path),
  add constraint chalkboard_assets_tv_storage_path_key
  unique (tv_storage_path);

-- The old uniqueness rules represented one asset lineage per teaching. Replace
-- them with version and current-version uniqueness per logical asset group.
alter table public.chalkboard_assets
  drop constraint if exists chalkboard_assets_teaching_id_version_number_key,
  add constraint chalkboard_assets_teaching_group_version_key
  unique (teaching_id, asset_group_id, version_number);

drop index if exists public.chalkboard_assets_one_current_version_per_teaching_idx;

create unique index if not exists chalkboard_assets_one_current_version_per_group_idx
  on public.chalkboard_assets (teaching_id, asset_group_id)
  where is_current_version = true;

-- Current assets are the only rows shown in ordered placement queries.
create index if not exists chalkboard_assets_current_teaching_order_idx
  on public.chalkboard_assets (teaching_id, display_order, updated_at desc)
  where is_current_version = true and status = 'active';

create index if not exists chalkboard_assets_current_category_order_idx
  on public.chalkboard_assets (teaching_id, category_id, display_order, updated_at desc)
  where is_current_version = true and status = 'active' and category_id is not null;

create index if not exists chalkboard_assets_current_section_order_idx
  on public.chalkboard_assets (teaching_id, section_id, display_order, updated_at desc)
  where is_current_version = true and status = 'active' and section_id is not null;

create index if not exists chalkboard_assets_current_group_lookup_idx
  on public.chalkboard_assets (teaching_id, asset_group_id)
  where is_current_version = true;

-- The existing teaching/status/current/uploaded index remains useful for
-- lifecycle management and is intentionally retained.

-- RLS and storage policies remain unchanged: chalkboard metadata and private
-- chalkboards bucket objects are administrator-managed only. Public delivery
-- will use verified server-side signed URLs in a later phase.
