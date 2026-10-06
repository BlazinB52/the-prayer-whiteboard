"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin";
import { MAX_TEACHING_DOCX_BYTES } from "@/lib/teaching-docx-package";
import {
  OUTLINE_BUCKET,
  isDocxMagicBytes,
  outlineSlug,
  outlineStoragePath,
  parseOutlineDocx,
  suggestOutlineDate,
  validateGatheringDate,
  validateOutlineCategoryName,
  validateOutlineId,
  validateOutlineLanguage,
  validateOutlineTitle,
  type ParsedOutline,
} from "@/lib/teaching-outlines";

export type OutlinePreview = {
  fileName: string;
  suggestedDate: string | null;
  ok: boolean;
  errors: string[];
  warnings: string[];
  outline: ParsedOutline | null;
};
export type OutlinePreviewState = { error?: string; preview?: OutlinePreview };
export type OutlineActionState = { error?: string; ok?: true };

const DOCX_EXTENSION = /\.docx$/i;

function revalidateOutlinePaths() {
  revalidatePath("/admin/outlines");
}

/** Reads the uploaded file and converts it. The file is only held in memory for the request. */
async function readOutlineFile(formData: FormData) {
  const file = formData.get("sourceDocument");
  if (!(file instanceof File) || !file.size) return { error: "Choose a Word (.docx) file." };
  if (!DOCX_EXTENSION.test(file.name)) return { error: "The outline must be a Word (.docx) file. In Word, use File > Save As > Word Document." };
  if (file.size > MAX_TEACHING_DOCX_BYTES) return { error: "The .docx file must be 8 MiB or smaller." };

  const buffer = Buffer.from(await file.arrayBuffer());
  if (!isDocxMagicBytes(buffer)) return { error: "This file is not a valid Word (.docx) document." };
  return { file, buffer, result: parseOutlineDocx(buffer, file.name) };
}

/** Step 1: convert the document and return a preview. Nothing is saved. */
export async function previewOutline(formData: FormData): Promise<OutlinePreviewState> {
  await requireAdmin();
  const read = await readOutlineFile(formData);
  if ("error" in read) return { error: read.error };

  return {
    preview: {
      fileName: read.file.name,
      suggestedDate: suggestOutlineDate(read.file.name),
      ok: read.result.ok,
      errors: read.result.errors,
      warnings: read.result.warnings,
      outline: read.result.outline,
    },
  };
}

/**
 * Step 2: save after the admin approves the preview. The document is converted
 * again here rather than trusting anything the browser sends back. The original
 * .docx is stored first and removed again if the row cannot be saved.
 */
export async function saveOutline(formData: FormData): Promise<OutlineActionState> {
  const { supabase } = await requireAdmin();
  const read = await readOutlineFile(formData);
  if ("error" in read) return { error: read.error };
  if (!read.result.ok || !read.result.outline) return { error: "This document still has problems. Fix them in Word and preview it again." };

  const title = validateOutlineTitle(formData.get("title") || read.result.outline.title);
  if (title.error || !title.value) return { error: title.error ?? "Title is invalid." };
  const date = validateGatheringDate(formData.get("gatheringDate"));
  if (date.error) return { error: date.error };
  const categoryId = validateOutlineId(formData.get("categoryId"));
  if (categoryId.error || !categoryId.value) return { error: "Choose a category." };
  const publish = formData.get("publish") === "on";

  const { data: category } = await supabase.from("outline_categories").select("id").eq("id", categoryId.value).maybeSingle();
  if (!category) return { error: "That category no longer exists. Choose another." };

  const storagePath = outlineStoragePath(crypto.randomUUID());
  const upload = await supabase.storage.from(OUTLINE_BUCKET).upload(storagePath, read.buffer, {
    contentType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    cacheControl: "public, max-age=31536000, immutable",
  });
  if (upload.error) return { error: "The Word file could not be stored. Nothing was saved." };

  const baseSlug = outlineSlug(title.value);
  let saved = false;
  for (let suffix = 0; suffix <= 99 && !saved; suffix += 1) {
    const { error } = await supabase.from("teaching_outlines").insert({
      slug: suffix === 0 ? baseSlug : `${baseSlug}-${suffix}`,
      title: title.value,
      subtitle: read.result.outline.subtitle,
      category_id: categoryId.value,
      language: validateOutlineLanguage(formData.get("language")),
      gathering_date: date.value,
      status: publish ? "published" : "draft",
      published_at: publish ? new Date().toISOString() : null,
      content: read.result.outline.blocks,
      source_path: storagePath,
      source_file_name: read.file.name,
    });
    if (!error) saved = true;
    else if (error.code !== "23505") break;
  }

  if (!saved) {
    await supabase.storage.from(OUTLINE_BUCKET).remove([storagePath]);
    return { error: "The outline could not be saved. Nothing was saved." };
  }

  revalidateOutlinePaths();
  return { ok: true };
}

export async function setOutlineStatus(id: string, status: "draft" | "published"): Promise<OutlineActionState> {
  const { supabase } = await requireAdmin();
  const idResult = validateOutlineId(id);
  if (idResult.error || !idResult.value) return { error: idResult.error };

  const { error } = await supabase
    .from("teaching_outlines")
    .update(status === "published" ? { status, published_at: new Date().toISOString() } : { status, published_at: null })
    .eq("id", idResult.value);
  if (error) return { error: "The outline status could not be changed." };

  revalidateOutlinePaths();
  return { ok: true };
}

export async function moveOutlineToCategory(id: string, categoryId: string): Promise<OutlineActionState> {
  const { supabase } = await requireAdmin();
  const idResult = validateOutlineId(id);
  const categoryResult = validateOutlineId(categoryId);
  if (idResult.error || !idResult.value || categoryResult.error || !categoryResult.value) return { error: "That record could not be found." };

  const { error } = await supabase.from("teaching_outlines").update({ category_id: categoryResult.value }).eq("id", idResult.value);
  if (error) return { error: "The category could not be changed." };

  revalidateOutlinePaths();
  return { ok: true };
}

export async function deleteOutline(id: string): Promise<OutlineActionState> {
  const { supabase } = await requireAdmin();
  const idResult = validateOutlineId(id);
  if (idResult.error || !idResult.value) return { error: idResult.error };

  const { data: existing } = await supabase.from("teaching_outlines").select("source_path").eq("id", idResult.value).maybeSingle();
  const { error } = await supabase.from("teaching_outlines").delete().eq("id", idResult.value);
  if (error) return { error: "The outline could not be deleted." };
  if (existing?.source_path) await supabase.storage.from(OUTLINE_BUCKET).remove([existing.source_path]);

  revalidateOutlinePaths();
  return { ok: true };
}

export async function createOutlineCategory(name: string): Promise<OutlineActionState> {
  const { supabase } = await requireAdmin();
  const nameResult = validateOutlineCategoryName(name);
  if (nameResult.error || !nameResult.value) return { error: nameResult.error };

  const { data: last } = await supabase.from("outline_categories").select("sort_order").order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const baseSlug = outlineSlug(nameResult.value);

  for (let suffix = 0; suffix <= 99; suffix += 1) {
    const { error } = await supabase.from("outline_categories").insert({
      name: nameResult.value,
      slug: suffix === 0 ? baseSlug : `${baseSlug}-${suffix}`,
      sort_order: (last?.sort_order ?? 0) + 1,
    });
    if (!error) {
      revalidateOutlinePaths();
      return { ok: true };
    }
    if (error.code !== "23505") return { error: "The category could not be created." };
    // A name collision is the only unique violation worth surfacing; a slug collision just retries.
    const { data: sameName } = await supabase.from("outline_categories").select("id").ilike("name", nameResult.value).maybeSingle();
    if (sameName) return { error: "A category with that name already exists." };
  }
  return { error: "The category could not be created." };
}

export async function renameOutlineCategory(id: string, name: string): Promise<OutlineActionState> {
  const { supabase } = await requireAdmin();
  const idResult = validateOutlineId(id);
  const nameResult = validateOutlineCategoryName(name);
  if (idResult.error || !idResult.value) return { error: idResult.error };
  if (nameResult.error || !nameResult.value) return { error: nameResult.error };

  const { error } = await supabase.from("outline_categories").update({ name: nameResult.value }).eq("id", idResult.value);
  if (error) return { error: error.code === "23505" ? "A category with that name already exists." : "The category could not be renamed." };

  revalidateOutlinePaths();
  return { ok: true };
}

export async function deleteOutlineCategory(id: string): Promise<OutlineActionState> {
  const { supabase } = await requireAdmin();
  const idResult = validateOutlineId(id);
  if (idResult.error || !idResult.value) return { error: idResult.error };

  const { error } = await supabase.from("outline_categories").delete().eq("id", idResult.value);
  if (error) {
    return { error: error.code === "23503" ? "This category still has outlines. Move or delete them first." : "The category could not be deleted." };
  }

  revalidateOutlinePaths();
  return { ok: true };
}
