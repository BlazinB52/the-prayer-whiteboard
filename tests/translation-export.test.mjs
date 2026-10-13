import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseDevotionalText } from "../lib/devotional-import.ts";
import { buildDevotionalTranslationText, devotionalExportFileName } from "../lib/devotional-export.ts";
import { parseTeachingDocxParts } from "../lib/teaching-docx-import.ts";
import { convertDocxToWeeklyUpdate } from "../lib/weekly-update-docx.ts";
import { buildWeeklyUpdateTranslationDocx, weeklyUpdateExportFileName } from "../lib/weekly-update-export.ts";
import { parts } from "./teaching-docx-fixture.mjs";

// ---------------------------------------------------------------- devotional

const devotional = { id: "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee", title: "Walking in the Light", introduction: "Every day, believers face a **battle**.\nSecond line." };
const day = (n, extra = {}) => ({
  day_number: n,
  title: `Day ${n}: Title ${n}`,
  anchor_scriptures: [`Ephesians 5:11 (KJV) — "And have no fellowship ${n}."`, "John 3:16 (KJV) — \"For God so loved.\""],
  devotional_reading: `Reading ${n} with **bold** and a [link](https://example.com/${n}).\nSecond paragraph.`,
  confession: `Confession ${n}.`,
  journal_prompt: `Prompt ${n}.`,
  prayer_activation: `Activation ${n}.`,
  ...extra,
});
const communion = day(7, { title: "Day 7 — Communion and Rest: Remember", journal_prompt: null, prayer_activation: null, bread_reflection: "Bread.", cup_reflection: "Cup.", self_examination: "Examine.", series_closing_prayer: "Closing." });
const days = [1, 2, 3, 4, 5, 6].map((n) => day(n)).concat(communion);

test("an exported devotional imports straight back, with bold and links kept, the notes ignored and the source named", () => {
  const text = buildDevotionalTranslationText(devotional, days);
  assert.match(text, /^# TRANSLATION INSTRUCTIONS/);
  assert.match(text, /voseo/);
  assert.match(text, /# source-devotional: aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee/);
  const parsed = parseDevotionalText(text);
  assert.equal(parsed.title, "Walking in the Light");
  assert.equal(parsed.introduction, "Every day, believers face a **battle**.\nSecond line.");
  assert.equal(parsed.language, "en");
  assert.equal(parsed.sourceDevotionalId, devotional.id);
  assert.equal(parsed.days.length, 7);
  assert.equal(parsed.days[0].devotional_reading, "Reading 1 with **bold** and a [link](https://example.com/1).\nSecond paragraph.");
  assert.equal(parsed.days[0].anchor_scriptures.length, 2);
  assert.equal(parsed.days[6].bread_reflection, "Bread.");
  assert.equal(parsed.days[6].series_closing_prayer, "Closing.");
  assert.equal(JSON.stringify(parsed).includes("TRANSLATION INSTRUCTIONS"), false, "the notes never become content");
});

test("a translated devotional (Spanish day headings and labels) is read as Español and keeps its source", () => {
  const spanish = buildDevotionalTranslationText(devotional, days)
    .replace(/^(Day) (\d)/gm, "Día $2")
    .replace(/^Anchor Scriptures:$/gm, "Pasajes bíblicos clave:")
    .replace(/^The Spiritual Mechanic:$/gm, "La dinámica espiritual:")
    .replace(/^Today's Confession:$/gm, "Confesión de hoy:")
    .replace(/^5-Minute Journal Prompt:$/gm, "Pregunta para tu diario de 5 minutos:")
    .replace(/^Prayer Activation Exercise:$/gm, "Ejercicio de activación en oración:")
    .replace(/^The Rest Reflection:$/gm, "La reflexión del descanso:")
    .replace(/^Today's Confession of Rest:$/gm, "Confesión de descanso de hoy:")
    .replace(/^Reverent Self-Examination & Blessing:$/gm, "Autoexamen reverente y bendición:")
    .replace(/^The Bread Reflection:$/gm, "La reflexión del pan:")
    .replace(/^The Cup Reflection:$/gm, "La reflexión de la copa:")
    .replace(/^Series Closing Prayer:$/gm, "Oración de cierre de la serie:");
  const parsed = parseDevotionalText(spanish);
  assert.equal(parsed.language, "es");
  assert.equal(parsed.sourceDevotionalId, devotional.id);
  assert.equal(parsed.days[6].cup_reflection, "Cup.");
});

test("a stray ** around a label, a day heading or an anchor Scripture is still removed", () => {
  const text = buildDevotionalTranslationText(devotional, days)
    .replace("Day 1: Title 1", "**Day 1: Title 1**")
    .replace(/^Anchor Scriptures:$/m, "**Anchor Scriptures:**")
    .replace('Ephesians 5:11 (KJV) — "And have no fellowship 1."', '**Ephesians 5:11 (KJV) —** "And have no fellowship 1."');
  const parsed = parseDevotionalText(text);
  assert.equal(parsed.days[0].title, "Day 1: Title 1");
  assert.equal(parsed.days[0].anchor_scriptures[0].includes("**"), false);
});

test("the devotional file is named es_ then a date then devotional", () => {
  assert.equal(devotionalExportFileName("2026-10-10"), "es_20261010_devotional.txt");
  assert.equal(devotionalExportFileName(null, new Date("2026-11-02T15:00:00Z")), "es_20261102_devotional.txt");
});

// ------------------------------------------------------------ weekly update

const blocks = [
  { type: "heading", level: 2, children: [{ text: "Prayer Focus" }] },
  { type: "paragraph", children: [{ text: "Please pray for " }, { text: "the harvest", bold: true }, { text: " and read " }, { text: "[this](https://example.com/a)", italic: true }, { text: "." }] },
  { type: "heading", level: 3, children: [{ text: "Requests" }] },
  { type: "list", items: [[{ text: "First item" }], [{ text: "Second " }, { text: "item", italic: true }]] },
  { type: "quote", children: [{ text: "A quoted line." }] },
  { type: "divider" },
  { type: "paragraph", children: [{ text: "Closing words." }] },
];

test("an exported weekly update converts straight back to the same blocks", () => {
  const result = convertDocxToWeeklyUpdate(buildWeeklyUpdateTranslationDocx("Weekly Update", blocks));
  // The converter writes bold and italic out explicitly (false when off); compare on that footing.
  const normal = (list) => list.map((block) => JSON.parse(JSON.stringify(block, (key, value) => (key === "children" ? value.map((child) => ({ text: child.text, bold: Boolean(child.bold), italic: Boolean(child.italic) })) : key === "items" ? value.map((item) => item.map((child) => ({ text: child.text, bold: Boolean(child.bold), italic: Boolean(child.italic) }))) : value))));
  assert.deepEqual(normal(result.blocks), normal(blocks));
  assert.deepEqual(result.report.notes.filter((note) => note.level === "warning"), []);
});

test("the weekly update file is named es_ then a date then weekly_update", () => {
  assert.equal(weeklyUpdateExportFileName("2026-10-07T12:00:00+00:00"), "es_20261007_weekly_update.docx");
  assert.equal(weeklyUpdateExportFileName(null, new Date("2026-11-02T15:00:00Z")), "es_20261102_weekly_update.docx");
});

// ------------------------------------------------------- the teaching importer

const meta = (...labels) => labels.flatMap(([label, value]) => [["Heading1", label], [null, value]]);
const teachingDoc = (labels, category = "Primera categoría") => [["Title", "Caminar en la Luz"], ...meta(...labels), ["Heading1", category], [null, "Texto."]];

test("Spanish forms of the Heading 1 labels are understood, and the labels may also stay in English", () => {
  const spanish = parseTeachingDocxParts(parts(teachingDoc([["Tema central", "Tema."], ["Introducción", "Intro."], ["Resumen breve", "Resumen."]])), { language: "es" });
  assert.equal(spanish.ok, true, spanish.errors.join("\n"));
  assert.equal(spanish.teaching.centralTheme, "Tema.");
  const english = parseTeachingDocxParts(parts(teachingDoc([["Central Theme", "Tema."], ["Introduction", "Intro."], ["Short Summary", "Resumen."]])), { language: "es" });
  assert.equal(english.ok, true, english.errors.join("\n"));
});

test("homepage teasers are read, are optional, and are checked for length and completeness", () => {
  const base = [["Central Theme", "T."], ["Introduction", "I."], ["Short Summary", "S."]];
  const withTeasers = parseTeachingDocxParts(parts(teachingDoc([...base, ["Homepage Teaser 1 Heading", "Encabezado uno"], ["Homepage Teaser 1 Text", "Texto uno."], ["Homepage Teaser 2 Heading", "Encabezado dos"], ["Homepage Teaser 2 Text", "Texto dos."]])));
  assert.equal(withTeasers.ok, true, withTeasers.errors.join("\n"));
  assert.deepEqual([withTeasers.teaching.teaser1Heading, withTeasers.teaching.teaser1Text, withTeasers.teaching.teaser2Heading, withTeasers.teaching.teaser2Text], ["Encabezado uno", "Texto uno.", "Encabezado dos", "Texto dos."]);
  assert.equal(withTeasers.teaching.categories[0].title, "Primera categoría", "the category after the teasers is still a category");

  const none = parseTeachingDocxParts(parts(teachingDoc(base)));
  assert.equal(none.ok, true);
  assert.equal(none.teaching.teaser1Heading, "");

  const tooLong = parseTeachingDocxParts(parts(teachingDoc([...base, ["Homepage Teaser 1 Heading", "x".repeat(101)], ["Homepage Teaser 1 Text", "ok"]])));
  assert.equal(tooLong.ok, false);
  assert.match(tooLong.errors.join("\n"), /Homepage Teaser 1 Heading is 101 characters; the limit is 100/);

  const half = parseTeachingDocxParts(parts(teachingDoc([...base, ["Homepage Teaser 2 Heading", "Solo encabezado"]])));
  assert.equal(half.ok, false);
  assert.match(half.errors.join("\n"), /Homepage Teaser 2 has to have both|needs both its heading and its text/);

  const twice = parseTeachingDocxParts(parts(teachingDoc([...base, ["Homepage Teaser 1 Heading", "a"], ["Homepage Teaser 1 Heading", "b"]])));
  assert.match(twice.errors.join("\n"), /appears more than once/);
});

// ------------------------------------------------------------ routes and screens

test("every export route only reads, and only an Administrator can use it", async () => {
  for (const file of ["app/api/admin/teaching/export/route.ts", "app/api/admin/devotional/export/route.ts", "app/api/admin/weekly-update/export/route.ts"]) {
    const source = await readFile(file, "utf8");
    assert.match(source, /getAuthorizedUser\(\)/, file);
    assert.match(source, /status: 401/, file);
    assert.match(source, /export async function GET/, file);
    assert.doesNotMatch(source, /\.(insert|update|upsert|delete)\(/, `${file} never writes`);
    assert.doesNotMatch(source, /export async function (POST|PUT|PATCH|DELETE)/, file);
    assert.match(source, /Content-Disposition/, file);
    assert.match(source, /no-store/, file);
  }
});

test("each edit screen has an export button that works on drafts and published items", async () => {
  const teaching = await readFile("app/admin/teachings/[id]/edit/page.tsx", "utf8");
  assert.match(teaching, /\/api\/admin\/teaching\/export\?teaching_id=/);
  const teachingRoute = await readFile("app/api/admin/teaching/export/route.ts", "utf8");
  assert.match(teachingRoute, /\.in\("status", \["draft", "published"\]\)/);
  const devotional = await readFile("app/admin/devotionals/[id]/page.tsx", "utf8");
  assert.match(devotional, /\/api\/admin\/devotional\/export\?devotional_id=/);
  const weekly = await readFile("app/admin/weekly-updates/page.tsx", "utf8");
  assert.match(weekly, /\/api\/admin\/weekly-update\/export\?weekly_update_id=/);
});

test("importing links the new draft to its source only when asked, only across languages, and only if neither is paired", async () => {
  const teaching = await readFile("app/admin/teachings/import/actions.ts", "utf8");
  assert.match(teaching, /formData\.get\("linkSource"\)/);
  assert.match(teaching, /source\.language !== file\.language/);
  assert.match(teaching, /!source\.alreadyPaired/);
  assert.match(teaching, /translation_of: translationOf/);
  assert.match(teaching, /teaser_1_heading: teaching\.teaser1Heading \|\| null/);
  const devotional = await readFile("app/admin/teachings/devotional-actions.ts", "utf8");
  assert.match(devotional, /formData\.get\("linkSource"\) && imported\.sourceDevotionalId/);
  assert.match(devotional, /original\.language !== language && !original\.translation_of/);
  const form = await readFile("app/admin/teachings/import/import-form.tsx", "utf8");
  assert.match(form, /name="linkSource"/);
  assert.match(form, /Link this draft as the/);
  const devotionalForm = await readFile("app/admin/devotionals/new/create-standalone-devotional-form.tsx", "utf8");
  assert.match(devotionalForm, /name="linkSource"/);
});
