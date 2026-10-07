import type { SupabaseClient } from "@supabase/supabase-js";

export type TranslationOption = { id: string; label: string; disabled?: boolean };

// The items an admin can pair with this one: everything in the other language. An item that is
// already paired with something else is listed but disabled, so a pairing is never replaced by accident.
export async function loadTranslationOptions(
  supabase: SupabaseClient,
  kind: "teachings" | "teaching_devotionals",
  id: string,
  language: "en" | "es",
): Promise<{ currentId: string; options: TranslationOption[] }> {
  const otherLanguage = language === "es" ? "en" : "es";
  const [{ data: items, error }, { data: all }] = await Promise.all([
    supabase.from(kind).select("id, title, status, slug").eq("language", otherLanguage).order("title", { ascending: true }),
    supabase.from(kind).select("id, translation_of"),
  ]);
  if (error) return { currentId: "", options: [] };

  const links = all ?? [];
  const own = links.find((row) => row.id === id);
  const pointingAtMe = links.find((row) => row.translation_of === id);
  const currentId = (own?.translation_of as string | null) ?? (pointingAtMe?.id as string | undefined) ?? "";

  const options = (items ?? []).map((item) => {
    const takenBy = links.some((row) => (row.id === item.id && row.translation_of && row.translation_of !== id) || (row.translation_of === item.id && row.id !== id));
    return {
      id: item.id as string,
      label: `${item.title}${item.status === "published" ? "" : " (draft)"}${takenBy ? " — already paired with another item" : ""}`,
      disabled: takenBy,
    };
  });
  return { currentId, options };
}
