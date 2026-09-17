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
};

const DAY_HEADING_PATTERN = /^Day\s+([1-7]):\s+.+/i;
const MAX_ANCHOR_SCRIPTURE_LENGTH = 1000;
const LABELS = [
  "Anchor Scriptures:",
  "The Spiritual Mechanic:",
  "Today's Confession:",
  "5-Minute Journal Prompt:",
  "Prayer Activation Exercise:",
] as const;

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
  for (const label of LABELS) {
    if (line === label) return [line];
    if (line.startsWith(label)) {
      const rest = cleanText(line.slice(label.length));
      return rest ? [label, rest] : [label];
    }
  }
  return [line];
}

function normalizeLines(text: string) {
  const lines: string[] = [];
  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = cleanText(rawLine);
    if (!line) continue;
    for (const expanded of expandLabeledLine(line)) {
      lines.push(expanded);
    }
  }
  return lines;
}

function readBlock(section: string[], label: (typeof LABELS)[number]) {
  const start = section.indexOf(label);
  if (start === -1) {
    throw new Error(`Missing "${label}" in ${section[0]}.`);
  }

  let end = section.length;
  for (let index = start + 1; index < section.length; index += 1) {
    if ((LABELS as readonly string[]).includes(section[index])) {
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

  const anchorScriptures = readBlock(section, "Anchor Scriptures:");
  const devotionalReading = readBlock(section, "The Spiritual Mechanic:");
  const confession = readBlock(section, "Today's Confession:");
  const journalPrompt = readBlock(section, "5-Minute Journal Prompt:");
  const prayerActivation = readBlock(section, "Prayer Activation Exercise:");

  return {
    day_number: Number(match[1]),
    title: section[0],
    anchor_scriptures: anchorScriptures,
    devotional_reading: devotionalReading.join("\n"),
    confession: confession.join("\n"),
    journal_prompt: journalPrompt.join("\n"),
    prayer_activation: prayerActivation.join("\n"),
  };
}

function validateImportedDevotional(devotional: ImportedDevotional) {
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
  return devotional;
}
