import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { parseDevotionalText } from "../lib/devotional-import.ts";
import { splitDevotionalTextBlocks } from "../lib/devotionals.ts";

function day(dayNumber) {
  return `Day ${dayNumber}: Imported Day ${dayNumber}
Anchor Scriptures:
Reference ${dayNumber}: "Scripture text ${dayNumber}."
The Spiritual Mechanic:
Reading ${dayNumber}.
Today's Confession:
Confession ${dayNumber}.
5-Minute Journal Prompt:
Prompt ${dayNumber}.
Prayer Activation Exercise:
Activation ${dayNumber}.`;
}

test("devotional text importer parses seven labeled day sections", () => {
  const parsed = parseDevotionalText([
    "7-Day Devotional: Imported Series",
    "Optional introduction paragraph.",
    ...[1, 2, 3, 4, 5, 6, 7].map(day),
  ].join("\n"));

  assert.equal(parsed.title, "7-Day Devotional: Imported Series");
  assert.equal(parsed.introduction, "Optional introduction paragraph.");
  assert.equal(parsed.days.length, 7);
  assert.equal(parsed.days[0].day_number, 1);
  assert.deepEqual(parsed.days[0].anchor_scriptures, ['Reference 1: "Scripture text 1."']);
  assert.equal(parsed.days[6].prayer_activation, "Activation 7.");
});

test("admin dashboard exposes a direct devotionals card", async () => {
  const source = await readFile("app/admin/page.tsx", "utf8");
  assert.match(source, /title: "Devotionals"/);
  assert.match(source, /href: "\/admin\/devotionals"/);
  assert.match(source, /<Link key=\{tool\.title\} href=\{tool\.href\}/);
});

test("devotional admin page includes text import action", async () => {
  const source = await readFile("app/admin/teachings/[id]/devotional/page.tsx", "utf8");
  assert.match(source, /importDevotionalText/);
  assert.match(source, /Import From Text File/);
});

test("devotional admin index lists devotional records without teaching-only cards", async () => {
  const source = await readFile("app/admin/devotionals/page.tsx", "utf8");
  assert.match(source, /\.from\("teaching_devotionals"\)/);
  assert.match(source, /devotionals\.map\(\(devotional\)/);
  assert.match(source, /Used by/);
  assert.match(source, /Preview devotional/);
  assert.match(source, /Create New Devotional/);
  assert.doesNotMatch(source, /Edit teaching/);
  assert.doesNotMatch(source, /no devotional(?!s)/i);
});

test("devotional text groups dash and bullet-prefixed lines into lists", () => {
  assert.deepEqual(splitDevotionalTextBlocks(`Opening paragraph.
- First item
- Second **bold** item
Closing paragraph.`), [
    { type: "paragraph", text: "Opening paragraph." },
    { type: "bullet-list", items: ["First item", "Second **bold** item"] },
    { type: "paragraph", text: "Closing paragraph." },
  ]);

  assert.deepEqual(splitDevotionalTextBlocks("\u2022 Existing bullet\n\u2022 Another bullet"), [
    { type: "bullet-list", items: ["Existing bullet", "Another bullet"] },
  ]);
});
