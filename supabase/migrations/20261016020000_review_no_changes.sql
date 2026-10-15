-- "Reviewed, no changes needed": a Content Manager can say they read something that was sent to them and found nothing to
-- change.
--
-- Until now the only way to finish a review was to submit at least one proposed change ("There are no changes to submit"),
-- so a Content Manager who found nothing wrong had no way to say so, and the item stayed on their list for ever. Weekly
-- updates already have their own "OK to publish" per person (weekly_update_proofings); this gives teachings, devotionals,
-- teaching outlines and handouts the same thing.
--
--   * content_review_oks holds one row per person per item: who said it was fine, and when. It is a note for the
--     Administrator. It changes nothing about the item and publishes nothing.
--   * mark_review_ok / clear_review_ok are the only ways to write it. Only a Content Manager or Administrator, only for a
--     draft the Administrator has sent for review, and only for themselves.
--   * The notes go away by themselves when the item stops being a sent draft: published, taken back from review, or deleted.
--     Sending it again after changes starts a clean round.
--
-- Nothing here is readable by the public.

create table if not exists public.content_review_oks (
  subject_type text not null,
  subject_id uuid not null,
  user_id uuid not null references auth.users(id) on delete cascade,
  user_name text,
  ok_at timestamptz not null default now(),
  primary key (subject_type, subject_id, user_id),
  constraint content_review_oks_subject_type_check check (subject_type in ('teaching', 'devotional', 'outline', 'handout'))
);

create index if not exists content_review_oks_subject_idx on public.content_review_oks (subject_type, subject_id);

alter table public.content_review_oks enable row level security;

drop policy if exists "Administrators read all review notes" on public.content_review_oks;
create policy "Administrators read all review notes"
on public.content_review_oks
for select
to authenticated
using (public.is_authenticated_admin());

drop policy if exists "People read their own review notes" on public.content_review_oks;
create policy "People read their own review notes"
on public.content_review_oks
for select
to authenticated
using (user_id = auth.uid());

revoke all on public.content_review_oks from public, anon, authenticated;
grant select on public.content_review_oks to authenticated;

-- The item behind a note: a draft that has been sent for review.
create or replace function public.review_subject_is_sent_draft(p_subject_type text, p_subject_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if p_subject_type = 'teaching' then
    return exists (select 1 from public.teachings where id = p_subject_id and status = 'draft' and sent_for_review_at is not null);
  elsif p_subject_type = 'devotional' then
    return exists (select 1 from public.teaching_devotionals where id = p_subject_id and status = 'draft' and sent_for_review_at is not null);
  elsif p_subject_type = 'outline' then
    return exists (select 1 from public.teaching_outlines where id = p_subject_id and status = 'draft' and sent_for_review_at is not null);
  elsif p_subject_type = 'handout' then
    return exists (select 1 from public.teaching_handouts where id = p_subject_id and status = 'draft' and sent_for_review_at is not null);
  end if;
  return false;
end;
$$;

create or replace function public.mark_review_ok(p_subject_type text, p_subject_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not public.is_content_manager_or_admin() then
    raise exception 'Only a Content Manager can mark something reviewed.' using errcode = '42501';
  end if;
  if not public.review_subject_is_sent_draft(p_subject_type, p_subject_id) then
    raise exception 'This is not waiting for your review.' using errcode = 'P0001';
  end if;
  -- Finishing with proposed changes still open would leave two answers, so send or discard those first. A draft with no
  -- changes in it (saved without editing anything) is not a proposal; it is cleared away.
  if exists (
    select 1 from public.content_revisions r
    where r.subject_type = p_subject_type
      and r.submitted_by = v_user
      and r.status = 'draft'
      and coalesce(r.teaching_id, r.devotional_id, r.outline_id, r.handout_id) = p_subject_id
      and exists (select 1 from public.content_revision_changes c where c.revision_id = r.id)
  ) then
    raise exception 'Submit or discard your proposed changes first.' using errcode = 'P0001';
  end if;
  delete from public.content_revisions r
  where r.subject_type = p_subject_type
    and r.submitted_by = v_user
    and r.status = 'draft'
    and coalesce(r.teaching_id, r.devotional_id, r.outline_id, r.handout_id) = p_subject_id
    and not exists (select 1 from public.content_revision_changes c where c.revision_id = r.id);

  insert into public.content_review_oks (subject_type, subject_id, user_id, user_name)
  values (
    p_subject_type,
    p_subject_id,
    v_user,
    coalesce(
      (select nullif(trim(aa.display_name), '') from public.admin_authorizations aa where aa.user_id = v_user),
      (select u.email from auth.users u where u.id = v_user)
    )
  )
  on conflict (subject_type, subject_id, user_id) do update set ok_at = now();
end;
$$;

-- Takes the person's own note back, so the item is waiting for their review again.
create or replace function public.clear_review_ok(p_subject_type text, p_subject_id uuid)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or not public.is_content_manager_or_admin() then
    raise exception 'Only a Content Manager can change a review.' using errcode = '42501';
  end if;
  delete from public.content_review_oks
  where subject_type = p_subject_type and subject_id = p_subject_id and user_id = v_user;
end;
$$;

revoke all on function public.review_subject_is_sent_draft(text, uuid) from public, anon, authenticated;
revoke all on function public.mark_review_ok(text, uuid) from public, anon;
revoke all on function public.clear_review_ok(text, uuid) from public, anon;
grant execute on function public.mark_review_ok(text, uuid) to authenticated;
grant execute on function public.clear_review_ok(text, uuid) to authenticated;

-- The notes end with the round: when the item is no longer a draft that is out for review, or is deleted.
create or replace function public.clear_review_oks_when_round_ends()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    delete from public.content_review_oks where subject_type = tg_argv[0] and subject_id = old.id;
    return old;
  end if;
  if new.status <> 'draft' or new.sent_for_review_at is null then
    delete from public.content_review_oks where subject_type = tg_argv[0] and subject_id = new.id;
  end if;
  return new;
end;
$$;

drop trigger if exists teachings_clear_review_oks on public.teachings;
create trigger teachings_clear_review_oks
after update of status, sent_for_review_at or delete on public.teachings
for each row execute function public.clear_review_oks_when_round_ends('teaching');

drop trigger if exists teaching_devotionals_clear_review_oks on public.teaching_devotionals;
create trigger teaching_devotionals_clear_review_oks
after update of status, sent_for_review_at or delete on public.teaching_devotionals
for each row execute function public.clear_review_oks_when_round_ends('devotional');

drop trigger if exists teaching_outlines_clear_review_oks on public.teaching_outlines;
create trigger teaching_outlines_clear_review_oks
after update of status, sent_for_review_at or delete on public.teaching_outlines
for each row execute function public.clear_review_oks_when_round_ends('outline');

drop trigger if exists teaching_handouts_clear_review_oks on public.teaching_handouts;
create trigger teaching_handouts_clear_review_oks
after update of status, sent_for_review_at or delete on public.teaching_handouts
for each row execute function public.clear_review_oks_when_round_ends('handout');
