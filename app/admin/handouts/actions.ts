"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin";
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
export type HandoutPreview = {
  fileName: string;
  suggestedDate: string | null;
  /** Set when the file name begins with a language other than English, which handouts do not support yet. */
  unsupportedLanguage: string | null;
  ok: boolean;
  errors: string[];
  warnings: string[];
  handout: ParsedHandout | null;
  /** What was found, so the Administrator can check the styles took. */
  counts: HandoutCounts | null;
};
export type HandoutPreviewState = { error?: string; preview?: HandoutPreview };
export type HandoutActionState = { error?: string; ok?: true; id?: string };

const DOCX_EXTENSION = /\.docx$/i;

function revalidateHandoutPaths() {
  revalidatePath("/admin/handouts");
  revalidatePath("/admin/cm/handout-review");
  revalidatePath("/admin/cm");
}

async function readHandoutFile(formData: FormData) {
  const file = formData.get("sourceDocument");
  if (!(file instanceof File) || !file.size) return { error: "Choose a Word (.docx) file." };
  if (!DOCX_EXTENSION.test(file.name)) return { error: "The handout must be a Word (.docx) file. In Word, use File > Save As > Word Document." };
  if (file.size > MAX_TEACHING_DOCX_BYTES) return { error: "The .docx file must be 8 MiB or smaller." };
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isDocxMagicBytes(buffer)) return { error: "This file is not a valid Word (.docx) document." };
  return { file, result: parseHandoutDocx(buffer) };
}

function countBlocks(handout: ParsedHandout | null): HandoutCounts | null {
  if (!handout) return null;
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

/** Step 1: convert the document and return a preview. Nothing is saved. */
export async function previewHandout(formData: FormData): Promise<HandoutPreviewState> {
  await requireAdmin();
  const read = await readHandoutFile(formData);
  if ("error" in read) return { error: read.error };
  const suggestion = suggestHandoutFromFileName(read.file.name);
  return {
    preview: {
      fileName: read.file.name,
      suggestedDate: suggestion.date,
      unsupportedLanguage: suggestion.unsupportedLanguage,
      ok: read.result.ok,
      errors: read.result.errors,
      warnings: read.result.warnings,
      handout: read.result.handout,
      counts: countBlocks(read.result.handout),
    },
  };
}

/**
 * Step 2: save after the Administrator approves the preview. The document is converted again here rather than
 * trusting anything the browser sends back. A handout is always a draft that Content Managers cannot see
 * until the Administrator sends it, and it is never published.
 */
export async function saveHandout(formData: FormData): Promise<HandoutActionState> {
  const { supabase } = await requireAdmin();
  const read = await readHandoutFile(formData);
  if ("error" in read) return { error: read.error };
  if (!read.result.ok || !read.result.handout) return { error: "This document still has problems. Fix them in Word and preview it again." };
  if (suggestHandoutFromFileName(read.file.name).unsupportedLanguage) return { error: "Only English handouts are supported for now." };

  const title = validateHandoutTitle(formData.get("title") || read.result.handout.title);
  if (title.error || !title.value) return { error: title.error ?? "Title is invalid." };
  const date = validateHandoutDate(formData.get("gatheringDate"));
  if (date.error || !date.value) return { error: date.error ?? "Choose the teaching date." };
  const teachingId = validateOptionalOutlineId(formData.get("teachingId"));
  if (teachingId.error) return { error: teachingId.error };

  const { data, error } = await supabase
    .from("teaching_handouts")
    .insert({
      teaching_id: teachingId.value,
      title: title.value,
      gathering_date: date.value,
      language: "en",
      status: "draft",
      content: read.result.handout.blocks,
      original_content: read.result.handout.blocks,
      source_file_name: read.file.name,
    })
    .select("id")
    .single();
  if (error || !data) return { error: "The handout could not be saved. Nothing was saved." };

  revalidateHandoutPaths();
  return { ok: true, id: data.id };
}

/** The teaching date a handout goes with can be put right at any time. */
export async function setHandoutDate(id: string, gatheringDate: string): Promise<HandoutActionState> {
  const { supabase } = await requireAdmin();
  const idResult = validateHandoutId(id);
  const date = validateHandoutDate(gatheringDate);
  if (idResult.error || !idResult.value) return { error: idResult.error };
  if (date.error || !date.value) return { error: date.error };

  const { data, error } = await supabase.from("teaching_handouts").update({ gathering_date: date.value }).eq("id", idResult.value).select("id");
  if (error) return { error: "The teaching date could not be changed." };
  if (!data?.length) return { error: "That handout could not be found." };

  revalidateHandoutPaths();
  revalidatePath(`/admin/handouts/${idResult.value}`);
  return { ok: true };
}

/** Links the handout to the teaching it goes with, or clears the link (empty id). */
export async function setHandoutTeaching(id: string, teachingId: string): Promise<HandoutActionState> {
  const { supabase } = await requireAdmin();
  const idResult = validateHandoutId(id);
  const teaching = validateOptionalOutlineId(teachingId);
  if (idResult.error || !idResult.value) return { error: idResult.error };
  if (teaching.error) return { error: teaching.error };

  const { data, error } = await supabase.from("teaching_handouts").update({ teaching_id: teaching.value }).eq("id", idResult.value).select("id");
  if (error) return { error: "The teaching could not be changed." };
  if (!data?.length) return { error: "That handout could not be found." };

  revalidateHandoutPaths();
  revalidatePath(`/admin/handouts/${idResult.value}`);
  revalidatePath("/admin/cm/reports");
  return { ok: true };
}

export async function deleteHandout(id: string): Promise<HandoutActionState> {
  const { supabase } = await requireAdmin();
  const idResult = validateHandoutId(id);
  if (idResult.error || !idResult.value) return { error: idResult.error };

  const { error } = await supabase.from("teaching_handouts").delete().eq("id", idResult.value);
  if (error) return { error: "The handout could not be deleted." };

  revalidateHandoutPaths();
  revalidatePath("/admin/teaching-revisions");
  return { ok: true };
}
