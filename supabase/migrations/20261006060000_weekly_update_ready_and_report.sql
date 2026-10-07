-- Upload check report and "Ready to publish" marker for weekly updates.
--
-- conversion_report keeps the notes produced when the Word document was converted (for example
-- unresolved tracked changes or dropped pictures) so they stay visible on the draft until it is
-- published. ready_to_publish_at is only a note for the Administrator: it does not publish or email
-- anything. Moving an update out of draft in any way clears it.

alter table public.weekly_updates
  add column if not exists conversion_report jsonb,
  add column if not exists ready_to_publish_at timestamptz;

create or replace function public.clear_weekly_update_ready_marker()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.ready_to_publish_at := null;
  return new;
end;
$$;

drop trigger if exists weekly_updates_clear_ready_marker on public.weekly_updates;
create trigger weekly_updates_clear_ready_marker
before update of status on public.weekly_updates
for each row
when (new.status <> 'draft' and new.ready_to_publish_at is not null)
execute function public.clear_weekly_update_ready_marker();

alter table public.weekly_updates
  drop constraint if exists weekly_updates_ready_only_for_drafts_check,
  add constraint weekly_updates_ready_only_for_drafts_check
    check (ready_to_publish_at is null or status = 'draft');
