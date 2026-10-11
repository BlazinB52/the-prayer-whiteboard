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

// Day 7 is the Communion and rest day: no journal prompt or prayer activation.
function communionDay() {
  return `DAY 7 — COMMUNION AND REST: Imported Rest
Anchor Scriptures:
Hebrews 4:9-10: "There remaineth therefore a rest."
The Rest Reflection:
Rest reading.
Today's Confession of Rest:
Rest confession.
The Table of Remembrance:
Prepare a small piece of bread and a small cup of juice.
Reverent Self-Examination & Blessing:
Self-examination text.
The Bread Reflection:
Bread text.
Partaking Declaration: "Lord, as we take this bread."
The Cup Reflection:
Cup text.
Series Closing Prayer:
Closing prayer text.`;
}

const weekOne = () => [...[1, 2, 3, 4, 5, 6].map(day), communionDay()];

test("devotional text importer parses seven labeled day sections", () => {
  const parsed = parseDevotionalText([
    "7-Day Devotional: Imported Series",
    "Optional introduction paragraph.",
    ...weekOne(),
  ].join("\n"));

  assert.equal(parsed.title, "7-Day Devotional: Imported Series");
  assert.equal(parsed.introduction, "Optional introduction paragraph.");
  assert.equal(parsed.days.length, 7);
  assert.equal(parsed.days[0].day_number, 1);
  assert.deepEqual(parsed.days[0].anchor_scriptures, ['Reference 1: "Scripture text 1."']);
  assert.equal(parsed.days[5].prayer_activation, "Activation 6.");
  assert.equal(parsed.days[5].bread_reflection, "");
  assert.equal(parsed.days[6].title, "DAY 7 — COMMUNION AND REST: Imported Rest");
  assert.equal(parsed.days[6].devotional_reading, "Rest reading.");
  assert.equal(parsed.days[6].confession, "Rest confession.");
  assert.equal(parsed.days[6].bread_reflection, 'Bread text.\nPartaking Declaration: "Lord, as we take this bread."');
  assert.equal(parsed.days[6].cup_reflection, "Cup text.");
  assert.equal(parsed.days[6].self_examination, "Self-examination text.");
  assert.equal(parsed.days[6].series_closing_prayer, "Closing prayer text.");
  assert.equal(parsed.days[6].journal_prompt, "");
  assert.equal(parsed.days[6].prayer_activation, "");
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

function diaComunion() {
  return `DÍA 7 — COMUNIÓN Y DESCANSO: Descanso importado
Pasajes bíblicos clave:
Hebreos 4:9-10: "Queda un reposo."
La reflexión del descanso:
Lectura de descanso.
Confesión de descanso de hoy:
Confesión de descanso.
La mesa del recuerdo:
Prepará un pedacito de pan y una copita de jugo.
Autoexamen reverente y bendición:
Texto del autoexamen.
La reflexión del pan:
Texto del pan.
La reflexión de la copa:
Texto de la copa.
Oración de cierre de la serie:
Texto de la oración de cierre.`;
}

test("devotional text importer reads Español day headings and labels", () => {
  const parsed = parseDevotionalText([
    "Devocional de 7 días: Serie importada",
    "Introducción opcional.",
    ...[1, 2, 3, 4, 5, 6].map(diaEspanol),
    diaComunion(),
  ].join("\n"));

  assert.equal(parsed.language, "es");
  assert.equal(parsed.title, "Devocional de 7 días: Serie importada");
  assert.equal(parsed.days.length, 7);
  assert.equal(parsed.days[0].title, "Día 1: Día importado 1");
  assert.equal(parsed.days[0].devotional_reading, "Lectura 1.");
  assert.equal(parsed.days[2].confession, "Confesión 3.");
  assert.equal(parsed.days[4].journal_prompt, "Pregunta 5.");
  assert.equal(parsed.days[5].prayer_activation, "Activación 6.");
  assert.equal(parsed.days[6].title, "DÍA 7 — COMUNIÓN Y DESCANSO: Descanso importado");
  assert.equal(parsed.days[6].devotional_reading, "Lectura de descanso.");
  assert.equal(parsed.days[6].confession, "Confesión de descanso.");
  assert.equal(parsed.days[6].bread_reflection, "Texto del pan.");
  assert.equal(parsed.days[6].cup_reflection, "Texto de la copa.");
  assert.equal(parsed.days[6].self_examination, "Texto del autoexamen.");
  assert.equal(parsed.days[6].series_closing_prayer, "Texto de la oración de cierre.");
  assert.deepEqual(parsed.days[0].anchor_scriptures, ['Referencia 1: "Texto bíblico 1."']);
});

test("devotional text importer accepts Spanish labels without accents or on the same line as the text", () => {
  const section = (n) => `Dia ${n}: Titulo ${n}
Pasajes biblicos clave: Juan 3:16 "Porque de tal manera amó Dios al mundo."
La dinamica espiritual: Lectura ${n}.
Confesion de hoy: Confesión ${n}.
Pregunta para tu diario de 5 minutos: Pregunta ${n}.
Ejercicio de activacion en oracion: Activación ${n}.`;
  const sevenNoAccents = `Dia 7: Descanso
Pasajes biblicos clave: Hebreos 4:9 "Queda un reposo."
La reflexion del descanso: Lectura 7.
Confesion de descanso de hoy: Confesión 7.
La mesa del recuerdo: Prepara pan y jugo.
Autoexamen reverente y bendicion: Examen 7.
La reflexion del pan: Pan 7.
La reflexion de la copa: Copa 7.
Oracion de cierre de la serie: Cierre 7.`;
  const parsed = parseDevotionalText(["Título", ...[1, 2, 3, 4, 5, 6].map(section), sevenNoAccents].join("\n"));
  assert.equal(parsed.language, "es");
  assert.equal(parsed.days[0].devotional_reading, "Lectura 1.");
  assert.equal(parsed.days[5].prayer_activation, "Activación 6.");
  assert.equal(parsed.days[6].devotional_reading, "Lectura 7.");
  assert.equal(parsed.days[6].self_examination, "Examen 7.");
  assert.equal(parsed.days[6].series_closing_prayer, "Cierre 7.");
});

test("English devotional files are still detected as English", () => {
  const parsed = parseDevotionalText(["Title", ...weekOne()].join("\n"));
  assert.equal(parsed.language, "en");
});

test("a missing label is named in the language of the file, never both", () => {
  const broken = diaEspanol(1).replace("Confesión de hoy:\nConfesión 1.\n", "");
  assert.throws(
    () => parseDevotionalText(["Título", broken, ...[2, 3, 4, 5, 6].map(diaEspanol), diaComunion()].join("\n")),
    (error) => /Missing "Confesión de hoy:"/.test(error.message) && !/Today's Confession|Spanish:/.test(error.message),
  );
  const english = day(1).replace("Today's Confession:\nConfession 1.\n", "");
  assert.throws(
    () => parseDevotionalText(["Title", english, ...[2, 3, 4, 5, 6].map(day), communionDay()].join("\n")),
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
  const parsed = parseDevotionalText(["Title", ...[1, 2, 3, 4, 5, 6].map(loose), communionDay()].join("\n"));
  assert.equal(parsed.days.length, 7);
  assert.equal(parsed.days[0].devotional_reading, "Reading 1.");
  assert.equal(parsed.days[0].confession, "Confession 1.");
  assert.deepEqual(parsed.days[0].anchor_scriptures, ['Ephesians 5:11, 14 (KJV) — "And have no fellowship with darkness."']);
  assert.equal(parsed.language, "en");
});
