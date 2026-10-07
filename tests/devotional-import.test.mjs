import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseDevotionalText } from "../lib/devotional-import.ts";
import { splitDevotionalTextBlocks } from "../lib/devotionals.ts";

function day(dayNumber) {
  return `Day ${dayNumber}: Imported Day ${dayNumber}
Anchor Scriptures:
Reference ${dayNumber}: "Scripture text ${dayNumber}."
The Spiritual Mechanic:
Reading ${dayNumber}.
Today's Confession:
Confession ${dayNumber}.
5-Minute Journal Prompt:
Prompt ${dayNumber}.
Prayer Activation Exercise:
Activation ${dayNumber}.`;
}

test("devotional text importer parses seven labeled day sections", () => {
  const parsed = parseDevotionalText([
    "7-Day Devotional: Imported Series",
    "Optional introduction paragraph.",
    ...[1, 2, 3, 4, 5, 6, 7].map(day),
  ].join("\n"));

  assert.equal(parsed.title, "7-Day Devotional: Imported Series");
  assert.equal(parsed.introduction, "Optional introduction paragraph.");
  assert.equal(parsed.days.length, 7);
  assert.equal(parsed.days[0].day_number, 1);
  assert.deepEqual(parsed.days[0].anchor_scriptures, ['Reference 1: "Scripture text 1."']);
  assert.equal(parsed.days[6].prayer_activation, "Activation 7.");
});

test("admin dashboard exposes a direct devotionals card", async () => {
  const source = await readFile("app/admin/page.tsx", "utf8");
  assert.match(source, /title: "Devotionals"/);
  assert.match(source, /href: "\/admin\/devotionals"/);
  assert.match(source, /<Link key=\{tool\.title\} href=\{tool\.href\}/);
});

test("devotional admin page includes text import action", async () => {
  const source = await readFile("app/admin/teachings/[id]/devotional/page.tsx", "utf8");
  assert.match(source, /importDevotionalText/);
  assert.match(source, /Import From Text File/);
});

test("devotional admin index lists devotional records without teaching-only cards", async () => {
  const source = await readFile("app/admin/devotionals/page.tsx", "utf8");
  assert.match(source, /\.from\("teaching_devotionals"\)/);
  assert.match(source, /devotionals\.map\(\(devotional\)/);
  assert.match(source, /No associated teaching/);
  assert.match(source, /heading="English"/);
  assert.match(source, /heading="Español"/);
  assert.match(source, /\/admin\/devotionals\/\$\{devotional\.id\}/);
  assert.match(source, /Create New Devotional/);
  assert.doesNotMatch(source, /Edit teaching/);
  assert.doesNotMatch(source, /no devotional(?!s)/i);
});

test("devotional text groups dash and bullet-prefixed lines into lists", () => {
  assert.deepEqual(splitDevotionalTextBlocks(`Opening paragraph.
- First item
- Second **bold** item
Closing paragraph.`), [
    { type: "paragraph", text: "Opening paragraph." },
    { type: "bullet-list", items: ["First item", "Second **bold** item"] },
    { type: "paragraph", text: "Closing paragraph." },
  ]);

  assert.deepEqual(splitDevotionalTextBlocks("\u2022 Existing bullet\n\u2022 Another bullet"), [
    { type: "bullet-list", items: ["Existing bullet", "Another bullet"] },
  ]);
});

function diaEspanol(dayNumber) {
  return `Día ${dayNumber}: Día importado ${dayNumber}
Pasajes bíblicos clave:
Referencia ${dayNumber}: "Texto bíblico ${dayNumber}."
La dinámica espiritual:
Lectura ${dayNumber}.
Confesión de hoy:
Confesión ${dayNumber}.
Pregunta para tu diario de 5 minutos:
Pregunta ${dayNumber}.
Ejercicio de activación en oración:
Activación ${dayNumber}.`;
}

test("devotional text importer reads Español day headings and labels", () => {
  const parsed = parseDevotionalText([
    "Devocional de 7 días: Serie importada",
    "Introducción opcional.",
    ...[1, 2, 3, 4, 5, 6, 7].map(diaEspanol),
  ].join("\n"));

  assert.equal(parsed.language, "es");
  assert.equal(parsed.title, "Devocional de 7 días: Serie importada");
  assert.equal(parsed.days.length, 7);
  assert.equal(parsed.days[0].title, "Día 1: Día importado 1");
  assert.equal(parsed.days[0].devotional_reading, "Lectura 1.");
  assert.equal(parsed.days[2].confession, "Confesión 3.");
  assert.equal(parsed.days[4].journal_prompt, "Pregunta 5.");
  assert.equal(parsed.days[6].prayer_activation, "Activación 7.");
  assert.deepEqual(parsed.days[0].anchor_scriptures, ['Referencia 1: "Texto bíblico 1."']);
});

test("devotional text importer accepts Spanish labels without accents or on the same line as the text", () => {
  const section = (n) => `Dia ${n}: Titulo ${n}
Pasajes biblicos clave: Juan 3:16 "Porque de tal manera amó Dios al mundo."
La dinamica espiritual: Lectura ${n}.
Confesion de hoy: Confesión ${n}.
Pregunta para tu diario de 5 minutos: Pregunta ${n}.
Ejercicio de activacion en oracion: Activación ${n}.`;
  const parsed = parseDevotionalText(["Título", ...[1, 2, 3, 4, 5, 6, 7].map(section)].join("\n"));
  assert.equal(parsed.language, "es");
  assert.equal(parsed.days[0].devotional_reading, "Lectura 1.");
  assert.equal(parsed.days[6].prayer_activation, "Activación 7.");
});

test("English devotional files are still detected as English", () => {
  const parsed = parseDevotionalText(["Title", ...[1, 2, 3, 4, 5, 6, 7].map(day)].join("\n"));
  assert.equal(parsed.language, "en");
});

test("a missing label is named in the language of the file, never both", () => {
  const broken = diaEspanol(1).replace("Confesión de hoy:\nConfesión 1.\n", "");
  assert.throws(
    () => parseDevotionalText(["Título", broken, ...[2, 3, 4, 5, 6, 7].map(diaEspanol)].join("\n")),
    (error) => /Missing "Confesión de hoy:"/.test(error.message) && !/Today's Confession|Spanish:/.test(error.message),
  );
  const english = day(1).replace("Today's Confession:\nConfession 1.\n", "");
  assert.throws(
    () => parseDevotionalText(["Title", english, ...[2, 3, 4, 5, 6, 7].map(day)].join("\n")),
    (error) => /Missing "Today's Confession:"/.test(error.message) && !/Confesión|Spanish/.test(error.message),
  );
});

test("labels typed without a colon, 'Anchor Scripture', 'Devotional Reading' and stray ** markers are understood", () => {
  const loose = (n) => `Day ${n}: Loose Day ${n}
Anchor Scripture
**Ephesians 5:11, 14 (KJV) —**  And have no fellowship with darkness.
Devotional Reading
Reading ${n}.
Today’s Confession
Confession ${n}.
5-Minute Journal Prompt
Prompt ${n}.
Prayer Activation Exercise
Activation ${n}.`;
  const parsed = parseDevotionalText(["Title", ...[1, 2, 3, 4, 5, 6, 7].map(loose)].join("\n"));
  assert.equal(parsed.days.length, 7);
  assert.equal(parsed.days[0].devotional_reading, "Reading 1.");
  assert.equal(parsed.days[0].confession, "Confession 1.");
  assert.deepEqual(parsed.days[0].anchor_scriptures, ['Ephesians 5:11, 14 (KJV) — "And have no fellowship with darkness."']);
  assert.equal(parsed.language, "en");
});
