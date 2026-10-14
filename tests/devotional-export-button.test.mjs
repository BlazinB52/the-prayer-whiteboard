import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const standalone = await readFile("app/admin/devotionals/[id]/page.tsx", "utf8");
const teachingPage = await readFile("app/admin/teachings/[id]/devotional/page.tsx", "utf8");
const section = await readFile("app/admin/devotionals/export-for-translation-section.tsx", "utf8");

test("both devotional admin pages show the same Export for translation section", () => {
  assert.match(section, /export function DevotionalExportForTranslationSection\(\{ devotionalId \}/);
  assert.match(section, /\/api\/admin\/devotional\/export\?devotional_id=\$\{devotionalId\}/);
  assert.match(section, /Export for translation \(text file\)/);
  assert.match(standalone, /<DevotionalExportForTranslationSection devotionalId=\{devotional\.id\} \/>/);
  assert.match(teachingPage, /<DevotionalExportForTranslationSection devotionalId=\{devotional\.id\} \/>/);
  // Neither page keeps its own copy of the section, so they cannot drift apart.
  assert.doesNotMatch(standalone, /<section id="export-for-translation"/);
  assert.doesNotMatch(teachingPage, /<section id="export-for-translation"/);
});

test("a teaching's devotional page only offers the export once a devotional exists", () => {
  assert.match(teachingPage, /\{devotional \? <DevotionalExportForTranslationSection/);
});

test("each page has the 'Export for translation' link at the top, like the teachings page", () => {
  const link = /<a href="#export-for-translation"[^>]*>Export for translation<\/a>/;
  assert.match(standalone, link);
  assert.match(teachingPage, /\{devotional \? <a href="#export-for-translation"[^>]*>Export for translation<\/a> : null\}/);
  const teachings = readFile("app/admin/teachings/[id]/edit/page.tsx", "utf8");
  return teachings.then((source) => assert.match(source, link, "the teachings page uses the same link"));
});

test("the section's anchor id matches the top links", () => {
  assert.match(section, /DEVOTIONAL_EXPORT_SECTION_ID = "export-for-translation"/);
  assert.match(section, /<section id=\{DEVOTIONAL_EXPORT_SECTION_ID\}/);
});

test("the export route reads the Day 7 Communion fields, so Day 7 is not exported empty", async () => {
  const route = await readFile("app/api/admin/devotional/export/route.ts", "utf8");
  for (const column of ["bread_reflection", "cup_reflection", "self_examination", "series_closing_prayer"]) {
    assert.match(route, new RegExp(column), `${column} is exported`);
  }
});
