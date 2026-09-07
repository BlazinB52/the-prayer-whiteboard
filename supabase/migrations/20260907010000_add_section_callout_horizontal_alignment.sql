alter table public.teaching_sections
  add column if not exists highlight_horizontal_alignment text not null default 'left';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'teaching_sections_highlight_horizontal_alignment_check'
      and conrelid = 'public.teaching_sections'::regclass
  ) then
    alter table public.teaching_sections
      add constraint teaching_sections_highlight_horizontal_alignment_check
      check (highlight_horizontal_alignment in ('left', 'center'));
  end if;
end
$$;
