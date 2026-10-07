"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/lib/supabase/admin";

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type TranslationKind = "teachings" | "teaching_devotionals";
export type TranslationState = { error?: string; saved?: boolean };

// Links an item to its translation, or clears the link. The link is stored on one side only, so
// any older link involving either item is removed first; each item ends with at most one twin.
export async function saveTranslation(
  kind: TranslationKind,
  id: string,
  revalidate: string,
  previousState: TranslationState,
  formData: FormData,
): Promise<TranslationState> {
  void previousState;
  const { supabase } = await requireAdmin();
  if ((kind !== "teachings" && kind !== "teaching_devotionals") || !UUID_PATTERN.test(id)) return { error: "This item could not be found." };

  const twinId = String(formData.get("translation_of") ?? "").trim();
  if (twinId && (!UUID_PATTERN.test(twinId) || twinId === id)) return { error: "Choose a valid item to link." };

  const ids = twinId ? [id, twinId] : [id];
  const { data: rows, error: readError } = await supabase.from(kind).select("id, language").in("id", ids);
  if (readError || (rows ?? []).length !== ids.length) return { error: "This item or the chosen translation could not be found." };
  if (twinId) {
    const languages = new Set((rows ?? []).map((row) => row.language === "es" ? "es" : "en"));
    if (languages.size !== 2) return { error: "A translation must be in the other language: link an English item to an Español item." };
  }

  // Remove any existing link that involves this item or the chosen one.
  const { data: current } = await supabase.from(kind).select("id, translation_of").or(`id.eq.${id},translation_of.eq.${id}`);
  const staleIds = (current ?? []).filter((row) => row.translation_of).map((row) => row.id as string);
  if (twinId) {
    const { data: twinCurrent } = await supabase.from(kind).select("id, translation_of").or(`id.eq.${twinId},translation_of.eq.${twinId}`);
    for (const row of twinCurrent ?? []) if (row.translation_of) staleIds.push(row.id as string);
  }
  if (staleIds.length) {
    const { error } = await supabase.from(kind).update({ translation_of: null }).in("id", [...new Set(staleIds)]);
    if (error) return { error: "The translation link could not be saved." };
  }
  if (twinId) {
    const { error } = await supabase.from(kind).update({ translation_of: twinId }).eq("id", id);
    if (error) return { error: "The translation link could not be saved." };
  }

  revalidatePath(revalidate);
  revalidatePath("/", "layout");
  return { saved: true };
}
