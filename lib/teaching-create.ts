// Creates a draft teaching from a parsed (imported or machine-translated) teaching. Shared by "Import Teaching
// from Word" and "Convert & Save Spanish Version" so both store a teaching the same way. Rows go into the
// existing teachings, teaching_categories and teaching_sections tables; if any step fails the new teaching is
// deleted (its categories and sections cascade with it) so no partial draft is left behind.

import type { SupabaseClient } from "@supabase/supabase-js";
import { toSectionContent, type ImportedTeaching } from "./teaching-docx-import.ts";

export function slugify(value: string, fallback: string) {
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

export type CreateDraftOptions = {
  language: "en" | "es";
  gatheringDate: string | null;
  /** The teaching this one translates, or null. The caller must already have checked that neither side is paired. */
  translationOf: string | null;
};

export type CreateDraftResult = { id: string } | { error: string };

export async function createDraftTeaching(supabase: SupabaseClient, teaching: ImportedTeaching, options: CreateDraftOptions): Promise<CreateDraftResult> {
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
        gathering_date: options.gatheringDate,
        teaching_type: teaching.sourceTeachingType === "deep_dive" ? "deep_dive" : "standard",
        language: options.language,
        translation_of: options.translationOf,
        teaser_1_heading: teaching.teaser1Heading || null,
        teaser_1_text: teaching.teaser1Text || null,
        teaser_2_heading: teaching.teaser2Heading || null,
        teaser_2_text: teaching.teaser2Text || null,
        slug: suffix === 0 ? baseSlug : `${baseSlug}-${suffix}`,
        status: "draft",
        is_featured: false,
        published_at: null,
        chalkboard_asset_id: null,
      })
      .select("id")
      .single();

    if (!error && data) teachingId = data.id as string;
    else if (error?.code === "23505" && /translation_of/.test(`${error.message} ${error.details ?? ""}`)) {
      return { error: "That teaching already has a translation linked to it. Nothing was saved." };
    } else if (error?.code !== "23505") return { error: "The teaching could not be created. Nothing was saved." };
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
        ? `The draft failed part-way and the partial draft "${teaching.title}" could not be removed automatically. Please delete it from the Teachings list.`
        : "The draft could not be saved and nothing was kept. Please try again.",
    };
  }

  return { id: teachingId };
}
