-- Printable PDFs get a language so Español printables appear only on the
-- Español side (/espanol/materiales-para-imprimir) and English ones only on /pdf.
alter table public.printable_pdf_links
  add column if not exists language text not null default 'en';

alter table public.printable_pdf_links
  drop constraint if exists printable_pdf_links_language_check,
  add constraint printable_pdf_links_language_check
    check (language in ('en', 'es'));
