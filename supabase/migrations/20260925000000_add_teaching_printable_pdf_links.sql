create table if not exists public.teaching_printable_pdf_links (
  teaching_id uuid primary key references public.teachings(id) on delete cascade,
  printable_pdf_url text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint teaching_printable_pdf_links_url_check
    check (
      printable_pdf_url = btrim(printable_pdf_url)
      and length(printable_pdf_url) between 9 and 2048
      and printable_pdf_url like 'https://%'
      and printable_pdf_url !~* '^(javascript|data|file):'
      and printable_pdf_url !~ '[[:space:]<>"'']'
    )
);

drop trigger if exists teaching_printable_pdf_links_set_updated_at on public.teaching_printable_pdf_links;
create trigger teaching_printable_pdf_links_set_updated_at
before update on public.teaching_printable_pdf_links
for each row execute function public.set_updated_at();

alter table public.teaching_printable_pdf_links enable row level security;

drop policy if exists "Public can read published teaching printable PDF links" on public.teaching_printable_pdf_links;
create policy "Public can read published teaching printable PDF links"
on public.teaching_printable_pdf_links
for select
using (
  exists (
    select 1
    from public.teachings teaching
    where teaching.id = teaching_id
      and teaching.status = 'published'
  )
  or public.is_authenticated_admin()
);

drop policy if exists "Admins manage teaching printable PDF links" on public.teaching_printable_pdf_links;
create policy "Admins manage teaching printable PDF links"
on public.teaching_printable_pdf_links
for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

grant select on public.teaching_printable_pdf_links to anon, authenticated;
grant select, insert, update, delete on public.teaching_printable_pdf_links to authenticated;
