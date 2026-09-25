begin;

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

select plan(9);

create temp table printable_pdf_test_ids (
  key text primary key,
  id uuid not null
) on commit drop;

insert into printable_pdf_test_ids (key, id)
values
  ('admin_user', '00000000-0000-4000-b000-000000000501'),
  ('admin_auth', '00000000-0000-4000-b000-000000000502'),
  ('regular_user', '00000000-0000-4000-b000-000000000503'),
  ('teaching_with_link', '00000000-0000-4000-b000-000000000511'),
  ('teaching_without_link', '00000000-0000-4000-b000-000000000512');

grant select on printable_pdf_test_ids to authenticated;

insert into auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  created_at,
  updated_at
)
values
  (
    '00000000-0000-0000-0000-000000000000',
    (select id from printable_pdf_test_ids where key = 'admin_user'),
    'authenticated',
    'authenticated',
    'printable-pdf-admin@example.test',
    'local-regression-placeholder',
    now(),
    now(),
    now()
  ),
  (
    '00000000-0000-0000-0000-000000000000',
    (select id from printable_pdf_test_ids where key = 'regular_user'),
    'authenticated',
    'authenticated',
    'printable-pdf-regular@example.test',
    'local-regression-placeholder',
    now(),
    now(),
    now()
  );

insert into public.admin_authorizations (id, user_id, role, is_active)
values (
  (select id from printable_pdf_test_ids where key = 'admin_auth'),
  (select id from printable_pdf_test_ids where key = 'admin_user'),
  'admin',
  true
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from printable_pdf_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

insert into public.teachings (id, title, slug, status, summary)
values
  (
    (select id from printable_pdf_test_ids where key = 'teaching_with_link'),
    'Teaching With Printable PDF',
    'teaching-with-printable-pdf',
    'published',
    'Published teaching summary.'
  ),
  (
    (select id from printable_pdf_test_ids where key = 'teaching_without_link'),
    'Teaching Without Printable PDF',
    'teaching-without-printable-pdf',
    'published',
    'Published teaching summary.'
  );

insert into public.teaching_printable_pdf_links (teaching_id, printable_pdf_url)
values (
  (select id from printable_pdf_test_ids where key = 'teaching_with_link'),
  'https://onedrive.live.com/download?resid=ABC123'
);

select is(
  (
    select printable_pdf_url
    from public.teaching_printable_pdf_links
    where teaching_id = (select id from printable_pdf_test_ids where key = 'teaching_with_link')
  ),
  'https://onedrive.live.com/download?resid=ABC123',
  'admin can assign a printable PDF link to a teaching'
);

update public.teaching_printable_pdf_links
set printable_pdf_url = 'https://contoso.sharepoint.com/:b:/s/storehouse/example'
where teaching_id = (select id from printable_pdf_test_ids where key = 'teaching_with_link');

select is(
  (
    select printable_pdf_url
    from public.teaching_printable_pdf_links
    where teaching_id = (select id from printable_pdf_test_ids where key = 'teaching_with_link')
  ),
  'https://contoso.sharepoint.com/:b:/s/storehouse/example',
  'admin can update a printable PDF link'
);

select is(
  (
    select count(*)
    from public.teaching_printable_pdf_links
    where teaching_id = (select id from printable_pdf_test_ids where key = 'teaching_without_link')
  ),
  0::bigint,
  'a teaching without a PDF link remains valid'
);

select throws_ok(
  $$ insert into public.teaching_printable_pdf_links (teaching_id, printable_pdf_url)
     values ((select id from printable_pdf_test_ids where key = 'teaching_without_link'), 'http://example.com/file.pdf') $$,
  '23514',
  null,
  'non-https URLs are rejected'
);

select throws_ok(
  $$ insert into public.teaching_printable_pdf_links (teaching_id, printable_pdf_url)
     values ((select id from printable_pdf_test_ids where key = 'teaching_without_link'), 'javascript:alert(1)') $$,
  '23514',
  null,
  'javascript URLs are rejected'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from printable_pdf_test_ids where key = 'regular_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

select throws_ok(
  $$ insert into public.teaching_printable_pdf_links (teaching_id, printable_pdf_url)
     values ((select id from printable_pdf_test_ids where key = 'teaching_without_link'), 'https://onedrive.live.com/download?resid=REGULAR') $$,
  '42501',
  null,
  'authorization is required to assign a printable PDF link'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', (select id::text from printable_pdf_test_ids where key = 'admin_user'), true);
select set_config('request.jwt.claim.role', 'authenticated', true);

delete from public.teaching_printable_pdf_links
where teaching_id = (select id from printable_pdf_test_ids where key = 'teaching_with_link');

select is(
  (
    select count(*)
    from public.teaching_printable_pdf_links
    where teaching_id = (select id from printable_pdf_test_ids where key = 'teaching_with_link')
  ),
  0::bigint,
  'admin can remove a printable PDF link'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'teaching_printable_pdf_links'
      and policyname = 'Admins manage teaching printable PDF links'
  ),
  'admin write policy exists'
);

select ok(
  exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'teaching_printable_pdf_links'
      and policyname = 'Public can read published teaching printable PDF links'
  ),
  'published-teaching read policy exists for future public use'
);

select * from finish();

rollback;
