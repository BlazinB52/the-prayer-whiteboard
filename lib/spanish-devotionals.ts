import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Devotionals have no language of their own: a series is Español when it is
 * assigned to an Español teaching, and English otherwise (including standalone
 * series). This returns the ids of the Español series so the English pages and
 * the daily English email can leave them out, and the Español pages can pick
 * them up.
 */
export async function getSpanishDevotionalIds(client: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await client
    .from("teaching_devotional_assignments")
    .select("devotional_id, teachings!inner(language)")
    .eq("teachings.language", "es");
  if (error) return new Set();
  return new Set((data ?? []).map((row) => row.devotional_id as string));
}
