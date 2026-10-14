import type { requireAdmin } from "@/lib/supabase/admin";
import { offeredTeachingChoices, teachingChoiceLabel, type TeachingChoice } from "@/lib/teaching-choices";

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

export { teachingChoiceLabel, type TeachingChoice };

/** Every teaching, newest first, for the "which teaching does this go with" pickers. */
export async function loadTeachingChoices(supabase: Supabase): Promise<TeachingChoice[]> {
  const { data } = await supabase
    .from("teachings")
    .select("id, title, language, gathering_date, status")
    .order("gathering_date", { ascending: false, nullsFirst: false })
    .order("title", { ascending: true });
  return ((data as { id: string; title: string; language: string | null; gathering_date: string | null; status: string | null }[] | null) ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    language: row.language === "es" ? "es" : "en",
    gatheringDate: row.gathering_date,
    archived: row.status === "archived",
  }));
}

export function TeachingChoiceOptions({ teachings, selectedId }: { teachings: TeachingChoice[]; selectedId?: string | null }) {
  return (
    <>
      <option value="">Not linked to a teaching</option>
      {offeredTeachingChoices(teachings, selectedId).map((teaching) => (
        <option key={teaching.id} value={teaching.id}>
          {teachingChoiceLabel(teaching)}
        </option>
      ))}
    </>
  );
}
