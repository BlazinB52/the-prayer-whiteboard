import assert from "node:assert/strict";
import test from "node:test";
import { buildOutlineDocx, compareOutlineStructure, listOutlineChanges, mergeAdjacentLists, readOutlineMarker, normalizeInlines } from "../lib/outline-docx.ts";
import { parseOutlineDocx } from "../lib/teaching-outlines.ts";

const ID = "5337c68d-49ec-438f-8fbf-be6fc14ffdbc";
const HASH = "0123456789abcdef0123456789abcdef";

const blocks = [
  { type: "heading", level: 1, inlines: [{ text: "Part One" }] },
  { type: "paragraph", inlines: [{ text: "Plain, " }, { text: "bold", bold: true }, { text: " and " }, { text: "italic", italic: true }, { text: " & <odd> \"text\"." }] },
  { type: "paragraph", inlines: [{ text: "See " }, { text: "the site", href: "https://example.com/a?b=1&c=2", bold: true }, { text: "." }] },
  { type: "heading", level: 3, inlines: [{ text: "Deeper" }] },
  { type: "list", items: [{ level: 0, ordered: false, inlines: [{ text: "Bullet one" }] }, { level: 1, ordered: false, inlines: [{ text: "Nested bullet" }] }, { level: 0, ordered: false, inlines: [{ text: "Bullet two" }] }] },
  { type: "paragraph", inlines: [{ text: "Between" }] },
  { type: "list", items: [{ level: 0, ordered: true, inlines: [{ text: "First" }] }, { level: 1, ordered: true, inlines: [{ text: "Sub" }] }, { level: 0, ordered: true, inlines: [{ text: "Second" }] }] },
  { type: "table", rows: [[[{ text: "A" }], [{ text: "B", bold: true }]], [[{ text: "C" }], []]] },
  { type: "table", rows: [[[{ text: "Second table" }]]] },
  { type: "paragraph", inlines: [{ text: "Last" }] },
];

const exportIt = (overrides = {}) => buildOutlineDocx({ outlineId: ID, hash: HASH, title: "Walking in the Light", subtitle: "Week 3", blocks, ...overrides });
const norm = (list) => list.map((b) => (b.type === "list" ? { ...b, items: b.items.map((i) => ({ ...i, inlines: normalizeInlines(i.inlines) })) } : b.type === "table" ? { ...b, rows: b.rows.map((r) => r.map(normalizeInlines)) } : { ...b, inlines: normalizeInlines(b.inlines) }));

test("an exported outline reads back as exactly the same blocks, title and subtitle", () => {
  const parsed = parseOutlineDocx(exportIt(), "x.docx");
  assert.deepEqual(parsed.errors, []);
  assert.equal(parsed.outline.title, "Walking in the Light");
  assert.equal(parsed.outline.subtitle, "Week 3");
  assert.deepEqual(parsed.outline.blocks, norm(blocks));
});

test("an outline with no subtitle reads back with none", () => {
  const parsed = parseOutlineDocx(exportIt({ subtitle: null }), "x.docx");
  assert.equal(parsed.outline.subtitle, null);
});

test("the marker survives and names the outline and its fingerprint", () => {
  assert.deepEqual(readOutlineMarker(exportIt()), { outlineId: ID, hash: HASH });
  assert.equal(readOutlineMarker(Buffer.from("not a zip")), null);
});

test("two lists in a row come back as one list, and count as one when compared", () => {
  const twoLists = [
    { type: "paragraph", inlines: [{ text: "P" }] },
    { type: "list", items: [{ level: 0, ordered: false, inlines: [{ text: "One" }] }] },
    { type: "list", items: [{ level: 0, ordered: false, inlines: [{ text: "Two" }] }] },
  ];
  const parsed = parseOutlineDocx(exportIt({ blocks: twoLists }), "x.docx");
  assert.equal(parsed.outline.blocks.length, 2);
  assert.deepEqual(compareOutlineStructure(twoLists, parsed.outline.blocks), []);
  assert.equal(mergeAdjacentLists(twoLists).length, 2);
});

test("the same structure with different wording is accepted and the changes are listed", () => {
  const edited = JSON.parse(JSON.stringify(blocks));
  edited[1].inlines = [{ text: "Rewritten paragraph." }];
  edited[4].items[1].inlines = [{ text: "Changed nested" }];
  edited[7].rows[0][1] = [{ text: "B2" }];
  assert.deepEqual(compareOutlineStructure(blocks, edited), []);
  const changes = listOutlineChanges(blocks, edited);
  assert.deepEqual(changes.map((c) => c.where), ["Block 2", "Block 5, item 2", "Block 8, row 1 cell 2"]);
  assert.deepEqual(listOutlineChanges(blocks, blocks), []);
});

test("formatting-only changes (bold, italic, links) count as changes but not as structure changes", () => {
  const edited = JSON.parse(JSON.stringify(blocks));
  edited[1].inlines = [{ text: "Plain, bold and italic & <odd> \"text\"." }];
  assert.deepEqual(compareOutlineStructure(blocks, edited), []);
  assert.equal(listOutlineChanges(blocks, edited).length, 1);
});

test("every structural difference is refused with a plain explanation", () => {
  const clone = () => JSON.parse(JSON.stringify(blocks));

  const fewer = clone();
  fewer.splice(3, 1);
  assert.match(compareOutlineStructure(blocks, fewer)[0], /has 10 blocks.*has 9/s);
  assert.match(compareOutlineStructure(blocks, fewer)[0], /first difference is at block 4/);

  const more = clone();
  more.splice(2, 0, { type: "paragraph", inlines: [{ text: "Extra" }] });
  assert.match(compareOutlineStructure(blocks, more)[0], /has 10 blocks.*has 11/s);

  const kind = clone();
  kind[1] = { type: "heading", level: 2, inlines: kind[1].inlines };
  assert.match(compareOutlineStructure(blocks, kind)[0], /Block 2.*a paragraph.*a heading \(level 2\)/);

  const level = clone();
  level[0].level = 2;
  assert.match(compareOutlineStructure(blocks, level)[0], /Block 1.*heading \(level 1\).*heading \(level 2\)/);

  const items = clone();
  items[4].items.pop();
  assert.match(compareOutlineStructure(blocks, items)[0], /list has 3 items but the document has 2/);

  const indent = clone();
  indent[4].items[1].level = 0;
  assert.match(compareOutlineStructure(blocks, indent)[0], /different indent level or bullet\/number type/);

  const numbered = clone();
  numbered[4].items[0].ordered = true;
  assert.match(compareOutlineStructure(blocks, numbered)[0], /different indent level or bullet\/number type/);

  const table = clone();
  table[7].rows.pop();
  assert.match(compareOutlineStructure(blocks, table)[0], /different number of rows or cells/);

  const cells = clone();
  cells[7].rows[0].pop();
  assert.match(compareOutlineStructure(blocks, cells)[0], /different number of rows or cells/);
});

test("a paragraph emptied in Word disappears on import, which counts as a structure change", () => {
  const withEmpty = JSON.parse(JSON.stringify(blocks));
  withEmpty[5].inlines = [];
  const parsed = parseOutlineDocx(exportIt({ blocks: withEmpty }), "x.docx");
  assert.ok(compareOutlineStructure(blocks, parsed.outline.blocks).length > 0);
});

test("removing the paragraph between two lists merges them, which is a structure change", () => {
  const merged = JSON.parse(JSON.stringify(blocks));
  merged.splice(5, 1);
  merged[4].items.push(...merged[5].items);
  merged.splice(5, 1);
  assert.ok(compareOutlineStructure(blocks, merged).length > 0);
});

test("whitespace-only differences are not counted as changes", () => {
  const a = [{ type: "paragraph", inlines: [{ text: "Hello", bold: true }, { text: " there.\n\n" }] }];
  const b = [{ type: "paragraph", inlines: [{ text: "Hello", bold: true }, { text: "  there." }] }];
  assert.deepEqual(listOutlineChanges(a, b), []);
  const c = [{ type: "paragraph", inlines: [{ text: "Hello", bold: false }, { text: " there!" }] }];
  assert.equal(listOutlineChanges(a, c).length, 1);
});
