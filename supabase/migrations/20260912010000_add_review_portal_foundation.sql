-- Review Portal foundation.
-- This adds reviewer authorization, immutable review snapshots, review actions,
-- append-only audit events, and atomic reviewer action RPCs.
-- It does not create Supabase Auth users or seed real reviewer accounts.

create table if not exists public.reviewer_accounts (
  id uuid primary key default gen_random_uuid(),
  auth_user_id uuid not null unique references auth.users(id) on delete cascade,
  login_name text not null,
  display_name text not null,
  role text not null default 'reviewer' check (role in ('reviewer')),
  status text not null default 'pending' check (status in ('pending', 'active', 'disabled')),
  must_change_password boolean not null default true,
  first_login_completed_at timestamptz,
  temporary_password_issued_at timestamptz,
  temporary_password_expires_at timestamptz,
  temporary_password_last_reissued_at timestamptz,
  activated_at timestamptz,
  deactivated_at timestamptz,
  created_by_admin_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint reviewer_accounts_login_name_not_blank_check
    check (length(trim(login_name)) > 0),
  constraint reviewer_accounts_display_name_not_blank_check
    check (length(trim(display_name)) > 0),
  constraint reviewer_accounts_first_login_requires_password_change_complete_check
    check (first_login_completed_at is null or must_change_password = false),
  constraint reviewer_accounts_disabled_has_deactivated_at_check
    check (status <> 'disabled' or deactivated_at is not null),
  constraint reviewer_accounts_temp_password_expiry_check
    check (
      temporary_password_expires_at is null
      or temporary_password_issued_at is null
      or temporary_password_expires_at > temporary_password_issued_at
    )
);

create unique index if not exists reviewer_accounts_login_name_lower_key
  on public.reviewer_accounts (lower(login_name));

create index if not exists reviewer_accounts_auth_status_idx
  on public.reviewer_accounts (auth_user_id, status);

create trigger reviewer_accounts_set_updated_at
before update on public.reviewer_accounts
for each row execute function public.set_updated_at();

create or replace function public.current_reviewer_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ra.id
  from public.reviewer_accounts ra
  where ra.auth_user_id = auth.uid()
    and ra.status = 'active'
    and ra.must_change_password = false
  limit 1;
$$;

create or replace function public.is_authenticated_reviewer()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_reviewer_account_id() is not null;
$$;

create or replace function public.current_pending_reviewer_account_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select ra.id
  from public.reviewer_accounts ra
  where ra.auth_user_id = auth.uid()
    and ra.status in ('pending', 'active')
    and ra.must_change_password = true
    and ra.temporary_password_expires_at is not null
    and ra.temporary_password_expires_at > now()
  limit 1;
$$;

create or replace function public.is_pending_reviewer_password_change()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.current_pending_reviewer_account_id() is not null;
$$;

create table if not exists public.review_requests (
  id uuid primary key default gen_random_uuid(),
  subject_type text not null check (subject_type in ('teaching', 'devotional')),
  source_teaching_id uuid references public.teachings(id) on delete set null,
  source_devotional_id uuid references public.teaching_devotionals(id) on delete set null,
  title text not null,
  status text not null default 'active' check (status in ('active', 'ready_for_publication', 'closed', 'superseded')),
  current_snapshot_id uuid,
  current_version integer not null default 1 check (current_version > 0),
  submitted_by_admin_user_id uuid references auth.users(id) on delete set null,
  submitted_at timestamptz not null default now(),
  closed_at timestamptz,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint review_requests_title_not_blank_check
    check (length(trim(title)) > 0),
  constraint review_requests_subject_source_check
    check (
      (subject_type = 'teaching' and source_teaching_id is not null)
      or (subject_type = 'devotional' and source_devotional_id is not null)
    ),
  constraint review_requests_closed_at_check
    check (status <> 'closed' or closed_at is not null),
  constraint review_requests_superseded_at_check
    check (status <> 'superseded' or superseded_at is not null)
);

create table if not exists public.review_snapshots (
  id uuid primary key default gen_random_uuid(),
  review_request_id uuid not null references public.review_requests(id) on delete cascade,
  version integer not null check (version > 0),
  subject_type text not null check (subject_type in ('teaching', 'devotional')),
  source_teaching_id uuid,
  source_devotional_id uuid,
  title text not null,
  summary text,
  snapshot_json jsonb not null,
  created_by_admin_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (review_request_id, version),
  unique (id, review_request_id),
  unique (id, review_request_id, version),
  constraint review_snapshots_title_not_blank_check
    check (length(trim(title)) > 0),
  constraint review_snapshots_payload_object_check
    check (jsonb_typeof(snapshot_json) = 'object'),
  constraint review_snapshots_subject_source_check
    check (
      (subject_type = 'teaching' and source_teaching_id is not null)
      or (subject_type = 'devotional' and source_devotional_id is not null)
    )
);

alter table public.review_requests
  add constraint review_requests_current_snapshot_fk
  foreign key (current_snapshot_id, id, current_version)
  references public.review_snapshots (id, review_request_id, version)
  on delete restrict;

create index if not exists review_requests_status_submitted_idx
  on public.review_requests (status, submitted_at desc);

create index if not exists review_snapshots_request_version_idx
  on public.review_snapshots (review_request_id, version desc);

create trigger review_requests_set_updated_at
before update on public.review_requests
for each row execute function public.set_updated_at();

create table if not exists public.review_required_approvers (
  id uuid primary key default gen_random_uuid(),
  reviewer_account_id uuid not null unique references public.reviewer_accounts(id) on delete cascade,
  is_active boolean not null default true,
  created_by_admin_user_id uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists review_required_approvers_active_idx
  on public.review_required_approvers (reviewer_account_id)
  where is_active = true;

create trigger review_required_approvers_set_updated_at
before update on public.review_required_approvers
for each row execute function public.set_updated_at();

create table if not exists public.review_comments (
  id uuid primary key default gen_random_uuid(),
  review_request_id uuid not null,
  snapshot_id uuid not null,
  snapshot_version integer not null,
  reviewer_account_id uuid not null references public.reviewer_accounts(id) on delete restrict,
  anchor_type text,
  anchor_id text,
  body text not null,
  status text not null default 'open' check (status in ('open', 'resolved', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (snapshot_id, review_request_id, snapshot_version)
    references public.review_snapshots (id, review_request_id, version)
    on delete cascade,
  constraint review_comments_body_not_blank_check
    check (length(trim(body)) > 0)
);

create table if not exists public.review_suggestions (
  id uuid primary key default gen_random_uuid(),
  review_request_id uuid not null,
  snapshot_id uuid not null,
  snapshot_version integer not null,
  reviewer_account_id uuid not null references public.reviewer_accounts(id) on delete restrict,
  anchor_type text not null,
  anchor_id text not null,
  current_text text,
  suggested_text text not null,
  note text,
  status text not null default 'open' check (status in ('open', 'accepted', 'rejected', 'withdrawn')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (snapshot_id, review_request_id, snapshot_version)
    references public.review_snapshots (id, review_request_id, version)
    on delete cascade,
  constraint review_suggestions_anchor_type_not_blank_check
    check (length(trim(anchor_type)) > 0),
  constraint review_suggestions_anchor_id_not_blank_check
    check (length(trim(anchor_id)) > 0),
  constraint review_suggestions_suggested_text_not_blank_check
    check (length(trim(suggested_text)) > 0)
);

create table if not exists public.review_change_requests (
  id uuid primary key default gen_random_uuid(),
  review_request_id uuid not null,
  snapshot_id uuid not null,
  snapshot_version integer not null,
  reviewer_account_id uuid not null references public.reviewer_accounts(id) on delete restrict,
  summary text not null,
  created_at timestamptz not null default now(),
  foreign key (snapshot_id, review_request_id, snapshot_version)
    references public.review_snapshots (id, review_request_id, version)
    on delete cascade,
  constraint review_change_requests_summary_not_blank_check
    check (length(trim(summary)) > 0)
);

create table if not exists public.review_approvals (
  id uuid primary key default gen_random_uuid(),
  review_request_id uuid not null,
  snapshot_id uuid not null,
  snapshot_version integer not null,
  reviewer_account_id uuid not null references public.reviewer_accounts(id) on delete restrict,
  approved_at timestamptz not null default now(),
  withdrawn_at timestamptz,
  withdraw_reason text,
  foreign key (snapshot_id, review_request_id, snapshot_version)
    references public.review_snapshots (id, review_request_id, version)
    on delete cascade,
  constraint review_approvals_withdraw_reason_check
    check (withdraw_reason is null or length(trim(withdraw_reason)) > 0)
);

create unique index if not exists review_approvals_one_active_per_reviewer_snapshot_idx
  on public.review_approvals (snapshot_id, reviewer_account_id)
  where withdrawn_at is null;

create index if not exists review_comments_request_snapshot_created_idx
  on public.review_comments (review_request_id, snapshot_version, created_at);

create index if not exists review_suggestions_request_snapshot_created_idx
  on public.review_suggestions (review_request_id, snapshot_version, created_at);

create index if not exists review_change_requests_request_snapshot_created_idx
  on public.review_change_requests (review_request_id, snapshot_version, created_at);

create index if not exists review_approvals_snapshot_active_idx
  on public.review_approvals (snapshot_id, reviewer_account_id)
  where withdrawn_at is null;

create trigger review_comments_set_updated_at
before update on public.review_comments
for each row execute function public.set_updated_at();

create trigger review_suggestions_set_updated_at
before update on public.review_suggestions
for each row execute function public.set_updated_at();

create table if not exists public.review_activity_events (
  id uuid primary key default gen_random_uuid(),
  review_request_id uuid not null,
  snapshot_id uuid not null,
  snapshot_version integer not null,
  actor_type text not null check (actor_type in ('reviewer', 'admin', 'system')),
  reviewer_account_id uuid references public.reviewer_accounts(id) on delete set null,
  admin_user_id uuid references auth.users(id) on delete set null,
  action_type text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  foreign key (snapshot_id, review_request_id, snapshot_version)
    references public.review_snapshots (id, review_request_id, version)
    on delete restrict,
  constraint review_activity_events_action_type_not_blank_check
    check (length(trim(action_type)) > 0),
  constraint review_activity_events_metadata_object_check
    check (jsonb_typeof(metadata) = 'object'),
  constraint review_activity_events_actor_check
    check (
      (actor_type = 'reviewer' and reviewer_account_id is not null and admin_user_id is null)
      or (actor_type = 'admin' and admin_user_id is not null and reviewer_account_id is null)
      or (actor_type = 'system' and reviewer_account_id is null and admin_user_id is null)
    )
);

create index if not exists review_activity_events_request_created_idx
  on public.review_activity_events (review_request_id, snapshot_version, created_at desc);

create index if not exists review_activity_events_reviewer_created_idx
  on public.review_activity_events (reviewer_account_id, created_at desc);

create index if not exists review_activity_events_action_created_idx
  on public.review_activity_events (action_type, created_at desc);

create or replace function public.admin_submit_review_snapshot(
  p_review_request_id uuid,
  p_subject_type text,
  p_source_teaching_id uuid,
  p_source_devotional_id uuid,
  p_title text,
  p_summary text,
  p_snapshot_json jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_admin_user_id uuid;
  v_request public.review_requests%rowtype;
  v_request_id uuid;
  v_snapshot_id uuid;
  v_next_version integer;
begin
  if not public.is_authenticated_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  v_admin_user_id := auth.uid();

  if p_subject_type not in ('teaching', 'devotional') then
    raise exception 'Review subject type is invalid.';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'Review title is required.';
  end if;

  if jsonb_typeof(p_snapshot_json) is distinct from 'object' then
    raise exception 'Review snapshot payload must be a JSON object.';
  end if;

  if p_subject_type = 'teaching' and p_source_teaching_id is null then
    raise exception 'Teaching review snapshots require a teaching id.';
  end if;

  if p_subject_type = 'devotional' and p_source_devotional_id is null then
    raise exception 'Devotional review snapshots require a devotional id.';
  end if;

  if p_review_request_id is null then
    insert into public.review_requests (
      subject_type,
      source_teaching_id,
      source_devotional_id,
      title,
      status,
      current_version,
      submitted_by_admin_user_id
    )
    values (
      p_subject_type,
      p_source_teaching_id,
      p_source_devotional_id,
      trim(p_title),
      'active',
      1,
      v_admin_user_id
    )
    returning * into v_request;

    v_request_id := v_request.id;
    v_next_version := 1;
  else
    select *
      into v_request
      from public.review_requests
      where id = p_review_request_id
      for update;

    if not found then
      raise exception 'Review request could not be found.' using errcode = 'P0002';
    end if;

    if v_request.status not in ('active', 'ready_for_publication') then
      raise exception 'Only active review requests can receive a new snapshot.';
    end if;

    if v_request.subject_type <> p_subject_type then
      raise exception 'Snapshot subject type does not match the review request.';
    end if;

    v_request_id := v_request.id;
    v_next_version := v_request.current_version + 1;
  end if;

  insert into public.review_snapshots (
    review_request_id,
    version,
    subject_type,
    source_teaching_id,
    source_devotional_id,
    title,
    summary,
    snapshot_json,
    created_by_admin_user_id
  )
  values (
    v_request_id,
    v_next_version,
    p_subject_type,
    p_source_teaching_id,
    p_source_devotional_id,
    trim(p_title),
    nullif(trim(coalesce(p_summary, '')), ''),
    p_snapshot_json,
    v_admin_user_id
  )
  returning id into v_snapshot_id;

  update public.review_requests
    set current_snapshot_id = v_snapshot_id,
        current_version = v_next_version,
        title = trim(p_title),
        status = 'active',
        submitted_by_admin_user_id = v_admin_user_id,
        submitted_at = now()
    where id = v_request_id;

  insert into public.review_activity_events (
    review_request_id,
    snapshot_id,
    snapshot_version,
    actor_type,
    admin_user_id,
    action_type,
    target_type,
    target_id
  )
  values (
    v_request_id,
    v_snapshot_id,
    v_next_version,
    'admin',
    v_admin_user_id,
    'snapshot.submitted',
    'review_snapshot',
    v_snapshot_id
  );

  return v_snapshot_id;
end;
$$;

create or replace function public.get_review_snapshot_readiness(p_snapshot_id uuid)
returns table (
  required_approver_count integer,
  active_required_approval_count integer,
  is_ready boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with required as (
    select rra.reviewer_account_id
    from public.review_required_approvers rra
    join public.reviewer_accounts ra on ra.id = rra.reviewer_account_id
    where rra.is_active = true
      and ra.status = 'active'
      and ra.must_change_password = false
  ),
  approved as (
    select distinct a.reviewer_account_id
    from public.review_approvals a
    join required r on r.reviewer_account_id = a.reviewer_account_id
    where a.snapshot_id = p_snapshot_id
      and a.withdrawn_at is null
  )
  select
    (select count(*)::integer from required) as required_approver_count,
    (select count(*)::integer from approved) as active_required_approval_count,
    (
      (select count(*) from required) >= 2
      and not exists (
        select 1
        from required r
        where not exists (
          select 1
          from approved a
          where a.reviewer_account_id = r.reviewer_account_id
        )
      )
    ) as is_ready;
$$;

create or replace function public.refresh_review_request_readiness(p_review_request_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.review_requests%rowtype;
  v_is_ready boolean;
begin
  select *
    into v_request
    from public.review_requests
    where id = p_review_request_id
    for update;

  if not found then
    raise exception 'Review request could not be found.' using errcode = 'P0002';
  end if;

  if v_request.current_snapshot_id is null then
    return false;
  end if;

  select readiness.is_ready
    into v_is_ready
    from public.get_review_snapshot_readiness(v_request.current_snapshot_id) readiness;

  if v_request.status in ('active', 'ready_for_publication') then
    update public.review_requests
      set status = case when coalesce(v_is_ready, false) then 'ready_for_publication' else 'active' end
      where id = p_review_request_id;
  end if;

  return coalesce(v_is_ready, false);
end;
$$;

create or replace function public.get_current_review_snapshot(p_review_request_id uuid)
returns public.review_snapshots
language sql
stable
security definer
set search_path = public
as $$
  select s.*
  from public.review_requests r
  join public.review_snapshots s
    on s.id = r.current_snapshot_id
   and s.review_request_id = r.id
   and s.version = r.current_version
  where r.id = p_review_request_id
    and r.status in ('active', 'ready_for_publication');
$$;

create or replace function public.assert_current_full_reviewer()
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer_id uuid;
begin
  v_reviewer_id := public.current_reviewer_account_id();

  if v_reviewer_id is null then
    raise exception 'Active reviewer authorization is required.' using errcode = '42501';
  end if;

  return v_reviewer_id;
end;
$$;

create or replace function public.review_approve_current(p_review_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer_id uuid;
  v_snapshot public.review_snapshots%rowtype;
  v_approval_id uuid;
begin
  v_reviewer_id := public.assert_current_full_reviewer();

  select *
    into v_snapshot
    from public.get_current_review_snapshot(p_review_request_id);

  if not found then
    raise exception 'Current review snapshot could not be found.' using errcode = 'P0002';
  end if;

  insert into public.review_approvals (
    review_request_id,
    snapshot_id,
    snapshot_version,
    reviewer_account_id
  )
  values (
    v_snapshot.review_request_id,
    v_snapshot.id,
    v_snapshot.version,
    v_reviewer_id
  )
  returning id into v_approval_id;

  insert into public.review_activity_events (
    review_request_id,
    snapshot_id,
    snapshot_version,
    actor_type,
    reviewer_account_id,
    action_type,
    target_type,
    target_id
  )
  values (
    v_snapshot.review_request_id,
    v_snapshot.id,
    v_snapshot.version,
    'reviewer',
    v_reviewer_id,
    'approval.created',
    'review_approval',
    v_approval_id
  );

  perform public.refresh_review_request_readiness(v_snapshot.review_request_id);

  return v_approval_id;
end;
$$;

create or replace function public.review_withdraw_current_approval(
  p_review_request_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer_id uuid;
  v_snapshot public.review_snapshots%rowtype;
  v_approval_id uuid;
begin
  v_reviewer_id := public.assert_current_full_reviewer();

  select *
    into v_snapshot
    from public.get_current_review_snapshot(p_review_request_id);

  if not found then
    raise exception 'Current review snapshot could not be found.' using errcode = 'P0002';
  end if;

  update public.review_approvals
    set withdrawn_at = now(),
        withdraw_reason = nullif(trim(coalesce(p_reason, '')), '')
    where review_request_id = v_snapshot.review_request_id
      and snapshot_id = v_snapshot.id
      and snapshot_version = v_snapshot.version
      and reviewer_account_id = v_reviewer_id
      and withdrawn_at is null
    returning id into v_approval_id;

  if v_approval_id is null then
    raise exception 'Active approval could not be found.' using errcode = 'P0002';
  end if;

  insert into public.review_activity_events (
    review_request_id,
    snapshot_id,
    snapshot_version,
    actor_type,
    reviewer_account_id,
    action_type,
    target_type,
    target_id,
    metadata
  )
  values (
    v_snapshot.review_request_id,
    v_snapshot.id,
    v_snapshot.version,
    'reviewer',
    v_reviewer_id,
    'approval.withdrawn',
    'review_approval',
    v_approval_id,
    jsonb_build_object('has_reason', nullif(trim(coalesce(p_reason, '')), '') is not null)
  );

  perform public.refresh_review_request_readiness(v_snapshot.review_request_id);

  return v_approval_id;
end;
$$;

create or replace function public.review_request_changes(
  p_review_request_id uuid,
  p_summary text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer_id uuid;
  v_snapshot public.review_snapshots%rowtype;
  v_change_request_id uuid;
  v_withdrawn_approval_id uuid;
begin
  v_reviewer_id := public.assert_current_full_reviewer();

  if nullif(trim(coalesce(p_summary, '')), '') is null then
    raise exception 'Change request summary is required.';
  end if;

  select *
    into v_snapshot
    from public.get_current_review_snapshot(p_review_request_id);

  if not found then
    raise exception 'Current review snapshot could not be found.' using errcode = 'P0002';
  end if;

  update public.review_approvals
    set withdrawn_at = now(),
        withdraw_reason = 'Reviewer requested changes.'
    where review_request_id = v_snapshot.review_request_id
      and snapshot_id = v_snapshot.id
      and snapshot_version = v_snapshot.version
      and reviewer_account_id = v_reviewer_id
      and withdrawn_at is null
    returning id into v_withdrawn_approval_id;

  insert into public.review_change_requests (
    review_request_id,
    snapshot_id,
    snapshot_version,
    reviewer_account_id,
    summary
  )
  values (
    v_snapshot.review_request_id,
    v_snapshot.id,
    v_snapshot.version,
    v_reviewer_id,
    trim(p_summary)
  )
  returning id into v_change_request_id;

  insert into public.review_activity_events (
    review_request_id,
    snapshot_id,
    snapshot_version,
    actor_type,
    reviewer_account_id,
    action_type,
    target_type,
    target_id,
    metadata
  )
  values (
    v_snapshot.review_request_id,
    v_snapshot.id,
    v_snapshot.version,
    'reviewer',
    v_reviewer_id,
    'changes.requested',
    'review_change_request',
    v_change_request_id,
    jsonb_build_object('approval_withdrawn', v_withdrawn_approval_id is not null)
  );

  if v_withdrawn_approval_id is not null then
    insert into public.review_activity_events (
      review_request_id,
      snapshot_id,
      snapshot_version,
      actor_type,
      reviewer_account_id,
      action_type,
      target_type,
      target_id
    )
    values (
      v_snapshot.review_request_id,
      v_snapshot.id,
      v_snapshot.version,
      'reviewer',
      v_reviewer_id,
      'approval.withdrawn',
      'review_approval',
      v_withdrawn_approval_id
    );
  end if;

  perform public.refresh_review_request_readiness(v_snapshot.review_request_id);

  return v_change_request_id;
end;
$$;

create or replace function public.review_add_comment(
  p_review_request_id uuid,
  p_body text,
  p_anchor_type text default null,
  p_anchor_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer_id uuid;
  v_snapshot public.review_snapshots%rowtype;
  v_comment_id uuid;
begin
  v_reviewer_id := public.assert_current_full_reviewer();

  if nullif(trim(coalesce(p_body, '')), '') is null then
    raise exception 'Comment body is required.';
  end if;

  select *
    into v_snapshot
    from public.get_current_review_snapshot(p_review_request_id);

  if not found then
    raise exception 'Current review snapshot could not be found.' using errcode = 'P0002';
  end if;

  insert into public.review_comments (
    review_request_id,
    snapshot_id,
    snapshot_version,
    reviewer_account_id,
    anchor_type,
    anchor_id,
    body
  )
  values (
    v_snapshot.review_request_id,
    v_snapshot.id,
    v_snapshot.version,
    v_reviewer_id,
    nullif(trim(coalesce(p_anchor_type, '')), ''),
    nullif(trim(coalesce(p_anchor_id, '')), ''),
    trim(p_body)
  )
  returning id into v_comment_id;

  insert into public.review_activity_events (
    review_request_id,
    snapshot_id,
    snapshot_version,
    actor_type,
    reviewer_account_id,
    action_type,
    target_type,
    target_id
  )
  values (
    v_snapshot.review_request_id,
    v_snapshot.id,
    v_snapshot.version,
    'reviewer',
    v_reviewer_id,
    'comment.created',
    'review_comment',
    v_comment_id
  );

  return v_comment_id;
end;
$$;

create or replace function public.review_suggest_replacement(
  p_review_request_id uuid,
  p_anchor_type text,
  p_anchor_id text,
  p_suggested_text text,
  p_current_text text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_reviewer_id uuid;
  v_snapshot public.review_snapshots%rowtype;
  v_suggestion_id uuid;
begin
  v_reviewer_id := public.assert_current_full_reviewer();

  if nullif(trim(coalesce(p_anchor_type, '')), '') is null then
    raise exception 'Suggestion anchor type is required.';
  end if;

  if nullif(trim(coalesce(p_anchor_id, '')), '') is null then
    raise exception 'Suggestion anchor id is required.';
  end if;

  if nullif(trim(coalesce(p_suggested_text, '')), '') is null then
    raise exception 'Suggested text is required.';
  end if;

  select *
    into v_snapshot
    from public.get_current_review_snapshot(p_review_request_id);

  if not found then
    raise exception 'Current review snapshot could not be found.' using errcode = 'P0002';
  end if;

  insert into public.review_suggestions (
    review_request_id,
    snapshot_id,
    snapshot_version,
    reviewer_account_id,
    anchor_type,
    anchor_id,
    current_text,
    suggested_text,
    note
  )
  values (
    v_snapshot.review_request_id,
    v_snapshot.id,
    v_snapshot.version,
    v_reviewer_id,
    trim(p_anchor_type),
    trim(p_anchor_id),
    nullif(p_current_text, ''),
    trim(p_suggested_text),
    nullif(trim(coalesce(p_note, '')), '')
  )
  returning id into v_suggestion_id;

  insert into public.review_activity_events (
    review_request_id,
    snapshot_id,
    snapshot_version,
    actor_type,
    reviewer_account_id,
    action_type,
    target_type,
    target_id
  )
  values (
    v_snapshot.review_request_id,
    v_snapshot.id,
    v_snapshot.version,
    'reviewer',
    v_reviewer_id,
    'suggestion.created',
    'review_suggestion',
    v_suggestion_id
  );

  return v_suggestion_id;
end;
$$;

alter table public.reviewer_accounts enable row level security;
alter table public.review_requests enable row level security;
alter table public.review_snapshots enable row level security;
alter table public.review_required_approvers enable row level security;
alter table public.review_comments enable row level security;
alter table public.review_suggestions enable row level security;
alter table public.review_change_requests enable row level security;
alter table public.review_approvals enable row level security;
alter table public.review_activity_events enable row level security;

create policy "Reviewers can read their own minimal account state"
on public.reviewer_accounts
for select
using (
  auth.uid() = auth_user_id
  and (
    public.is_authenticated_reviewer()
    or public.is_pending_reviewer_password_change()
  )
);

create policy "Admins manage reviewer accounts"
on public.reviewer_accounts
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

create policy "Admins manage review requests"
on public.review_requests
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

create policy "Full reviewers read active review requests"
on public.review_requests
for select
using (
  public.is_authenticated_reviewer()
  and status in ('active', 'ready_for_publication')
);

create policy "Admins insert and read review snapshots"
on public.review_snapshots
for select
using (public.is_authenticated_admin());

create policy "Admins insert review snapshots"
on public.review_snapshots
for insert
with check (public.is_authenticated_admin());

create policy "Full reviewers read review snapshots"
on public.review_snapshots
for select
using (
  public.is_authenticated_reviewer()
  and exists (
    select 1
    from public.review_requests rr
    where rr.id = review_request_id
      and rr.status in ('active', 'ready_for_publication')
  )
);

create policy "Admins manage required review approvers"
on public.review_required_approvers
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

create policy "Full reviewers read required review approvers"
on public.review_required_approvers
for select
using (public.is_authenticated_reviewer());

create policy "Admins read review comments"
on public.review_comments
for select
using (public.is_authenticated_admin());

create policy "Full reviewers read review comments"
on public.review_comments
for select
using (
  public.is_authenticated_reviewer()
  and exists (
    select 1
    from public.review_requests rr
    where rr.id = review_request_id
      and rr.status in ('active', 'ready_for_publication')
  )
);

create policy "Admins read review suggestions"
on public.review_suggestions
for select
using (public.is_authenticated_admin());

create policy "Full reviewers read review suggestions"
on public.review_suggestions
for select
using (
  public.is_authenticated_reviewer()
  and exists (
    select 1
    from public.review_requests rr
    where rr.id = review_request_id
      and rr.status in ('active', 'ready_for_publication')
  )
);

create policy "Admins read review change requests"
on public.review_change_requests
for select
using (public.is_authenticated_admin());

create policy "Full reviewers read review change requests"
on public.review_change_requests
for select
using (
  public.is_authenticated_reviewer()
  and exists (
    select 1
    from public.review_requests rr
    where rr.id = review_request_id
      and rr.status in ('active', 'ready_for_publication')
  )
);

create policy "Admins read review approvals"
on public.review_approvals
for select
using (public.is_authenticated_admin());

create policy "Full reviewers read review approvals"
on public.review_approvals
for select
using (
  public.is_authenticated_reviewer()
  and exists (
    select 1
    from public.review_requests rr
    where rr.id = review_request_id
      and rr.status in ('active', 'ready_for_publication')
  )
);

create policy "Admins read review audit events"
on public.review_activity_events
for select
using (public.is_authenticated_admin());

create policy "Full reviewers read review audit events"
on public.review_activity_events
for select
using (
  public.is_authenticated_reviewer()
  and exists (
    select 1
    from public.review_requests rr
    where rr.id = review_request_id
      and rr.status in ('active', 'ready_for_publication')
  )
);

revoke all on function public.current_reviewer_account_id() from public;
revoke all on function public.is_authenticated_reviewer() from public;
revoke all on function public.current_pending_reviewer_account_id() from public;
revoke all on function public.is_pending_reviewer_password_change() from public;
revoke all on function public.get_review_snapshot_readiness(uuid) from public;
revoke all on function public.refresh_review_request_readiness(uuid) from public;
revoke all on function public.get_current_review_snapshot(uuid) from public;
revoke all on function public.assert_current_full_reviewer() from public;
revoke all on function public.admin_submit_review_snapshot(uuid, text, uuid, uuid, text, text, jsonb) from public;
revoke all on function public.review_approve_current(uuid) from public;
revoke all on function public.review_withdraw_current_approval(uuid, text) from public;
revoke all on function public.review_request_changes(uuid, text) from public;
revoke all on function public.review_add_comment(uuid, text, text, text) from public;
revoke all on function public.review_suggest_replacement(uuid, text, text, text, text, text) from public;

grant execute on function public.current_reviewer_account_id() to authenticated;
grant execute on function public.is_authenticated_reviewer() to authenticated;
grant execute on function public.current_pending_reviewer_account_id() to authenticated;
grant execute on function public.is_pending_reviewer_password_change() to authenticated;
grant execute on function public.admin_submit_review_snapshot(uuid, text, uuid, uuid, text, text, jsonb) to authenticated;
grant execute on function public.review_approve_current(uuid) to authenticated;
grant execute on function public.review_withdraw_current_approval(uuid, text) to authenticated;
grant execute on function public.review_request_changes(uuid, text) to authenticated;
grant execute on function public.review_add_comment(uuid, text, text, text) to authenticated;
grant execute on function public.review_suggest_replacement(uuid, text, text, text, text, text) to authenticated;

grant select on public.reviewer_accounts to authenticated;
grant select, insert, update on public.reviewer_accounts to authenticated;
grant select, insert, update on public.review_requests to authenticated;
grant select, insert on public.review_snapshots to authenticated;
grant select, insert, update on public.review_required_approvers to authenticated;
grant select on public.review_comments to authenticated;
grant select on public.review_suggestions to authenticated;
grant select on public.review_change_requests to authenticated;
grant select on public.review_approvals to authenticated;
grant select on public.review_activity_events to authenticated;
