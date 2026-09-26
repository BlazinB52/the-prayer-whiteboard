begin;

drop table if exists public.printable_pdf_links;

create table public.teaching_printable_pdf_links (
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

create trigger teaching_printable_pdf_links_set_updated_at
before update on public.teaching_printable_pdf_links
for each row execute function public.set_updated_at();

alter table public.teaching_printable_pdf_links enable row level security;

create policy "Public can read published teaching printable PDF links"
on public.teaching_printable_pdf_links for select using (true);

create policy "Admins manage teaching printable PDF links"
on public.teaching_printable_pdf_links for all
using (public.is_authenticated_admin())
with check (public.is_authenticated_admin());

grant select on public.teaching_printable_pdf_links to anon, authenticated;
grant select, insert, update, delete on public.teaching_printable_pdf_links to authenticated;

insert into public.teachings (id, title, slug, status, summary)
values (
  '00000000-0000-4000-b000-000000000611',
  'Migrated Printable Resource',
  'migrated-printable-resource',
  'published',
  'Migration fixture.'
);

insert into public.teaching_printable_pdf_links (
  teaching_id,
  printable_pdf_url,
  created_at,
  updated_at
)
values (
  '00000000-0000-4000-b000-000000000611',
  'https://onedrive.live.com/download?resid=MIGRATION',
  '2026-09-20 10:00:00+00',
  '2026-09-21 11:00:00+00'
);

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

select plan(16);

select is((select count(*) from public.printable_pdf_links), 1::bigint, 'legacy PDF row is preserved');
select is((select title from public.printable_pdf_links), 'Migrated Printable Resource', 'teaching title becomes the PDF title');
select is((select printable_pdf_url from public.printable_pdf_links), 'https://onedrive.live.com/download?resid=MIGRATION', 'legacy URL is preserved');
select is((select created_at from public.printable_pdf_links), '2026-09-20 10:00:00+00'::timestamptz, 'created timestamp is preserved');
select is((select updated_at from public.printable_pdf_links), '2026-09-21 11:00:00+00'::timestamptz, 'updated timestamp is preserved');
select ok((select id is not null from public.printable_pdf_links), 'migrated row receives a UUID');
select hasnt_column('public', 'printable_pdf_links', 'teaching_id', 'teaching association is removed');

set local role anon;
select is((select count(*) from public.printable_pdf_links), 1::bigint, 'public can read PDF records');
select throws_ok(
  $$ insert into public.printable_pdf_links (title, printable_pdf_url) values ('Anon PDF', 'https://example.com/anon.pdf') $$,
  '42501',
  null,
  'public cannot create PDF records'
);
select throws_ok(
  $$ update public.printable_pdf_links set title = 'Anon update' $$,
  '42501',
  null,
  'public cannot update PDF records'
);
select throws_ok(
  $$ delete from public.printable_pdf_links $$,
  '42501',
  null,
  'public cannot delete PDF records'
);

reset role;

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, created_at, updated_at
)
values (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-4000-b000-000000000601',
  'authenticated',
  'authenticated',
  'printable-pdf-admin@example.test',
  'local-regression-placeholder',
  now(),
  now(),
  now()
);

insert into public.admin_authorizations (id, user_id, role, is_active)
values (
  '00000000-0000-4000-b000-000000000602',
  '00000000-0000-4000-b000-000000000601',
  'admin',
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-b000-000000000601', true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.printable_pdf_links (title, printable_pdf_url)
values ('New Printable', 'https://example.com/new.pdf');
select is((select count(*) from public.printable_pdf_links), 2::bigint, 'admin can create a PDF record');

update public.printable_pdf_links
set title = 'Updated Printable', printable_pdf_url = 'https://example.com/updated.pdf'
where title = 'New Printable';
select is((select title from public.printable_pdf_links where printable_pdf_url = 'https://example.com/updated.pdf'), 'Updated Printable', 'admin can edit title and URL');

select throws_ok(
  $$ insert into public.printable_pdf_links (title, printable_pdf_url) values ('Unsafe PDF', 'http://example.com/file.pdf') $$,
  '23514',
  null,
  'non-https URLs are rejected'
);

delete from public.printable_pdf_links where title = 'Updated Printable';
select is((select count(*) from public.printable_pdf_links), 1::bigint, 'admin can delete a PDF record');

select ok(
  exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'printable_pdf_links'
      and policyname = 'Public can read printable PDF links'
  ),
  'public read policy exists'
);

select * from finish();

rollback;
