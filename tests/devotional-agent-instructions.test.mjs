import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { parseDevotionalText } from "../lib/devotional-import.ts";
import { publicationFileName } from "../lib/file-names.ts";

// docs/devotional_agent_instructions.txt is the file handed to an agent to keep as its standing instructions for every
// devotional. The agent's output goes straight into the importer, so anything the file promises the importer must really
// accept. These tests build a devotional from the file's own labels, in the file's own order, and import it.

const instructions = await readFile("docs/devotional_agent_instructions.txt", "utf8");
const importer = await readFile("lib/devotional-import.ts", "utf8");
const lines = instructions.split(/\r?\n/);

const DAY_LABELS = ["Anchor Scriptures", "Devotional Reading", "Today's Confession", "5-Minute Journal Prompt", "Prayer Activation Exercise"];
const DAY_7_LABELS = ["Anchor Scriptures", "The Rest Reflection", "Today's Confession of Rest", "Reverent Self-Examination & Blessing", "The Bread Reflection", "The Cup Reflection", "Series Closing Prayer"];

function labelsBetween(startPattern, endPattern, known) {
  const from = lines.findIndex((line) => startPattern.test(line));
  const to = lines.findIndex((line, index) => index > from && endPattern.test(line));
  assert.ok(from > -1 && to > from, `section ${startPattern} was not found`);
  return lines.slice(from, to).filter((line) => known.includes(line));
}

const days1to6Labels = labelsBetween(/^DAYS 1-6/, /^DAY 7 \(strict/, DAY_LABELS);
const day7Labels = labelsBetween(/^DAY 7 — COMMUNION AND REST:/, /^FORMATTING INSIDE A FIELD/, DAY_7_LABELS);

function devotionalFrom(dayLabels, day7) {
  const anchor = 'Book 1:1 (KJV) — "A complete verse, word for word."';
  const section = (labelsInOrder) => labelsInOrder.map((label) => (label === "Anchor Scriptures" ? `${label}\n${anchor}` : `${label}\nText for ${label}.`)).join("\n");
  return [
    "A Devotional Title",
    "",
    "The introduction.",
    "",
    ...[1, 2, 3, 4, 5, 6].flatMap((n) => [`Day ${n}: Title ${n}`, section(dayLabels), ""]),
    "DAY 7 — COMMUNION AND REST: The week's theme",
    section(day7),
    "",
    "Website Description: One sentence.",
  ].join("\n");
}

test("the instructions give Days 1-6 and Day 7 the labels the importer reads, in the order the importer expects", () => {
  assert.deepEqual(days1to6Labels, DAY_LABELS);
  assert.deepEqual(day7Labels, DAY_7_LABELS);
});

test("a devotional built from the instructions' own layout imports as seven English days", () => {
  const parsed = parseDevotionalText(devotionalFrom(days1to6Labels, day7Labels));
  assert.equal(parsed.language, "en");
  assert.equal(parsed.days.length, 7);
  assert.equal(parsed.title, "A Devotional Title");
  assert.equal(parsed.days[0].journal_prompt, "Text for 5-Minute Journal Prompt.");
  assert.equal(parsed.days[6].series_closing_prayer, "Text for Series Closing Prayer.");
  assert.equal(parsed.days[6].journal_prompt, "", "Day 7 has no journal prompt");
  assert.deepEqual(parsed.days[0].anchor_scriptures, ['Book 1:1 (KJV) — "A complete verse, word for word."'], "the anchor line is kept in the standard form");
});

test("the instructions do not ask for a Table of Remembrance, because the website adds it", () => {
  assert.match(instructions, /Do not write a "Table of Remembrance" section: the website adds that sentence automatically\./);
  assert.ok(!day7Labels.includes("The Table of Remembrance"));
});

test("the file name the instructions ask for is the project's own publication file name", () => {
  assert.equal(publicationFileName("2026-10-18", "en", "devotional", "txt"), "20261018_en_devotional.txt");
  assert.match(instructions, /named yyyymmdd_en_devotional\.txt/);
  assert.match(instructions, /for example 20261018_en_devotional\.txt/);
});

test("the Scripture form in the instructions is the form the importer produces, with the dash", () => {
  assert.match(instructions, /Reference \(VER\) — "full verse text"/);
  assert.match(instructions, /never leave it out/);
  const parsed = parseDevotionalText(devotionalFrom(days1to6Labels, day7Labels));
  for (const day of parsed.days) assert.match(day.anchor_scriptures[0], /^.+ \(KJV\) — ".+"$/);
});

test("the limits the instructions quote are the importer's limits", () => {
  const limits = [["8,000", /introduction\.length > 8000/], ["12,000", /devotional_reading\.length > 12000/], ["1,000", /MAX_ANCHOR_SCRIPTURE_LENGTH = 1000/], ["6,000", /MAX_COMMUNION_TEXT_LENGTH = 6000/], ["3,000", /MAX_CLOSING_PRAYER_LENGTH = 3000/], ["180", /title\.length > 180/]];
  for (const [shown, rule] of limits) {
    assert.ok(instructions.includes(shown), `the instructions mention ${shown}`);
    assert.match(importer, rule, `the importer still enforces ${shown}`);
  }
});

test("the instructions work as standing instructions: keep them, one plain file back, English only", () => {
  assert.match(instructions, /^KEEP THESE INSTRUCTIONS\./m);
  assert.match(instructions, /ENGLISH devotionals/);
  assert.match(instructions, /One plain-text file/);
  assert.match(instructions, /nothing is left in \[brackets\]/);
});
