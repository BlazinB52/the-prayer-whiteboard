"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireAdmin } from "@/lib/supabase/admin";
import {
  parseTeachingDocx,
  suggestGatheringDate,
  type ImportedTeaching,
} from "@/lib/teaching-docx-import";
import { createDraftTeaching } from "@/lib/teaching-create";
import { MAX_TEACHING_DOCX_BYTES } from "@/lib/teaching-docx-package";

/** The teaching an exported file came from, when the file says so and that teaching still exists. */
export type TeachingImportSource = {
  id: string;
  title: string;
  language: "en" | "es";
  /** True when the original already has a translation linked, or is itself a translation of something else. */
  alreadyPaired: boolean;
};

export type TeachingImportPreview = {
  fileName: string;
  suggestedDate: string | null;
  source: TeachingImportSource | null;
  ok: boolean;
  errors: string[];
  warnings: string[];
  teaching: ImportedTeaching | null;
};
export type TeachingImportPreviewState = { error?: string; preview?: TeachingImportPreview };
export type TeachingImportCreateState = { error?: string };

const DOCX_EXTENSION = /\.docx$/i;

/** Reads and parses the uploaded document. The file is held only in memory for this request. */
async function readImportFile(formData: FormData) {
  const file = formData.get("sourceDocument");
  if (!(file instanceof File) || !file.size) return { error: "Choose a .docx teaching document." };
  if (!DOCX_EXTENSION.test(file.name)) return { error: "The teaching document must be a .docx file." };
  if (file.size > MAX_TEACHING_DOCX_BYTES) return { error: "The .docx file must be 8 MiB or smaller." };

  const language: "en" | "es" = formData.get("language") === "es" ? "es" : "en";
  const result = parseTeachingDocx(Buffer.from(await file.arrayBuffer()), { language });
  return { fileName: file.name, language, result };
}

/** Looks up the teaching an exported file says it came from. A missing or unreadable one simply means "no link offered". */
async function findSource(supabase: Awaited<ReturnType<typeof requireAdmin>>["supabase"], sourceId: string | null): Promise<TeachingImportSource | null> {
  if (!sourceId) return null;
  const { data: original } = await supabase.from("teachings").select("id, title, language, translation_of").eq("id", sourceId).maybeSingle();
  if (!original) return null;
  const { data: pointingAtIt } = await supabase.from("teachings").select("id").eq("translation_of", sourceId).limit(1);
  return {
    id: original.id as string,
    title: String(original.title ?? ""),
    language: original.language === "es" ? "es" : "en",
    alreadyPaired: Boolean(original.translation_of) || (pointingAtIt ?? []).length > 0,
  };
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
  const { supabase } = await requireAdmin();
  const file = await readImportFile(formData);
  if ("error" in file) return { error: file.error };

  return {
    preview: {
      fileName: file.fileName,
      suggestedDate: suggestGatheringDate(file.fileName),
      source: await findSource(supabase, file.result.teaching?.sourceTeachingId ?? null),
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

  // Link the new draft to the teaching the file was exported from, only if the Administrator asked for it, that
  // teaching is in the other language, and neither side is already paired. (A translation link is stored on one side.)
  let translationOf: string | null = null;
  if (formData.get("linkSource") && teaching.sourceTeachingId && String(formData.get("linkSource")) === teaching.sourceTeachingId) {
    const source = await findSource(supabase, teaching.sourceTeachingId);
    if (source && !source.alreadyPaired && source.language !== file.language) translationOf = source.id;
  }

  const created = await createDraftTeaching(supabase, teaching, { language: file.language, gatheringDate: gatheringDate.value ?? null, translationOf });
  if ("error" in created) return { error: created.error };
  const teachingId = created.id;

  revalidatePath("/admin/teachings");
  redirect(`/admin/teachings/${teachingId}/edit`);
}
