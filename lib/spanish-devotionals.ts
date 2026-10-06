import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * A series is Español when its own language is Español or it is assigned to an
 * Español teaching, and English otherwise. This returns the ids of the Español series so the English pages and
 * the daily English email can leave them out, and the Español pages can pick
 * them up.
 */
export async function getSpanishDevotionalIds(client: SupabaseClient): Promise<Set<string>> {
  const [{ data: tagged }, { data: assigned }] = await Promise.all([
    client.from("teaching_devotionals").select("id").eq("language", "es"),
    client.from("teaching_devotional_assignments").select("devotional_id, teachings!inner(language)").eq("teachings.language", "es"),
  ]);
  return new Set([
    ...(tagged ?? []).map((row) => row.id as string),
    ...(assigned ?? []).map((row) => row.devotional_id as string),
  ]);
}

/** Whether one published series is Español, by its own language or by an Español teaching it is assigned to. */
export async function isSpanishDevotional(client: SupabaseClient, devotionalId: string): Promise<boolean> {
  const [{ data: own }, { data: assigned }] = await Promise.all([
    client.from("teaching_devotionals").select("language").eq("id", devotionalId).maybeSingle(),
    client
      .from("teaching_devotional_assignments")
      .select("devotional_id, teachings!inner(language)")
      .eq("devotional_id", devotionalId)
      .eq("teachings.language", "es")
      .limit(1),
  ]);
  return own?.language === "es" || (assigned?.length ?? 0) > 0;
}
