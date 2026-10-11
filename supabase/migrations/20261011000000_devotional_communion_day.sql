-- Day 7 of a devotional is a Communion and rest day.
--
-- It has no 5-minute journal prompt and no prayer activation. Its reading is "The Rest Reflection",
-- its confession is "Today's Confession of Rest", and it adds three texts of its own:
--   bread_reflection  - how the week's theme connects to the broken body of Christ, ending with the
--                       bread's partaking declaration
--   cup_reflection    - how the week's theme connects to the blood of the New Covenant, ending with the
--                       cup's partaking declaration
--   self_examination  - the "Reverent Self-Examination & Blessing" closing
-- The fixed "Table of Remembrance" sentence is part of the page, not stored.
--
-- Existing Day 7s are NOT rewritten here. Their journal_prompt and prayer_activation stay as they are,
-- and a Day 7 with none of the three new texts keeps showing and mailing in its old layout until it is
-- converted. Nothing already published disappears.
--
-- The co-editor review (propose / accept / reject) works field by field through two internal
-- functions, so they are replaced below to know the three new fields. Everything else in the review
-- workflow is unchanged.

alter table public.teaching_devotional_days
  add column if not exists bread_reflection text,
  add column if not exists cup_reflection text,
  add column if not exists self_examination text;

alter table public.teaching_devotional_days
  drop constraint if exists teaching_devotional_days_bread_reflection_length_check,
  add constraint teaching_devotional_days_bread_reflection_length_check
    check (bread_reflection is null or char_length(bread_reflection) <= 6000),
  drop constraint if exists teaching_devotional_days_cup_reflection_length_check,
  add constraint teaching_devotional_days_cup_reflection_length_check
    check (cup_reflection is null or char_length(cup_reflection) <= 6000),
  drop constraint if exists teaching_devotional_days_self_examination_length_check,
  add constraint teaching_devotional_days_self_examination_length_check
    check (self_examination is null or char_length(self_examination) <= 6000);

-- ---------------------------------------------------------------------------
-- Review: which day fields can be proposed and applied
-- ---------------------------------------------------------------------------

create or replace function public.revision_devotional_field_info(
  p_devotional_id uuid,
  p_kind text,
  p_target_id uuid,
  p_field text,
  out valid boolean,
  out current_value text,
  out max_length integer
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_title text;
  v_intro text;
  v_day public.teaching_devotional_days%rowtype;
begin
  valid := false;
  current_value := null;
  max_length := 0;

  if p_kind = 'devotional' then
    if p_target_id is not null or p_field not in ('title', 'introduction') then return; end if;
    select d.title, d.introduction into v_title, v_intro
    from public.teaching_devotionals d
    where d.id = p_devotional_id and d.status = 'draft';
    if not found then return; end if;
    valid := true;
    current_value := case p_field when 'title' then v_title else v_intro end;
    max_length := case p_field when 'title' then 180 else 8000 end;
    return;
  end if;

  if p_kind = 'day' then
    if p_target_id is null then return; end if;
    select dd.* into v_day
    from public.teaching_devotional_days dd
    join public.teaching_devotionals d on d.id = dd.devotional_id
    where dd.id = p_target_id and dd.devotional_id = p_devotional_id and d.status = 'draft';
    if not found then return; end if;

    if p_field = 'title' then
      valid := true; current_value := v_day.title; max_length := 180; return;
    elsif p_field = 'anchor_scriptures' then
      valid := true; current_value := array_to_string(v_day.anchor_scriptures, E'\n'); max_length := 20019; return;
    elsif p_field = 'devotional_reading' then
      valid := true; current_value := v_day.devotional_reading; max_length := 12000; return;
    elsif p_field = 'confession' then
      valid := true; current_value := v_day.confession; max_length := 3000; return;
    elsif p_field = 'journal_prompt' then
      valid := true; current_value := v_day.journal_prompt; max_length := 3000; return;
    elsif p_field = 'prayer_activation' then
      valid := true; current_value := v_day.prayer_activation; max_length := 3000; return;
    elsif p_field = 'bread_reflection' then
      valid := true; current_value := v_day.bread_reflection; max_length := 6000; return;
    elsif p_field = 'cup_reflection' then
      valid := true; current_value := v_day.cup_reflection; max_length := 6000; return;
    elsif p_field = 'self_examination' then
      valid := true; current_value := v_day.self_examination; max_length := 6000; return;
    end if;
  end if;
end;
$$;

create or replace function public.revision_devotional_apply_value(
  p_devotional_id uuid,
  p_kind text,
  p_target_id uuid,
  p_field text,
  p_value text
)
returns void
language plpgsql
volatile
security definer
set search_path = public
as $$
declare
  v_value text := public.revision_normalize_text(p_value);
  v_rows integer;
  v_scriptures text[];
begin
  if p_kind = 'devotional' then
    if p_field = 'title' then
      if v_value = '' then raise exception 'The devotional title cannot be empty.'; end if;
      update public.teaching_devotionals set title = v_value where id = p_devotional_id and status = 'draft';
    elsif p_field = 'introduction' then
      update public.teaching_devotionals set introduction = nullif(v_value, '') where id = p_devotional_id and status = 'draft';
    else
      raise exception 'That devotional field cannot be changed through review.';
    end if;
    get diagnostics v_rows = row_count;
  elsif p_kind = 'day' then
    if p_field = 'title' then
      update public.teaching_devotional_days dd set title = v_value
      from public.teaching_devotionals d
      where dd.id = p_target_id and dd.devotional_id = p_devotional_id and d.id = dd.devotional_id and d.status = 'draft';
    elsif p_field = 'anchor_scriptures' then
      select coalesce(array_agg(trim(line)) filter (where trim(line) <> ''), array[]::text[])
      into v_scriptures
      from unnest(string_to_array(v_value, E'\n')) as line;
      if cardinality(v_scriptures) > 20 then raise exception 'Anchor Scriptures must include 20 references or fewer.'; end if;
      if exists (select 1 from unnest(v_scriptures) s where char_length(s) > 1000) then
        raise exception 'Each anchor Scripture must be 1,000 characters or fewer.';
      end if;
      update public.teaching_devotional_days dd set anchor_scriptures = v_scriptures
      from public.teaching_devotionals d
      where dd.id = p_target_id and dd.devotional_id = p_devotional_id and d.id = dd.devotional_id and d.status = 'draft';
    elsif p_field = 'devotional_reading' then
      update public.teaching_devotional_days dd set devotional_reading = nullif(v_value, '')
      from public.teaching_devotionals d
      where dd.id = p_target_id and dd.devotional_id = p_devotional_id and d.id = dd.devotional_id and d.status = 'draft';
    elsif p_field = 'confession' then
      update public.teaching_devotional_days dd set confession = nullif(v_value, '')
      from public.teaching_devotionals d
      where dd.id = p_target_id and dd.devotional_id = p_devotional_id and d.id = dd.devotional_id and d.status = 'draft';
    elsif p_field = 'journal_prompt' then
      update public.teaching_devotional_days dd set journal_prompt = nullif(v_value, '')
      from public.teaching_devotionals d
      where dd.id = p_target_id and dd.devotional_id = p_devotional_id and d.id = dd.devotional_id and d.status = 'draft';
    elsif p_field = 'prayer_activation' then
      update public.teaching_devotional_days dd set prayer_activation = nullif(v_value, '')
      from public.teaching_devotionals d
      where dd.id = p_target_id and dd.devotional_id = p_devotional_id and d.id = dd.devotional_id and d.status = 'draft';
    elsif p_field = 'bread_reflection' then
      update public.teaching_devotional_days dd set bread_reflection = nullif(v_value, '')
      from public.teaching_devotionals d
      where dd.id = p_target_id and dd.devotional_id = p_devotional_id and d.id = dd.devotional_id and d.status = 'draft';
    elsif p_field = 'cup_reflection' then
      update public.teaching_devotional_days dd set cup_reflection = nullif(v_value, '')
      from public.teaching_devotionals d
      where dd.id = p_target_id and dd.devotional_id = p_devotional_id and d.id = dd.devotional_id and d.status = 'draft';
    elsif p_field = 'self_examination' then
      update public.teaching_devotional_days dd set self_examination = nullif(v_value, '')
      from public.teaching_devotionals d
      where dd.id = p_target_id and dd.devotional_id = p_devotional_id and d.id = dd.devotional_id and d.status = 'draft';
    else
      raise exception 'That day field cannot be changed through review.';
    end if;
    get diagnostics v_rows = row_count;
  else
    raise exception 'Unknown revision target.';
  end if;

  if v_rows is distinct from 1 then
    raise exception 'The text to change could not be found.';
  end if;
end;
$$;

revoke all on function public.revision_devotional_field_info(uuid, text, uuid, text) from public, anon, authenticated;
revoke all on function public.revision_devotional_apply_value(uuid, text, uuid, text, text) from public, anon, authenticated;
