import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AdminTextEditor, type TextEditorField } from "@/app/admin/text-editor";
import { TeachingDateLabel } from "@/app/teaching-date-label";
import { compareHandouts, type HandoutReviewFieldRow } from "@/lib/handout-revisions";
import { requireAdmin } from "@/lib/supabase/admin";
import { TrackedText } from "@/lib/tracked-text";
import { changeHandoutStructure, saveHandoutText } from "./actions";

export const metadata: Metadata = {
  title: "Edit Handout Text",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export default async function EditHandoutTextPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_PATTERN.test(id)) notFound();

  const { supabase } = await requireAdmin();
  const { data: handout } = await supabase
    .from("teaching_handouts")
    .select("id, title, gathering_date, content, original_content, source_file_name")
    .eq("id", id)
    .maybeSingle();
  if (!handout) notFound();

  const { data: fieldRows } = await supabase.rpc("handout_review_fields", { p_handout_id: id });
  const rows = (fieldRows ?? []) as HandoutReviewFieldRow[];
  const comparison = compareHandouts(handout.original_content, handout.content);

  const fields: TextEditorField[] = rows.map((row) => ({
    key: row.field_key,
    label: `${row.context} — ${row.label}`,
    value: row.current_value ?? "",
    rows: row.field_rows,
    maxLength: row.max_length,
    formatted: row.formatted,
    multiline: row.multiline,
  }));
  const labelFor = (key: string) => {
    const row = rows.find((candidate) => candidate.field_key === key);
    return row ? `${row.context} — ${row.label}` : key.replace(/^block_/, "Block ").replace(/_/g, " ");
  };

  return (
    <main className="admin-shell">
      <div className="mx-auto max-w-4xl">
        <Link href={`/admin/handouts/${id}`} className="text-sm font-extrabold text-[#946332] hover:text-[#a85e32]">Back to the handout</Link>
        <header className="mt-4 border-b border-[#284a3b]/10 pb-6">
          <p className="text-xs font-extrabold uppercase tracking-[0.18em] text-[#946332]">Edit text</p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-tight text-[#243d31] sm:text-4xl">{handout.title}</h1>
          <div className="mt-3"><TeachingDateLabel date={handout.gathering_date} /></div>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[#607066]">
            Edit the wording of this handout directly, for example to put right something that came in with an accepted change. Use **bold**, *italic* and [link text](https://address) the same way as in the review editors. Use Add below to insert a new paragraph (or bullet) after one, and Delete to remove one; both work on what is saved. They are not available while a Content Manager proposal on this handout is still open.
          </p>
        </header>

        <section className="mt-6 rounded-2xl border border-[#284a3b]/10 bg-[#fffdf8] p-5">
          <h2 className="text-lg font-extrabold text-[#243d31]">
            Changed since the uploaded Word document <span className="text-sm font-bold text-[#607066]">({comparison.differences.length})</span>
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#607066]">
            Compared with {handout.source_file_name ?? "the original upload"}. Red struck-through wording was in the document and is gone, and blue underlined wording is new. This panel is only for looking.
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

        {fields.length ? (
          <AdminTextEditor
            // A new key remounts the editor after a paragraph is added or removed, so it starts from the new text.
            key={fields.length + ":" + fields.reduce((hash, field) => (hash * 31 + field.key.length + field.value.length) % 1000003, 7)}
            action={saveHandoutText.bind(null, id)}
            fields={fields}
            unit="place"
            structureAction={changeHandoutStructure.bind(null, id)}
          />
        ) : (
          <p role="alert" className="mt-6 rounded-xl border border-[#a2472c]/30 bg-[#f7e6e1] px-4 py-3 text-sm font-bold text-[#a2472c]">The text of this handout could not be loaded for editing. Reload the page, and if it still does not appear, tell the site developer.</p>
        )}
      </div>
    </main>
  );
}
