import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const standalone = await readFile("app/admin/devotionals/[id]/page.tsx", "utf8");
const teachingPage = await readFile("app/admin/teachings/[id]/devotional/page.tsx", "utf8");
const section = await readFile("app/admin/devotionals/print-preview-section.tsx", "utf8");
const printPage = await readFile("app/admin/devotionals/[id]/print/page.tsx", "utf8");
const printable = await readFile("app/admin/devotionals/printable-devotional.tsx", "utf8");
const css = await readFile("app/globals.css", "utf8");

// The way it looks on paper was checked by eye in a browser with a sample devotional (Day 7 in the Communion layout,
// the gold-line Scripture style, the date, the introduction). These tests keep the wiring and the print rules in place.

test("both devotional admin pages offer the same Print preview box, and a link to it at the top", () => {
  assert.match(section, /export function DevotionalPrintPreviewSection\(\{ devotionalId \}/);
  assert.match(section, /DEVOTIONAL_PRINT_SECTION_ID = "print-preview"/);
  assert.match(section, /<section id=\{DEVOTIONAL_PRINT_SECTION_ID\}/);
  assert.match(section, /href=\{`\/admin\/devotionals\/\$\{devotionalId\}\/print`\} target="_blank"/, "opens the printable page in a new tab, like the teachings");
  assert.match(section, /Preview Printable Devotional/);
  assert.match(standalone, /<DevotionalPrintPreviewSection devotionalId=\{devotional\.id\} \/>/);
  assert.match(teachingPage, /\{devotional \? <DevotionalPrintPreviewSection devotionalId=\{devotional\.id\} \/> : null\}/);
  for (const page of [standalone, teachingPage]) assert.match(page, /<a href="#print-preview"[^>]*>Print preview<\/a>/);
  assert.doesNotMatch(standalone + teachingPage, /<section id="print-preview"/, "neither page keeps its own copy of the box");
});

test("the printable page is admin only, read only, and shows the saved text of a draft or a published devotional", () => {
  assert.match(printPage, /await requireAdmin\(\)/);
  assert.match(printPage, /UUID_PATTERN\.test\(id\)\) notFound\(\)/);
  assert.match(printPage, /\.select\(DEVOTIONAL_DAY_COLUMNS\)/, "reads every day column, including the Day 7 Communion fields");
  assert.match(printPage, /\.order\("day_number", \{ ascending: true \}\)/);
  assert.doesNotMatch(printPage, /\.(insert|update|upsert|delete)\(/, "it only reads");
  assert.doesNotMatch(printPage, /\.eq\("status"/, "it works on a draft as well as a published devotional");
  assert.match(printPage, /robots: \{ index: false, follow: false \}/);
});

test("the controls are hidden when printing, and the Print button is the shared one", () => {
  assert.match(printPage, /<div className="print-controls[^"]*"/);
  assert.match(printPage, /<PrintPreviewButton label="Print Devotional" \/>/);
  assert.match(printPage, /Back to the Devotional/);
  assert.match(css, /\.print-controls,/, "the shared print rules already hide .print-controls");
});

test("the printout uses the same section list as the website and the email, so Day 7 comes out in the Communion layout", () => {
  assert.match(printable, /devotionalDaySections\(day, t\)/);
  assert.match(printable, /const t = ui\(language\)/, "labels follow the devotional's language");
  assert.match(printable, /t\.sevenDayDevotional/);
  assert.match(printable, /<ScriptureList entries=\{day\.anchor_scriptures\} \/>/, "Scriptures use the standard gold-line style");
  assert.match(printable, /sort\(\(a, b\) => a\.day_number - b\.day_number\)/);
});

test("every day after the first starts on a new sheet, and a field's heading stays with its text", () => {
  assert.match(css, /\.print-day \+ \.print-day \{\s*break-before: page;\s*page-break-before: always;/);
  assert.match(css, /\.print-day-header,\s*\.print-field-heading \{\s*break-after: avoid;/);
  assert.match(css, /\.print-field \{\s*break-inside: avoid;/);
  // These rules must sit inside the print media block, or they would change the on-screen page too.
  const printBlock = css.indexOf("@media print");
  assert.ok(printBlock > -1 && css.indexOf(".print-day + .print-day") > printBlock);
});
