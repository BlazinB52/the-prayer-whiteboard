// Creates draft devotionals. Shared by "Create From a Text File" and "Translate to Español" so both store a
// devotional the same way: a draft that belongs to no teaching, with a provisional slug taken from its title.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ImportedDevotional, ImportedDevotionalDay } from "./devotional-import.ts";
import { slugify } from "./teaching-create.ts";

const PROVISIONAL_SLUG_ATTEMPTS = 100;

// The slug is provisional only: it is derived from the title now and can be replaced before publishing; the partial
// unique index ignores blank slugs but still rejects duplicate real ones, so retry on 23505 the way createTeaching does.
export async function insertStandaloneDraft(
  supabase: SupabaseClient,
  input: { title: string; introduction: string | null; language: "en" | "es"; translationOf?: string | null; gatheringDate?: string | null },
): Promise<{ id: string; slug: string } | { error: string }> {
  const baseSlug = slugify(input.title, "devotional");

  for (let suffix = 0; suffix < PROVISIONAL_SLUG_ATTEMPTS; suffix += 1) {
    const slug = suffix === 0 ? baseSlug : `${baseSlug}-${suffix + 1}`;
    const { data, error } = await supabase
      .from("teaching_devotionals")
      .insert({
        teaching_id: null,
        slug,
        language: input.language,
        translation_of: input.translationOf ?? null,
        gathering_date: input.gatheringDate ?? null,
        title: input.title,
        introduction: input.introduction,
        status: "draft",
        published_at: null,
      })
      .select("id, slug")
      .single();

    if (!error && data) return { id: data.id as string, slug: data.slug as string };
    if (error?.code !== "23505") return { error: "This devotional could not be created." };
  }

  return { error: "This devotional title is already in use. Please choose another title." };
}

// What an import writes for one day. Days 1-6 clear the Communion columns and Day 7 clears the
// journal and prayer columns, so a replaced draft never keeps text from the other format.
export function importedDayRow(devotionalId: string, day: ImportedDevotionalDay) {
  return {
    devotional_id: devotionalId,
    day_number: day.day_number,
    title: day.title,
    anchor_scriptures: day.anchor_scriptures,
    devotional_reading: day.devotional_reading,
    confession: day.confession,
    journal_prompt: day.journal_prompt || null,
    prayer_activation: day.prayer_activation || null,
    bread_reflection: day.bread_reflection || null,
    cup_reflection: day.cup_reflection || null,
    self_examination: day.self_examination || null,
    series_closing_prayer: day.series_closing_prayer || null,
  };
}

/** Saves a parsed devotional and its seven days as a new draft. If the days cannot be saved, the empty draft is removed. */
export async function createDraftDevotional(
  supabase: SupabaseClient,
  devotional: ImportedDevotional,
  options: { language: "en" | "es"; translationOf: string | null; gatheringDate: string | null },
): Promise<{ id: string; slug: string } | { error: string }> {
  const created = await insertStandaloneDraft(supabase, { title: devotional.title, introduction: devotional.introduction || null, language: options.language, translationOf: options.translationOf, gatheringDate: options.gatheringDate });
  if ("error" in created) return created;

  const { error } = await supabase.from("teaching_devotional_days").upsert(devotional.days.map((day) => importedDayRow(created.id, day)), { onConflict: "devotional_id,day_number" });
  if (error) {
    await supabase.from("teaching_devotionals").delete().eq("id", created.id);
    return { error: "The devotional days could not be saved." };
  }
  return created;
}
