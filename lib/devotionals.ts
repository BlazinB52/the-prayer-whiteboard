export const DEVOTIONAL_DAY_NUMBERS = [1, 2, 3, 4, 5, 6, 7] as const;

// scripture text limit
export const MAX_ANCHOR_SCRIPTURE_LENGTH = 1000;

export type DevotionalStatus = "draft" | "published";

export type TeachingDevotional = {
  id: string;
  teaching_id: string;
  slug: string;
  title: string;
  introduction: string | null;
  status: DevotionalStatus;
  published_at: string | null;
};

export type DevotionalDay = {
  id: string;
  devotional_id: string;
  day_number: number;
  title: string;
  anchor_scriptures: string[];
  devotional_reading: string | null;
  confession: string | null;
  journal_prompt: string | null;
  prayer_activation: string | null;
};

export function splitParagraphs(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function normalizeScriptureLines(value: FormDataEntryValue | null) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

export function formatAnchorScriptureLengthLimit() {
  return new Intl.NumberFormat("en-US").format(MAX_ANCHOR_SCRIPTURE_LENGTH);
}

export function scripturesToTextareaValue(scriptures: string[] | null | undefined) {
  return (scriptures ?? []).join("\n");
}

export function isCompleteDevotionalDay(day: Pick<DevotionalDay, "title" | "anchor_scriptures" | "devotional_reading" | "confession" | "journal_prompt" | "prayer_activation">) {
  return Boolean(
    day.title.trim()
      && day.anchor_scriptures.some((scripture) => scripture.trim())
      && day.devotional_reading?.trim()
      && day.confession?.trim()
      && day.journal_prompt?.trim()
      && day.prayer_activation?.trim(),
  );
}

export function findDevotionalPublishBlocker(devotional: Pick<TeachingDevotional, "title"> | null, days: DevotionalDay[]) {
  if (!devotional?.title.trim()) {
    return "The devotional title is required before publishing.";
  }

  for (const dayNumber of DEVOTIONAL_DAY_NUMBERS) {
    const day = days.find((item) => item.day_number === dayNumber);
    if (!day) {
      return `Day ${dayNumber} must be saved before publishing.`;
    }

    if (!day.title.trim()) return `Day ${dayNumber} needs a title before publishing.`;
    if (!day.anchor_scriptures.some((scripture) => scripture.trim())) return `Day ${dayNumber} needs at least one anchor Scripture before publishing.`;
    if (!day.devotional_reading?.trim()) return `Day ${dayNumber} needs a devotional reading before publishing.`;
    if (!day.confession?.trim()) return `Day ${dayNumber} needs today's confession before publishing.`;
    if (!day.journal_prompt?.trim()) return `Day ${dayNumber} needs a 5-minute journal prompt before publishing.`;
    if (!day.prayer_activation?.trim()) return `Day ${dayNumber} needs a prayer activation exercise before publishing.`;
  }

  return null;
}
