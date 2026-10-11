import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminTextEditor, type TextEditorField } from "@/app/admin/text-editor";
import { compareOutlines, type OutlineReviewFieldRow } from "@/lib/outline-revisions";
import { requireAdmin } from "@/lib/supabase/admin";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { TrackedText } from "@/lib/tracked-text";
import { MAX_TEACHING_DOCX_BYTES } from "@/lib/teaching-docx-package";
import { OUTLINE_BUCKET, parseOutlineDocx } from "@/lib/teaching-outlines";
import { changeOutlineStructure, saveOutlineText } from "./actions";

export const metadata: Metadata = {
  title: "Edit Outline Text",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// What changed since the Word document was uploaded, so the Administrator can see everything that was
// accepted from a Content Manager and put right whatever should not have been. Returns null if the
// original document cannot be read, in which case the page simply leaves this section out.
async function changesSinceUpload(storagePath: string, currentBlocks: unknown) {
  try {
    const service = createServiceRoleClient();
    if (!service) return null;
    const { data: file } = await service.storage.from(OUTLINE_BUCKET).download(storagePath);
    if (!file || file.size > MAX_TEACHING_DOCX_BYTES) return null;
    const original = parseOutlineDocx(Buffer.from(await file.arrayBuffer()));
    if (!original.outline) return null;
    return compareOutlines(original.outline.blocks, currentBlocks);
  } catch {
    return null;
  }
}

export default async function EditOutlineTextPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const { supabase } = await requireAdmin();
  const { data: outline } = await supabase
    .from("teaching_outlines")
    .select("id, title, status, content, source_path, source_file_name")
    .eq("id", id)
    .eq("status", "draft")
    .maybeSingle();
  if (!outline) notFound();

  const [{ data: fieldRows }, comparison] = await Promise.all([
    supabase.rpc("outline_review_fields", { p_outline_id: id }),
    changesSinceUpload(outline.source_path, outline.content),
  ]);

  const rows = (fieldRows ?? []) as OutlineReviewFieldRow[];
  const fields: TextEditorField[] = rows.map((row) => ({
    key: row.field_key,
    label: row.label,
    value: row.current_value ?? "",
    rows: row.field_rows,
    maxLength: row.max_length,
    formatted: row.formatted,
    multiline: row.multiline,
  }));
  const labelFor = (key: string) => rows.find((row) => row.field_key === key)?.label ?? key.replace(/^block_/, "Block ").replace(/_/g, " ");

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-4xl">
        <Link href={`/admin/outlines/${id}`} className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to the outline</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Edit text</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#243d31] sm:text-4xl">{outline.title}</h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#607066]">
            Edit the wording of this draft directly, for example to put right something that came in with an accepted change. Use **bold**, *italic* and [link text](https://address) the same way as in the review editors. Use Add below to insert a new paragraph (or list item) after one, and Delete to remove one; both work on what is saved. They are not available while a Content Manager proposal on this outline is still open. Nothing is published from here.
          </p>
        </header>

        {comparison ? (
          <section className="mt-6 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
            <h2 className="text-lg font-extrabold text-[#243d31]">
              Changed since the uploaded Word document <span className="text-sm font-bold text-[#607066]">({comparison.differences.length})</span>
            </h2>
            <p className="mt-1 text-sm leading-6 text-[#607066]">
              Compared with {outline.source_file_name ?? "the original upload"}. Red struck-through wording was in the document and is gone, and blue underlined wording is new. This panel is only for looking. To correct one, press its Edit this paragraph link, or scroll down to the editor.
            </p>
            {!comparison.sameLength ? <p className="mt-2 text-sm font-bold text-[#7a4a1d]">The number of blocks is different from the upload, so some of these may be paragraphs that were added or removed.</p> : null}
            {comparison.differences.length ? (
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-extrabold text-[#9d5a2f]">Show what changed</summary>
                <div className="mt-3 max-h-[32rem] space-y-4 overflow-y-auto pr-1">
                  {comparison.differences.map((difference) => (
                    <article key={difference.key} className="rounded-xl border border-[#284a3b]/10 bg-white p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <h3 className="text-sm font-extrabold text-[#243d31]">{labelFor(difference.key)}</h3>
                        <a href={`#field-${difference.key}`} className="text-sm font-extrabold text-[#1a4fb4] underline underline-offset-2">Edit this paragraph ↓</a>
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
          <AdminTextEditor
            // A new key remounts the editor after a paragraph is added or removed, so it starts from the new text.
            key={fields.length + ":" + fields.reduce((hash, field) => (hash * 31 + field.key.length + field.value.length) % 1000003, 7)}
            action={saveOutlineText.bind(null, id)}
            fields={fields}
            unit="place"
            structure={{ run: changeOutlineStructure.bind(null, id), allows: (key) => /^block_[0-9]+(_item_[0-9]+)?$/.test(key) }}
          />
        ) : (
          <p role="alert" className="mt-6 rounded-xl border border-[#a2472c]/30 bg-[#f7e6e1] px-4 py-3 text-sm font-bold text-[#a2472c]">The text of this draft could not be loaded for editing. Reload the page, and if it still does not appear, tell the site developer.</p>
        )}
      </div>
    </main>
  );
}
