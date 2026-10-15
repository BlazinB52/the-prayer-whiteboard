import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inlinesToMarkup, markupToInlines, planWeeklyUpdateTranslation } from "../lib/weekly-update-translate.ts";
import { weeklyUpdatePlainText } from "../lib/weekly-update-docx.ts";

const read = (file) => readFile(file, "utf8");

const blocks = [
  { type: "heading", level: 2, children: [{ text: "Prayer this week" }] },
  { type: "paragraph", children: [{ text: "Join us ", bold: false }, { text: "Saturday", bold: true }, { text: " at the usual time. See [the page](https://example.org/x)." }] },
  { type: "list", items: [[{ text: "Bring a Bible" }], [{ text: "Bring a friend", italic: true }]] },
  { type: "divider" },
  { type: "quote", children: [{ text: "Be still." }] },
];

test("bold and italic travel as marks and come back as the same pieces; a written link stays text", () => {
  assert.equal(inlinesToMarkup([{ text: "a " }, { text: "b", bold: true }, { text: " c", italic: true }, { text: "d", bold: true, italic: true }]), "a **b** *c*" + "***d***");
  assert.deepEqual(markupToInlines("Hola **mundo** y *tú*"), [{ text: "Hola " }, { text: "mundo", bold: true }, { text: " y " }, { text: "tú", italic: true }]);
  assert.deepEqual(markupToInlines("Ve [la página](https://example.org/x)."), [{ text: "Ve [la página](https://example.org/x)." }]);
});

test("the plan translates the title, headings, paragraphs, list items and quotes, and leaves dividers alone", () => {
  const plan = planWeeklyUpdateTranslation("Weekly Update", blocks);
  const segments = plan.groups.flat();
  assert.equal(segments[0].id, "update.title");
  assert.equal(segments[0].limit, 180);
  assert.deepEqual(segments.slice(1).map((segment) => segment.id), ["b1", "b2", "b3_i1", "b3_i2", "b5"]);
  assert.equal(segments.find((segment) => segment.id === "b1").kind, "heading");
  assert.equal(segments.find((segment) => segment.id === "b2").text, "Join us **Saturday** at the usual time. See [the page](https://example.org/x).");
});

test("applying the translation rebuilds the same shape in Español", () => {
  const plan = planWeeklyUpdateTranslation("Weekly Update", blocks);
  const translated = new Map([
    ["update.title", "Actualización semanal"],
    ["b1", "Oración esta semana"],
    ["b2", "Acompañanos el **sábado** a la hora de siempre. Mirá [la página](https://example.org/x)."],
    ["b3_i1", "Traé una Biblia"],
    ["b3_i2", "*Traé un amigo*"],
    ["b5", "Quedate quieto."],
  ]);
  const built = plan.apply(translated);
  assert.equal(built.title, "Actualización semanal");
  assert.deepEqual(built.blocks.map((block) => block.type), ["heading", "paragraph", "list", "divider", "quote"]);
  assert.equal(built.blocks[0].level, 2);
  assert.deepEqual(built.blocks[1].children[1], { text: "sábado", bold: true });
  assert.deepEqual(built.blocks[2].items[1], [{ text: "Traé un amigo", italic: true }]);
  assert.match(weeklyUpdatePlainText(built.blocks), /Oración esta semana\n\nAcompañanos/);
});

test("a segment that did not come back keeps its English so nothing is lost", () => {
  const plan = planWeeklyUpdateTranslation("Weekly Update", blocks);
  const built = plan.apply(new Map([["update.title", "Actualización"]]));
  assert.deepEqual(built.blocks[0], blocks[0]);
  assert.deepEqual(built.blocks[2], blocks[2]);
});

test("a long letter is translated in several small requests, never one big one", () => {
  const long = Array.from({ length: 40 }, (_, index) => ({ type: "paragraph", children: [{ text: `Paragraph ${index} ` + "word ".repeat(120) }] }));
  const plan = planWeeklyUpdateTranslation("Weekly Update", long);
  assert.ok(plan.groups.length > 3);
  for (const group of plan.groups) {
    assert.ok(group.length <= 12);
    assert.ok(group.reduce((sum, segment) => sum + segment.text.length, 0) <= 3500 + 700);
  }
  assert.equal(plan.groups.flat().length, 41);
});

test("the translate route is Administrator-only, makes a linked draft and publishes and emails nothing", async () => {
  const route = await read("app/api/admin/weekly-update/translate/route.ts");
  assert.match(route, /is_authenticated_admin/);
  assert.match(route, /status: "draft"/);
  assert.match(route, /is_current: false/);
  assert.match(route, /translation_of: updateId/);
  assert.match(route, /already has an Español version/);
  assert.match(route, /Only English weekly updates can be translated/);
  assert.match(route, /nothing to translate/);
  assert.doesNotMatch(route, /publish_weekly_update|status: "published"/);
  assert.doesNotMatch(route, /\.(update|delete)\(/, "the English update is only read");
});

test("importing an Español letter links it to its English original and reads the file name", async () => {
  const actions = await read("app/admin/weekly-updates/actions.ts");
  assert.match(actions, /translation_of: translationOf,/);
  assert.match(actions, /That English weekly update already has an Español version\./);
  const editor = await read("app/admin/weekly-updates/weekly-update-editor.tsx");
  assert.match(editor, /name="translationOf"/);
  assert.match(editor, /parseFileNameStamp\(name\)/);
  const exporter = await read("app/api/admin/weekly-update/export/route.ts");
  assert.match(exporter, /update\.gathering_date as string \| null\) \?\? /, "the exported file is dated with the gathering date");
});
