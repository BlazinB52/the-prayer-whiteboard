import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { TrackedText } from "@/lib/tracked-text";
import { compareBlocks, type BlockDifference } from "@/lib/weekly-update-compare";
import { convertDocxToWeeklyUpdate } from "@/lib/weekly-update-docx";
import type { WeeklyUpdateReviewFieldRow } from "@/lib/weekly-update-revisions";
import { saveWeeklyUpdateText } from "./actions";
import { WeeklyUpdateTextEditor, type TextEditorField } from "./text-editor";

export const metadata: Metadata = {
  title: "Edit Weekly Update Text",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const SOURCE_BUCKET = "weekly-update-documents";

// What changed since the Word document was uploaded, so the Administrator can see everything that was
// accepted from a Content Manager and put right whatever should not have been. Returns null if the
// original document cannot be read, in which case the page simply leaves this section out.
async function changesSinceUpload(storagePath: string | null, currentBlocks: unknown): Promise<{ differences: BlockDifference[]; sameLength: boolean } | null> {
  if (!storagePath) return null;
  try {
    const service = createServiceRoleClient();
    if (!service) return null;
    const { data: file } = await service.storage.from(SOURCE_BUCKET).download(storagePath);
    if (!file) return null;
    const original = convertDocxToWeeklyUpdate(Buffer.from(await file.arrayBuffer()));
    return compareBlocks(original.blocks, currentBlocks);
  } catch {
    return null;
  }
}

export default async function EditWeeklyUpdateTextPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const { supabase } = await requireAdmin();
  const { data: update } = await supabase
    .from("weekly_updates")
    .select("id, title, status, converted_content, source_document_storage_path, source_document_file_name")
    .eq("id", id)
    .eq("status", "draft")
    .maybeSingle();
  if (!update) notFound();

  const [{ data: fieldRows }, comparison] = await Promise.all([
    supabase.rpc("weekly_update_review_fields", { p_weekly_update_id: id }),
    changesSinceUpload(update.source_document_storage_path, update.converted_content),
  ]);

  const rows = (fieldRows ?? []) as WeeklyUpdateReviewFieldRow[];
  const fields: TextEditorField[] = rows.map((row) => ({
    key: row.field_key,
    label: row.label,
    value: row.current_value ?? "",
    rows: row.field_rows,
    maxLength: row.max_length,
    formatted: row.formatted,
    multiline: row.multiline,
  }));
  const labelFor = (position: number) => rows.find((row) => row.field_key === `block_${position}`)?.label ?? `Block ${position}`;

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-4xl">
        <Link href="/admin/weekly-updates" className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to Weekly Updates</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Edit text</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#243d31] sm:text-4xl">{update.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#607066]">
            Edit the wording of this draft directly, for example to put right something that came in with an accepted change. Use **bold**, *italic* and [link text](https://address) the same way as in the review editors. Nothing is published or emailed from here.
          </p>
        </header>

        {comparison ? (
          <section className="mt-6 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
            <h2 className="text-lg font-extrabold text-[#243d31]">
              Changed since the uploaded Word document <span className="text-sm font-bold text-[#607066]">({comparison.differences.length})</span>
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#607066]">
              Compared with {update.source_document_file_name ?? "the original upload"}. Red struck-through wording was in the document and is gone, and blue underlined wording is new. This panel is only for looking. To correct one, press its Edit this paragraph link, or scroll down to the editor.
            </p>
            {!comparison.sameLength ? <p className="mt-2 text-sm font-bold text-[#7a4a1d]">The number of paragraphs is different from the upload, so some of these may be paragraphs that were added or removed.</p> : null}
            {comparison.differences.length ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-extrabold text-[#9d5a2f]">Show what changed</summary>
                <div className="mt-3 max-h-[32rem] space-y-4 overflow-y-auto pr-1">
                  {comparison.differences.map((difference) => (
                    <article key={difference.position} className="rounded-xl border border-[#284a3b]/10 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-extrabold text-[#243d31]">{labelFor(difference.position)}</h3>
                        <a href={`#field-block_${difference.position}`} className="text-sm font-extrabold text-[#1a4fb4] underline underline-offset-2">Edit this paragraph ↓</a>
                      </div>
                      <div className="mt-2"><TrackedText original={difference.original} proposed={difference.current} /></div>
                    </article>
                  ))}
                </div>
              </details>
            ) : (
              <p className="mt-3 text-sm font-bold text-[#326048]">Nothing has changed since the upload.</p>
            )}
          </section>
        ) : null}

        {fields.length ? (
          <WeeklyUpdateTextEditor action={saveWeeklyUpdateText.bind(null, id)} fields={fields} />
        ) : (
          <p role="alert" className="mt-6 rounded-xl border border-[#a2472c]/30 bg-[#f7e6e1] px-4 py-3 text-sm font-bold text-[#a2472c]">The text of this draft could not be loaded for editing. Reload the page, and if it still does not appear, tell the site developer.</p>
        )}
      </div>
    </main>
  );
}
