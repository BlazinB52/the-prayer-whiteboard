// "Export for translation" for a 7-day devotional: writes it as the plain text file the devotional importer
// reads (its English labels, one block per day), so the translated file can be used straight away to create a
// new Español draft. Lines that start with # are notes to the translator and the source marker; the importer
// ignores them, so they can never end up in the devotional.

import { publicationFileName } from "./file-names.ts";
import { spanishTranslationRuleLines } from "./spanish-translation-rules.ts";

export type ExportDevotional = { id: string; title: string; introduction: string | null };
export type ExportDevotionalDay = {
  day_number: number;
  title: string;
  anchor_scriptures: string[] | null;
  devotional_reading: string | null;
  confession: string | null;
  journal_prompt: string | null;
  prayer_activation: string | null;
  bread_reflection?: string | null;
  cup_reflection?: string | null;
  self_examination?: string | null;
  series_closing_prayer?: string | null;
};

const COMMUNION_DAY = 7;

export const DEVOTIONAL_TRANSLATOR_INSTRUCTIONS = [
  "TRANSLATION INSTRUCTIONS (lines that start with # are not imported; leave them or delete them)",
  "Translate this devotional into Español (El Salvador), using the voseo (vos) forms, not neutral Spanish, and following The Prayer Whiteboard's Spanish Translation Rules below.",
  ...spanishTranslationRuleLines(),
  "Translate every line, including the title, the introduction and each day's title. Write each day heading as 'Día 1: ...' (not 'Day 1: ...'): the importer decides the language from the day headings.",
  "Keep each label on its own line. You may leave the English labels as they are, or use exactly these Spanish ones: Pasajes bíblicos clave: / La dinámica espiritual: / Confesión de hoy: / Pregunta para tu diario de 5 minutos: / Ejercicio de activación en oración: (Day 7: La reflexión del descanso: / Confesión de descanso de hoy: / Autoexamen reverente y bendición: / La reflexión del pan: / La reflexión de la copa: / Oración de cierre de la serie:)",
  "Keep **bold**, *italic* and [link](https://address) marks exactly as they are around the translated words.",
  "Each anchor Scripture reads: Reference (VERSION) — \"verse\". Translate the book name, replace the verse with the published RVR1960 or NVI text of that passage, and put that version in parentheses.",
  "Save as plain text (.txt, UTF-8), named yyyymmdd_es_devotional.",
].map((line) => `# ${line}`);

/** 20261010_es_devotional.txt: a date, the language, and the word devotional. */
export function devotionalExportFileName(date: string | null, today: Date = new Date()) {
  return publicationFileName(date, "es", "devotional", "txt", today);
}

const clean = (value: string | null | undefined) => String(value ?? "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
const block = (label: string, value: string | null | undefined) => [label, ...clean(value)];

export function buildDevotionalTranslationText(devotional: ExportDevotional, days: ExportDevotionalDay[]) {
  const out: string[] = [...DEVOTIONAL_TRANSLATOR_INSTRUCTIONS, `# source-devotional: ${devotional.id}`, "", devotional.title.trim(), ...clean(devotional.introduction)];

  for (const day of [...days].sort((a, b) => a.day_number - b.day_number)) {
    out.push("", day.title.trim(), ...block("Anchor Scriptures:", (day.anchor_scriptures ?? []).join("\n")));
    if (day.day_number === COMMUNION_DAY) {
      out.push(
        ...block("The Rest Reflection:", day.devotional_reading),
        ...block("Today's Confession of Rest:", day.confession),
        ...block("Reverent Self-Examination & Blessing:", day.self_examination),
        ...block("The Bread Reflection:", day.bread_reflection),
        ...block("The Cup Reflection:", day.cup_reflection),
        ...block("Series Closing Prayer:", day.series_closing_prayer),
      );
    } else {
      out.push(
        ...block("The Spiritual Mechanic:", day.devotional_reading),
        ...block("Today's Confession:", day.confession),
        ...block("5-Minute Journal Prompt:", day.journal_prompt),
        ...block("Prayer Activation Exercise:", day.prayer_activation),
      );
    }
  }
  return `${out.join("\n")}\n`;
}
