alter table public.teaching_printable_pdf_links
rename to printable_pdf_links;

drop policy if exists "Public can read published teaching printable PDF links" on public.printable_pdf_links;
drop policy if exists "Admins manage teaching printable PDF links" on public.printable_pdf_links;

alter table public.printable_pdf_links
add column id uuid not null default gen_random_uuid(),
add column title text;

alter table public.printable_pdf_links
disable trigger teaching_printable_pdf_links_set_updated_at;

update public.printable_pdf_links pdf
set title = teaching.title
from public.teachings teaching
where teaching.id = pdf.teaching_id;

alter table public.printable_pdf_links
enable trigger teaching_printable_pdf_links_set_updated_at;

do $$
begin
  if exists (select 1 from public.printable_pdf_links where title is null) then
    raise exception 'Cannot migrate printable PDF links because a teaching title could not be found';
  end if;
end
$$;

alter table public.printable_pdf_links
alter column title set not null,
drop constraint teaching_printable_pdf_links_pkey,
add constraint printable_pdf_links_pkey primary key (id),
drop column teaching_id;

alter table public.printable_pdf_links
rename constraint teaching_printable_pdf_links_url_check to printable_pdf_links_url_check;

alter trigger teaching_printable_pdf_links_set_updated_at on public.printable_pdf_links
rename to printable_pdf_links_set_updated_at;

create policy "Public can read printable PDF links"
on public.printable_pdf_links
for select
to anon, authenticated
using (true);

create policy "Admins manage printable PDF links"
on public.printable_pdf_links
for all
to authenticated
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

revoke insert, update, delete on public.printable_pdf_links from anon;
grant select on public.printable_pdf_links to anon, authenticated, service_role;
grant select, insert, update, delete on public.printable_pdf_links to authenticated, service_role;
