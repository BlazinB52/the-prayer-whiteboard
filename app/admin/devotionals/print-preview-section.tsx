import Link from "next/link";

// The "Print preview" box on the devotional admin page. The page's top-right link jumps to it by id.
export const DEVOTIONAL_PRINT_SECTION_ID = "print-preview";

export function DevotionalPrintPreviewSection({ devotionalId }: { devotionalId: string }) {
  return (
    <section id={DEVOTIONAL_PRINT_SECTION_ID} className="mt-8 scroll-mt-6 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6">
      <h2 className="text-2xl font-extrabold text-[#243d31]">Print preview</h2>
      <p className="mt-3 text-sm leading-6 text-[#607066]">
        Opens a printable copy of the whole devotional in a new tab: the title, the introduction and all seven days, with each day after the first starting on a new page. It shows saved content only, so save any edits first. You can open it as often as you like, and it works on a draft or a published devotional. Nothing here changes.
      </p>
      <Link href={`/admin/devotionals/${devotionalId}/print`} target="_blank" rel="noreferrer" className="admin-primary-button mt-4 inline-flex items-center justify-center">
        <span>Preview Printable Devotional</span>
      </Link>
    </section>
  );
}
