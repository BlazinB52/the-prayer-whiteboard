import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { sortByDateThenTitle, translationOptionLabel } from "../lib/translation-options.ts";

const read = (file) => readFile(file, "utf8");

test("translation partners are listed newest first, with undated ones after, by title", () => {
  const sorted = sortByDateThenTitle([
    { title: "B undated", date: null },
    { title: "Old", date: "2026-09-12" },
    { title: "A undated", date: null },
    { title: "New", date: "2026-10-10" },
    { title: "Same day b", date: "2026-09-26" },
    { title: "Same day a", date: "2026-09-26" },
  ]);
  assert.deepEqual(sorted.map((item) => item.title), ["New", "Same day a", "Same day b", "Old", "A undated", "B undated"]);
});

test("a translation partner reads date, title, status and whether it is taken", () => {
  assert.equal(translationOptionLabel({ title: "De Gloria en Gloria", status: "published", date: "2026-10-10" }, false), "Oct 10, 2026 · De Gloria en Gloria");
  assert.equal(translationOptionLabel({ title: "Borrador", status: "draft", date: null }, true), "No gathering date · Borrador (draft) — already paired with another item");
});

test("the translation picker's list gets its dates from the teaching, or for a devotional from the teaching it belongs to", async () => {
  const source = await read("lib/translation-options.ts");
  assert.match(source, /gathering_date/);
  assert.match(source, /from\("teaching_devotional_assignments"\)/);
  assert.match(source, /sortByDateThenTitle\(/);
});

test("the outlines' Related teaching pickers use the shared dated, English-only list and keep a chosen teaching", async () => {
  const manager = await read("app/admin/outlines/outline-manager.tsx");
  assert.match(manager, /<TeachingChoiceOptions teachings=\{teachings\} \/>/);
  assert.match(manager, /<TeachingChoiceOptions teachings=\{teachings\} selectedId=\{outline\.teachingId\} \/>/);
  assert.doesNotMatch(manager, /function TeachingOptions/);
  const page = await read("app/admin/outlines/page.tsx");
  assert.match(page, /loadTeachingChoices\(supabase\)/);
});

test("the Content Manager's outline list shows each outline's teaching date, newest first", async () => {
  const page = await read("app/admin/cm/outline-review/page.tsx");
  assert.match(page, /select\("id, title, language, gathering_date, updated_at"\)/);
  assert.match(page, /\.order\("gathering_date", \{ ascending: false, nullsFirst: false \}\)/);
  assert.match(page, /<TeachingDateLabel date=\{outline\.gathering_date\} \/>/);
});
