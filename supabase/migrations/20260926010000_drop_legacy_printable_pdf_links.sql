-- Legacy OneDrive-linked printable PDFs are no longer wanted at all — every
-- entry must be a real file stored in Supabase Storage, full stop. The 2
-- pre-existing OneDrive-linked rows are removed outright (not just hidden),
-- and the schema drops the coexistence path added in
-- 20260926000000_add_printable_pdf_storage.sql, since it's no longer needed.
delete from public.printable_pdf_links where printable_pdf_url is not null;

alter table public.printable_pdf_links
drop constraint printable_pdf_links_one_source_check;

alter table public.printable_pdf_links
drop constraint printable_pdf_links_url_check;

alter table public.printable_pdf_links
drop column printable_pdf_url;

alter table public.printable_pdf_links
alter column storage_path set not null;
