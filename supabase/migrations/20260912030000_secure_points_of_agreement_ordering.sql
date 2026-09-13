-- Enforces active Points of Agreement ordering and adds admin-only ordering RPCs.

with ordered as (
  select
    id,
    row_number() over (order by display_order, created_at, id) as next_display_order
  from public.points_of_agreement
  where status = 'active'
)
update public.points_of_agreement point
set display_order = ordered.next_display_order
from ordered
where point.id = ordered.id
  and point.display_order <> ordered.next_display_order;

create unique index if not exists points_of_agreement_active_display_order_unique_idx
  on public.points_of_agreement (display_order)
  where status = 'active';

create or replace function public.admin_create_point_of_agreement(
  p_point_of_agreement text,
  p_scripture text,
  p_target text,
  p_decree text,
  p_additional_direction text,
  p_expires_on date,
  p_status text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_point_id uuid;
  v_display_order integer;
begin
  if not public.is_authenticated_admin() then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;

  if p_status not in ('active', 'archived') then
    raise exception 'invalid point status' using errcode = '22023';
  end if;

  lock table public.points_of_agreement in exclusive mode;

  if p_status = 'active' then
    select coalesce(max(display_order), 0) + 1
    into v_display_order
    from public.points_of_agreement
    where status = 'active';
  else
    select coalesce(max(display_order), 0) + 1
    into v_display_order
    from public.points_of_agreement;
  end if;

  insert into public.points_of_agreement (
    point_of_agreement,
    scripture,
    target,
    decree,
    additional_direction,
    expires_on,
    display_order,
    status,
    archived_at
  )
  values (
    p_point_of_agreement,
    p_scripture,
    p_target,
    p_decree,
    nullif(trim(p_additional_direction), ''),
    p_expires_on,
    v_display_order,
    p_status,
    case when p_status = 'archived' then now() else null end
  )
  returning id into v_point_id;

  return v_point_id;
end;
$$;

create or replace function public.admin_move_point_of_agreement(
  p_point_id uuid,
  p_direction text
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_current public.points_of_agreement%rowtype;
  v_neighbor public.points_of_agreement%rowtype;
  v_temporary_order integer;
begin
  if not public.is_authenticated_admin() then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;

  if p_direction not in ('up', 'down') then
    raise exception 'invalid move direction' using errcode = '22023';
  end if;

  lock table public.points_of_agreement in exclusive mode;

  select *
  into v_current
  from public.points_of_agreement
  where id = p_point_id
    and status = 'active';

  if not found then
    raise exception 'active point not found' using errcode = 'P0002';
  end if;

  if p_direction = 'up' then
    select *
    into v_neighbor
    from public.points_of_agreement
    where status = 'active'
      and display_order < v_current.display_order
    order by display_order desc, created_at desc, id desc
    limit 1;
  else
    select *
    into v_neighbor
    from public.points_of_agreement
    where status = 'active'
      and display_order > v_current.display_order
    order by display_order asc, created_at asc, id asc
    limit 1;
  end if;

  if not found then
    raise exception 'point cannot move %', p_direction using errcode = '22023';
  end if;

  select coalesce(max(display_order), 0) + 1
  into v_temporary_order
  from public.points_of_agreement
  where status = 'active';

  update public.points_of_agreement
  set display_order = v_temporary_order
  where id = v_current.id;

  update public.points_of_agreement
  set display_order = v_current.display_order
  where id = v_neighbor.id;

  update public.points_of_agreement
  set display_order = v_neighbor.display_order
  where id = v_current.id;
end;
$$;

create or replace function public.admin_restore_point_of_agreement(
  p_point_id uuid
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_display_order integer;
begin
  if not public.is_authenticated_admin() then
    raise exception 'admin authorization required' using errcode = '42501';
  end if;

  lock table public.points_of_agreement in exclusive mode;

  if not exists (
    select 1
    from public.points_of_agreement
    where id = p_point_id
      and status = 'archived'
  ) then
    raise exception 'archived point not found' using errcode = 'P0002';
  end if;

  select coalesce(max(display_order), 0) + 1
  into v_display_order
  from public.points_of_agreement
  where status = 'active';

  update public.points_of_agreement
  set
    status = 'active',
    display_order = v_display_order,
    archived_at = null
  where id = p_point_id
    and status = 'archived';
end;
$$;

revoke all on function public.admin_create_point_of_agreement(text, text, text, text, text, date, text) from public;
revoke all on function public.admin_create_point_of_agreement(text, text, text, text, text, date, text) from anon;
revoke all on function public.admin_create_point_of_agreement(text, text, text, text, text, date, text) from authenticated;
grant execute on function public.admin_create_point_of_agreement(text, text, text, text, text, date, text) to authenticated;

revoke all on function public.admin_move_point_of_agreement(uuid, text) from public;
revoke all on function public.admin_move_point_of_agreement(uuid, text) from anon;
revoke all on function public.admin_move_point_of_agreement(uuid, text) from authenticated;
grant execute on function public.admin_move_point_of_agreement(uuid, text) to authenticated;

revoke all on function public.admin_restore_point_of_agreement(uuid) from public;
revoke all on function public.admin_restore_point_of_agreement(uuid) from anon;
revoke all on function public.admin_restore_point_of_agreement(uuid) from authenticated;
grant execute on function public.admin_restore_point_of_agreement(uuid) to authenticated;
