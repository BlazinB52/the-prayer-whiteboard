-- Teaching outlines: a library of teacher's outlines uploaded as Word files.
--
-- 1. outline_categories: admin-managed groups (e.g. Communion, Prayer) that
--    outlines are filed under.
-- 2. teaching_outlines: one row per uploaded outline. The Word file is
--    converted at upload time into a small block structure (headings,
--    paragraphs, lists, tables) stored in `content`, so the site renders it in
--    its own styles. The original .docx is kept in Storage for download.
-- 3. Admins manage everything. The public can read only published outlines
--    (and the categories), ready for a public teachers' library page.
-- 4. teaching-outlines: a public Storage bucket for the original .docx files,
--    so download links never expire (same approach as printable-pdfs).

create table if not exists public.outline_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  constraint outline_categories_name_check check (length(trim(name)) between 1 and 80),
  constraint outline_categories_slug_check check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$')
);

create unique index if not exists outline_categories_name_lower_idx
  on public.outline_categories (lower(name));

create table if not exists public.teaching_outlines (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  title text not null,
  subtitle text,
  category_id uuid not null references public.outline_categories(id) on delete restrict,
  language text not null default 'en',
  gathering_date date,
  status text not null default 'draft',
  content jsonb not null,
  source_path text not null unique,
  source_file_name text,
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teaching_outlines_title_check check (length(trim(title)) between 1 and 200),
  constraint teaching_outlines_subtitle_check check (subtitle is null or length(trim(subtitle)) between 1 and 300),
  constraint teaching_outlines_language_check check (language in ('en', 'es')),
  constraint teaching_outlines_status_check check (status in ('draft', 'published')),
  constraint teaching_outlines_content_check check (jsonb_typeof(content) = 'array'),
  constraint teaching_outlines_source_path_check check (source_path ~ '^[0-9a-f-]{36}\.docx$')
);

create index if not exists teaching_outlines_category_idx
  on public.teaching_outlines (category_id, language, status);

drop trigger if exists teaching_outlines_set_updated_at on public.teaching_outlines;
create trigger teaching_outlines_set_updated_at
before update on public.teaching_outlines
for each row execute function public.set_updated_at();

alter table public.outline_categories enable row level security;
alter table public.teaching_outlines enable row level security;

drop policy if exists "Admins manage outline categories" on public.outline_categories;
create policy "Admins manage outline categories"
on public.outline_categories
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

drop policy if exists "Public reads outline categories" on public.outline_categories;
create policy "Public reads outline categories"
on public.outline_categories
for select
using (true);

drop policy if exists "Admins manage teaching outlines" on public.teaching_outlines;
create policy "Admins manage teaching outlines"
on public.teaching_outlines
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

drop policy if exists "Public reads published teaching outlines" on public.teaching_outlines;
create policy "Public reads published teaching outlines"
on public.teaching_outlines
for select
using (status = 'published');

grant select on public.outline_categories, public.teaching_outlines to anon;
grant select, insert, update, delete on public.outline_categories, public.teaching_outlines to authenticated;
grant all on public.outline_categories, public.teaching_outlines to service_role;

-- Original Word files
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'teaching-outlines',
  'teaching-outlines',
  true,
  8388608,
  array['application/vnd.openxmlformats-officedocument.wordprocessingml.document']
)
on conflict (id) do nothing;

drop policy if exists "Admins manage teaching outline files" on storage.objects;
create policy "Admins manage teaching outline files"
on storage.objects
for all
using (bucket_id = 'teaching-outlines' and public.is_authenticated_admin())
with check (bucket_id = 'teaching-outlines' and public.is_authenticated_admin());

drop policy if exists "Public can read teaching outline files" on storage.objects;
create policy "Public can read teaching outline files"
on storage.objects
for select
using (bucket_id = 'teaching-outlines');
