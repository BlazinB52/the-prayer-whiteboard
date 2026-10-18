import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseDevotionalText } from "../lib/devotional-import.ts";

const template = await readFile("docs/devotional-import-template.txt", "utf8");
const importer = await readFile("lib/devotional-import.ts", "utf8");

test("the template imports exactly as it is, so its layout can never drift from the importer", () => {
  const parsed = parseDevotionalText(template);
  assert.equal(parsed.language, "en");
  assert.equal(parsed.title, "REPLACE with the devotional title");
  assert.equal(parsed.days.length, 7);
  assert.deepEqual(parsed.days.map((day) => day.day_number), [1, 2, 3, 4, 5, 6, 7]);
  assert.match(parsed.introduction, /^REPLACE with the introduction, first paragraph/);
  assert.match(parsed.introduction, /second paragraph/);
});

test("Days 1-6 carry all five fields, and each Scripture is in the standard form", () => {
  const parsed = parseDevotionalText(template);
  for (const day of parsed.days.slice(0, 6)) {
    for (const field of ["devotional_reading", "confession", "journal_prompt", "prayer_activation"]) {
      assert.match(day[field], /^REPLACE/, `Day ${day.day_number} ${field}`);
    }
    assert.equal(day.anchor_scriptures.length, 1);
    assert.match(day.anchor_scriptures[0], /^Book 1:1 \(KJV\) — "REPLACE with the full verse text/, "reference, em dash, quoted verse");
    assert.equal(day.bread_reflection, "", "Days 1-6 have no Communion text");
  }
});

test("Day 7 is the Communion and rest day with every section and none of the old ones", () => {
  const d7 = parseDevotionalText(template).days[6];
  assert.match(d7.title, /^DAY 7 — COMMUNION AND REST: REPLACE/);
  for (const field of ["devotional_reading", "confession", "self_examination", "bread_reflection", "cup_reflection", "series_closing_prayer"]) {
    assert.match(d7[field], /^REPLACE/, field);
  }
  assert.match(d7.bread_reflection, /\nPartaking Declaration: "REPLACE with the words spoken over the bread\."$/);
  assert.match(d7.cup_reflection, /\nPartaking Declaration: "REPLACE with the words spoken over the cup\."$/);
  assert.equal(d7.journal_prompt, "");
  assert.equal(d7.prayer_activation, "");
  assert.doesNotMatch(template.replace(/^#.*$/gm, ""), /Table of Remembrance/, "the site adds that sentence itself");
});

test("the notes at the top are never imported, and the Website Description line is dropped", () => {
  assert.match(template, /^# THE PRAYER WHITEBOARD/);
  const imported = JSON.stringify(parseDevotionalText(template));
  assert.doesNotMatch(imported, /HOW TO USE THIS FILE|LIMITS \(characters\)|Website Description|START OF THE DEVOTIONAL/);
  assert.match(template, /\nWebsite Description: REPLACE/);
});

test("every label the importer reads is in the template's notes, in English and Español", () => {
  for (const label of ["Anchor Scriptures", "Devotional Reading", "Today's Confession", "5-Minute Journal Prompt", "Prayer Activation Exercise", "The Rest Reflection", "Today's Confession of Rest", "Reverent Self-Examination & Blessing", "The Bread Reflection", "The Cup Reflection", "Series Closing Prayer"]) {
    assert.ok(template.includes(label), label);
  }
  for (const label of ["Pasajes bíblicos clave:", "La dinámica espiritual:", "Confesión de hoy:", "Pregunta para tu diario de 5 minutos:", "Ejercicio de activación en oración:", "La reflexión del descanso:", "Confesión de descanso de hoy:", "Autoexamen reverente y bendición:", "La reflexión del pan:", "La reflexión de la copa:", "Oración de cierre de la serie:"]) {
    assert.ok(template.includes(label), label);
    assert.ok(importer.includes(`"${label}"`), `${label} is still a label the importer reads`);
  }
});

test("the limits quoted in the notes are the importer's limits", () => {
  const limits = [["8,000", /introduction.*> 8000/], ["12,000", /devotional_reading\.length > 12000/], ["1,000", /MAX_ANCHOR_SCRIPTURE_LENGTH = 1000/], ["6,000", /MAX_COMMUNION_TEXT_LENGTH = 6000/]];
  for (const [shown, rule] of limits) {
    assert.ok(template.includes(shown), `the notes mention ${shown}`);
    assert.match(importer, rule, `the importer still enforces ${shown}`);
  }
  assert.match(importer, /MAX_CLOSING_PRAYER_LENGTH = 3000/);
  assert.match(importer, /confession\.length > 3000/);
  assert.match(importer, /anchor_scriptures\.length > 20/);
});

test("a Spanish copy of the template imports as Español once its headings and labels are translated", () => {
  const spanish = template
    .replace(/^Day (\d):/gm, "Día $1:")
    .replace(/^DAY 7 - COMMUNION AND REST:/m, "DÍA 7 — COMUNIÓN Y DESCANSO:")
    .replace(/^Anchor Scriptures$/gm, "Pasajes bíblicos clave:")
    .replace(/^Devotional Reading$/gm, "La dinámica espiritual:")
    .replace(/^Today's Confession$/gm, "Confesión de hoy:")
    .replace(/^5-Minute Journal Prompt$/gm, "Pregunta para tu diario de 5 minutos:")
    .replace(/^Prayer Activation Exercise$/gm, "Ejercicio de activación en oración:")
    .replace(/^The Rest Reflection$/gm, "La reflexión del descanso:")
    .replace(/^Today's Confession of Rest$/gm, "Confesión de descanso de hoy:")
    .replace(/^Reverent Self-Examination & Blessing$/gm, "Autoexamen reverente y bendición:")
    .replace(/^The Bread Reflection$/gm, "La reflexión del pan:")
    .replace(/^The Cup Reflection$/gm, "La reflexión de la copa:")
    .replace(/^Series Closing Prayer$/gm, "Oración de cierre de la serie:");
  const parsed = parseDevotionalText(spanish);
  assert.equal(parsed.language, "es");
  assert.equal(parsed.days.length, 7);
  assert.match(parsed.days[6].title, /^DÍA 7 — COMUNIÓN Y DESCANSO:/);
  assert.match(parsed.days[6].series_closing_prayer, /^REPLACE/);
});
