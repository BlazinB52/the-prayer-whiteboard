-- Archive the previous current Weekly Update when publishing a new current update.

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
    set status = 'archived',
        is_current = false,
        archived_at = coalesce(archived_at, now())
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
