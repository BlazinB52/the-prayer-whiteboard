import Link from "next/link";

// The "Export for translation" box on both devotional admin pages (a teaching's devotional page and the
// standalone devotional page), so the two can never drift apart. The page's top-right link points at its id.
export const DEVOTIONAL_EXPORT_SECTION_ID = "export-for-translation";

export function DevotionalExportForTranslationSection({ devotionalId }: { devotionalId: string }) {
  return (
    <section id={DEVOTIONAL_EXPORT_SECTION_ID} className="mt-8 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-6">
      <h2 className="text-2xl font-extrabold text-[#243d31]">Export for translation</h2>
      <p className="mt-3 text-sm leading-6 text-[#607066]">
        Downloads this devotional as a plain text file named es_yyyymmdd_devotional, with the title, introduction and all seven days. Have it translated into Español (El Salvador, with the vos forms), then create a new devotional from the translated file on the <Link href="/admin/devotionals/new" className="font-extrabold text-[#9d5a2f] underline underline-offset-2">New devotional</Link> page with Language set to Español. It offers to link the new devotional to this one. You can export as often as you like, and it works on a draft or a published devotional. Nothing here changes.
      </p>
      <a href={`/api/admin/devotional/export?devotional_id=${devotionalId}`} download className="admin-secondary-button mt-4 inline-flex items-center justify-center">Export for translation (text file)</a>
    </section>
  );
}
