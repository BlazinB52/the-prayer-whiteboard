import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const outlines = await import("../lib/teaching-outlines.ts");
const fixture = await import("./teaching-docx-fixture.mjs");

function parse(paragraphs, extra = {}) {
  const built = fixture.parts(paragraphs, extra);
  return outlines.parseOutlineDocxParts({
    documentXml: built.documentXml,
    stylesXml: built.stylesXml,
    relationshipsXml: built.relationshipsXml,
    ...extra,
  });
}

test("a plain Word outline converts with no special formatting rules", () => {
  const result = parse([
    ["Title", "Walking in the Light"],
    ["Subtitle", "TEACHER’S OUTLINE"],
    ["Heading1", "Lesson at a Glance"],
    [null, "Ask: ", "What captures your attention first?"],
    ["Heading2", "Teaching points"],
    ["ListBullet", "First point"],
    ["ListBullet", { t: "Second ", b: true }, { t: "point", link: "https://example.com/a" }],
  ]);

  assert.equal(result.ok, true);
  assert.deepEqual(result.errors, []);
  assert.equal(result.outline.title, "Walking in the Light");
  assert.equal(result.outline.subtitle, "TEACHER’S OUTLINE");
  assert.deepEqual(result.outline.blocks.map((block) => block.type), ["heading", "paragraph", "heading", "list"]);
  const list = result.outline.blocks[3];
  assert.equal(list.items.length, 2);
  assert.equal(list.items[0].ordered, false);
  assert.deepEqual(list.items[1].inlines, [{ text: "Second ", bold: true }, { text: "point", href: "https://example.com/a" }]);
});

test("a missing Title falls back to the file name and warns", () => {
  const result = parse([[null, "Just a paragraph."]], { fileName: "20261003 Prayer-Outline.docx" });
  assert.equal(result.ok, true);
  assert.equal(result.outline.title, "Prayer Outline");
  assert.match(result.warnings.join(" "), /no Title-style paragraph/);
});

test("unsafe links are kept as plain text and reported", () => {
  const result = parse([["Title", "T"], [null, { t: "click", link: "javascript:alert(1)" }]]);
  assert.equal(result.outline.blocks[0].inlines[0].href, undefined);
  assert.match(result.warnings.join(" "), /could not be used/);
});

test("an empty document is rejected", () => {
  const result = parse([["Title", "Only a title"]]);
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /no readable content/);
});

test("validators and path helpers", () => {
  assert.equal(outlines.validateOutlineTitle("  ").error, "Title is required.");
  assert.equal(outlines.validateOutlineCategoryName("x".repeat(81)).error, "Category name must be 80 characters or fewer.");
  assert.equal(outlines.validateOutlineLanguage("es"), "es");
  assert.equal(outlines.validateOutlineLanguage("fr"), "en");
  assert.equal(outlines.validateGatheringDate("2026-02-30").error, "Date must be a valid date.");
  assert.equal(outlines.suggestOutlineDate("20261003 Walking.docx"), "2026-10-03");
  assert.equal(outlines.outlineSlug("Walking in the Light — Part 1!"), "walking-in-the-light-part-1");
  const uuid = "0a1b2c3d-4e5f-4a1b-8c2d-0123456789ab";
  assert.equal(outlines.isValidOutlineStoragePath(outlines.outlineStoragePath(uuid)), true);
  assert.equal(outlines.isValidOutlineStoragePath("../x.docx"), false);
  assert.equal(outlines.isDocxMagicBytes(new Uint8Array([0x50, 0x4b, 3, 4])), true);
  assert.equal(outlines.isDocxMagicBytes(new Uint8Array([0x25, 0x50, 0x44, 0x46])), false);
});

test("the migration restricts writes to admins and public reads to published rows", async () => {
  const sql = await readFile("supabase/migrations/20261006000000_add_teaching_outlines.sql", "utf8");
  assert.match(sql, /Admins manage teaching outlines[\s\S]*is_authenticated_admin/);
  assert.match(sql, /Public reads published teaching outlines[\s\S]*status = 'published'/);
  assert.match(sql, /bucket_id = 'teaching-outlines' and public\.is_authenticated_admin\(\)/);
});

test("the follow-up migration seeds categories, links teachings, and opens uploads to content managers", async () => {
  const sql = await readFile("supabase/migrations/20261006010000_outlines_categories_teaching_link_staff.sql", "utf8");
  for (const name of ["Prayer", "Communion", "Christian Living"]) assert.match(sql, new RegExp(`'${name}'`));
  assert.match(sql, /teaching_id uuid references public\.teachings\(id\) on delete set null/);
  assert.match(sql, /Staff manage teaching outlines[\s\S]*is_content_manager_or_admin/);
  assert.match(sql, /bucket_id = 'teaching-outlines' and public\.is_content_manager_or_admin\(\)/);
});
