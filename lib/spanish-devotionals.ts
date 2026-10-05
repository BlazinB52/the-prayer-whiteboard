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
