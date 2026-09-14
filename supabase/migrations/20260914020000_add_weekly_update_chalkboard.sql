-- Allow current Weekly Updates to select a chalkboard from the shared library.

alter table public.weekly_updates
  add column if not exists chalkboard_asset_id uuid;

alter table public.weekly_updates
  drop constraint if exists weekly_updates_chalkboard_asset_id_fkey,
  add constraint weekly_updates_chalkboard_asset_id_fkey
    foreign key (chalkboard_asset_id)
    references public.chalkboard_assets(id)
    on delete set null;

create or replace view public.public_current_weekly_update
as
select
  id,
  title,
  body_markdown,
  converted_content,
  published_at,
  chalkboard_asset_id
from public.weekly_updates
where status = 'published'
  and is_current = true;

grant select on public.public_current_weekly_update to anon, authenticated;
