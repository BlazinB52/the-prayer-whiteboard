"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin";
import {
  parseTeachingDocx,
  suggestGatheringDate,
  toSectionContent,
  type ImportedTeaching,
} from "@/lib/teaching-docx-import";
import { MAX_TEACHING_DOCX_BYTES } from "@/lib/teaching-docx-package";

export type TeachingImportPreview = {
  fileName: string;
  suggestedDate: string | null;
  ok: boolean;
  errors: string[];
  warnings: string[];
  teaching: ImportedTeaching | null;
};
export type TeachingImportPreviewState = { error?: string; preview?: TeachingImportPreview };
export type TeachingImportCreateState = { error?: string };

const DOCX_EXTENSION = /\.docx$/i;

function slugify(value: string, fallback: string) {
  const slug = value
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80)
    .replace(/-+$/, "");

  return slug || fallback;
}

/** Reads and parses the uploaded document. The file is held only in memory for this request. */
async function readImportFile(formData: FormData) {
  const file = formData.get("sourceDocument");
  if (!(file instanceof File) || !file.size) return { error: "Choose a .docx teaching document." };
  if (!DOCX_EXTENSION.test(file.name)) return { error: "The teaching document must be a .docx file." };
  if (file.size > MAX_TEACHING_DOCX_BYTES) return { error: "The .docx file must be 8 MiB or smaller." };

  const result = parseTeachingDocx(Buffer.from(await file.arrayBuffer()));
  return { fileName: file.name, result };
}

function readGatheringDate(formData: FormData) {
  const value = String(formData.get("gatheringDate") ?? "").trim();
  if (!value) return { value: null };
  const parsed = new Date(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) {
    return { error: "Gathering date must be a valid date." };
  }
  return { value };
}

/** Step 1: validate the whole document and return a preview. Nothing is saved. */
export async function previewTeachingImport(formData: FormData): Promise<TeachingImportPreviewState> {
  await requireAdmin();
  const file = await readImportFile(formData);
  if ("error" in file) return { error: file.error };

  return {
    preview: {
      fileName: file.fileName,
      suggestedDate: suggestGatheringDate(file.fileName),
      ok: file.result.ok,
      errors: file.result.errors,
      warnings: file.result.warnings,
      teaching: file.result.teaching,
    },
  };
}

/**
 * Step 2: create the draft after the administrator approves the preview. The
 * document is parsed again here rather than trusting anything the browser sends
 * back. Rows go into the existing teachings, teaching_categories and
 * teaching_sections tables; if any step fails the new teaching is deleted (its
 * categories and sections cascade with it) so no partial draft is left behind.
 */
export async function createTeachingFromImport(formData: FormData): Promise<TeachingImportCreateState> {
  const { supabase } = await requireAdmin();
  const file = await readImportFile(formData);
  if ("error" in file) return { error: file.error };
  if (!file.result.ok || !file.result.teaching) return { error: "This document still has errors. Fix them in Word and preview it again." };
  const gatheringDate = readGatheringDate(formData);
  if (gatheringDate.error) return { error: gatheringDate.error };

  const teaching = file.result.teaching;
  const baseSlug = slugify(teaching.title, "teaching");
  let teachingId: string | null = null;

  for (let suffix = 0; suffix <= 99 && !teachingId; suffix += 1) {
    const { data, error } = await supabase
      .from("teachings")
      .insert({
        title: teaching.title,
        central_theme: teaching.centralTheme || null,
        introduction: teaching.introduction || null,
        summary: teaching.summary || null,
        gathering_date: gatheringDate.value,
        teaching_type: "standard",
        language: formData.get("language") === "es" ? "es" : "en",
        teaser_1_heading: null,
        teaser_1_text: null,
        teaser_2_heading: null,
        teaser_2_text: null,
        slug: suffix === 0 ? baseSlug : `${baseSlug}-${suffix}`,
        status: "draft",
        is_featured: false,
        published_at: null,
        chalkboard_asset_id: null,
      })
      .select("id")
      .single();

    if (!error && data) teachingId = data.id;
    else if (error?.code !== "23505") return { error: "The teaching could not be created. Nothing was saved." };
  }
  if (!teachingId) return { error: "This teaching title is already in use. Nothing was saved." };

  const categoryRows = teaching.categories.map((category, index) => {
    const id = crypto.randomUUID();
    return { id, teaching_id: teachingId, slug: `${slugify(category.title, "category")}-${id.slice(0, 8)}`, title: category.title, sort_order: index + 1, status: "draft" };
  });
  const sectionRows = teaching.categories.flatMap((category, categoryIndex) =>
    category.sections.map((section, sectionIndex) => {
      const id = crypto.randomUUID();
      return {
        id,
        teaching_id: teachingId,
        category_id: categoryRows[categoryIndex].id,
        slug: `${slugify(section.title, "section")}-${id.slice(0, 8)}`,
        title: section.title,
        content: toSectionContent(section),
        highlight_horizontal_alignment: "left",
        sort_order: sectionIndex + 1,
        status: "draft",
      };
    }),
  );

  const categoryResult = await supabase.from("teaching_categories").insert(categoryRows);
  const sectionResult = categoryResult.error ? null : await supabase.from("teaching_sections").insert(sectionRows);

  if (categoryResult.error || !sectionResult || sectionResult.error) {
    const { error: cleanupError } = await supabase.from("teachings").delete().eq("id", teachingId);
    return {
      error: cleanupError
        ? `The import failed part-way and the partial draft "${teaching.title}" could not be removed automatically. Please delete it from the Teachings list.`
        : "The import failed and nothing was saved. Please try again.",
    };
  }

  revalidatePath("/admin/teachings");
  redirect(`/admin/teachings/${teachingId}/edit`);
}
