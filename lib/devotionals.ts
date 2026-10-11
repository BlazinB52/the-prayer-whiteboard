import { formatAnchorScriptures } from "./anchor-scripture-format.ts";

export const DEVOTIONAL_DAY_NUMBERS =[1, 2, 3, 4, 5, 6, 7] as const;

// scripture text limit
export const MAX_ANCHOR_SCRIPTURE_LENGTH = 1000;

export type DevotionalStatus = "draft" | "published";

export type TeachingDevotional = {
  id: string;
  // Both are nullable since 20260923000000_decouple_devotional_ownership.
  // teaching_id is a legacy/backup reference only; the authoritative teaching
  // mapping lives in teaching_devotional_assignments. slug stays empty until a
  // devotional is ready for a public URL, and publishing requires a real one.
  teaching_id: string | null;
  slug: string | null;
  title: string;
  introduction: string | null;
  status: DevotionalStatus;
  published_at: string | null;
  language?: "en" | "es";
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
  // Day 7 only: the Communion and rest day. Older Day 7s have none of these and keep their
  // journal prompt and prayer activation until they are converted.
  bread_reflection?: string | null;
  cup_reflection?: string | null;
  self_examination?: string | null;
  // Day 7 only: the prayer that closes the whole series, shown last.
  series_closing_prayer?: string | null;
};

// The columns every reader of a devotional day selects.
export const DEVOTIONAL_DAY_COLUMNS = "id, devotional_id, day_number, title, anchor_scriptures, devotional_reading, confession, journal_prompt, prayer_activation, bread_reflection, cup_reflection, self_examination, series_closing_prayer";

export const COMMUNION_DAY_NUMBER = 7;

type CommunionFields = Pick<DevotionalDay, "bread_reflection" | "cup_reflection" | "self_examination" | "series_closing_prayer">;
type LegacyFields = Pick<DevotionalDay, "journal_prompt" | "prayer_activation">;

function hasText(value: string | null | undefined) {
  return Boolean(value?.trim());
}

function hasCommunionText(day: CommunionFields) {
  return hasText(day.bread_reflection) || hasText(day.cup_reflection) || hasText(day.self_examination) || hasText(day.series_closing_prayer);
}

/**
 * True for a Day 7 saved before the Communion format existed: it has a journal prompt or prayer
 * activation and none of the Communion text. It keeps showing and mailing in its old layout until it
 * is converted, so no reader loses wording that was already published.
 */
export function usesLegacyDayLayout(day: { day_number: number } & CommunionFields & Partial<LegacyFields>) {
  return day.day_number === COMMUNION_DAY_NUMBER
    && !hasCommunionText(day)
    && (hasText(day.journal_prompt) || hasText(day.prayer_activation));
}

/**
 * True when Day 7 has actually been written in the Communion format (not an empty or unconverted one).
 * Day 6 uses this to decide whether to remind the reader to have bread and juice ready.
 */
export function hasCommunionDay(day7: ({ day_number: number } & CommunionFields) | null | undefined) {
  return Boolean(day7 && day7.day_number === COMMUNION_DAY_NUMBER && hasCommunionText(day7));
}

/** The day before Communion: the one that carries the "have bread and juice ready" heads-up. */
export const COMMUNION_HEADS_UP_DAY_NUMBER = COMMUNION_DAY_NUMBER - 1;

/** Day 7 is the Communion and rest day unless it is still an unconverted legacy Day 7. */
export function isCommunionDay(day: { day_number: number } & CommunionFields & Partial<LegacyFields>) {
  return day.day_number === COMMUNION_DAY_NUMBER && !usesLegacyDayLayout(day);
}

/** A day with nothing saved yet, so a preview can still show the layout the day will use. */
export function emptyDevotionalDay(dayNumber: number): DevotionalDay {
  return { id: "", devotional_id: "", day_number: dayNumber, title: "", anchor_scriptures: [], devotional_reading: null, confession: null, journal_prompt: null, prayer_activation: null };
}

export type DevotionalSectionLabels = {
  anchorScriptures: string;
  devotionalReading: string;
  confession: string;
  journalPrompt: string;
  prayerActivation: string;
  restReflection: string;
  confessionOfRest: string;
  tableOfRemembrance: string;
  tableOfRemembranceIntro: string;
  breadReflection: string;
  cupReflection: string;
  selfExamination: string;
  seriesClosingPrayer: string;
};

export type DevotionalSection = { key: string; label: string; text: string | null; isScriptures?: boolean };

/**
 * The sections of one devotional day in reading order, with their labels. Every page, email and
 * preview builds a day from this list so Day 7 looks the same everywhere. Sections with no text are
 * still listed; the caller decides whether to show an empty one.
 */
export function devotionalDaySections(day: DevotionalDay, labels: DevotionalSectionLabels): DevotionalSection[] {
  if (isCommunionDay(day)) {
    return [
      { key: "anchor_scriptures", label: labels.anchorScriptures, text: null, isScriptures: true },
      { key: "devotional_reading", label: labels.restReflection, text: day.devotional_reading },
      { key: "confession", label: labels.confessionOfRest, text: day.confession },
      { key: "table_of_remembrance", label: labels.tableOfRemembrance, text: labels.tableOfRemembranceIntro },
      // The self-examination comes before the bread and cup: it is how the reader prepares to partake.
      { key: "self_examination", label: labels.selfExamination, text: day.self_examination ?? null },
      { key: "bread_reflection", label: labels.breadReflection, text: day.bread_reflection ?? null },
      { key: "cup_reflection", label: labels.cupReflection, text: day.cup_reflection ?? null },
      { key: "series_closing_prayer", label: labels.seriesClosingPrayer, text: day.series_closing_prayer ?? null },
    ];
  }
  return [
    { key: "anchor_scriptures", label: labels.anchorScriptures, text: null, isScriptures: true },
    { key: "devotional_reading", label: labels.devotionalReading, text: day.devotional_reading },
    { key: "confession", label: labels.confession, text: day.confession },
    { key: "journal_prompt", label: labels.journalPrompt, text: day.journal_prompt },
    { key: "prayer_activation", label: labels.prayerActivation, text: day.prayer_activation },
  ];
}

export type DevotionalTextBlock =
  | { type: "paragraph"; text: string }
  | { type: "bullet-list"; items: string[] };

export function splitParagraphs(value: string | null | undefined) {
  return String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
}

export function splitDevotionalTextBlocks(value: string | null | undefined): DevotionalTextBlock[] {
  const blocks: DevotionalTextBlock[] = [];

  for (const line of splitParagraphs(value)) {
    const bullet = line.match(/^(?:-\s+|\u2022\s*)(.+)$/);
    if (!bullet) {
      blocks.push({ type: "paragraph", text: line });
      continue;
    }

    const previous = blocks.at(-1);
    if (previous?.type === "bullet-list") {
      previous.items.push(bullet[1].trim());
    } else {
      blocks.push({ type: "bullet-list", items: [bullet[1].trim()] });
    }
  }

  return blocks;
}

export function normalizeScriptureLines(value: FormDataEntryValue | null) {
  return formatAnchorScriptures(String(value ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean));
}

export function formatAnchorScriptureLengthLimit() {
  return new Intl.NumberFormat("en-US").format(MAX_ANCHOR_SCRIPTURE_LENGTH);
}

export function scripturesToTextareaValue(scriptures: string[] | null | undefined) {
  return (scriptures ?? []).join("\n");
}

export function isCompleteDevotionalDay(day: Pick<DevotionalDay, "day_number" | "title" | "anchor_scriptures" | "devotional_reading" | "confession" | "journal_prompt" | "prayer_activation" | "bread_reflection" | "cup_reflection" | "self_examination" | "series_closing_prayer">) {
  const common = Boolean(
    day.title.trim()
      && day.anchor_scriptures.some((scripture) => scripture.trim())
      && day.devotional_reading?.trim()
      && day.confession?.trim(),
  );
  if (!common) return false;
  // Day 7 is the Communion and rest day: it has no journal prompt or prayer activation.
  if (day.day_number === COMMUNION_DAY_NUMBER) {
    return Boolean(day.bread_reflection?.trim() && day.cup_reflection?.trim() && day.self_examination?.trim() && day.series_closing_prayer?.trim());
  }
  return Boolean(day.journal_prompt?.trim() && day.prayer_activation?.trim());
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
    if (dayNumber === COMMUNION_DAY_NUMBER) {
      if (!day.devotional_reading?.trim()) return `Day ${dayNumber} needs the Rest Reflection before publishing.`;
      if (!day.confession?.trim()) return `Day ${dayNumber} needs today's confession of rest before publishing.`;
      if (!day.self_examination?.trim()) return `Day ${dayNumber} needs the Reverent Self-Examination & Blessing before publishing.`;
      if (!day.bread_reflection?.trim()) return `Day ${dayNumber} needs the Bread Reflection before publishing.`;
      if (!day.cup_reflection?.trim()) return `Day ${dayNumber} needs the Cup Reflection before publishing.`;
      if (!day.series_closing_prayer?.trim()) return `Day ${dayNumber} needs the Series Closing Prayer before publishing.`;
      continue;
    }

    if (!day.devotional_reading?.trim()) return `Day ${dayNumber} needs a devotional reading before publishing.`;
    if (!day.confession?.trim()) return `Day ${dayNumber} needs today's confession before publishing.`;
    if (!day.journal_prompt?.trim()) return `Day ${dayNumber} needs a 5-minute journal prompt before publishing.`;
    if (!day.prayer_activation?.trim()) return `Day ${dayNumber} needs a prayer activation exercise before publishing.`;
  }

  return null;
}
