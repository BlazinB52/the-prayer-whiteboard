import type { SupabaseClient } from "@supabase/supabase-js";
import { formatTeachingDateShort } from "./teaching-date.ts";

export type TranslationOption = { id: string; label: string; disabled?: boolean };

/** Newest date first; an item with no date after the rest, in title order. */
export function sortByDateThenTitle<T extends { date: string | null; title: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date) || a.title.localeCompare(b.title);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.title.localeCompare(b.title);
  });
}

/** "Oct 10, 2026 · Title (draft) — already paired with another item". */
export function translationOptionLabel(item: { title: string; status: string; date: string | null }, takenBy: boolean) {
  const date = item.date ? formatTeachingDateShort(item.date) : "No gathering date";
  return `${date} · ${item.title}${item.status === "published" ? "" : " (draft)"}${takenBy ? " — already paired with another item" : ""}`;
}

// The items an admin can pair with this one: everything in the other language, newest first, each with the gathering date
// of its teaching so similar titles can be told apart. An item that is already paired with something else is listed but
// disabled, so a pairing is never replaced by accident. A devotional has no date of its own: it carries the date of the
// teaching it belongs to.
export async function loadTranslationOptions(
  supabase: SupabaseClient,
  kind: "teachings" | "teaching_devotionals",
  id: string,
  language: "en" | "es",
): Promise<{ currentId: string; options: TranslationOption[] }> {
  const otherLanguage = language === "es" ? "en" : "es";
  const columns = kind === "teachings" ? "id, title, status, slug, gathering_date" : "id, title, status, slug, teaching_id";
  const [{ data: items, error }, { data: all }] = await Promise.all([
    supabase.from(kind).select(columns).eq("language", otherLanguage).order("title", { ascending: true }),
    supabase.from(kind).select("id, translation_of"),
  ]);
  if (error) return { currentId: "", options: [] };

  const links = all ?? [];
  const own = links.find((row) => row.id === id);
  const pointingAtMe = links.find((row) => row.translation_of === id);
  const currentId = (own?.translation_of as string | null) ?? (pointingAtMe?.id as string | undefined) ?? "";

  // The date of each item: a teaching's own, or for a devotional the latest gathering date of the teachings it belongs to.
  const rows = (items ?? []) as unknown as { id: string; title: string; status: string; gathering_date?: string | null; teaching_id?: string | null }[];
  const dates = new Map<string, string | null>();
  if (kind === "teachings") {
    for (const row of rows) dates.set(row.id, row.gathering_date ?? null);
  } else {
    const [{ data: assignments }, { data: teachings }] = await Promise.all([
      supabase.from("teaching_devotional_assignments").select("devotional_id, teaching_id"),
      supabase.from("teachings").select("id, gathering_date"),
    ]);
    const teachingDate = new Map(((teachings ?? []) as { id: string; gathering_date: string | null }[]).map((row) => [row.id, row.gathering_date]));
    for (const row of rows) {
      const teachingIds = [...((assignments ?? []) as { devotional_id: string; teaching_id: string }[]).filter((a) => a.devotional_id === row.id).map((a) => a.teaching_id), ...(row.teaching_id ? [row.teaching_id] : [])];
      const found = teachingIds.map((teachingId) => teachingDate.get(teachingId)).filter((date): date is string => Boolean(date)).sort();
      dates.set(row.id, found.length ? found[found.length - 1] : null);
    }
  }

  const options = sortByDateThenTitle(rows.map((item) => ({ ...item, date: dates.get(item.id) ?? null }))).map((item) => {
    const takenBy = links.some((row) => (row.id === item.id && row.translation_of && row.translation_of !== id) || (row.translation_of === item.id && row.id !== id));
    return { id: item.id, label: translationOptionLabel(item, takenBy), disabled: takenBy };
  });
  return { currentId, options };
}
