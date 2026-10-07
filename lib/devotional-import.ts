import { formatAnchorScriptures } from "./anchor-scripture-format.ts";

export type ImportedDevotionalDay = {
  day_number: number;
  title: string;
  anchor_scriptures: string[];
  devotional_reading: string;
  confession: string;
  journal_prompt: string;
  prayer_activation: string;
};

export type ImportedDevotional = {
  title: string;
  introduction: string;
  days: ImportedDevotionalDay[];
  // Español when the file uses the Spanish day headings and labels.
  language: "en" | "es";
};

// English files use "Day 1:" headings and the English labels; Español files use "Día 1:" and the
// Spanish labels below. Each label is the same field either way, so a file may be written in either.
const DAY_HEADING_PATTERN = /^(?:Day|D[ií]a)\s+([1-7]):\s+.+/i;
const SPANISH_DAY_HEADING_PATTERN = /^D[ií]a\s+[1-7]:/i;
const MAX_ANCHOR_SCRIPTURE_LENGTH = 1000;
const LABEL_ALIASES = {
  anchorScriptures: ["Anchor Scriptures:", "Pasajes bíblicos clave:"],
  spiritualMechanic: ["The Spiritual Mechanic:", "La dinámica espiritual:"],
  confession: ["Today's Confession:", "Confesión de hoy:"],
  journalPrompt: ["5-Minute Journal Prompt:", "Pregunta para tu diario de 5 minutos:"],
  prayerActivation: ["Prayer Activation Exercise:", "Ejercicio de activación en oración:"],
} as const;
type LabelKey = keyof typeof LABEL_ALIASES;
const LABELS: readonly string[] = Object.values(LABEL_ALIASES).flat();

// Case and accent differences in a label ("Confesion de hoy:") should not fail an import.
function foldLabel(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}


function cleanText(value: string) {
  return value
    .replace(/\u2018|\u2019/g, "'")
    .replace(/\u201c|\u201d/g, '"')
    .replace(/\u2013|\u2014/g, "-")
    .replace(/\u00a0/g, " ")
    .replace(/\ufffd/g, "'")
    .trim();
}

function expandLabeledLine(line: string) {
  const folded = foldLabel(line);
  for (const label of LABELS) {
    const foldedLabel = foldLabel(label);
    if (folded === foldedLabel) return [label];
    if (folded.startsWith(foldedLabel)) {
      // Accent folding can change the length (NFD), so cut the original line by the label's own length.
      const rest = cleanText(line.slice(label.length));
      return rest ? [label, rest] : [label];
    }
  }
  return [line];
}

// Other ways a label is commonly typed in Word: with no colon, "Anchor Scripture" in the singular, or
// "Devotional Reading" for the spiritual mechanic. Each is read as the label it stands for.
const LABEL_VARIANTS: Record<string, string> = {
  "anchor scripture": "Anchor Scriptures:",
  "anchor scripture:": "Anchor Scriptures:",
  "anchor scriptures": "Anchor Scriptures:",
  "the spiritual mechanic": "The Spiritual Mechanic:",
  "spiritual mechanic": "The Spiritual Mechanic:",
  "spiritual mechanic:": "The Spiritual Mechanic:",
  "devotional reading": "The Spiritual Mechanic:",
  "devotional reading:": "The Spiritual Mechanic:",
  "today's confession": "Today's Confession:",
  "5-minute journal prompt": "5-Minute Journal Prompt:",
  "prayer activation exercise": "Prayer Activation Exercise:",
};

function canonicalLabel(line: string) {
  const folded = foldLabel(line).replace(/\s+/g, " ");
  const variant = LABEL_VARIANTS[folded];
  if (variant) return variant;
  return LABELS.find((label) => foldLabel(label).replace(/:$/, "") === folded.replace(/:$/, "")) ?? null;
}

// An anchor Scripture typed as "Reference (KJV) - the verse words" with no quotation marks becomes
// the standard Reference (KJV) — "the verse words". The wording itself is never changed.
const UNQUOTED_ANCHOR = /^(.*?\([^()]+\))\s*-\s*([^"\s].*)$/;
function quoteBareAnchor(line: string) {
  if (line.includes('"')) return line;
  const match = line.match(UNQUOTED_ANCHOR);
  return match ? `${match[1].trim()} - "${match[2].trim()}"` : line;
}

function normalizeLines(text: string) {
  const lines: string[] = [];
  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    // Leftover **bold** markers from pasted text are not part of the wording.
    const line = cleanText(rawLine.replace(/\*\*/g, ""));
    if (!line) continue;
    const label = canonicalLabel(line);
    if (label) {
      lines.push(label);
      continue;
    }
    for (const expanded of expandLabeledLine(line)) {
      lines.push(expanded);
    }
  }
  return lines;
}

function readBlock(section: string[], key: LabelKey) {
  const aliases = LABEL_ALIASES[key] as readonly string[];
  const start = section.findIndex((line) => aliases.includes(line));
  if (start === -1) {
    // Name the label in the language of this day's own heading, so an English file is never told about Spanish.
    const label = SPANISH_DAY_HEADING_PATTERN.test(section[0]) ? aliases[1] : aliases[0];
    throw new Error(`Missing "${label}" in ${section[0]}. The label must be on its own line, spelled exactly like this.`);
  }

  let end = section.length;
  for (let index = start + 1; index < section.length; index += 1) {
    if (LABELS.includes(section[index])) {
      end = index;
      break;
    }
  }

  return section.slice(start + 1, end);
}

function splitDaySections(lines: string[]) {
  const starts = lines
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => DAY_HEADING_PATTERN.test(line));

  if (starts.length !== 7) {
    throw new Error(`Expected 7 day sections, found ${starts.length}.`);
  }

  return starts.map(({ index }, position) => {
    const end = starts[position + 1]?.index ?? lines.length;
    const section = lines.slice(index, end);
    const closingNoteIndex = section.findIndex((line) => line.startsWith("If you would like to expand"));
    return closingNoteIndex === -1 ? section : section.slice(0, closingNoteIndex);
  });
}

function parseDay(section: string[]): ImportedDevotionalDay {
  const match = section[0].match(DAY_HEADING_PATTERN);
  if (!match) throw new Error(`Invalid day heading: ${section[0]}`);

  const anchorScriptures = readBlock(section, "anchorScriptures").map(quoteBareAnchor);
  const devotionalReading = readBlock(section, "spiritualMechanic");
  const confession = readBlock(section, "confession");
  const journalPrompt = readBlock(section, "journalPrompt");
  const prayerActivation = readBlock(section, "prayerActivation");

  return {
    day_number: Number(match[1]),
    title: section[0],
    anchor_scriptures: formatAnchorScriptures(anchorScriptures),
    devotional_reading: devotionalReading.join("\n"),
    confession: confession.join("\n"),
    journal_prompt: journalPrompt.join("\n"),
    prayer_activation: prayerActivation.join("\n"),
  };
}

function validateImportedDevotional(devotional: Omit<ImportedDevotional, "language">) {
  if (!devotional.title) throw new Error("The devotional title is missing.");
  if (devotional.title.length > 180) throw new Error("The devotional title must be 180 characters or fewer.");
  if (devotional.introduction.length > 8000) throw new Error("The devotional introduction must be 8,000 characters or fewer.");

  const expectedDayNumbers = [1, 2, 3, 4, 5, 6, 7];
  const actualDayNumbers = devotional.days.map((day) => day.day_number);
  if (actualDayNumbers.some((dayNumber, index) => dayNumber !== expectedDayNumbers[index])) {
    throw new Error("Day headings must run from Day 1 through Day 7 in order.");
  }

  for (const day of devotional.days) {
    if (!day.title.trim()) throw new Error(`Day ${day.day_number} needs a title.`);
    if (day.title.length > 180) throw new Error(`Day ${day.day_number} title must be 180 characters or fewer.`);
    if (!day.anchor_scriptures.length) throw new Error(`Day ${day.day_number} needs at least one anchor Scripture.`);
    if (day.anchor_scriptures.length > 20) throw new Error(`Day ${day.day_number} has more than 20 anchor Scriptures.`);
    if (day.anchor_scriptures.some((scripture) => scripture.length > MAX_ANCHOR_SCRIPTURE_LENGTH)) {
      throw new Error(`Day ${day.day_number} has an anchor Scripture longer than ${MAX_ANCHOR_SCRIPTURE_LENGTH} characters.`);
    }
    if (!day.devotional_reading.trim()) throw new Error(`Day ${day.day_number} needs a devotional reading.`);
    if (day.devotional_reading.length > 12000) throw new Error(`Day ${day.day_number} devotional reading must be 12,000 characters or fewer.`);
    if (!day.confession.trim()) throw new Error(`Day ${day.day_number} needs today's confession.`);
    if (day.confession.length > 3000) throw new Error(`Day ${day.day_number} confession must be 3,000 characters or fewer.`);
    if (!day.journal_prompt.trim()) throw new Error(`Day ${day.day_number} needs a journal prompt.`);
    if (day.journal_prompt.length > 3000) throw new Error(`Day ${day.day_number} journal prompt must be 3,000 characters or fewer.`);
    if (!day.prayer_activation.trim()) throw new Error(`Day ${day.day_number} needs a prayer activation exercise.`);
    if (day.prayer_activation.length > 3000) throw new Error(`Day ${day.day_number} prayer activation must be 3,000 characters or fewer.`);
  }
}

export function parseDevotionalText(text: string): ImportedDevotional {
  const lines = normalizeLines(text);
  const firstDayIndex = lines.findIndex((line) => DAY_HEADING_PATTERN.test(line));
  if (firstDayIndex <= 0) {
    throw new Error("The file must start with a devotional title before Day 1.");
  }

  const title = lines[0];
  const introduction = lines.slice(1, firstDayIndex).join("\n");
  const days = splitDaySections(lines.slice(firstDayIndex)).map(parseDay);
  const devotional = { title, introduction, days };
  validateImportedDevotional(devotional);
  const language = lines.slice(firstDayIndex).some((line) => SPANISH_DAY_HEADING_PATTERN.test(line)) ? "es" : "en";
  return { ...devotional, language };
}
