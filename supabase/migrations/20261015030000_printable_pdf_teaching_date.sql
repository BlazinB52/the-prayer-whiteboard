-- Printable PDF links get the date of the teaching they go with.
--
-- The public PDF library and the Printable PDF Links page showed the date a PDF was added, which is not the date anyone
-- looks for: a handout is found by the teaching it goes with. gathering_date is that date. It is shown, and used to
-- sort the lists, in place of the date the PDF was added; a PDF with no teaching date falls back to the date it was added.
--
-- Publishing a handout fills it from the handout's teaching date, and the rows already published from a handout are
-- filled here. The rest can be set on the Printable PDF Links page.

alter table public.printable_pdf_links add column if not exists gathering_date date;

update public.printable_pdf_links link
set gathering_date = handout.gathering_date
from public.teaching_handouts handout
where handout.printable_pdf_id = link.id
  and link.gathering_date is null;

create index if not exists printable_pdf_links_listing_idx
  on public.printable_pdf_links (language, gathering_date desc nulls last, created_at desc);
