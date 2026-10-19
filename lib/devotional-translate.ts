// "Translate to Español" for a 7-day devotional: sends the English devotional's text to the same translator the
// teachings and handouts use (so the Spanish Translation Rules apply), puts the answer back together as the
// Español text file the devotional importer reads, and parses it with that importer, so an automatic translation
// is checked by exactly the rules a hand translation is. Nothing here touches the database.
//
// Scripture: the model is never asked for Bible wording when the passage can be looked up. Each anchor Scripture's
// verse is the published Reina-Valera 1960 text from BibleGateway; only the reference's book name is translated.
// If a passage cannot be looked up, the model writes it and the passage is listed as "not verified".

import { parseDevotionalText, type ImportedDevotional } from "./devotional-import.ts";
import type { ExportDevotional, ExportDevotionalDay } from "./devotional-export.ts";
import { fetchRvr1960 } from "./rvr1960.ts";
import { SPANISH_SCRIPTURE_VERSION, translateSegments, type AutoTranslateOptions, type TranslationSegment } from "./teaching-auto-translate.ts";

export type DevotionalScripture = { english: string; reference: string; quotation: string; /** True when the verse is the looked-up RVR1960 text. */ verified: boolean };
export type DevotionalTranslation = { imported: ImportedDevotional; text: string; warnings: string[]; scriptures: DevotionalScripture[] };
export type DevotionalTranslateOptions = AutoTranslateOptions & { /** Looks up the RVR1960 text of an English reference. Defaults to BibleGateway. */ fetchVerse?: (reference: string) => Promise<string | null> };

const COMMUNION_DAY = 7;
// The importer's own limits (lib/devotional-import.ts). Text is never shortened to fit: a translation over a limit stops the save.
const LIMITS = { title: 180, introduction: 8000, dayTitle: 170, reading: 12000, short: 3000, communion: 6000, closingPrayer: 3000 } as const;

const ANCHOR_LINE = /^(.*?)\s*\(([^()]+)\)\s*[—–-]\s*([\s\S]*)$/;
const DAY_PREFIX = /^\s*(?:Day|D[ií]a)\s+([1-7])\s*(?::|—|–|-)\s*([\s\S]*)$/i;

const lines = (value: string | null | undefined) => String(value ?? "").replace(/\r\n?/g, "\n").split("\n").map((line) => line.trim()).filter(Boolean);
const stripQuotes = (value: string) => value.trim().replace(/^["“”]+|["“”]+$/g, "").trim();

type ParsedAnchor = { kind: "verse"; english: string; version: string; quote: string } | { kind: "other"; line: string };
function parseAnchor(line: string): ParsedAnchor {
  const match = line.trim().match(ANCHOR_LINE);
  return match ? { kind: "verse", english: match[1].trim(), version: match[2].trim(), quote: stripQuotes(match[3]) } : { kind: "other", line: line.trim() };
}

/** The ids and field names a day's translated pieces travel under. */
const dayKey = (day: number, field: string) => `day${day}.${field}`;

export async function translateDevotional(devotional: ExportDevotional, days: ExportDevotionalDay[], options: DevotionalTranslateOptions): Promise<DevotionalTranslation> {
  const sorted = [...days].sort((a, b) => a.day_number - b.day_number);
  if (sorted.length !== 7 || sorted.some((day, index) => day.day_number !== index + 1)) {
    throw new Error("This devotional needs all seven days before it can be translated. Fill in the missing days first.");
  }

  const anchors = new Map(sorted.map((day) => [day.day_number, (day.anchor_scriptures ?? []).map(parseAnchor)]));

  // Look up each passage once, a few at a time.
  const lookup = options.fetchVerse ?? ((reference: string) => fetchRvr1960(reference, options.fetchImpl));
  const references = [...new Set([...anchors.values()].flat().flatMap((anchor) => (anchor.kind === "verse" ? [anchor.english] : [])))];
  const verses = new Map<string, string | null>();
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(3, references.length) }, async () => {
    while (next < references.length) {
      const reference = references[next++];
      verses.set(reference, await lookup(reference));
    }
  }));

  // One group for the title and introduction, then one per day, so the requests are small and run together.
  const add = (group: TranslationSegment[], id: string, kind: TranslationSegment["kind"], text: string | null | undefined, limit?: number, note?: string) => {
    const value = String(text ?? "").replace(/\r\n?/g, "\n").trim();
    if (!value) return;
    group.push({ id, kind, text: value, ...(limit ? { limit } : {}), ...(note ? { note } : {}) });
  };
  const header: TranslationSegment[] = [];
  add(header, "devotional.title", "heading", devotional.title, LIMITS.title);
  add(header, "devotional.introduction", "text", devotional.introduction, LIMITS.introduction);
  const groups: TranslationSegment[][] = [header];

  for (const day of sorted) {
    const n = day.day_number;
    const group: TranslationSegment[] = [];
    const title = day.title.trim();
    add(group, dayKey(n, "title"), "heading", title.match(DAY_PREFIX)?.[2] || title, LIMITS.dayTitle);
    anchors.get(n)!.forEach((anchor, index) => {
      if (anchor.kind === "other") return add(group, dayKey(n, `anchor${index}.line`), "text", anchor.line);
      add(group, dayKey(n, `anchor${index}.reference`), "scripture_reference", anchor.english);
      if (!verses.get(anchor.english)) {
        add(group, dayKey(n, `anchor${index}.verse`), "scripture_verse", anchor.quote, undefined, `Passage: ${anchor.english}. English (${anchor.version}) shown only so you know which verses; write the RVR1960 text instead.`);
      }
    });
    add(group, dayKey(n, "reading"), "text", day.devotional_reading, n === COMMUNION_DAY ? LIMITS.communion : LIMITS.reading);
    add(group, dayKey(n, "confession"), "text", day.confession, LIMITS.short);
    if (n === COMMUNION_DAY) {
      add(group, dayKey(n, "self_examination"), "text", day.self_examination, LIMITS.communion);
      add(group, dayKey(n, "bread"), "text", day.bread_reflection, LIMITS.communion);
      add(group, dayKey(n, "cup"), "text", day.cup_reflection, LIMITS.communion);
      add(group, dayKey(n, "closing"), "text", day.series_closing_prayer, LIMITS.closingPrayer);
    } else {
      add(group, dayKey(n, "journal"), "text", day.journal_prompt, LIMITS.short);
      add(group, dayKey(n, "prayer"), "text", day.prayer_activation, LIMITS.short);
    }
    groups.push(group);
  }

  const { translated, warnings } = await translateSegments(groups, options);
  const got = (id: string) => translated.get(id) ?? "";

  // Put the Español text file together, the way the importer expects to read it.
  const scriptures: DevotionalScripture[] = [];
  const out: string[] = [got("devotional.title"), ...lines(got("devotional.introduction"))];
  for (const day of sorted) {
    const n = day.day_number;
    const title = got(dayKey(n, "title"));
    out.push("", n === COMMUNION_DAY ? `Día 7 — ${title}` : `Día ${n}: ${title}`, "Pasajes bíblicos clave:");
    anchors.get(n)!.forEach((anchor, index) => {
      if (anchor.kind === "other") return out.push(...lines(got(dayKey(n, `anchor${index}.line`))));
      const looked = verses.get(anchor.english);
      const verse = looked || stripQuotes(got(dayKey(n, `anchor${index}.verse`)));
      const reference = got(dayKey(n, `anchor${index}.reference`));
      scriptures.push({ english: `${anchor.english} (${anchor.version})`, reference: `${reference} (${SPANISH_SCRIPTURE_VERSION})`, quotation: verse, verified: Boolean(looked) });
      out.push(`${reference} (${SPANISH_SCRIPTURE_VERSION}) — "${verse}"`);
    });
    const block = (label: string, field: string) => out.push(label, ...lines(got(dayKey(n, field))));
    if (n === COMMUNION_DAY) {
      block("La reflexión del descanso:", "reading");
      block("Confesión de descanso de hoy:", "confession");
      block("Autoexamen reverente y bendición:", "self_examination");
      block("La reflexión del pan:", "bread");
      block("La reflexión de la copa:", "cup");
      block("Oración de cierre de la serie:", "closing");
    } else {
      block("La dinámica espiritual:", "reading");
      block("Confesión de hoy:", "confession");
      block("Pregunta para tu diario de 5 minutos:", "journal");
      block("Ejercicio de activación en oración:", "prayer");
    }
  }

  const text = `${out.join("\n")}\n`;
  const imported = parseDevotionalText(text);
  const unverified = scriptures.filter((scripture) => !scripture.verified);
  const allWarnings = [...warnings];
  if (unverified.length) {
    allWarnings.push(`The published RVR1960 text could not be looked up for ${unverified.map((scripture) => scripture.reference).join(", ")}. The wording was written by the translator, so check it against an RVR1960 Bible before publishing.`);
  }
  return { imported: { ...imported, sourceDevotionalId: devotional.id }, text, warnings: allWarnings, scriptures };
}
