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
 * Saves the form on the "Create new handout" page: only now is a draft made, with the publication (English or Español),
 * title, teaching date, teaching and optional version name entered there. It then opens the handout's page, where the
 * Word draft is uploaded. Nothing is visible to Content Managers until it is sent.
 */
export async function createHandout(formData: FormData) {
  const { supabase } = await requireAdmin();
  const fail = (code: string) => redirect(`/admin/handouts/new?error=${code}`);
  const language = formData.get("language") === "es" ? "es" : "en";
  const title = validateHandoutTitle(formData.get("title"));
  if (title.error || !title.value) return fail("title");
  const date = validateHandoutDate(formData.get("gatheringDate"));
  if (date.error || !date.value) return fail("date");
  const teaching = validateOptionalOutlineId(formData.get("teachingId"));
  if (teaching.error) return fail("teaching");
  const version = validateVersionLabel(formData.get("versionLabel"));
  if (version.error) return fail("version");

  const { data, error } = await supabase
    .from("teaching_handouts")
    .insert({
      title: title.value,
      gathering_date: date.value,
      teaching_id: teaching.value ?? (await teachingForDate(supabase, date.value)),
      language,
      status: "draft",
      version_label: version.value,
      content: [],
      original_content: [],
    })
    .select("id")
    .single();
  if (error || !data) return fail("create");
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
/** The name of a version ("Honduras", "US"): optional, at most 60 characters. Empty means an ordinary handout. */
function validateVersionLabel(value: unknown): { value: string | null; error?: undefined } | { error: string; value?: undefined } {
  const text = typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
  if (!text) return { value: null };
  if (text.length > 60) return { error: "The version name must be 60 characters or fewer." };
  return { value: text };
}

/**
 * Makes another version of a handout: a new draft that starts as a copy of the one it is made from (its text, language and
 * footer) with its own title, date, teaching and version name, so each version is edited, built and published on its own,
 * each with its own final PDF. It is not a second translation: it never takes over the original's translation link.
 */
export async function createHandoutVersion(formData: FormData) {
  const { supabase } = await requireAdmin();
  const fail = (code: string) => redirect(`/admin/handouts/version?error=${code}`);
  const baseId = validateHandoutId(String(formData.get("fromId") ?? ""));
  if (baseId.error || !baseId.value) return fail("base");
  const version = validateVersionLabel(formData.get("versionLabel"));
  if (version.error || !version.value) return fail("version");
  const title = validateHandoutTitle(formData.get("title"));
  if (title.error || !title.value) return fail("title");
  const date = validateHandoutDate(formData.get("gatheringDate"));
  if (date.error || !date.value) return fail("date");
  const teaching = validateOptionalOutlineId(formData.get("teachingId"));
  if (teaching.error) return fail("teaching");

  const { data: base } = await supabase
    .from("teaching_handouts")
    .select("id, language, footer_id, content, original_content, source_file_name, teaching_id, version_of")
    .eq("id", baseId.value)
    .maybeSingle();
  if (!base) return fail("base");

  const { data, error } = await supabase
    .from("teaching_handouts")
    .insert({
      title: title.value,
      gathering_date: date.value,
      teaching_id: teaching.value ?? base.teaching_id ?? (await teachingForDate(supabase, date.value)),
      language: base.language,
      status: "draft",
      content: base.content,
      original_content: base.original_content,
      source_file_name: base.source_file_name,
      footer_id: base.footer_id,
      version_label: version.value,
      version_of: base.version_of ?? base.id,
    })
    .select("id")
    .single();
  if (error || !data) return fail("create");
  revalidateHandoutPaths();
  redirect(`/admin/handouts/${data.id}?created=1&version=1`);
}

/**
 * The English teaching of a gathering date, when there is exactly one, so a handout is linked to its teaching without
 * the Administrator having to pick it. More than one, or none, leaves the choice to the Administrator.
 */
async function teachingForDate(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], date: string | null | undefined) {
  if (!date) return null;
  const { data } = await supabase.from("teachings").select("id").eq("language", "en").eq("gathering_date", date).neq("status", "archived").limit(2);
  return data?.length === 1 ? (data[0].id as string) : null;
}

export async function saveHandoutDetails(id: string, title: string, gatheringDate: string, teachingId: string, versionLabel = ""): Promise<HandoutActionState> {
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

  const version = validateVersionLabel(versionLabel);
  if (version.error) return { error: version.error };

  // No teaching chosen: link the one teaching of that date, if there is exactly one.
  const teachingToSave = teaching.value ?? (await teachingForDate(supabase, dateResult.value));

  const { data, error } = await supabase
    .from("teaching_handouts")
    .update({ title: titleResult.value, gathering_date: dateResult.value ?? null, teaching_id: teachingToSave, version_label: version.value })
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
 * Changes only the title and the version name. Allowed on a published handout too, so a typo does not need an unpublish
 * (which removes the PDF from the library). The library entry's title follows; the date, the text and the PDF file itself
 * are never touched.
 */
export async function saveHandoutNames(id: string, title: string, versionLabel: string): Promise<HandoutActionState> {
  const { supabase } = await requireAdmin();
  const idResult = validateHandoutId(id);
  if (idResult.error || !idResult.value) return { error: idResult.error };
  const titleResult = validateHandoutTitle(title);
  if (titleResult.error || !titleResult.value) return { error: titleResult.error };
  const version = validateVersionLabel(versionLabel);
  if (version.error) return { error: version.error };

  const { data, error } = await supabase
    .from("teaching_handouts")
    .update({ title: titleResult.value, version_label: version.value })
    .eq("id", idResult.value)
    .select("id, printable_pdf_id");
  if (error) return { error: "The title and version name could not be saved." };
  if (!data?.length) return { error: "That handout could not be found." };

  const pdfId = data[0].printable_pdf_id as string | null;
  if (pdfId) {
    const { error: linkError } = await supabase.from("printable_pdf_links").update({ title: titleResult.value }).eq("id", pdfId);
    if (linkError) return { error: "The handout was saved, but its title in the PDF library could not be updated. Try again." };
    revalidatePublicPdfPaths();
  }

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
    .select("id, title, gathering_date, status, sent_for_review_at, language, teaching_id")
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

  // With a date and no teaching yet, link the one teaching of that date.
  if (!handout.teaching_id) {
    const linked = await teachingForDate(supabase, (update.gathering_date as string | undefined) ?? handout.gathering_date);
    if (linked) update.teaching_id = linked;
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
    .insert({ title: handout.title, storage_path: storagePath, language: handout.language === "es" ? "es" : "en", gathering_date: handout.gathering_date })
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
