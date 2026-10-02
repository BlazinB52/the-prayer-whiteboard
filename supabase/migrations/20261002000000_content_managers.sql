-- Content Managers.
--
-- 1. Adds a "content_manager" role to admin_authorizations, with the name,
--    personal email, and invitation/activation dates the admin portal shows.
-- 2. Makes is_authenticated_admin() check the role. Before this, any active
--    row counted as admin regardless of role.
-- 3. Adds is_content_manager_or_admin() and lets it manage Points of
--    Agreement (table policies and the ordering RPCs).
-- 4. Records who last edited each Point of Agreement and the guide settings.
-- 5. Removes the unused Review Portal objects from 20260912010000.

-- ---------------------------------------------------------------------------
-- Safety checks. Stop instead of silently changing anyone's access or
-- discarding Review Portal data.
-- ---------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from public.admin_authorizations where role not in ('admin', 'content_manager')) then
    raise exception 'admin_authorizations has rows with a role other than admin. Review them before applying this migration.';
  end if;

  if to_regclass('public.reviewer_accounts') is not null
     and exists (select 1 from public.reviewer_accounts) then
    raise exception 'reviewer_accounts has rows. The Review Portal is not unused; stop and review before dropping it.';
  end if;

  if to_regclass('public.review_requests') is not null
     and exists (select 1 from public.review_requests) then
    raise exception 'review_requests has rows. The Review Portal is not unused; stop and review before dropping it.';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- Roles and staff details
-- ---------------------------------------------------------------------------

alter table public.admin_authorizations
  drop constraint if exists admin_authorizations_role_check;

alter table public.admin_authorizations
  add constraint admin_authorizations_role_check
  check (role in ('admin', 'content_manager'));

alter table public.admin_authorizations
  add column if not exists display_name text,
  add column if not exists email text,
  add column if not exists invited_at timestamptz,
  add column if not exists last_invite_sent_at timestamptz,
  add column if not exists activated_at timestamptz;

-- Rows with revoked_at set already had no access; make is_active agree
-- before the constraint below requires it.
update public.admin_authorizations
set is_active = false
where revoked_at is not null
  and is_active = true;

-- Record existing staff emails so an invite to an admin's address is
-- refused before any sign-in link is created.
update public.admin_authorizations aa
set email = lower(trim(u.email))
from auth.users u
where aa.user_id = u.id
  and aa.email is null
  and u.email is not null
  and lower(trim(u.email)) ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$';

alter table public.admin_authorizations
  add constraint admin_authorizations_display_name_check
    check (display_name is null or length(trim(display_name)) between 1 and 120),
  add constraint admin_authorizations_email_check
    check (email is null or (email = lower(trim(email)) and email ~ '^[^\s@]+@[^\s@]+\.[^\s@]+$')),
  add constraint admin_authorizations_revoked_inactive_check
    check (revoked_at is null or is_active = false);

create unique index if not exists admin_authorizations_email_key
  on public.admin_authorizations (email)
  where email is not null;

-- The table had no updated_at trigger.
drop trigger if exists admin_authorizations_set_updated_at on public.admin_authorizations;
create trigger admin_authorizations_set_updated_at
before update on public.admin_authorizations
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Authorization checks
-- ---------------------------------------------------------------------------

create or replace function public.is_authenticated_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_authorizations aa
    where aa.user_id = auth.uid()
      and aa.role = 'admin'
      and aa.is_active = true
      and aa.revoked_at is null
  );
$$;

create or replace function public.is_content_manager_or_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.admin_authorizations aa
    where aa.user_id = auth.uid()
      and aa.role in ('admin', 'content_manager')
      and aa.is_active = true
      and aa.revoked_at is null
  );
$$;

-- Returns 'admin', 'content_manager', or null for the signed-in user.
-- Used by the app to decide where to send someone after sign-in.
create or replace function public.current_staff_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select aa.role
  from public.admin_authorizations aa
  where aa.user_id = auth.uid()
    and aa.is_active = true
    and aa.revoked_at is null
  limit 1;
$$;

-- Called after a staff member sets their password for the first time.
create or replace function public.mark_staff_activated()
returns void
language sql
volatile
security definer
set search_path = public
as $$
  update public.admin_authorizations
  set activated_at = now()
  where user_id = auth.uid()
    and is_active = true
    and revoked_at is null
    and activated_at is null;
$$;

revoke all on function public.is_content_manager_or_admin() from public;
revoke all on function public.current_staff_role() from public;
revoke all on function public.mark_staff_activated() from public;
grant execute on function public.is_content_manager_or_admin() to anon, authenticated;
grant execute on function public.current_staff_role() to authenticated;
grant execute on function public.mark_staff_activated() to authenticated;

-- The admin portal manages content managers with the service role.
grant select, insert, update on public.admin_authorizations to service_role;

-- ---------------------------------------------------------------------------
-- Last edited by
-- ---------------------------------------------------------------------------

alter table public.points_of_agreement
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by_name text;

alter table public.points_of_agreement_guide_settings
  add column if not exists updated_by uuid references auth.users(id) on delete set null,
  add column if not exists updated_by_name text;

-- Stores a name with the edit so it stays readable after a content manager
-- is revoked. Falls back to the account email when no name is on file.
create or replace function public.set_content_updated_by()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    return new;
  end if;

  new.updated_by := v_user_id;
  new.updated_by_name := coalesce(
    (select nullif(trim(aa.display_name), '') from public.admin_authorizations aa where aa.user_id = v_user_id),
    (select u.email from auth.users u where u.id = v_user_id)
  );
  return new;
end;
$$;

revoke all on function public.set_content_updated_by() from public;

drop trigger if exists points_of_agreement_set_updated_by on public.points_of_agreement;
create trigger points_of_agreement_set_updated_by
before insert or update on public.points_of_agreement
for each row execute function public.set_content_updated_by();

drop trigger if exists points_of_agreement_guide_settings_set_updated_by on public.points_of_agreement_guide_settings;
create trigger points_of_agreement_guide_settings_set_updated_by
before insert or update on public.points_of_agreement_guide_settings
for each row execute function public.set_content_updated_by();

-- ---------------------------------------------------------------------------
-- Points of Agreement: content managers and admins
-- ---------------------------------------------------------------------------

drop policy if exists "Admins manage points of agreement guide settings" on public.points_of_agreement_guide_settings;
drop policy if exists "Admins manage points of agreement" on public.points_of_agreement;

create policy "Content managers manage points of agreement guide settings"
on public.points_of_agreement_guide_settings
for all
using (public.is_content_manager_or_admin())
with check (public.is_content_manager_or_admin());

create policy "Content managers manage points of agreement"
on public.points_of_agreement
for all
using (public.is_content_manager_or_admin())
with check (public.is_content_manager_or_admin());

-- The three ordering RPCs below are unchanged from
-- 20260912030000_secure_points_of_agreement_ordering.sql except for the
-- authorization check.

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
  if not public.is_content_manager_or_admin() then
    raise exception 'content manager authorization required' using errcode = '42501';
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
  if not public.is_content_manager_or_admin() then
    raise exception 'content manager authorization required' using errcode = '42501';
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
  if not public.is_content_manager_or_admin() then
    raise exception 'content manager authorization required' using errcode = '42501';
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

-- ---------------------------------------------------------------------------
-- Remove the unused Review Portal (20260912010000_add_review_portal_foundation)
-- ---------------------------------------------------------------------------

drop function if exists public.review_suggest_replacement(uuid, text, text, text, text, text);
drop function if exists public.review_add_comment(uuid, text, text, text);
drop function if exists public.review_request_changes(uuid, text);
drop function if exists public.review_withdraw_current_approval(uuid, text);
drop function if exists public.review_approve_current(uuid);
drop function if exists public.assert_current_full_reviewer();
drop function if exists public.get_current_review_snapshot(uuid);
drop function if exists public.refresh_review_request_readiness(uuid);
drop function if exists public.get_review_snapshot_readiness(uuid);
drop function if exists public.admin_submit_review_snapshot(uuid, text, uuid, uuid, text, text, jsonb);

drop table if exists public.review_activity_events cascade;
drop table if exists public.review_approvals cascade;
drop table if exists public.review_change_requests cascade;
drop table if exists public.review_suggestions cascade;
drop table if exists public.review_comments cascade;
drop table if exists public.review_required_approvers cascade;
drop table if exists public.review_snapshots cascade;
drop table if exists public.review_requests cascade;
drop table if exists public.reviewer_accounts cascade;

drop function if exists public.is_pending_reviewer_password_change();
drop function if exists public.current_pending_reviewer_account_id();
drop function if exists public.is_authenticated_reviewer();
drop function if exists public.current_reviewer_account_id();
