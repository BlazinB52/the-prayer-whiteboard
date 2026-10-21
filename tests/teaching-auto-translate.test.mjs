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
  const result = await translateTeaching(teaching, categories, sections, { apiKey: "test", fetchImpl: fakeFetch({ calls }) });
  assert.equal(calls.length, 3);
  assert.equal(calls[0].model, "claude-opus-5-5");
  assert.match(calls[0].system, /En la enseñanza se explicó/);
  assert.equal(calls.some((body) => body.messages[0].content.includes('"limit"')), false, "no length limit is ever sent, so nothing is shortened");
  // A forced tool call (type "tool" or "any") is rejected by current models, so the request lets the model choose and the prompt names the tool.
  assert.deepEqual(calls[0].tool_choice, { type: "auto" });
  assert.match(calls[0].messages[0].content, /Call the save_translation tool/);

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

test("the prompt follows the Spanish Translation Rules", () => {
  const prompt = translationSystemPrompt();
  for (const rule of [/Español de El Salvador/, /natural, warm and professional/, /que querás, que confirmés/, /ustedes/, /keep exactly whom the English addresses/,
    /keep that gender in Spanish/, /do not add one/, /Never guess a gender|Never guess a gender from a name/, /En la enseñanza se explicó/, /los participantes, never la congregación/, /un impulso or una dirección/, /Avoid "inquietud"/,
    /la Santa Cena/, /comunión con Dios/, /degree of certainty/, /do not embellish prophetic words/, /Never present your own translation/, /Él, Su, Sus, Tu, Tus, Tú, Te, Lo, Le, Vos/,
    /Mantené tus ojos en Jesús/, /sentence case/, /un ama de casa/, /Never shorten, summarize, condense or cut/]) assert.match(prompt, rule);
  assert.doesNotMatch(prompt, /shorten it|"shortened"/);
  assert.doesNotMatch(prompt, /una inquietud del Espíritu Santo/);
});

test("rule checks: gendered teacher, inquietud, congregación and la Comunión are flagged; over-limit fields stop the save", () => {
  const warn = (text) => checkSegment({ id: "x", kind: "text", text: "English." }, text).warnings.join(" ");
  assert.match(warn("La maestra explicó algo."), /teacher's gender/);
  // When the English itself gives the teacher's gender, Spanish keeps it.
  const gendered = (english, text) => checkSegment({ id: "x", kind: "text", text: english }, text).warnings.join(" ");
  assert.equal(gendered("The teacher said she was grateful.", "La maestra dijo que estaba agradecida."), "");
  assert.equal(gendered("The teacher went on to say he was grateful.", "El maestro continuó diciendo que estaba agradecido."), "");
  assert.match(gendered("The teacher said it was true.", "La maestra dijo que era verdad."), /teacher's gender/);
  assert.match(warn("Obedecen una inquietud del Espíritu Santo."), /inquietud/);
  assert.match(warn("La congregación oró."), /congregación/);
  assert.match(warn("La Comunión reunió la enseñanza."), /Santa Cena/);
  assert.match(warn("Una ama de casa oró."), /un ama/);
  assert.equal(warn("En la enseñanza se explicó que la comunión con Dios es real."), "");
  const over = checkSegment({ id: "teaching.central_theme", kind: "text", text: "Short.", limit: 300 }, "a".repeat(301));
  assert.match(over.error, /Central Theme is 301 characters in Spanish, over the website's 300-character limit\. Nothing was saved and nothing was cut\. Raise the limit, or shorten the English/);
});

test("a long translation is kept whole: over the website limit, the save stops instead of cutting text", async () => {
  const { SPANISH_FIELD_LIMITS } = await import("../lib/teaching-auto-translate.ts");
  const { TEACHING_IMPORT_LIMITS } = await import("../lib/teaching-docx-import.ts");
  assert.equal(SPANISH_FIELD_LIMITS.centralTheme, TEACHING_IMPORT_LIMITS.centralTheme, "the converter uses the site's own limits");
  assert.equal(SPANISH_FIELD_LIMITS.summary, TEACHING_IMPORT_LIMITS.summary);
  const long = "Resumen largo. ".repeat(60);
  await assert.rejects(
    translateTeaching(teaching, categories, sections, { apiKey: "test", fetchImpl: fakeFetch({ override: { "teaching.summary": long } }) }),
    /Short Summary is \d+ characters in Spanish, over the website's 800-character limit\. Nothing was saved and nothing was cut/,
  );
  const fits = await translateTeaching(teaching, categories, sections, { apiKey: "test", fetchImpl: fakeFetch({ override: { "teaching.summary": "Resumen completo." } }) });
  assert.equal(fits.teaching.summary, "Resumen completo.");
});

test("every exported file carries the Spanish Translation Rules for whoever translates it by hand", async () => {
  const { TRANSLATOR_INSTRUCTIONS } = await import("../lib/teaching-docx-export.ts");
  const { DEVOTIONAL_TRANSLATOR_INSTRUCTIONS } = await import("../lib/devotional-export.ts");
  const { WEEKLY_UPDATE_TRANSLATOR_INSTRUCTIONS } = await import("../lib/weekly-update-export.ts");
  const { SPANISH_TRANSLATION_RULES } = await import("../lib/spanish-translation-rules.ts");
  for (const [name, text] of [["teaching", TRANSLATOR_INSTRUCTIONS], ["devotional", DEVOTIONAL_TRANSLATOR_INSTRUCTIONS.join("\n")], ["weekly update", WEEKLY_UPDATE_TRANSLATOR_INSTRUCTIONS]]) {
    for (const rule of SPANISH_TRANSLATION_RULES) assert.equal(text.includes(rule), true, `${name} export carries: ${rule.slice(0, 40)}`);
    for (const pattern of [/En la enseñanza se explicó/, /la Santa Cena/, /impulso or dirección/, /Never translate the English verse yourself/, /do not shorten/]) assert.match(text, pattern, name);
  }
  assert.doesNotMatch(TRANSLATOR_INSTRUCTIONS, /Translate the book name and the verse/, "verses are replaced with a published Bible text, not translated");
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
