import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { inlinesToMarkup, markupToInlines, planHandoutTranslation } from "../lib/handout-translate.ts";
import { translateSegments } from "../lib/teaching-auto-translate.ts";

const read = (file) => readFile(file, "utf8");

// ---------------------------------------------------------------------------
// Bold, italic and links survive the trip to the translator and back
// ---------------------------------------------------------------------------

test("inlines become wording and come back the same", () => {
  const inlines = [
    { text: "Behold. ", bold: true },
    { text: "Look at " },
    { text: "John 15", href: "https://example.com/john" },
    { text: " and " },
    { text: "stay", italic: true },
    { text: " close." },
  ];
  assert.equal(inlinesToMarkup(inlines), "**Behold. **Look at [John 15](https://example.com/john) and *stay* close.");
  assert.deepEqual(markupToInlines(inlinesToMarkup(inlines)), inlines);
});

test("a bold lead-in stays a bold lead-in in the translation", () => {
  assert.deepEqual(markupToInlines("**Contemplá al Señor. **Dale tu atención."), [{ text: "Contemplá al Señor. ", bold: true }, { text: "Dale tu atención." }]);
});

test("only http(s) addresses become links, and unmatched stars stay as text", () => {
  assert.deepEqual(markupToInlines("[click](javascript:alert(1))"), [{ text: "[click](javascript:alert(1))" }]);
  assert.deepEqual(markupToInlines("a * b"), [{ text: "a * b" }]);
});

// ---------------------------------------------------------------------------
// The plan: what is sent, and how the answer is put back
// ---------------------------------------------------------------------------

const blocks = [
  { type: "section_title", inlines: [{ text: "FROM GLORY TO GLORY" }] },
  { type: "subtitle", inlines: [{ text: "Beholding the Lord" }] },
  { type: "paragraph", inlines: [{ text: "God chose believers (Ephesians 1:3–4)." }] },
  { type: "paragraph_title", inlines: [{ text: "Joined and Sealed" }] },
  { type: "list", items: [{ level: 0, ordered: false, inlines: [{ text: "Behold. ", bold: true }, { text: "Look." }] }, { level: 0, ordered: false, inlines: [{ text: "Honor." }] }] },
  { type: "tagline", inlines: [{ text: "2 Corinthians 3:18" }] },
  { type: "section_title", inlines: [{ text: "CARRYING HIS PRESENCE" }] },
  { type: "tagline", inlines: [{ text: "Stay close • Stay available" }] },
];

test("the title gets its own group and each section its own, so sections are translated together", () => {
  const plan = planHandoutTranslation("From Glory to Glory", blocks);
  assert.equal(plan.groups.length, 3);
  assert.deepEqual(plan.groups[0].map((segment) => segment.id), ["handout.title"]);
  assert.deepEqual(plan.groups[1].map((segment) => segment.id), ["b1", "b2", "b3", "b4", "b5_i1", "b5_i2", "b6"]);
  assert.deepEqual(plan.groups[2].map((segment) => segment.id), ["b7", "b8"]);
});

test("titles are headings, text is text, and a line that is only a Scripture reference is a reference", () => {
  const [, section] = planHandoutTranslation("T", blocks).groups;
  const kinds = Object.fromEntries(section.map((segment) => [segment.id, segment.kind]));
  assert.deepEqual(kinds, { b1: "heading", b2: "heading", b3: "text", b4: "heading", b5_i1: "text", b5_i2: "text", b6: "scripture_reference" });
});

test("no length limit is sent for the body, so nothing is ever shortened; the title has the site's 200", () => {
  const plan = planHandoutTranslation("T", blocks);
  assert.equal(plan.groups[0][0].limit, 200);
  assert.equal(plan.groups.flat().filter((segment) => segment.id !== "handout.title").some((segment) => "limit" in segment), false);
});

test("the Español handout has the same shape as the English one, with the words replaced", () => {
  const plan = planHandoutTranslation("From Glory to Glory", blocks);
  const translated = new Map([
    ["handout.title", "De Gloria en Gloria"],
    ["b1", "De Gloria en Gloria"],
    ["b2", "Contemplando al Señor"],
    ["b3", "Dios escogió a los creyentes (Efesios 1:3–4)."],
    ["b4", "Unidos y Sellados"],
    ["b5_i1", "**Contemplá. **Mirá."],
    ["b5_i2", "Honrá."],
    ["b6", "2 Corintios 3:18"],
    ["b7", "Llevando Su Presencia"],
    ["b8", "Mantenete cerca • Permanecé disponible"],
  ]);
  const result = plan.apply(translated);
  assert.equal(result.title, "De Gloria en Gloria");
  assert.deepEqual(result.blocks.map((block) => block.type), blocks.map((block) => block.type));
  assert.deepEqual(result.blocks[4].items[0].inlines, [{ text: "Contemplá. ", bold: true }, { text: "Mirá." }]);
  assert.equal(result.blocks[4].items[0].level, 0);
  assert.equal(result.blocks[4].items[1].ordered, false);
  assert.deepEqual(result.blocks[2].inlines, [{ text: "Dios escogió a los creyentes (Efesios 1:3–4)." }]);
});

test("a title typed in capitals in English is in capitals in Español, because the Word template shows titles in capitals", () => {
  const plan = planHandoutTranslation("T", blocks);
  const result = plan.apply(new Map([["b1", "De Gloria en Gloria"], ["b2", "Contemplando al Señor"], ["b4", "Unidos y Sellados"]]));
  assert.equal(result.blocks[0].inlines[0].text, "DE GLORIA EN GLORIA");
  assert.equal(result.blocks[1].inlines[0].text, "Contemplando al Señor", "a subtitle typed in sentence case stays that way");
  assert.equal(result.blocks[3].inlines[0].text, "Unidos y Sellados");
});

test("anything the translator did not return stays as it was, rather than disappearing", () => {
  const result = planHandoutTranslation("Title", blocks).apply(new Map([["b3", "Solo esto."]]));
  assert.equal(result.title, "Title");
  assert.deepEqual(result.blocks[0], blocks[0]);
  assert.deepEqual(result.blocks[2].inlines, [{ text: "Solo esto." }]);
});

// ---------------------------------------------------------------------------
// The translator is the teachings' translator
// ---------------------------------------------------------------------------

function fakeFetch(answer) {
  return async (_url, init) => {
    const body = JSON.parse(init.body);
    const segments = JSON.parse(body.messages[0].content.slice(body.messages[0].content.indexOf("{"))).segments;
    return new Response(JSON.stringify({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "save_translation", input: { segments: segments.map((segment) => ({ id: segment.id, text: answer(segment) })) } }] }), { status: 200, headers: { "content-type": "application/json" } });
  };
}

test("every group is translated and checked, and a too-long title stops with nothing cut", async () => {
  const plan = planHandoutTranslation("Short", blocks);
  const done = await translateSegments(plan.groups, { apiKey: "test", fetchImpl: fakeFetch((segment) => `ES ${segment.text}`) });
  assert.equal(done.translated.get("b3"), "ES God chose believers (Ephesians 1:3–4).");
  await assert.rejects(
    translateSegments(plan.groups, { apiKey: "test", fetchImpl: fakeFetch((segment) => (segment.id === "handout.title" ? "x".repeat(201) : "ok")) }),
    /The handout title is 201 characters in Spanish, over the website's 200-character limit\. Nothing was saved and nothing was cut/,
  );
});

// ---------------------------------------------------------------------------
// The button, the route and the footer
// ---------------------------------------------------------------------------

test("the translate route is Administrator-only, English-only, one Español version per handout, and saves a draft", async () => {
  const route = await read("app/api/admin/handout/translate/route.ts");
  assert.match(route, /is_authenticated_admin/);
  assert.match(route, /handout\.language === "es"/);
  assert.match(route, /eq\("translation_of", handoutId\)/);
  assert.match(route, /status: 409/);
  assert.match(route, /language: "es"/);
  assert.match(route, /translation_of: handoutId/);
  assert.match(route, /status: "draft"/);
  assert.match(route, /gathering_date: handout\.gathering_date/);
  assert.match(route, /teaching_id: handout\.teaching_id/);
  assert.doesNotMatch(route, /\.update\(/, "the English handout is only read");
});

test("only an English handout with a draft offers the button, and the Español handout links back", async () => {
  const page = await read("app/admin/handouts/[id]/page.tsx");
  assert.match(page, /language === "en" && hasDraft/);
  assert.match(page, /<TranslateToEspanolButton/);
  assert.match(page, /Translated from the English handout/);
});

test("the footer is chosen from the existing footers of the handout's own language", async () => {
  const page = await read("app/admin/handouts/[id]/page.tsx");
  assert.match(page, /from\("content_footers"\)[\s\S]*eq\("language", language\)/);
  const actions = await read("app/admin/handouts/actions.ts");
  const footer = actions.slice(actions.indexOf("export async function setHandoutFooter"), actions.indexOf("export async function saveHandoutDetails"));
  assert.match(footer, /requireAdmin\(\)/);
  assert.match(footer, /row\.language !== handout\.language/);
  assert.match(footer, /row\.status !== "active"/);
});

test("a new handout can be English or Español, and an upload must match the handout's language", async () => {
  const list = await read("app/admin/handouts/page.tsx");
  assert.match(list, /<option value="es">Español<\/option>/);
  const actions = await read("app/admin/handouts/actions.ts");
  assert.match(actions, /formData\.get\("language"\) === "es" \? "es" : "en"/);
  assert.match(actions, /suggestion\.language !== handout\.language/);
});

test("the migration links an Español handout to its English one (one each) and gives handouts a footer", async () => {
  const sql = await read("supabase/migrations/20261015020000_handout_espanol.sql");
  assert.match(sql, /translation_of uuid references public\.teaching_handouts\(id\) on delete set null/);
  assert.match(sql, /footer_id uuid references public\.content_footers\(id\) on delete set null/);
  assert.match(sql, /create unique index if not exists teaching_handouts_translation_of_idx/);
});

test("the Title Collections report groups an Español handout under its English one", async () => {
  const report = await read("app/admin/cm/reports/title-collections/page.tsx");
  assert.match(report, /parentId: row\.translation_of/);
});
