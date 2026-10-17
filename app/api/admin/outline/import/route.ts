import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { compareOutlineStructure, listOutlineChanges, mergeAdjacentLists, readOutlineMarker } from "@/lib/outline-docx";
import { createClient } from "@/lib/supabase/server";
import { MAX_TEACHING_DOCX_BYTES } from "@/lib/teaching-docx-package";
import { isDocxMagicBytes, parseOutlineDocx, validateOutlineId, type OutlineBlock } from "@/lib/teaching-outlines";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const refuse = (error: string, problems: string[] = [], status = 422) => NextResponse.json({ ok: false, error, problems }, { status });

// "Import edited Word file": replaces a draft outline's text with an edited copy of the file exported from it.
//
//   mode=check  reads and checks the file and says what would change. Nothing is saved.
//   mode=apply  runs every check again, then replaces the text in one database call.
//
// Every check happens before anything is written, and the database function checks the essentials again. The file must have
// been exported from this outline, the outline must not have changed since, and the structure must be identical: the same
// blocks in the same order, the same heading levels, list items and levels, and table shapes. Only wording, bold, italic and
// links may differ. Administrator only.
export async function POST(request: Request) {
  const supabase = await createClient();
  const { data: isAdmin } = await supabase.rpc("is_authenticated_admin");
  if (!isAdmin) return NextResponse.json({ ok: false, error: "Unauthorized." }, { status: 401 });

  const form = await request.formData().catch(() => null);
  if (!form) return refuse("The upload could not be read.", [], 400);
  const id = validateOutlineId(form.get("id"));
  const apply = form.get("mode") === "apply";
  const file = form.get("file");
  if (!id.value) return refuse("A valid outline id is required.", [], 400);
  if (!(file instanceof File) || !file.name.toLowerCase().endsWith(".docx")) return refuse("Choose the Word (.docx) file that was exported from this outline.", [], 400);
  if (file.size > MAX_TEACHING_DOCX_BYTES) return refuse("The file must be 8 MiB or smaller.", [], 400);
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isDocxMagicBytes(buffer)) return refuse("That file is not a Word (.docx) document.", [], 400);

  const { data: outline } = await supabase.from("teaching_outlines").select("id, title, subtitle, status, content").eq("id", id.value).maybeSingle();
  if (!outline) return refuse("Outline not found.", [], 404);
  if (outline.status !== "draft") return refuse("Only a draft outline can be replaced. Unpublish it first.");

  // 1. It must be the file exported from this outline.
  const marker = readOutlineMarker(buffer);
  if (!marker) return refuse("This file was not exported from an outline here (or Word removed its Tags property). Use Export for editing, edit that file, and import it again.");
  if (marker.outlineId !== outline.id.toLowerCase()) return refuse("This file was exported from a different outline, so it was not imported.");

  // 2. The outline must not have changed since the export.
  const { data: hash } = await supabase.rpc("outline_content_hash", { p_outline_id: outline.id });
  if (hash !== marker.hash) return refuse("The outline has changed since this file was exported (it was edited here, or a change was accepted). Export it again so nothing made since then is overwritten.");

  // 3. The document must read cleanly.
  const parsed = parseOutlineDocx(buffer, file.name);
  if (!parsed.ok || !parsed.outline) return refuse("The document could not be read.", parsed.errors);
  if (parsed.warnings.some((warning) => /tracked changes/i.test(warning))) return refuse("The document has tracked changes. Accept or reject them in Word, save, and import again.");
  if (parsed.warnings.some((warning) => /no Title-style paragraph/i.test(warning))) return refuse("The Title line at the top of the document was removed or restyled. Put it back and import again.");
  const incoming = parsed.outline;
  if (Boolean(incoming.subtitle) !== Boolean(outline.subtitle)) {
    return refuse(outline.subtitle ? "The Subtitle line under the title was removed or restyled. Put it back and import again." : "The document has a Subtitle line the outline does not. Remove it and import again.");
  }

  // 4. The structure must be identical.
  const current = (Array.isArray(outline.content) ? outline.content : []) as OutlineBlock[];
  const problems = compareOutlineStructure(current, incoming.blocks);
  if (problems.length) return refuse("The document's structure does not match the outline, so nothing was imported.", problems);

  const changes = listOutlineChanges(current, incoming.blocks);
  const titleChanged = incoming.title !== outline.title;
  const subtitleChanged = (incoming.subtitle ?? null) !== (outline.subtitle ?? null);
  const summary = {
    changeCount: changes.length + (titleChanged ? 1 : 0) + (subtitleChanged ? 1 : 0),
    changes: changes.slice(0, 12),
    moreChanges: Math.max(0, changes.length - 12),
    titleChanged,
    subtitleChanged,
    warnings: parsed.warnings,
  };
  if (!apply) return NextResponse.json({ ok: true, mode: "check", ...summary });
  if (summary.changeCount === 0) return NextResponse.json({ ok: true, mode: "apply", ...summary, applied: false });

  // 5. Replace the text. The database checks again that this is a draft with no open proposals and that the fingerprint matches.
  const { error } = await supabase.rpc("admin_import_outline", {
    p_outline_id: outline.id,
    p_expected_hash: marker.hash,
    p_title: incoming.title,
    p_subtitle: incoming.subtitle,
    p_content: mergeAdjacentLists(incoming.blocks),
  });
  if (error) return refuse(error.message);

  revalidatePath("/admin/outlines");
  revalidatePath(`/admin/outlines/${outline.id}`);
  revalidatePath(`/admin/outlines/${outline.id}/edit-text`);
  return NextResponse.json({ ok: true, mode: "apply", ...summary, applied: true });
}
