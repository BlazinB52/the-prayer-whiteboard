-- Printable PDFs move from admin-typed OneDrive links to files stored
-- directly in Supabase Storage, so viewers open the file itself instead of
-- going through OneDrive's own viewer/redirect chain.
--
-- Unlike the "chalkboards" bucket (private, read via short-lived signed
-- URLs), this bucket is public with permanent direct URLs: the content is
-- already fully public with no gating, and a stable bookmarkable link
-- matches how the OneDrive links behaved before.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'printable-pdfs',
  'printable-pdfs',
  true,
  26214400,
  array['application/pdf']
)
on conflict (id) do nothing;

create policy "Admins can manage printable pdf bucket objects"
on storage.objects
for all
using (
  (bucket_id = 'printable-pdfs')
  and public.is_authenticated_admin()
)
with check (
  (bucket_id = 'printable-pdfs')
  and public.is_authenticated_admin()
);

-- Belt-and-suspenders: the bucket's own "public" flag already serves objects
-- unauthenticated via the public URL endpoint regardless of this policy, but
-- this keeps storage.objects queries/listing consistent with that too.
create policy "Public can read printable pdf bucket objects"
on storage.objects
for select
using (bucket_id = 'printable-pdfs');

-- Existing rows keep their OneDrive link (printable_pdf_url) until an admin
-- edits them and uploads a real file, which moves that row over to
-- storage_path. Going forward, new rows only ever get storage_path.
alter table public.printable_pdf_links
add column storage_path text unique;

alter table public.printable_pdf_links
alter column printable_pdf_url drop not null;

alter table public.printable_pdf_links
add constraint printable_pdf_links_one_source_check
check (num_nonnulls(storage_path, printable_pdf_url) = 1);
