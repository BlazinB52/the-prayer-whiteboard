-- Adds one structured 7-Day Devotional series per teaching.
-- Devotionals are independently drafted/published and are public only when
-- both the devotional and its parent teaching are published.

create table if not exists public.teaching_devotionals (
  id uuid primary key default gen_random_uuid(),
  teaching_id uuid not null references public.teachings(id) on delete cascade,
  title text not null default '',
  introduction text,
  status text not null default 'draft' check (status in ('draft', 'published')),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (teaching_id),
  constraint teaching_devotionals_title_length_check
    check (char_length(title) <= 180),
  constraint teaching_devotionals_introduction_length_check
    check (introduction is null or char_length(introduction) <= 8000),
  constraint teaching_devotionals_published_title_check
    check (status <> 'published' or length(trim(title)) > 0)
);

create table if not exists public.teaching_devotional_days (
  id uuid primary key default gen_random_uuid(),
  devotional_id uuid not null references public.teaching_devotionals(id) on delete cascade,
  day_number integer not null check (day_number between 1 and 7),
  title text not null default '',
  anchor_scriptures text[] not null default array[]::text[],
  devotional_reading text,
  confession text,
  journal_prompt text,
  prayer_activation text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (devotional_id, day_number),
  constraint teaching_devotional_days_title_length_check
    check (char_length(title) <= 180),
  constraint teaching_devotional_days_anchor_scriptures_length_check
    check (
      cardinality(anchor_scriptures) <= 20
      and array_position(anchor_scriptures, null) is null
    ),
  constraint teaching_devotional_days_reading_length_check
    check (devotional_reading is null or char_length(devotional_reading) <= 12000),
  constraint teaching_devotional_days_confession_length_check
    check (confession is null or char_length(confession) <= 3000),
  constraint teaching_devotional_days_journal_prompt_length_check
    check (journal_prompt is null or char_length(journal_prompt) <= 3000),
  constraint teaching_devotional_days_prayer_activation_length_check
    check (prayer_activation is null or char_length(prayer_activation) <= 3000)
);

create index if not exists teaching_devotionals_teaching_idx
  on public.teaching_devotionals (teaching_id);

create index if not exists teaching_devotionals_status_published_idx
  on public.teaching_devotionals (status, published_at desc);

create index if not exists teaching_devotional_days_devotional_idx
  on public.teaching_devotional_days (devotional_id);

create index if not exists teaching_devotional_days_order_idx
  on public.teaching_devotional_days (devotional_id, day_number);

create trigger teaching_devotionals_set_updated_at
before update on public.teaching_devotionals
for each row execute function public.set_updated_at();

create trigger teaching_devotional_days_set_updated_at
before update on public.teaching_devotional_days
for each row execute function public.set_updated_at();

alter table public.teaching_devotionals enable row level security;
alter table public.teaching_devotional_days enable row level security;

create policy "Public can read published teaching devotionals"
on public.teaching_devotionals
for select
using (
  (
    status = 'published'
    and exists (
      select 1
      from public.teachings t
      where t.id = teaching_id
        and t.status = 'published'
    )
  )
  or public.is_authenticated_admin()
);

create policy "Admins manage teaching devotionals"
on public.teaching_devotionals
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

create policy "Public can read published teaching devotional days"
on public.teaching_devotional_days
for select
using (
  (
    exists (
      select 1
      from public.teaching_devotionals d
      join public.teachings t on t.id = d.teaching_id
      where d.id = devotional_id
        and d.status = 'published'
        and t.status = 'published'
    )
  )
  or public.is_authenticated_admin()
);

create policy "Admins manage teaching devotional days"
on public.teaching_devotional_days
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

grant select on public.teaching_devotionals to anon, authenticated;
grant select on public.teaching_devotional_days to anon, authenticated;
grant select, insert, update, delete on public.teaching_devotionals to authenticated;
grant select, insert, update, delete on public.teaching_devotional_days to authenticated;

-- Service-role access is intentionally not required for public devotional
-- delivery because published text can be read through the scoped public RLS
-- policies above. Teaching deletion cascades through teaching_devotionals and
-- then through teaching_devotional_days.
