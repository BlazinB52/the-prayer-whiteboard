-- Corrects the Review Portal foundation for document-first review requests.
-- Formal approval now targets immutable uploaded document versions, not website
-- content snapshots or mutable OneDrive working documents.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'review-documents',
  'review-documents',
  false,
  52428800,
  array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do update
set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Admins can manage review documents bucket objects" on storage.objects;

create policy "Admins can manage review documents bucket objects"
on storage.objects
for all
using (
  bucket_id = 'review-documents'
  and public.is_authenticated_admin()
)
with check (
  bucket_id = 'review-documents'
  and public.is_authenticated_admin()
);

alter table public.review_requests
  drop constraint if exists review_requests_subject_type_check,
  drop constraint if exists review_requests_status_check,
  drop constraint if exists review_requests_subject_source_check;

alter table public.review_requests
  add column if not exists review_instructions text,
  add column if not exists publication_scope text,
  add column if not exists onedrive_url text,
  add column if not exists onedrive_drive_id text,
  add column if not exists onedrive_item_id text,
  add column if not exists onedrive_version_id text,
  add column if not exists current_document_version_id uuid;

alter table public.review_requests
  add constraint review_requests_subject_type_check
  check (subject_type in (
    'full_teaching',
    'condensed_foldable_teaching',
    'devotional',
    'chalkboard_visual',
    'other_publication_material'
  )),
  add constraint review_requests_status_check
  check (status in (
    'draft',
    'editorial_review',
    'changes_suggested',
    'final_candidate_awaiting_approval',
    'ready_for_publication',
    'closed',
    'superseded'
  )),
  add constraint review_requests_review_instructions_check
  check (review_instructions is null or length(trim(review_instructions)) > 0),
  add constraint review_requests_publication_scope_check
  check (publication_scope is null or length(trim(publication_scope)) > 0),
  add constraint review_requests_onedrive_url_check
  check (onedrive_url is null or onedrive_url ~* '^https://');

alter table public.review_snapshots
  drop constraint if exists review_snapshots_subject_type_check,
  drop constraint if exists review_snapshots_subject_source_check;

alter table public.review_snapshots
  add constraint review_snapshots_subject_type_check
  check (subject_type in (
    'full_teaching',
    'condensed_foldable_teaching',
    'devotional',
    'chalkboard_visual',
    'other_publication_material'
  ));

create table if not exists public.review_document_versions (
  id uuid primary key default gen_random_uuid(),
  review_request_id uuid not null references public.review_requests(id) on delete cascade,
  version integer not null check (version > 0),
  version_purpose text not null check (version_purpose in ('original', 'review_copy', 'final_candidate', 'approved_archive')),
  storage_bucket text not null default 'review-documents',
  storage_path text not null,
  original_filename text not null,
  mime_type text not null,
  file_size_bytes bigint not null,
  sha256_hex text not null,
  uploaded_by_admin_user_id uuid references auth.users(id) on delete set null,
  uploaded_at timestamptz not null default now(),
  onedrive_url text,
  onedrive_drive_id text,
  onedrive_item_id text,
  onedrive_version_id text,
  created_at timestamptz not null default now(),
  unique (review_request_id, version),
  unique (id, review_request_id),
  unique (id, review_request_id, version),
  constraint review_document_versions_bucket_check
    check (storage_bucket = 'review-documents'),
  constraint review_document_versions_path_check
    check (
      storage_path ~ '^review-requests/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/versions/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}[.]docx$'
    ),
  constraint review_document_versions_original_filename_check
    check (length(trim(original_filename)) > 0),
  constraint review_document_versions_mime_type_check
    check (mime_type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'),
  constraint review_document_versions_file_size_check
    check (file_size_bytes > 0 and file_size_bytes <= 52428800),
  constraint review_document_versions_sha256_check
    check (sha256_hex ~ '^[0-9a-f]{64}$'),
  constraint review_document_versions_onedrive_url_check
    check (onedrive_url is null or onedrive_url ~* '^https://')
);

create unique index if not exists review_document_versions_storage_path_key
  on public.review_document_versions (storage_path);

create index if not exists review_document_versions_request_version_idx
  on public.review_document_versions (review_request_id, version desc);

create index if not exists review_document_versions_request_purpose_idx
  on public.review_document_versions (review_request_id, version_purpose, version desc);

alter table public.review_document_versions enable row level security;

alter table public.review_requests
  drop constraint if exists review_requests_current_document_version_fk;

alter table public.review_requests
  add constraint review_requests_current_document_version_fk
  foreign key (current_document_version_id, id, current_version)
  references public.review_document_versions (id, review_request_id, version)
  on delete restrict;

alter table public.review_approvals
  alter column snapshot_id drop not null,
  alter column snapshot_version drop not null,
  add column if not exists document_version_id uuid,
  add column if not exists document_version integer,
  add column if not exists document_sha256_hex text;

alter table public.review_approvals
  drop constraint if exists review_approvals_document_version_fk,
  drop constraint if exists review_approvals_document_target_check,
  drop constraint if exists review_approvals_document_sha256_check;

alter table public.review_approvals
  add constraint review_approvals_document_version_fk
  foreign key (document_version_id, review_request_id, document_version)
  references public.review_document_versions (id, review_request_id, version)
  on delete cascade,
  add constraint review_approvals_document_target_check
  check (document_version_id is not null and document_version is not null and snapshot_id is null and snapshot_version is null),
  add constraint review_approvals_document_sha256_check
  check (document_sha256_hex is not null and document_sha256_hex ~ '^[0-9a-f]{64}$');

create unique index if not exists review_approvals_one_active_per_reviewer_document_idx
  on public.review_approvals (document_version_id, reviewer_account_id)
  where withdrawn_at is null;

alter table public.review_change_requests
  alter column snapshot_id drop not null,
  alter column snapshot_version drop not null,
  add column if not exists document_version_id uuid,
  add column if not exists document_version integer;

alter table public.review_change_requests
  drop constraint if exists review_change_requests_document_version_fk;

alter table public.review_change_requests
  add constraint review_change_requests_document_version_fk
  foreign key (document_version_id, review_request_id, document_version)
  references public.review_document_versions (id, review_request_id, version)
  on delete cascade;

alter table public.review_activity_events
  alter column snapshot_id drop not null,
  alter column snapshot_version drop not null,
  add column if not exists document_version_id uuid,
  add column if not exists document_version integer;

alter table public.review_activity_events
  drop constraint if exists review_activity_events_document_version_fk;

alter table public.review_activity_events
  add constraint review_activity_events_document_version_fk
  foreign key (document_version_id, review_request_id, document_version)
  references public.review_document_versions (id, review_request_id, version)
  on delete restrict;

create table if not exists public.review_document_reviewer_actions (
  id uuid primary key default gen_random_uuid(),
  review_request_id uuid not null,
  document_version_id uuid not null,
  document_version integer not null,
  reviewer_account_id uuid not null references public.reviewer_accounts(id) on delete restrict,
  action_type text not null check (action_type in ('word_review_complete', 'changes_suggested')),
  notes text,
  created_at timestamptz not null default now(),
  foreign key (document_version_id, review_request_id, document_version)
    references public.review_document_versions (id, review_request_id, version)
    on delete cascade,
  constraint review_document_reviewer_actions_notes_check
    check (notes is null or length(trim(notes)) > 0)
);

create index if not exists review_document_reviewer_actions_request_created_idx
  on public.review_document_reviewer_actions (review_request_id, document_version, created_at desc);

alter table public.review_document_reviewer_actions enable row level security;

drop policy if exists "Full reviewers read active review requests" on public.review_requests;
drop policy if exists "Full reviewers read review snapshots" on public.review_snapshots;
drop policy if exists "Full reviewers read review comments" on public.review_comments;
drop policy if exists "Full reviewers read review suggestions" on public.review_suggestions;
drop policy if exists "Full reviewers read review change requests" on public.review_change_requests;
drop policy if exists "Full reviewers read review approvals" on public.review_approvals;
drop policy if exists "Full reviewers read review audit events" on public.review_activity_events;

create policy "Full reviewers read open document review requests"
on public.review_requests
for select
using (
  public.is_authenticated_reviewer()
  and status in ('editorial_review', 'changes_suggested', 'final_candidate_awaiting_approval', 'ready_for_publication')
);

create policy "Full reviewers read open review document versions"
on public.review_document_versions
for select
using (
  public.is_authenticated_reviewer()
  and exists (
    select 1
    from public.review_requests rr
    where rr.id = review_request_id
      and rr.status in ('editorial_review', 'changes_suggested', 'final_candidate_awaiting_approval', 'ready_for_publication')
  )
);

create policy "Admins read review document versions"
on public.review_document_versions
for select
using (public.is_authenticated_admin());

create policy "Full reviewers read open document reviewer actions"
on public.review_document_reviewer_actions
for select
using (
  public.is_authenticated_reviewer()
  and exists (
    select 1
    from public.review_requests rr
    where rr.id = review_request_id
      and rr.status in ('editorial_review', 'changes_suggested', 'final_candidate_awaiting_approval', 'ready_for_publication')
  )
);

create policy "Admins read document reviewer actions"
on public.review_document_reviewer_actions
for select
using (public.is_authenticated_admin());

create policy "Full reviewers read review snapshots"
on public.review_snapshots
for select
using (
  public.is_authenticated_reviewer()
  and exists (
    select 1
    from public.review_requests rr
    where rr.id = review_request_id
      and rr.status in ('editorial_review', 'changes_suggested', 'final_candidate_awaiting_approval', 'ready_for_publication')
  )
);

create policy "Full reviewers read review comments"
on public.review_comments
for select
using (
  public.is_authenticated_reviewer()
  and exists (
    select 1
    from public.review_requests rr
    where rr.id = review_request_id
      and rr.status in ('editorial_review', 'changes_suggested', 'final_candidate_awaiting_approval', 'ready_for_publication')
  )
);

create policy "Full reviewers read review suggestions"
on public.review_suggestions
for select
using (
  public.is_authenticated_reviewer()
  and exists (
    select 1
    from public.review_requests rr
    where rr.id = review_request_id
      and rr.status in ('editorial_review', 'changes_suggested', 'final_candidate_awaiting_approval', 'ready_for_publication')
  )
);

create policy "Full reviewers read review change requests"
on public.review_change_requests
for select
using (
  public.is_authenticated_reviewer()
  and exists (
    select 1
    from public.review_requests rr
    where rr.id = review_request_id
      and rr.status in ('editorial_review', 'changes_suggested', 'final_candidate_awaiting_approval', 'ready_for_publication')
  )
);

create policy "Full reviewers read review approvals"
on public.review_approvals
for select
using (
  public.is_authenticated_reviewer()
  and exists (
    select 1
    from public.review_requests rr
    where rr.id = review_request_id
      and rr.status in ('editorial_review', 'changes_suggested', 'final_candidate_awaiting_approval', 'ready_for_publication')
  )
);

create policy "Full reviewers read review audit events"
on public.review_activity_events
for select
using (
  public.is_authenticated_reviewer()
  and exists (
    select 1
    from public.review_requests rr
    where rr.id = review_request_id
      and rr.status in ('editorial_review', 'changes_suggested', 'final_candidate_awaiting_approval', 'ready_for_publication')
  )
);

create or replace function public.admin_create_document_review_request(
  p_review_type text,
  p_title text,
  p_review_instructions text default null,
  p_publication_scope text default null,
  p_onedrive_url text default null,
  p_onedrive_drive_id text default null,
  p_onedrive_item_id text default null,
  p_onedrive_version_id text default null,
  p_source_teaching_id uuid default null,
  p_source_devotional_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_user_id uuid;
  v_request_id uuid;
begin
  if not public.is_authenticated_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  if p_review_type not in ('full_teaching', 'condensed_foldable_teaching', 'devotional', 'chalkboard_visual', 'other_publication_material') then
    raise exception 'Review type is invalid.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_title, '')), '') is null then
    raise exception 'Review title is required.' using errcode = '22023';
  end if;

  if p_onedrive_url is not null and p_onedrive_url !~* '^https://' then
    raise exception 'OneDrive URL must be HTTPS.' using errcode = '22023';
  end if;

  v_admin_user_id := auth.uid();

  insert into public.review_requests (
    subject_type,
    source_teaching_id,
    source_devotional_id,
    title,
    status,
    current_version,
    submitted_by_admin_user_id,
    review_instructions,
    publication_scope,
    onedrive_url,
    onedrive_drive_id,
    onedrive_item_id,
    onedrive_version_id
  )
  values (
    p_review_type,
    p_source_teaching_id,
    p_source_devotional_id,
    trim(p_title),
    'draft',
    1,
    v_admin_user_id,
    nullif(trim(coalesce(p_review_instructions, '')), ''),
    nullif(trim(coalesce(p_publication_scope, '')), ''),
    nullif(trim(coalesce(p_onedrive_url, '')), ''),
    nullif(trim(coalesce(p_onedrive_drive_id, '')), ''),
    nullif(trim(coalesce(p_onedrive_item_id, '')), ''),
    nullif(trim(coalesce(p_onedrive_version_id, '')), '')
  )
  returning id into v_request_id;

  insert into public.review_activity_events (
    review_request_id,
    actor_type,
    admin_user_id,
    action_type,
    target_type,
    target_id
  )
  values (
    v_request_id,
    'admin',
    v_admin_user_id,
    'review_request.created',
    'review_request',
    v_request_id
  );

  return v_request_id;
end;
$$;

create or replace function public.admin_register_review_document_version(
  p_review_request_id uuid,
  p_version_purpose text,
  p_original_filename text,
  p_mime_type text,
  p_file_size_bytes bigint,
  p_sha256_hex text,
  p_onedrive_url text default null,
  p_onedrive_drive_id text default null,
  p_onedrive_item_id text default null,
  p_onedrive_version_id text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_user_id uuid;
  v_request public.review_requests%rowtype;
  v_document_version_id uuid := gen_random_uuid();
  v_next_version integer;
  v_storage_path text;
begin
  if not public.is_authenticated_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  if p_version_purpose not in ('original', 'review_copy', 'final_candidate', 'approved_archive') then
    raise exception 'Document version purpose is invalid.' using errcode = '22023';
  end if;

  if nullif(trim(coalesce(p_original_filename, '')), '') is null then
    raise exception 'Original filename is required.' using errcode = '22023';
  end if;

  if p_mime_type <> 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' then
    raise exception 'Document MIME type is not allowed.' using errcode = '22023';
  end if;

  if p_file_size_bytes <= 0 or p_file_size_bytes > 52428800 then
    raise exception 'Document file size is not allowed.' using errcode = '22023';
  end if;

  if p_sha256_hex !~ '^[0-9a-f]{64}$' then
    raise exception 'Document fingerprint must be a lowercase SHA-256 hex value.' using errcode = '22023';
  end if;

  if p_onedrive_url is not null and p_onedrive_url !~* '^https://' then
    raise exception 'OneDrive URL must be HTTPS.' using errcode = '22023';
  end if;

  v_admin_user_id := auth.uid();

  select *
    into v_request
    from public.review_requests
    where id = p_review_request_id
    for update;

  if not found then
    raise exception 'Review request could not be found.' using errcode = 'P0002';
  end if;

  if v_request.status in ('closed', 'superseded') then
    raise exception 'Closed or superseded review requests cannot receive document versions.' using errcode = '22023';
  end if;

  select coalesce(max(version), 0) + 1
    into v_next_version
    from public.review_document_versions
    where review_request_id = p_review_request_id;

  v_storage_path := 'review-requests/' || p_review_request_id || '/versions/' || v_document_version_id || '.docx';

  insert into public.review_document_versions (
    id,
    review_request_id,
    version,
    version_purpose,
    storage_bucket,
    storage_path,
    original_filename,
    mime_type,
    file_size_bytes,
    sha256_hex,
    uploaded_by_admin_user_id,
    onedrive_url,
    onedrive_drive_id,
    onedrive_item_id,
    onedrive_version_id
  )
  values (
    v_document_version_id,
    p_review_request_id,
    v_next_version,
    p_version_purpose,
    'review-documents',
    v_storage_path,
    trim(p_original_filename),
    p_mime_type,
    p_file_size_bytes,
    p_sha256_hex,
    v_admin_user_id,
    nullif(trim(coalesce(p_onedrive_url, '')), ''),
    nullif(trim(coalesce(p_onedrive_drive_id, '')), ''),
    nullif(trim(coalesce(p_onedrive_item_id, '')), ''),
    nullif(trim(coalesce(p_onedrive_version_id, '')), '')
  );

  update public.review_requests
    set current_document_version_id = v_document_version_id,
        current_version = v_next_version,
        status = case
          when p_version_purpose = 'final_candidate' then 'final_candidate_awaiting_approval'
          when status = 'draft' then 'editorial_review'
          else status
        end,
        submitted_by_admin_user_id = v_admin_user_id,
        submitted_at = now()
    where id = p_review_request_id;

  insert into public.review_activity_events (
    review_request_id,
    document_version_id,
    document_version,
    actor_type,
    admin_user_id,
    action_type,
    target_type,
    target_id,
    metadata
  )
  values (
    p_review_request_id,
    v_document_version_id,
    v_next_version,
    'admin',
    v_admin_user_id,
    case when p_version_purpose = 'final_candidate' then 'document.final_candidate_registered' else 'document.version_registered' end,
    'review_document_version',
    v_document_version_id,
    jsonb_build_object('version_purpose', p_version_purpose)
  );

  return v_document_version_id;
end;
$$;

create or replace function public.admin_set_review_onedrive_url(
  p_review_request_id uuid,
  p_onedrive_url text,
  p_onedrive_drive_id text default null,
  p_onedrive_item_id text default null,
  p_onedrive_version_id text default null
)
returns void
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_admin_user_id uuid;
begin
  if not public.is_authenticated_admin() then
    raise exception 'Administrator authorization is required.' using errcode = '42501';
  end if;

  if p_onedrive_url is not null and p_onedrive_url !~* '^https://' then
    raise exception 'OneDrive URL must be HTTPS.' using errcode = '22023';
  end if;

  v_admin_user_id := auth.uid();

  update public.review_requests
    set onedrive_url = nullif(trim(coalesce(p_onedrive_url, '')), ''),
        onedrive_drive_id = nullif(trim(coalesce(p_onedrive_drive_id, '')), ''),
        onedrive_item_id = nullif(trim(coalesce(p_onedrive_item_id, '')), ''),
        onedrive_version_id = nullif(trim(coalesce(p_onedrive_version_id, '')), '')
    where id = p_review_request_id;

  if not found then
    raise exception 'Review request could not be found.' using errcode = 'P0002';
  end if;

  insert into public.review_activity_events (
    review_request_id,
    actor_type,
    admin_user_id,
    action_type,
    target_type,
    target_id,
    metadata
  )
  values (
    p_review_request_id,
    'admin',
    v_admin_user_id,
    'onedrive_link.updated',
    'review_request',
    p_review_request_id,
    jsonb_build_object('has_onedrive_url', nullif(trim(coalesce(p_onedrive_url, '')), '') is not null)
  );
end;
$$;

create or replace function public.get_review_document_readiness(p_document_version_id uuid)
returns table (
  required_approver_count integer,
  active_required_approval_count integer,
  is_ready boolean
)
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  with target as (
    select dv.*
    from public.review_document_versions dv
    join public.review_requests rr on rr.id = dv.review_request_id
    where dv.id = p_document_version_id
      and rr.current_document_version_id = dv.id
      and dv.version_purpose = 'final_candidate'
  ),
  required as (
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
    join target t on t.id = a.document_version_id
    join required r on r.reviewer_account_id = a.reviewer_account_id
    where a.withdrawn_at is null
      and a.document_sha256_hex = t.sha256_hex
  )
  select
    (select count(*)::integer from required) as required_approver_count,
    (select count(*)::integer from approved) as active_required_approval_count,
    (
      exists (select 1 from target)
      and (select count(*) from required) >= 2
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
set search_path = public, pg_temp
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

  if v_request.current_document_version_id is null then
    return false;
  end if;

  select readiness.is_ready
    into v_is_ready
    from public.get_review_document_readiness(v_request.current_document_version_id) readiness;

  if v_request.status in ('final_candidate_awaiting_approval', 'ready_for_publication') then
    update public.review_requests
      set status = case when coalesce(v_is_ready, false) then 'ready_for_publication' else 'final_candidate_awaiting_approval' end
      where id = p_review_request_id;
  end if;

  return coalesce(v_is_ready, false);
end;
$$;

create or replace function public.get_current_review_document_version(p_review_request_id uuid)
returns public.review_document_versions
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select dv.*
  from public.review_requests r
  join public.review_document_versions dv
    on dv.id = r.current_document_version_id
   and dv.review_request_id = r.id
   and dv.version = r.current_version
  where r.id = p_review_request_id
    and r.status in ('editorial_review', 'changes_suggested', 'final_candidate_awaiting_approval', 'ready_for_publication');
$$;

create or replace function public.review_approve_document_version(
  p_review_request_id uuid,
  p_document_version_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reviewer_id uuid;
  v_document public.review_document_versions%rowtype;
  v_request public.review_requests%rowtype;
  v_approval_id uuid;
begin
  v_reviewer_id := public.assert_current_full_reviewer();

  select *
    into v_request
    from public.review_requests
    where id = p_review_request_id
    for update;

  if not found then
    raise exception 'Review request could not be found.' using errcode = 'P0002';
  end if;

  select *
    into v_document
    from public.review_document_versions
    where id = p_document_version_id
      and review_request_id = p_review_request_id;

  if not found then
    raise exception 'Review document version could not be found for this request.' using errcode = 'P0002';
  end if;

  if v_request.current_document_version_id is distinct from v_document.id then
    raise exception 'Only the current document version can be approved.' using errcode = '42501';
  end if;

  if v_document.version_purpose <> 'final_candidate' then
    raise exception 'Only a final candidate document version can be approved.' using errcode = '42501';
  end if;

  insert into public.review_approvals (
    review_request_id,
    document_version_id,
    document_version,
    document_sha256_hex,
    reviewer_account_id
  )
  values (
    v_document.review_request_id,
    v_document.id,
    v_document.version,
    v_document.sha256_hex,
    v_reviewer_id
  )
  returning id into v_approval_id;

  insert into public.review_activity_events (
    review_request_id,
    document_version_id,
    document_version,
    actor_type,
    reviewer_account_id,
    action_type,
    target_type,
    target_id,
    metadata
  )
  values (
    v_document.review_request_id,
    v_document.id,
    v_document.version,
    'reviewer',
    v_reviewer_id,
    'approval.created',
    'review_approval',
    v_approval_id,
    jsonb_build_object('sha256_hex', v_document.sha256_hex)
  );

  perform public.refresh_review_request_readiness(v_document.review_request_id);

  return v_approval_id;
end;
$$;

create or replace function public.review_approve_current(p_review_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_document public.review_document_versions%rowtype;
begin
  select *
    into v_document
    from public.get_current_review_document_version(p_review_request_id);

  if not found then
    raise exception 'Current review document version could not be found.' using errcode = 'P0002';
  end if;

  return public.review_approve_document_version(p_review_request_id, v_document.id);
end;
$$;

create or replace function public.review_withdraw_current_approval(
  p_review_request_id uuid,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reviewer_id uuid;
  v_document public.review_document_versions%rowtype;
  v_approval_id uuid;
begin
  v_reviewer_id := public.assert_current_full_reviewer();

  select *
    into v_document
    from public.get_current_review_document_version(p_review_request_id);

  if not found then
    raise exception 'Current review document version could not be found.' using errcode = 'P0002';
  end if;

  update public.review_approvals
    set withdrawn_at = now(),
        withdraw_reason = nullif(trim(coalesce(p_reason, '')), '')
    where review_request_id = v_document.review_request_id
      and document_version_id = v_document.id
      and document_version = v_document.version
      and reviewer_account_id = v_reviewer_id
      and withdrawn_at is null
    returning id into v_approval_id;

  if v_approval_id is null then
    raise exception 'Active approval could not be found.' using errcode = 'P0002';
  end if;

  insert into public.review_activity_events (
    review_request_id,
    document_version_id,
    document_version,
    actor_type,
    reviewer_account_id,
    action_type,
    target_type,
    target_id,
    metadata
  )
  values (
    v_document.review_request_id,
    v_document.id,
    v_document.version,
    'reviewer',
    v_reviewer_id,
    'approval.withdrawn',
    'review_approval',
    v_approval_id,
    jsonb_build_object('has_reason', nullif(trim(coalesce(p_reason, '')), '') is not null)
  );

  perform public.refresh_review_request_readiness(v_document.review_request_id);

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
set search_path = public, pg_temp
as $$
declare
  v_reviewer_id uuid;
  v_document public.review_document_versions%rowtype;
  v_change_request_id uuid;
  v_withdrawn_approval_id uuid;
begin
  v_reviewer_id := public.assert_current_full_reviewer();

  if nullif(trim(coalesce(p_summary, '')), '') is null then
    raise exception 'Change request summary is required.' using errcode = '22023';
  end if;

  select *
    into v_document
    from public.get_current_review_document_version(p_review_request_id);

  if not found then
    raise exception 'Current review document version could not be found.' using errcode = 'P0002';
  end if;

  update public.review_approvals
    set withdrawn_at = now(),
        withdraw_reason = 'Reviewer requested changes.'
    where review_request_id = v_document.review_request_id
      and document_version_id = v_document.id
      and document_version = v_document.version
      and reviewer_account_id = v_reviewer_id
      and withdrawn_at is null
    returning id into v_withdrawn_approval_id;

  insert into public.review_change_requests (
    review_request_id,
    document_version_id,
    document_version,
    reviewer_account_id,
    summary
  )
  values (
    v_document.review_request_id,
    v_document.id,
    v_document.version,
    v_reviewer_id,
    trim(p_summary)
  )
  returning id into v_change_request_id;

  update public.review_requests
    set status = 'changes_suggested'
    where id = v_document.review_request_id
      and status in ('editorial_review', 'changes_suggested', 'final_candidate_awaiting_approval', 'ready_for_publication');

  insert into public.review_activity_events (
    review_request_id,
    document_version_id,
    document_version,
    actor_type,
    reviewer_account_id,
    action_type,
    target_type,
    target_id,
    metadata
  )
  values (
    v_document.review_request_id,
    v_document.id,
    v_document.version,
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
      document_version_id,
      document_version,
      actor_type,
      reviewer_account_id,
      action_type,
      target_type,
      target_id
    )
    values (
      v_document.review_request_id,
      v_document.id,
      v_document.version,
      'reviewer',
      v_reviewer_id,
      'approval.withdrawn',
      'review_approval',
      v_withdrawn_approval_id
    );
  end if;

  perform public.refresh_review_request_readiness(v_document.review_request_id);

  return v_change_request_id;
end;
$$;

create or replace function public.review_mark_word_review_complete(
  p_review_request_id uuid,
  p_notes text default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reviewer_id uuid;
  v_document public.review_document_versions%rowtype;
  v_action_id uuid;
begin
  v_reviewer_id := public.assert_current_full_reviewer();

  select *
    into v_document
    from public.get_current_review_document_version(p_review_request_id);

  if not found then
    raise exception 'Current review document version could not be found.' using errcode = 'P0002';
  end if;

  insert into public.review_document_reviewer_actions (
    review_request_id,
    document_version_id,
    document_version,
    reviewer_account_id,
    action_type,
    notes
  )
  values (
    v_document.review_request_id,
    v_document.id,
    v_document.version,
    v_reviewer_id,
    'word_review_complete',
    nullif(trim(coalesce(p_notes, '')), '')
  )
  returning id into v_action_id;

  insert into public.review_activity_events (
    review_request_id,
    document_version_id,
    document_version,
    actor_type,
    reviewer_account_id,
    action_type,
    target_type,
    target_id
  )
  values (
    v_document.review_request_id,
    v_document.id,
    v_document.version,
    'reviewer',
    v_reviewer_id,
    'word_review.completed',
    'review_document_reviewer_action',
    v_action_id
  );

  return v_action_id;
end;
$$;

create or replace function public.review_report_changes_suggested(
  p_review_request_id uuid,
  p_notes text
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_reviewer_id uuid;
  v_document public.review_document_versions%rowtype;
  v_action_id uuid;
begin
  v_reviewer_id := public.assert_current_full_reviewer();

  if nullif(trim(coalesce(p_notes, '')), '') is null then
    raise exception 'Notes are required.' using errcode = '22023';
  end if;

  select *
    into v_document
    from public.get_current_review_document_version(p_review_request_id);

  if not found then
    raise exception 'Current review document version could not be found.' using errcode = 'P0002';
  end if;

  insert into public.review_document_reviewer_actions (
    review_request_id,
    document_version_id,
    document_version,
    reviewer_account_id,
    action_type,
    notes
  )
  values (
    v_document.review_request_id,
    v_document.id,
    v_document.version,
    v_reviewer_id,
    'changes_suggested',
    trim(p_notes)
  )
  returning id into v_action_id;

  update public.review_requests
    set status = 'changes_suggested'
    where id = v_document.review_request_id
      and status in ('editorial_review', 'changes_suggested');

  insert into public.review_activity_events (
    review_request_id,
    document_version_id,
    document_version,
    actor_type,
    reviewer_account_id,
    action_type,
    target_type,
    target_id
  )
  values (
    v_document.review_request_id,
    v_document.id,
    v_document.version,
    'reviewer',
    v_reviewer_id,
    'word_review.changes_suggested',
    'review_document_reviewer_action',
    v_action_id
  );

  return v_action_id;
end;
$$;

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
set search_path = public, pg_temp
as $$
begin
  raise exception 'Snapshot-based review submission has been superseded by document version registration.' using errcode = '0A000';
end;
$$;

revoke all on function public.admin_create_document_review_request(text, text, text, text, text, text, text, text, uuid, uuid) from public;
revoke all on function public.admin_register_review_document_version(uuid, text, text, text, bigint, text, text, text, text, text) from public;
revoke all on function public.admin_set_review_onedrive_url(uuid, text, text, text, text) from public;
revoke all on function public.get_review_document_readiness(uuid) from public;
revoke all on function public.get_current_review_document_version(uuid) from public;
revoke all on function public.review_approve_document_version(uuid, uuid) from public;
revoke all on function public.review_mark_word_review_complete(uuid, text) from public;
revoke all on function public.review_report_changes_suggested(uuid, text) from public;

grant execute on function public.admin_create_document_review_request(text, text, text, text, text, text, text, text, uuid, uuid) to authenticated;
grant execute on function public.admin_register_review_document_version(uuid, text, text, text, bigint, text, text, text, text, text) to authenticated;
grant execute on function public.admin_set_review_onedrive_url(uuid, text, text, text, text) to authenticated;
grant execute on function public.review_approve_document_version(uuid, uuid) to authenticated;
grant execute on function public.review_mark_word_review_complete(uuid, text) to authenticated;
grant execute on function public.review_report_changes_suggested(uuid, text) to authenticated;

grant select on public.review_document_versions to authenticated;
grant select on public.review_document_reviewer_actions to authenticated;
