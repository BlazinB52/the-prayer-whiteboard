"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CATEGORY_TITLE_MAX = 160;
const SECTION_TITLE_MAX = 160;
const SECTION_TEXT_MAX = 12000;
const SCRIPTURE_REFERENCE_MAX = 240;
const SCRIPTURE_TRANSLATION_MAX = 80;

export type ContentActionState = { error?: string; saved?: boolean };
export type SectionFormat = "paragraph" | "bullets" | "scripture" | "takeaway";

/** Version 1 is importer-friendly: one typed block with plain text fields only. */
type SectionContent =
  | { version: 1; format: "paragraph" | "takeaway"; text: string }
  | { version: 1; format: "bullets"; bullets: string[] }
  | {
      version: 1;
      format: "scripture";
      introduction?: string;
      reference: string;
      translation?: string;
      quotation: string;
    };

function validId(value: string) {
  return UUID_PATTERN.test(value);
}

function readText(formData: FormData, name: string, label: string, maxLength: number, required = false) {
  const value = String(formData.get(name) ?? "").trim();
  if (required && !value) return { error: `${label} is required.` };
  if (value.length > maxLength) return { error: `${label} must be ${maxLength} characters or fewer.` };
  return { value };
}

function readFormat(formData: FormData) {
  const value = String(formData.get("format") ?? "");
  if (!["paragraph", "bullets", "scripture", "takeaway"].includes(value)) {
    return { error: "Choose a valid section format." };
  }
  return { value: value as SectionFormat };
}

function validateSection(formData: FormData) {
  const title = readText(formData, "title", "Section title", SECTION_TITLE_MAX, true);
  const format = readFormat(formData);
  const mainText = readText(formData, "mainText", "Main text", SECTION_TEXT_MAX);
  const introduction = readText(formData, "introduction", "Introductory note", SECTION_TEXT_MAX);
  const reference = readText(formData, "reference", "Scripture reference", SCRIPTURE_REFERENCE_MAX);
  const translation = readText(formData, "translation", "Translation", SCRIPTURE_TRANSLATION_MAX);
  const quotation = readText(formData, "quotation", "Scripture quotation", SECTION_TEXT_MAX);

  const error = [title, format, mainText, introduction, reference, translation, quotation].find((field) => field.error)?.error;
  if (error) return { error };
  const selectedFormat = format.value!;

  if (selectedFormat === "scripture" && (!reference.value || !quotation.value)) {
    return { error: "Scripture reference and quotation are required for this format." };
  }

  if (selectedFormat === "bullets") {
    const bullets = mainText.value!.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
    if (!bullets.length) return { error: "Add at least one nonempty bullet line." };
    if (bullets.some((bullet) => bullet.length > SECTION_TEXT_MAX)) {
      return { error: `Each bullet must be ${SECTION_TEXT_MAX} characters or fewer.` };
    }
    return { value: { title: title.value!, format: selectedFormat, content: { version: 1, format: "bullets", bullets } satisfies SectionContent } };
  }

  if (selectedFormat === "scripture") {
    const content: SectionContent = {
      version: 1,
      format: "scripture",
      ...(introduction.value ? { introduction: introduction.value } : {}),
      reference: reference.value!,
      ...(translation.value ? { translation: translation.value } : {}),
      quotation: quotation.value!,
    };
    return { value: { title: title.value!, format: selectedFormat, content } };
  }

  if (!mainText.value) return { error: "Main text is required for this section format." };
  return { value: { title: title.value!, format: selectedFormat, content: { version: 1, format: selectedFormat, text: mainText.value } satisfies SectionContent } };
}

async function requireDraftTeaching(teachingId: string) {
  if (!validId(teachingId)) return null;
  const { supabase } = await requireAdmin();
  const { data } = await supabase.from("teachings").select("id").eq("id", teachingId).eq("status", "draft").maybeSingle();
  return data ? { supabase } : null;
}

async function requireDraftCategory(teachingId: string, categoryId: string) {
  const context = await requireDraftTeaching(teachingId);
  if (!context || !validId(categoryId)) return null;
  const { data: category } = await context.supabase.from("teaching_categories").select("id, sort_order").eq("id", categoryId).eq("teaching_id", teachingId).eq("status", "draft").maybeSingle();
  return category ? { ...context, category } : null;
}

async function requireDraftSection(teachingId: string, categoryId: string, sectionId: string) {
  const context = await requireDraftCategory(teachingId, categoryId);
  if (!context || !validId(sectionId)) return null;
  const { data: section } = await context.supabase.from("teaching_sections").select("id, sort_order").eq("id", sectionId).eq("teaching_id", teachingId).eq("category_id", categoryId).eq("status", "draft").maybeSingle();
  return section ? { ...context, section } : null;
}

function contentPath(teachingId: string) {
  return `/admin/teachings/${teachingId}/edit`;
}

export async function createCategory(teachingId: string, _: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const context = await requireDraftTeaching(teachingId);
  if (!context) return { error: "This draft teaching could not be found." };
  const title = readText(formData, "title", "Category title", CATEGORY_TITLE_MAX, true);
  if (title.error) return title;
  const { data: last } = await context.supabase.from("teaching_categories").select("sort_order").eq("teaching_id", teachingId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const id = crypto.randomUUID();
  const { error } = await context.supabase.from("teaching_categories").insert({ id, teaching_id: teachingId, slug: `${slugify(title.value!)}-${id.slice(0, 8)}`, title: title.value, sort_order: (last?.sort_order ?? 0) + 1, status: "draft" });
  if (error) return { error: "The category could not be added." };
  revalidatePath(contentPath(teachingId));
  return { saved: true };
}

export async function renameCategory(teachingId: string, categoryId: string, _: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const context = await requireDraftCategory(teachingId, categoryId);
  if (!context) return { error: "This category could not be found." };
  const title = readText(formData, "title", "Category title", CATEGORY_TITLE_MAX, true);
  if (title.error) return title;
  const { error } = await context.supabase.from("teaching_categories").update({ title: title.value }).eq("id", categoryId).eq("teaching_id", teachingId).eq("status", "draft");
  if (error) return { error: "The category could not be renamed." };
  revalidatePath(contentPath(teachingId));
  return { saved: true };
}

export async function deleteCategory(teachingId: string, categoryId: string): Promise<ContentActionState> {
  const context = await requireDraftCategory(teachingId, categoryId);
  if (!context) return { error: "This category could not be found." };
  const { count } = await context.supabase.from("teaching_sections").select("id", { count: "exact", head: true }).eq("teaching_id", teachingId).eq("category_id", categoryId);
  if (count) return { error: "This category still contains sections. Remove or move its sections first." };
  const { error } = await context.supabase.from("teaching_categories").delete().eq("id", categoryId).eq("teaching_id", teachingId).eq("status", "draft");
  if (error) return { error: "The category could not be deleted." };
  revalidatePath(contentPath(teachingId));
  return { saved: true };
}

export async function moveCategory(teachingId: string, categoryId: string, direction: "up" | "down"): Promise<ContentActionState> {
  const context = await requireDraftCategory(teachingId, categoryId);
  if (!context || !["up", "down"].includes(direction)) return { error: "This category could not be moved." };
  const { data: categories } = await context.supabase.from("teaching_categories").select("id, sort_order").eq("teaching_id", teachingId).eq("status", "draft").order("sort_order", { ascending: true });
  const index = categories?.findIndex((category) => category.id === categoryId) ?? -1;
  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || !categories?.[neighborIndex]) return { error: "This category is already at the edge." };
  const current = categories[index];
  const neighbor = categories[neighborIndex];
  const first = await context.supabase.from("teaching_categories").update({ sort_order: -1 }).eq("id", current.id).eq("teaching_id", teachingId);
  if (first.error) return { error: "The category could not be moved." };
  const second = await context.supabase.from("teaching_categories").update({ sort_order: current.sort_order }).eq("id", neighbor.id).eq("teaching_id", teachingId);
  const third = await context.supabase.from("teaching_categories").update({ sort_order: neighbor.sort_order }).eq("id", current.id).eq("teaching_id", teachingId);
  if (second.error || third.error) return { error: "The category could not be moved." };
  revalidatePath(contentPath(teachingId));
  return { saved: true };
}

export async function createSection(teachingId: string, categoryId: string, _: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const context = await requireDraftCategory(teachingId, categoryId);
  if (!context) return { error: "This category could not be found." };
  const result = validateSection(formData);
  if (result.error) return result;
  const { data: last } = await context.supabase.from("teaching_sections").select("sort_order").eq("teaching_id", teachingId).eq("category_id", categoryId).order("sort_order", { ascending: false }).limit(1).maybeSingle();
  const id = crypto.randomUUID();
  const { error } = await context.supabase.from("teaching_sections").insert({ id, teaching_id: teachingId, category_id: categoryId, slug: `${slugify(result.value!.title)}-${id.slice(0, 8)}`, title: result.value!.title, content: result.value!.content, sort_order: (last?.sort_order ?? 0) + 1, status: "draft" });
  if (error) return { error: "The section could not be added." };
  revalidatePath(contentPath(teachingId));
  return { saved: true };
}

export async function updateSection(teachingId: string, categoryId: string, sectionId: string, _: ContentActionState, formData: FormData): Promise<ContentActionState> {
  const context = await requireDraftSection(teachingId, categoryId, sectionId);
  if (!context) return { error: "This section could not be found." };
  const result = validateSection(formData);
  if (result.error) return result;
  const { error } = await context.supabase.from("teaching_sections").update({ title: result.value!.title, content: result.value!.content }).eq("id", sectionId).eq("teaching_id", teachingId).eq("category_id", categoryId).eq("status", "draft");
  if (error) return { error: "The section could not be saved." };
  revalidatePath(contentPath(teachingId));
  return { saved: true };
}

export async function deleteSection(teachingId: string, categoryId: string, sectionId: string): Promise<ContentActionState> {
  const context = await requireDraftSection(teachingId, categoryId, sectionId);
  if (!context) return { error: "This section could not be found." };
  const { error } = await context.supabase.from("teaching_sections").delete().eq("id", sectionId).eq("teaching_id", teachingId).eq("category_id", categoryId).eq("status", "draft");
  if (error) return { error: "The section could not be deleted." };
  revalidatePath(contentPath(teachingId));
  return { saved: true };
}

export async function moveSection(teachingId: string, categoryId: string, sectionId: string, direction: "up" | "down"): Promise<ContentActionState> {
  const context = await requireDraftSection(teachingId, categoryId, sectionId);
  if (!context || !["up", "down"].includes(direction)) return { error: "This section could not be moved." };
  const { data: sections } = await context.supabase.from("teaching_sections").select("id, sort_order").eq("teaching_id", teachingId).eq("category_id", categoryId).eq("status", "draft").order("sort_order", { ascending: true });
  const index = sections?.findIndex((section) => section.id === sectionId) ?? -1;
  const neighborIndex = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || !sections?.[neighborIndex]) return { error: "This section is already at the edge." };
  const current = sections[index];
  const neighbor = sections[neighborIndex];
  const first = await context.supabase.from("teaching_sections").update({ sort_order: -1 }).eq("id", current.id).eq("teaching_id", teachingId).eq("category_id", categoryId);
  if (first.error) return { error: "The section could not be moved." };
  const second = await context.supabase.from("teaching_sections").update({ sort_order: current.sort_order }).eq("id", neighbor.id).eq("teaching_id", teachingId).eq("category_id", categoryId);
  const third = await context.supabase.from("teaching_sections").update({ sort_order: neighbor.sort_order }).eq("id", current.id).eq("teaching_id", teachingId).eq("category_id", categoryId);
  if (second.error || third.error) return { error: "The section could not be moved." };
  revalidatePath(contentPath(teachingId));
  return { saved: true };
}

function slugify(value: string) {
  return value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 70) || "item";
}
