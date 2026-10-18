import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const standalone = await readFile("app/admin/devotionals/[id]/page.tsx", "utf8");
const section = await readFile("app/admin/devotionals/export-for-translation-section.tsx", "utf8");

test("the devotional admin page shows the Export for translation section", () => {
  assert.match(section, /export function DevotionalExportForTranslationSection\(\{ devotionalId \}/);
  assert.match(section, /\/api\/admin\/devotional\/export\?devotional_id=\$\{devotionalId\}/);
  assert.match(section, /Export for translation \(text file\)/);
  assert.match(standalone, /<DevotionalExportForTranslationSection devotionalId=\{devotional\.id\} \/>/);
  // The page keeps no copy of the section.
  assert.doesNotMatch(standalone, /<section id="export-for-translation"/);
});

test("the page has the 'Export for translation' link at the top, like the teachings page", () => {
  const link = /<a href="#export-for-translation"[^>]*>Export for translation<\/a>/;
  assert.match(standalone, link);
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
