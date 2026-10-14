"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin";
import { PRINTABLE_PDF_BUCKET, isValidPrintablePdfStoragePath } from "@/lib/printable-pdf-links";
import { verifyUploadedPdf } from "@/lib/printable-pdf-verify";
import { MAX_TEACHING_DOCX_BYTES } from "@/lib/teaching-docx-package";
import {
  isDocxMagicBytes,
  parseHandoutDocx,
  suggestHandoutFromFileName,
  validateHandoutDate,
  validateHandoutId,
  validateHandoutTitle,
  type ParsedHandout,
} from "@/lib/teaching-handouts";
import { validateOptionalOutlineId } from "@/lib/teaching-outlines";

export type HandoutCounts = { sections: number; subtitles: number; paragraphTitles: number; paragraphs: number; bullets: number; taglines: number };
export type HandoutActionState = { error?: string; ok?: true };
export type HandoutDraftState = {
  error?: string;
  ok?: true;
  fileName?: string;
  warnings?: string[];
  counts?: HandoutCounts;
  /** What the upload filled in because it was still empty, so the Administrator knows to check it. */
  filled?: { title?: string; date?: string };
};

const DOCX_EXTENSION = /\.docx$/i;
const UNTITLED = "Untitled handout";

type AdminSupabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

function revalidateHandoutPaths(id?: string) {
  revalidatePath("/admin/handouts");
  revalidatePath("/admin/cm/handout-review");
  revalidatePath("/admin/cm");
  revalidatePath("/admin/cm/reports");
  revalidatePath("/admin/teaching-revisions");
  if (id) {
    revalidatePath(`/admin/handouts/${id}`);
    revalidatePath(`/admin/handouts/${id}/edit-text`);
    revalidatePath(`/admin/handouts/${id}/final`);
  }
}

function revalidatePublicPdfPaths() {
  revalidatePath("/admin");
  revalidatePath("/admin/printable-pdfs");
  revalidatePath("/pdf");
  revalidatePath("/espanol/materiales-para-imprimir");
}

function countBlocks(handout: ParsedHandout): HandoutCounts {
  const counts: HandoutCounts = { sections: 0, subtitles: 0, paragraphTitles: 0, paragraphs: 0, bullets: 0, taglines: 0 };
  for (const block of handout.blocks) {
    if (block.type === "section_title") counts.sections += 1;
    else if (block.type === "subtitle") counts.subtitles += 1;
    else if (block.type === "paragraph_title") counts.paragraphTitles += 1;
    else if (block.type === "paragraph") counts.paragraphs += 1;
    else if (block.type === "tagline") counts.taglines += 1;
    else if (block.type === "list") counts.bullets += block.items.length;
  }
  return counts;
}

/** A proposal a Content Manager has started or submitted and the Administrator has not finished with. */
async function hasOpenProposals(supabase: AdminSupabase, id: string) {
  const { count } = await supabase
    .from("content_revisions")
    .select("id", { count: "exact", head: true })
    .eq("subject_type", "handout")
    .eq("handout_id", id)
    .in("status", ["draft", "submitted"]);
  return (count ?? 0) > 0;
}

/**
 * "Create new handout": makes a blank draft and opens its page, where the title, teaching date and teaching
 * are entered and the Word draft is uploaded. Nothing is visible to Content Managers until it is sent.
 */
export async function createHandout(formData: FormData) {
  const { supabase } = await requireAdmin();
  const language = formData.get("language") === "es" ? "es" : "en";
  const { data, error } = await supabase
    .from("teaching_handouts")
    .insert({ title: UNTITLED, language, status: "draft", content: [], original_content: [] })
    .select("id")
    .single();
  if (error || !data) redirect("/admin/handouts?error=create");
  revalidateHandoutPaths();
  redirect(`/admin/handouts/${data.id}?created=1`);
}

/**
 * The footer printed at the bottom of the handout: the small credits block, chosen from the existing footers. An
 * Español handout uses an Español footer, which is written for it and is not a translation of the English one.
 */
export async function setHandoutFooter(id: string, footerId: string): Promise<HandoutActionState> {
  const { supabase } = await requireAdmin();
  const idResult = validateHandoutId(id);
  if (idResult.error || !idResult.value) return { error: idResult.error };
  const footer = validateOptionalOutlineId(footerId);
  if (footer.error) return { error: "That footer could not be found." };

  const { data: handout } = await supabase.from("teaching_handouts").select("id, language").eq("id", idResult.value).maybeSingle();
  if (!handout) return { error: "That handout could not be found." };
  if (footer.value) {
    const { data: row } = await supabase.from("content_footers").select("id, language, status").eq("id", footer.value).maybeSingle();
    if (!row || row.status !== "active") return { error: "That footer is no longer available. Choose another." };
    if (row.language !== handout.language) return { error: handout.language === "es" ? "Choose an Español footer for an Español handout." : "Choose an English footer for an English handout." };
  }

  const { error } = await supabase.from("teaching_handouts").update({ footer_id: footer.value }).eq("id", idResult.value);
  if (error) return { error: "The footer could not be saved." };

  revalidatePath(`/admin/handouts/${idResult.value}`);
  return { ok: true };
}

/** The title, the date of the teaching the handout goes with, and the teaching itself. */
export async function saveHandoutDetails(id: string, title: string, gatheringDate: string, teachingId: string): Promise<HandoutActionState> {
  const { supabase } = await requireAdmin();
  const idResult = validateHandoutId(id);
  if (idResult.error || !idResult.value) return { error: idResult.error };
  const titleResult = validateHandoutTitle(title);
  if (titleResult.error || !titleResult.value) return { error: titleResult.error };
  const trimmedDate = gatheringDate.trim();
  const dateResult = trimmedDate ? validateHandoutDate(trimmedDate) : { value: null };
  if ("error" in dateResult && dateResult.error) return { error: dateResult.error };
  const teaching = validateOptionalOutlineId(teachingId);
  if (teaching.error) return { error: teaching.error };

  const { data, error } = await supabase
    .from("teaching_handouts")
    .update({ title: titleResult.value, gathering_date: dateResult.value ?? null, teaching_id: teaching.value })
    .eq("id", idResult.value)
    .select("id");
  if (error) {
    // The only constraint a blank date can trip is "sent for review needs a date".
    return { error: error.code === "23514" ? "The teaching date cannot be removed while the handout is with the Content Managers or published." : "The details could not be saved." };
  }
  if (!data?.length) return { error: "That handout could not be found." };

  revalidateHandoutPaths(idResult.value);
  return { ok: true };
}

/**
 * Reads the Word draft and stores its text as the handout. It replaces whatever text was there, so it is
 * refused once the handout is published, with the Content Managers, or has an open proposal: their
 * proposals point at places in the old text.
 */
export async function uploadHandoutDraft(id: string, formData: FormData): Promise<HandoutDraftState> {
  const { supabase } = await requireAdmin();
  const idResult = validateHandoutId(id);
  if (idResult.error || !idResult.value) return { error: idResult.error };

  const { data: handout } = await supabase
    .from("teaching_handouts")
    .select("id, title, gathering_date, status, sent_for_review_at, language")
    .eq("id", idResult.value)
    .maybeSingle();
  if (!handout) return { error: "That handout could not be found." };
  if (handout.status !== "draft") return { error: "This handout is published. Unpublish it first to replace its draft." };
  if (handout.sent_for_review_at) return { error: "This handout is with the Content Managers. Take it back from review first to replace its draft." };
  if (await hasOpenProposals(supabase, idResult.value)) return { error: "A Content Manager proposal on this handout is still open. Decide or close it on the Revisions page first." };

  const file = formData.get("sourceDocument");
  if (!(file instanceof File) || !file.size) return { error: "Choose a Word (.docx) file." };
  if (!DOCX_EXTENSION.test(file.name)) return { error: "The draft must be a Word (.docx) file. In Word, use File > Save As > Word Document." };
  if (file.size > MAX_TEACHING_DOCX_BYTES) return { error: "The .docx file must be 8 MiB or smaller." };
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isDocxMagicBytes(buffer)) return { error: "This file is not a valid Word (.docx) document." };

  const suggestion = suggestHandoutFromFileName(file.name);
  if (suggestion.unsupportedLanguage) return { error: `The file name starts with "${suggestion.unsupportedLanguage}_". Handouts are English (en_) or Español (es_).` };
  if (suggestion.language && suggestion.language !== handout.language) {
    return { error: handout.language === "es" ? "This is an Español handout, so the file name should start with es_." : "This is an English handout, so the file name should start with en_." };
  }

  const result = parseHandoutDocx(buffer);
  if (!result.ok || !result.handout) {
    return { error: result.errors.join(" ") || "This document could not be read.", warnings: result.warnings };
  }

  // Fill in what is still empty from the file, so the Administrator has less to type. Anything already
  // entered is left alone.
  const update: Record<string, unknown> = { content: result.handout.blocks, original_content: result.handout.blocks, source_file_name: file.name };
  const filled: { title?: string; date?: string } = {};
  if ((!handout.title || handout.title === UNTITLED) && result.handout.title) {
    update.title = result.handout.title.slice(0, 200);
    filled.title = update.title as string;
  }
  if (!handout.gathering_date && suggestion.date) {
    update.gathering_date = suggestion.date;
    filled.date = suggestion.date;
  }

  const { error } = await supabase.from("teaching_handouts").update(update).eq("id", idResult.value);
  if (error) return { error: "The draft could not be saved. Nothing was changed." };

  revalidateHandoutPaths(idResult.value);
  return { ok: true, fileName: file.name, warnings: result.warnings, counts: countBlocks(result.handout), filled };
}

/**
 * Publishing a handout is adding its final PDF to Printable PDF Links, where the public PDF library shows
 * it. The browser has already uploaded the file straight to storage (the same signed upload the Printable
 * PDF Links page uses); this checks it is a real PDF, adds the link, and marks the handout published. If
 * anything fails the uploaded file is removed again.
 */
export async function publishHandout(id: string, storagePath: string): Promise<HandoutActionState> {
  const { supabase } = await requireAdmin();
  const idResult = validateHandoutId(id);
  if (idResult.error || !idResult.value) return { error: idResult.error };
  if (!isValidPrintablePdfStoragePath(storagePath)) return { error: "A PDF file is required." };

  const discard = () => supabase.storage.from(PRINTABLE_PDF_BUCKET).remove([storagePath]);

  const { data: handout } = await supabase
    .from("teaching_handouts")
    .select("id, title, gathering_date, status, language")
    .eq("id", idResult.value)
    .maybeSingle();
  if (!handout) {
    await discard();
    return { error: "That handout could not be found." };
  }
  if (handout.status !== "draft") {
    await discard();
    return { error: "This handout is already published." };
  }
  if (!handout.gathering_date || !handout.title || handout.title === UNTITLED) {
    await discard();
    return { error: "Enter the title and the teaching date, and save them, before publishing." };
  }
  if (!(await verifyUploadedPdf(supabase, storagePath))) {
    await discard();
    return { error: "The uploaded file is not a valid PDF." };
  }

  const { data: link, error: linkError } = await supabase
    .from("printable_pdf_links")
    .insert({ title: handout.title, storage_path: storagePath, language: handout.language === "es" ? "es" : "en" })
    .select("id")
    .single();
  if (linkError || !link) {
    await discard();
    return { error: "The PDF could not be added to Printable PDF Links. Nothing was published." };
  }

  const { error: publishError } = await supabase
    .from("teaching_handouts")
    .update({ status: "published", published_at: new Date().toISOString(), printable_pdf_id: link.id })
    .eq("id", idResult.value)
    .eq("status", "draft");
  if (publishError) {
    // Take the link back out so the library never shows a handout that is not marked published.
    await supabase.from("printable_pdf_links").delete().eq("id", link.id);
    await discard();
    return { error: "The handout could not be published. Nothing was changed." };
  }

  revalidateHandoutPaths(idResult.value);
  revalidatePublicPdfPaths();
  return { ok: true };
}

/** Takes the handout out of the public PDF library and back to a draft. The published PDF file is deleted. */
export async function unpublishHandout(id: string): Promise<HandoutActionState> {
  const { supabase } = await requireAdmin();
  const idResult = validateHandoutId(id);
  if (idResult.error || !idResult.value) return { error: idResult.error };

  const { data: handout } = await supabase.from("teaching_handouts").select("id, status, printable_pdf_id").eq("id", idResult.value).maybeSingle();
  if (!handout) return { error: "That handout could not be found." };
  if (handout.status !== "published" || !handout.printable_pdf_id) return { error: "This handout is not published." };

  const { data: link } = await supabase.from("printable_pdf_links").select("storage_path").eq("id", handout.printable_pdf_id).maybeSingle();

  // Deleting the link is what takes the handout back to a draft (a database trigger does that part).
  const { error } = await supabase.from("printable_pdf_links").delete().eq("id", handout.printable_pdf_id);
  if (error) return { error: "The handout could not be unpublished." };
  if (link?.storage_path) await supabase.storage.from(PRINTABLE_PDF_BUCKET).remove([link.storage_path]);

  revalidateHandoutPaths(idResult.value);
  revalidatePublicPdfPaths();
  return { ok: true };
}

export async function deleteHandout(id: string): Promise<HandoutActionState> {
  const { supabase } = await requireAdmin();
  const idResult = validateHandoutId(id);
  if (idResult.error || !idResult.value) return { error: idResult.error };

  const { data: handout } = await supabase.from("teaching_handouts").select("status").eq("id", idResult.value).maybeSingle();
  if (handout?.status === "published") return { error: "This handout is published. Unpublish it first, then delete it." };

  const { error } = await supabase.from("teaching_handouts").delete().eq("id", idResult.value);
  if (error) return { error: "The handout could not be deleted." };

  revalidateHandoutPaths();
  return { ok: true };
}
