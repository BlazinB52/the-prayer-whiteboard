-- Weekly updates get a language, so an Español weekly update can exist and be emailed to Español
-- subscribers without ever touching the English one.
--
-- Safe to apply before the matching app code ships: every existing row becomes 'en', the English
-- website view keeps returning exactly the one current English update, and the publish function
-- behaves identically until a Spanish update exists.
--
--  1. language column, default 'en' (all existing rows are English).
--  2. One current update PER LANGUAGE instead of one for the whole site. The new index is created
--     before the old one is dropped, so there is never a moment without protection.
--  3. publish_weekly_update archives only the previous current update of the SAME language. Before,
--     it archived every other current update, so publishing a Spanish update would have archived
--     the English one.
--  4. public_current_weekly_update stays the English view (same columns, now filtered to English),
--     so the English pages that read it need no change and can never show a Spanish update.
--     public_current_weekly_update_es is the Español equivalent.

alter table public.weekly_updates
  add column if not exists language text not null default 'en';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'weekly_updates_language_check') then
    alter table public.weekly_updates
      add constraint weekly_updates_language_check check (language in ('en', 'es'));
  end if;
end;
$$;

create unique index if not exists weekly_updates_one_current_per_language_idx
  on public.weekly_updates (language)
  where is_current = true;

drop index if exists public.weekly_updates_one_current_idx;

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

  -- Only the previous current update of this update's own language is replaced.
  update public.weekly_updates
    set status = 'archived',
        is_current = false,
        archived_at = coalesce(archived_at, now())
    where is_current = true
      and language = v_update.language
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
  and is_current = true
  and language = 'en';

create or replace view public.public_current_weekly_update_es
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
  and is_current = true
  and language = 'es';

grant select on public.public_current_weekly_update to anon, authenticated;
grant select on public.public_current_weekly_update_es to anon, authenticated;
