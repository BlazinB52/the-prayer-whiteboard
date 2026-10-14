import { formatTeachingDateShort } from "./teaching-date.ts";

// What the "which teaching does this go with" pickers show. Kept free of React so it can be tested.

export type TeachingChoice = {
  id: string;
  title: string;
  language: "en" | "es";
  /** The date of the teaching (YYYY-MM-DD), so two teachings with similar titles can be told apart. */
  gatheringDate: string | null;
  archived: boolean;
};

/** "Oct 10, 2026 · From Glory to Glory": the date first, so the list reads in order and each line is unique. */
export function teachingChoiceLabel(teaching: TeachingChoice) {
  const date = formatTeachingDateShort(teaching.gatheringDate);
  return `${date ? `${date} · ` : ""}${teaching.title}${teaching.language === "es" ? " (Español)" : ""}`;
}

/**
 * Everything is linked to the English teaching (the Title Collections report groups each Español piece under its
 * English original), so only English teachings are offered. A teaching that is already chosen stays in the list
 * even if it is Español or archived, so an existing link is never hidden or silently changed.
 */
export function offeredTeachingChoices(teachings: TeachingChoice[], selectedId?: string | null) {
  return teachings.filter((teaching) => (teaching.language === "en" && !teaching.archived) || teaching.id === selectedId);
}
