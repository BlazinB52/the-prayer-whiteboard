import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { devotionalChoices } from "../lib/devotional-choices.ts";

const devotional = (id, title, extra = {}) => ({ id, title, status: "published", language: "en", legacyTeachingId: null, ...extra });
const base = (overrides = {}) => ({
  devotionals: [devotional("d1", "Walking in the Light"), devotional("d2", "From Glory to Glory", { status: "draft" }), devotional("d3", "Treasure in Earthen Vessels"), devotional("d4", "Orphan devotional")],
  assignments: [
    { devotional_id: "d1", teaching_id: "t1" },
    { devotional_id: "d2", teaching_id: "t2" },
    { devotional_id: "d3", teaching_id: "t3" },
  ],
  teachingDates: [
    { id: "t1", gathering_date: "2026-09-20" },
    { id: "t2", gathering_date: "2026-10-10" },
    { id: "t3", gathering_date: "2026-09-26" },
  ],
  teachingLanguage: "en",
  currentDevotionalId: null,
  ...overrides,
});

test("each choice shows the gathering date of its teaching, newest first, undated last", () => {
  const choices = devotionalChoices(base());
  assert.deepEqual(choices.map((choice) => choice.title), ["From Glory to Glory", "Treasure in Earthen Vessels", "Walking in the Light", "Orphan devotional"]);
  assert.deepEqual(choices.map((choice) => choice.dateLabel), ["Oct 10, 2026", "Sep 26, 2026", "Sep 20, 2026", "No gathering date"]);
});

test("a devotional assigned to more than one teaching shows the latest of their dates", () => {
  const choices = devotionalChoices(base({ assignments: [{ devotional_id: "d1", teaching_id: "t1" }, { devotional_id: "d1", teaching_id: "t2" }] }));
  assert.equal(choices.find((choice) => choice.id === "d1").dateLabel, "Oct 10, 2026");
});

test("a devotional with only the older owner link still gets that teaching's date", () => {
  const choices = devotionalChoices(base({ devotionals: [devotional("d9", "Old one", { legacyTeachingId: "t3" })], assignments: [] }));
  assert.equal(choices[0].dateLabel, "Sep 26, 2026");
});

test("only devotionals in the teaching's own language are offered, and the one already assigned always stays", () => {
  const devotionals = [devotional("e1", "English one"), devotional("s1", "Devocional en español", { language: "es" }), devotional("s2", "Otro devocional", { language: "es" })];
  assert.deepEqual(devotionalChoices(base({ devotionals, assignments: [] })).map((choice) => choice.id), ["e1"]);
  assert.deepEqual(devotionalChoices(base({ devotionals, assignments: [], teachingLanguage: "es" })).map((choice) => choice.id).sort(), ["s1", "s2"]);
  assert.deepEqual(devotionalChoices(base({ devotionals, assignments: [], currentDevotionalId: "s1" })).map((choice) => choice.id).sort(), ["e1", "s1"]);
});

test("the picker shows the date, then the title and status", async () => {
  const form = await readFile("app/admin/teachings/devotional-assignment-form.tsx", "utf8");
  assert.match(form, /\{devotional\.dateLabel\} · \{devotional\.title\} \(\{devotional\.status\}\)/);
  const card = await readFile("app/admin/teachings/teaching-devotional-card.tsx", "utf8");
  assert.match(card, /devotionalChoices\(\{/);
  assert.match(card, /from\("teaching_devotional_assignments"\)\.select\("devotional_id, teaching_id"\)/);
});
