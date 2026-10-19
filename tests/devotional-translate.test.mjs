import assert from "node:assert/strict";
import test from "node:test";
import { translateDevotional } from "../lib/devotional-translate.ts";
import { extractRvr1960 } from "../lib/rvr1960.ts";

const devotional = { id: "7fd4d4d6-be82-4e87-94c1-1162332ff0b4", title: "From Glory to Glory", introduction: "You were chosen.\nGod is with you." };
const days = [1, 2, 3, 4, 5, 6, 7].map((n) => ({
  day_number: n,
  title: n === 7 ? "Day 7 — Communion and Rest: From Glory to Glory" : `Day ${n}: Title ${n}`,
  anchor_scriptures: n === 1 ? ['Ephesians 1:3-4 (NIV) — "Praise be to the God and Father."', 'Isaiah 60:1 (KJV) — "Arise, shine."'] : [`Hebrews 4:9-10 (NIV) — "There remains a Sabbath-rest."`],
  devotional_reading: `Reading ${n}.\n\nSecond paragraph ${n}.`,
  confession: `Confession ${n}.`,
  journal_prompt: n === 7 ? null : `Journal ${n}.`,
  prayer_activation: n === 7 ? null : `Prayer ${n}.`,
  bread_reflection: n === 7 ? "Bread." : null,
  cup_reflection: n === 7 ? "Cup." : null,
  self_examination: n === 7 ? "Examine." : null,
  series_closing_prayer: n === 7 ? "Closing." : null,
}));

const BOOKS = { Ephesians: "Efesios", Isaiah: "Isaías", Hebrews: "Hebreos" };

// A stand-in for the Claude API: returns every segment as "ES <text>", with the book name of a reference translated.
function fakeClaude({ drop = new Set(), calls = [] } = {}) {
  return async (_url, init) => {
    const { messages } = JSON.parse(init.body);
    const { segments } = JSON.parse(messages[0].content.slice(messages[0].content.indexOf("{")));
    calls.push(segments);
    const out = segments.filter((s) => !drop.has(s.id)).map((s) => ({
      id: s.id,
      text: s.kind === "scripture_reference" ? s.text.replace(/^\S+/, (book) => BOOKS[book] ?? book) : `ES ${s.text}`,
    }));
    return new Response(JSON.stringify({ stop_reason: "tool_use", content: [{ type: "tool_use", name: "save_translation", input: { segments: out } }] }), { status: 200 });
  };
}

const verseFor = async (reference) => ({ "Ephesians 1:3-4": "Bendito sea el Dios y Padre de nuestro Señor Jesucristo...", "Isaiah 60:1": "Levántate, resplandece.", "Hebrews 4:9-10": "Por tanto, queda un reposo para el pueblo de Dios." })[reference] ?? null;

test("a devotional becomes an Español devotional that the importer accepts", async () => {
  const calls = [];
  const result = await translateDevotional(devotional, days, { apiKey: "test", fetchImpl: fakeClaude({ calls }), fetchVerse: verseFor });
  assert.equal(result.imported.language, "es");
  assert.equal(result.imported.sourceDevotionalId, devotional.id);
  assert.equal(result.imported.title, "ES From Glory to Glory");
  assert.equal(result.imported.days.length, 7);
  assert.equal(result.imported.days[0].title, "Día 1: ES Title 1");
  assert.ok(result.imported.days[6].title.startsWith("Día 7 — "));
  assert.equal(result.imported.days[6].bread_reflection, "ES Bread.");
  assert.equal(result.imported.days[0].journal_prompt, "ES Journal 1.");
});

test("anchor Scriptures are the looked-up RVR1960 text, never sent to the model", async () => {
  const calls = [];
  const result = await translateDevotional(devotional, days, { apiKey: "test", fetchImpl: fakeClaude({ calls }), fetchVerse: verseFor });
  assert.deepEqual(result.imported.days[0].anchor_scriptures, [
    'Efesios 1:3-4 (RVR1960) — "Bendito sea el Dios y Padre de nuestro Señor Jesucristo..."',
    'Isaías 60:1 (RVR1960) — "Levántate, resplandece."',
  ]);
  assert.ok(result.scriptures.every((scripture) => scripture.verified));
  assert.equal(JSON.stringify(calls).includes("Praise be to the God"), false);
  assert.deepEqual(result.warnings, []);
});

test("a passage that cannot be looked up is written by the translator and flagged as not verified", async () => {
  const result = await translateDevotional(devotional, days, { apiKey: "test", fetchImpl: fakeClaude(), fetchVerse: async () => null });
  assert.ok(result.scriptures.every((scripture) => !scripture.verified));
  assert.ok(result.warnings.some((warning) => warning.includes("could not be looked up")));
  assert.match(result.imported.days[0].anchor_scriptures[0], /^Efesios 1:3-4 \(RVR1960\) — "ES Praise be to the God and Father\."$/);
});

test("a devotional without all seven days is refused", async () => {
  await assert.rejects(translateDevotional(devotional, days.slice(0, 6), { apiKey: "test", fetchImpl: fakeClaude(), fetchVerse: verseFor }), /all seven days/);
});

test("a day that does not come back translated stops the save", async () => {
  await assert.rejects(translateDevotional(devotional, days, { apiKey: "test", fetchImpl: fakeClaude({ drop: new Set(["day3.confession"]) }), fetchVerse: verseFor }));
});

test("the RVR1960 text is read out of a BibleGateway page without headings, verse numbers or notes", () => {
  const html = '<div class="passage-text"><h3>Título</h3><p><span class="chapternum">1 </span>Bendito sea el Dios,<sup class="footnote">(a)</sup> y Padre.<span class="versenum">4 </span>Según nos escogió,</p></div><div class="footnotes">x</div>';
  assert.equal(extractRvr1960(html), "Bendito sea el Dios, y Padre. Según nos escogió...");
  assert.equal(extractRvr1960("<html></html>"), null);
});
