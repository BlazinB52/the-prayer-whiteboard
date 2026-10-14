import type { requireAdmin } from "@/lib/supabase/admin";

type Supabase = Awaited<ReturnType<typeof requireAdmin>>["supabase"];

export type TeachingChoice = { id: string; title: string; language: "en" | "es" };

/** Every teaching, newest first, for the "which teaching does this go with" pickers. */
export async function loadTeachingChoices(supabase: Supabase): Promise<TeachingChoice[]> {
  const { data } = await supabase
    .from("teachings")
    .select("id, title, language")
    .order("gathering_date", { ascending: false, nullsFirst: false })
    .order("title", { ascending: true });
  return ((data as { id: string; title: string; language: string | null }[] | null) ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    language: row.language === "es" ? "es" : "en",
  }));
}

export function TeachingChoiceOptions({ teachings }: { teachings: TeachingChoice[] }) {
  return (
    <>
      <option value="">Not linked to a teaching</option>
      {teachings.map((teaching) => (
        <option key={teaching.id} value={teaching.id}>
          {teaching.title}
          {teaching.language === "es" ? " (Español)" : ""}
        </option>
      ))}
    </>
  );
}
