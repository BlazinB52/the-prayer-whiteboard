-- Pray for Those in Authority.
--
-- 1. authority_leaders: one row per leader on the prayer list (name, title,
--    optional photo, scripture, short prayer, active switch, order).
-- 2. At most 4 leaders can be active at once. Inactive leaders are unlimited.
-- 3. Content managers and admins manage the list; the public reads only the
--    active leaders through public_authority_leaders.
-- 4. authority-photos: a public Storage bucket for the cropped photos, so
--    links never expire.

create table if not exists public.authority_leaders (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  title text not null,
  photo_path text,
  photo_alt text,
  scripture_reference text not null,
  scripture_text text,
  prayer text not null,
  is_active boolean not null default false,
  display_order integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id) on delete set null,
  updated_by_name text,
  constraint authority_leaders_name_check check (length(trim(name)) between 1 and 120),
  constraint authority_leaders_title_check check (length(trim(title)) between 1 and 120),
  constraint authority_leaders_photo_path_check
    check (photo_path is null or photo_path ~ '^leaders/[0-9a-f-]{36}\.jpg$'),
  constraint authority_leaders_photo_alt_check
    check (photo_alt is null or length(trim(photo_alt)) between 1 and 200),
  constraint authority_leaders_scripture_reference_check
    check (length(trim(scripture_reference)) between 1 and 140),
  constraint authority_leaders_scripture_text_check
    check (scripture_text is null or length(trim(scripture_text)) between 1 and 1000),
  constraint authority_leaders_prayer_check check (length(trim(prayer)) between 1 and 300),
  constraint authority_leaders_display_order_check check (display_order > 0)
);

create index if not exists authority_leaders_order_idx
  on public.authority_leaders (display_order, created_at, id);

-- New leaders go to the bottom of the list unless an order is given.
-- BEFORE triggers run ahead of the NOT NULL check, so inserts can omit it.
create or replace function public.authority_leaders_assign_order()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.display_order is null then
    perform pg_advisory_xact_lock(hashtext('public.authority_leaders.order'));
    select coalesce(max(display_order), 0) + 1 into new.display_order from public.authority_leaders;
  end if;
  return new;
end;
$$;

-- Enforces the 4-active cap. The advisory lock makes two simultaneous saves
-- wait for each other, so they cannot both slip past the count.
create or replace function public.authority_leaders_enforce_active_limit()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_active_count integer;
begin
  if new.is_active and (tg_op = 'INSERT' or not old.is_active) then
    perform pg_advisory_xact_lock(hashtext('public.authority_leaders.active'));
    select count(*) into v_active_count
    from public.authority_leaders
    where is_active and id <> new.id;

    if v_active_count >= 4 then
      raise exception 'authority_leaders_active_limit'
        using errcode = 'P0001', hint = 'Only 4 leaders can be active at once.';
    end if;
  end if;
  return new;
end;
$$;

revoke all on function public.authority_leaders_assign_order() from public;
revoke all on function public.authority_leaders_enforce_active_limit() from public;

drop trigger if exists authority_leaders_assign_order on public.authority_leaders;
create trigger authority_leaders_assign_order
before insert on public.authority_leaders
for each row execute function public.authority_leaders_assign_order();

drop trigger if exists authority_leaders_enforce_active_limit on public.authority_leaders;
create trigger authority_leaders_enforce_active_limit
before insert or update of is_active on public.authority_leaders
for each row execute function public.authority_leaders_enforce_active_limit();

drop trigger if exists authority_leaders_set_updated_at on public.authority_leaders;
create trigger authority_leaders_set_updated_at
before update on public.authority_leaders
for each row execute function public.set_updated_at();

drop trigger if exists authority_leaders_set_updated_by on public.authority_leaders;
create trigger authority_leaders_set_updated_by
before insert or update on public.authority_leaders
for each row execute function public.set_content_updated_by();

alter table public.authority_leaders enable row level security;

drop policy if exists "Content managers manage authority leaders" on public.authority_leaders;
create policy "Content managers manage authority leaders"
on public.authority_leaders
for all
using (public.is_content_manager_or_admin())
with check (public.is_content_manager_or_admin());

grant select, insert, update, delete on public.authority_leaders to authenticated;

-- Swaps a leader with the one above or below it.
create or replace function public.admin_move_authority_leader(
  p_leader_id uuid,
  p_direction text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current public.authority_leaders%rowtype;
  v_neighbor public.authority_leaders%rowtype;
begin
  if not public.is_content_manager_or_admin() then
    raise exception 'content manager authorization required' using errcode = '42501';
  end if;

  if p_direction not in ('up', 'down') then
    raise exception 'invalid move direction' using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('public.authority_leaders.order'));

  select * into v_current from public.authority_leaders where id = p_leader_id;
  if not found then
    raise exception 'leader not found' using errcode = 'P0002';
  end if;

  if p_direction = 'up' then
    select * into v_neighbor
    from public.authority_leaders
    where (display_order, created_at, id) < (v_current.display_order, v_current.created_at, v_current.id)
    order by display_order desc, created_at desc, id desc
    limit 1;
  else
    select * into v_neighbor
    from public.authority_leaders
    where (display_order, created_at, id) > (v_current.display_order, v_current.created_at, v_current.id)
    order by display_order asc, created_at asc, id asc
    limit 1;
  end if;

  if not found then
    raise exception 'leader cannot move %', p_direction using errcode = '22023';
  end if;

  update public.authority_leaders set display_order = v_neighbor.display_order where id = v_current.id;
  update public.authority_leaders set display_order = v_current.display_order where id = v_neighbor.id;
end;
$$;

revoke all on function public.admin_move_authority_leader(uuid, text) from public;
grant execute on function public.admin_move_authority_leader(uuid, text) to authenticated;

-- Public read: active leaders only, no management fields.
create or replace view public.public_authority_leaders
as
select
  id,
  name,
  title,
  photo_path,
  photo_alt,
  scripture_reference,
  scripture_text,
  prayer,
  display_order
from public.authority_leaders
where is_active = true;

grant select on public.public_authority_leaders to anon, authenticated;

-- ---------------------------------------------------------------------------
-- Photo storage
-- ---------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('authority-photos', 'authority-photos', true, 2097152, array['image/jpeg'])
on conflict (id) do nothing;

drop policy if exists "Content managers manage authority photos" on storage.objects;
create policy "Content managers manage authority photos"
on storage.objects
for all
using (bucket_id = 'authority-photos' and public.is_content_manager_or_admin())
with check (bucket_id = 'authority-photos' and public.is_content_manager_or_admin());

drop policy if exists "Public can read authority photos" on storage.objects;
create policy "Public can read authority photos"
on storage.objects
for select
using (bucket_id = 'authority-photos');
