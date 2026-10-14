import assert from "node:assert/strict";
import test from "node:test";
import { parseTeachingDocx } from "../lib/teaching-docx-import.ts";
import { buildTeachingTranslationDocx } from "../lib/teaching-docx-export.ts";
import { checkSegment, collectSegments, translateTeaching, translationSystemPrompt } from "../lib/teaching-auto-translate.ts";

const teaching = {
  id: "11111111-2222-4333-8444-555555555555",
  title: "Walking in the Light",
  central_theme: "God calls us out of darkness.",
  introduction: "First paragraph.\n\nSecond paragraph with **bold** and a [link](https://example.com/a).",
  summary: "A short summary.",
  teaser_1_heading: "Where Are You Looking Today?",
  teaser_1_text: "Pause and examine your heart.",
  teaser_2_heading: null,
  teaser_2_text: null,
  teaching_type: "standard",
  language: "en",
  gathering_date: "2026-10-10",
};
const categories = [{ id: "c1", title: "First Category", sort_order: 1 }, { id: "c2", title: "Second Category", sort_order: 2 }];
const sections = [
  { id: "s1", category_id: "c1", title: "Body", sort_order: 1, content: { format: "paragraph", text: "Body one.\nBody two with *italic*.", showTitle: false } },
  { id: "s2", category_id: "c1", title: "A Named Part", sort_order: 2, content: { format: "scripture", reference: "Hebrews 12:2", translation: "NIV", quotation: "Fixing our eyes on Jesus.", introduction: "Read this verse." } },
  { id: "s3", category_id: "c2", title: "Bullets", sort_order: 1, content: { format: "bullets", bullets: ["One **bold**", "Two"], showTitle: false } },
  { id: "s4", category_id: "c2", title: "Takeaway", sort_order: 2, content: { format: "takeaway", text: "Remember this.", showTitle: false } },
];

function translateFake(segment) {
  if (segment.kind === "scripture_reference") return segment.text.replace("Hebrews", "Hebreos");
  if (segment.kind === "scripture_verse") return "“puestos los ojos en Jesús, el autor y consumador de la fe”";
  return segment.text.split("\n").map((line) => (line.trim() ? `ES ${line}` : line)).join("\n");
}

function fakeFetch({ drop = new Set(), override = {}, calls = [] } = {}) {
  return async (url, init) => {
    const body = JSON.parse(init.body);
    calls.push(body);
    const { segments } = JSON.parse(body.messages[0].content.slice(body.messages[0].content.indexOf("{")));
    const out = segments.filter((segment) => !drop.has(segment.id)).map((segment) => ({ id: segment.id, text: override[segment.id] ?? translateFake(segment) }));
    return new Response(JSON.stringify({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "save_translation", input: { segments: out } }] }), { status: 200 });
  };
}

test("only text is sent: labels, ids and hidden titles are never offered for translation", () => {
  const { groups } = collectSegments(teaching, categories, sections);
  const all = groups.flat();
  assert.equal(groups.length, 3, "the teaching's own fields, then one group per category");
  assert.equal(all.some((segment) => /Central Theme|Short Summary|Homepage Teaser/.test(segment.text)), false);
  assert.equal(all.some((segment) => segment.text === "Body" || segment.text === "Bullets"), false, "hidden section titles are skipped");
  assert.equal(all.find((segment) => segment.id === "section.s2.quotation").kind, "scripture_verse");
});

test("a translated teaching passes the Español importer, uses RVR1960 and lists every Scripture to check", async () => {
  const calls = [];
  const result = await translateTeaching(teaching, categories, sections, { apiKey: "test", teacher: "woman", fetchImpl: fakeFetch({ calls }) });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].model, "claude-opus-5-5");
  assert.match(calls[0].system, /la maestra/);
  assert.equal(calls[0].tool_choice.name, "save_translation");

  const parsed = parseTeachingDocx(buildTeachingTranslationDocx(result.teaching, result.categories, result.sections), { language: "es" });
  assert.equal(parsed.ok, true, parsed.errors.join("\n"));
  assert.equal(parsed.teaching.title, "ES Walking in the Light");
  assert.equal(parsed.teaching.sourceTeachingId, teaching.id);
  assert.equal(parsed.teaching.introduction.includes("[link](https://example.com/a)"), true);
  const verse = parsed.teaching.categories[0].sections.find((section) => section.format === "scripture");
  assert.equal(verse.reference, "Hebreos 12:2");
  assert.equal(verse.translation, "RVR1960");
  assert.deepEqual(result.scriptures.map((item) => item.reference), ["Hebreos 12:2 (RVR1960)"]);
  assert.equal(result.scriptures[0].english, "Hebrews 12:2 (NIV)");
  assert.equal(teaching.title, "Walking in the Light", "the English teaching object is not changed");
});

test("a part that does not come back is asked for again, and a second miss stops without saving", async () => {
  const calls = [];
  await assert.rejects(
    translateTeaching(teaching, categories, sections, { apiKey: "test", fetchImpl: fakeFetch({ drop: new Set(["teaching.summary"]), calls }) }),
    /did not come back translated/,
  );
  assert.equal(calls.filter((body) => body.messages[0].content.includes("teaching.summary")).length, 2);
});

test("a changed link is an error; tú forms and lost bold are warnings", async () => {
  await assert.rejects(
    translateTeaching(teaching, categories, sections, { apiKey: "test", fetchImpl: fakeFetch({ override: { "teaching.introduction": "Primero.\n\nSegundo con **negrita** y un [enlace](https://evil.example)." } }) }),
    /A link changed/,
  );
  assert.match(checkSegment({ id: "x", kind: "text", text: "Come close." }, "Acércate a Jesús.").warnings.join(), /tú form/);
  assert.match(checkSegment({ id: "x", kind: "text", text: "Be **bold**." }, "Sé valiente.").warnings.join(), /Bold/);
  assert.deepEqual(checkSegment({ id: "x", kind: "text", text: "Come close." }, "Acercate a Jesús.").warnings, []);
  assert.deepEqual(checkSegment({ id: "x", kind: "scripture_verse", text: "Draw near." }, "Acercaos a Dios").warnings, [], "Scripture keeps the Bible's own wording");
});

test("the prompt carries the site's rules", () => {
  const prompt = translationSystemPrompt();
  for (const rule of [/voseo/, /ustedes/, /Él, Su, Sus, Tu, Tus, Vos/, /Mantené Tus Ojos en Jesús/, /la Santa Cena/, /Reina-Valera 1960/, /el docente/]) assert.match(prompt, rule);
});

test("the convert route is for Administrators only, converts English only, and links the draft to its English teaching", async () => {
  const { readFile } = await import("node:fs/promises");
  const route = await readFile("app/api/admin/teaching/translate/route.ts", "utf8");
  assert.match(route, /getAuthorizedUser\(\)/);
  assert.match(route, /status: 401/);
  assert.match(route, /ANTHROPIC_API_KEY/);
  assert.match(route, /teaching\.language === "es"/);
  assert.match(route, /status: 409/, "an already paired teaching is not converted again");
  assert.match(route, /parseTeachingDocx\(file, \{ language: "es" \}\)/, "the translation passes the Español importer rules");
  assert.match(route, /translationOf: teachingId/);
  assert.doesNotMatch(route, /from\("teachings"\)\.update/, "the English teaching is never changed");
  const page = await readFile("app/admin/teachings/[id]/edit/page.tsx", "utf8");
  assert.match(page, /<ConvertToSpanishButton teachingId=\{id\} \/>/);
  const button = await readFile("app/admin/teachings/convert-to-spanish-button.tsx", "utf8");
  assert.match(button, /Convert &amp; Save Spanish Version|Convert & Save Spanish Version/);
});
