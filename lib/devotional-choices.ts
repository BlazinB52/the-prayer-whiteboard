import { devotionalDate } from "./devotional-date.ts";
import { formatTeachingDateShort } from "./teaching-date.ts";

// The list in "Use Existing Devotional". A devotional has its own gathering date; when it has none it carries the date of the
// teaching it belongs to (the same rule the Devotionals list uses), so each choice shows that date, newest first, with
// devotionals that have no date after the rest. Only devotionals in the teaching's own language are offered, and the one
// already assigned always stays in the list.

export type DevotionalChoiceInput = { id: string; title: string; status: string; language: string | null; legacyTeachingId: string | null; gatheringDate?: string | null };
export type DevotionalChoice = { id: string; title: string; status: string; date: string | null; dateLabel: string };

export function devotionalChoices(input: {
  devotionals: DevotionalChoiceInput[];
  /** Which teachings each devotional is assigned to. */
  assignments: { devotional_id: string; teaching_id: string }[];
  teachingDates: { id: string; gathering_date: string | null }[];
  teachingLanguage: "en" | "es";
  currentDevotionalId: string | null;
}): DevotionalChoice[] {
  const dateOf = new Map(input.teachingDates.map((teaching) => [teaching.id, teaching.gathering_date]));
  const choices = input.devotionals
    .filter((devotional) => (devotional.language === "es" ? "es" : "en") === input.teachingLanguage || devotional.id === input.currentDevotionalId)
    .map((devotional): DevotionalChoice => {
      const teachingIds = [...input.assignments.filter((row) => row.devotional_id === devotional.id).map((row) => row.teaching_id), ...(devotional.legacyTeachingId ? [devotional.legacyTeachingId] : [])];
      const date = devotionalDate(devotional.gatheringDate, teachingIds.map((id) => dateOf.get(id)));
      return { id: devotional.id, title: devotional.title, status: devotional.status, date, dateLabel: date ? formatTeachingDateShort(date) : "No gathering date" };
    });
  return choices.sort((a, b) => {
    if (a.date && b.date) return b.date.localeCompare(a.date) || a.title.localeCompare(b.title);
    if (a.date) return -1;
    if (b.date) return 1;
    return a.title.localeCompare(b.title);
  });
}
