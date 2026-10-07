-- "Ready to publish" marker for draft teachings.
--
-- An Administrator can mark a finished draft as ready so it stands out in the Teachings list while it
-- waits for the right day to be published. The marker is only a note: it does not publish anything,
-- does not send any email, and is not read by any public page. Only the Administrator can set it (the
-- teachings table accepts writes from Administrators only). Publishing a teaching, or moving it out of
-- draft in any way, clears the marker.

alter table public.teachings
  add column if not exists ready_to_publish_at timestamptz;

create or replace function public.clear_teaching_ready_marker()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.ready_to_publish_at := null;
  return new;
end;
$$;

drop trigger if exists teachings_clear_ready_marker on public.teachings;
create trigger teachings_clear_ready_marker
before update of status on public.teachings
for each row
when (new.status <> 'draft' and new.ready_to_publish_at is not null)
execute function public.clear_teaching_ready_marker();

alter table public.teachings
  drop constraint if exists teachings_ready_only_for_drafts_check,
  add constraint teachings_ready_only_for_drafts_check
    check (ready_to_publish_at is null or status = 'draft');
