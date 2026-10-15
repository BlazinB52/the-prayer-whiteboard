import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { printablePdfDate, validateOptionalPdfDate } from "../lib/printable-pdf-date.ts";

const read = (file) => readFile(file, "utf8");

test("the teaching date is shown instead of the date the PDF was added, without shifting a day", () => {
  const link = { gathering_date: "2026-10-10", created_at: "2026-10-14T23:30:00Z" };
  assert.deepEqual(printablePdfDate(link, "en-US"), { iso: "2026-10-10", text: "Oct 10, 2026", isTeachingDate: true });
  assert.equal(printablePdfDate(link, "es", "long").text, "10 de octubre de 2026");
});

test("a PDF with no teaching date falls back to the date it was added", () => {
  const result = printablePdfDate({ gathering_date: null, created_at: "2026-10-14T12:00:00Z" }, "en-US");
  assert.equal(result.isTeachingDate, false);
  assert.equal(result.iso, "2026-10-14T12:00:00Z");
  assert.match(result.text, /Oct 14, 2026/);
});

test("a teaching date from a form is optional but must be a real date", () => {
  assert.deepEqual(validateOptionalPdfDate(""), { value: null });
  assert.deepEqual(validateOptionalPdfDate("2026-10-10"), { value: "2026-10-10" });
  assert.ok(validateOptionalPdfDate("2026-02-30").error);
  assert.ok(validateOptionalPdfDate("10/10/2026").error);
});

test("both public lists and the admin list sort by the teaching date, newest first, with undated PDFs after", async () => {
  const order = /\.order\("gathering_date", \{ ascending: false, nullsFirst: false \}\)\s*\.order\("created_at", \{ ascending: false \}\)/;
  for (const file of ["app/pdf/page.tsx", "app/espanol/materiales-para-imprimir/page.tsx", "app/admin/printable-pdfs/page.tsx"]) {
    assert.match(await read(file), order, file);
  }
});

test("both public lists show the teaching date, not the date added", async () => {
  for (const file of ["app/pdf/page.tsx", "app/espanol/materiales-para-imprimir/page.tsx"]) {
    const page = await read(file);
    assert.match(page, /printablePdfDate\(link, /, file);
    assert.match(page, /dateTime=\{link\.date\.iso\}/, file);
    assert.doesNotMatch(page, /formatDate\(link\.created_at\)/, file);
  }
});

test("publishing a handout puts its teaching date on the PDF, and the admin page lets the date be set on any PDF", async () => {
  const handouts = await read("app/admin/handouts/actions.ts");
  assert.match(handouts, /gathering_date: handout\.gathering_date \}\)/);
  const admin = await read("app/admin/printable-pdfs/printable-pdf-form.tsx");
  assert.match(admin, /name="gatheringDate" type="date"/);
  assert.match(admin, /<TeachingDateCell id=\{link\.id\} date=\{link\.gathering_date\} \/>/);
  assert.match(admin, />Teaching date<\/th>/);
  const actions = await read("app/admin/printable-pdfs/actions.ts");
  assert.match(actions, /export async function setPrintablePdfDate/);
  assert.match(actions, /requireAdmin\(\)/);
});

test("the migration adds the date, fills it for handouts already published, and indexes the listing", async () => {
  const sql = await read("supabase/migrations/20261015030000_printable_pdf_teaching_date.sql");
  assert.match(sql, /add column if not exists gathering_date date/);
  assert.match(sql, /where handout\.printable_pdf_id = link\.id/);
  assert.match(sql, /gathering_date desc nulls last/);
});
