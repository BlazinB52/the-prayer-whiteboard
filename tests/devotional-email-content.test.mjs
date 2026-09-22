import assert from "node:assert/strict";
import test from "node:test";
import { buildDevotionalDayEmail, firstSentence } from "../lib/devotional-email-content.ts";

const baseInput = {
  dayNumber: 3,
  title: "Returning With Singing",
  anchorScriptures: ["Jeremiah 31:12 — \"They shall come and sing in the height of Zion.\"", "Isaiah 35:10"],
  devotionalReading: "God gathers His people from far away. He does not forget them.\n\nA second paragraph that must not appear.",
  dayUrl: "https://theprayerwhiteboard.com/teachings/beyond-the-garden/devotional/day/3",
  preferencesUrl: "https://theprayerwhiteboard.com/email-preferences",
};

test("only the first sentence of the reading is previewed", () => {
  const email = buildDevotionalDayEmail(baseInput);

  assert.match(email.html, /God gathers His people from far away\./);
  assert.equal(email.html.includes("He does not forget them"), false);
  assert.equal(email.html.includes("second paragraph"), false);
});

test("a sentence ending in a scripture abbreviation is not truncated", () => {
  assert.equal(firstSentence("Read Gen. 1:1 and see the beginning. Then continue."), "Read Gen. 1:1 and see the beginning.");
  assert.equal(firstSentence("Compare vv. 4-6 for context. Next sentence."), "Compare vv. 4-6 for context.");
  assert.equal(firstSentence("Dr. Smith wrote about grace. Another thought."), "Dr. Smith wrote about grace.");
});

test("first sentence handles quotes, questions, and single sentences", () => {
  assert.equal(firstSentence("\"Be still,\" He says. Then we rest."), "\"Be still,\" He says.");
  assert.equal(firstSentence("What does the Lord require? He requires justice."), "What does the Lord require?");
  assert.equal(firstSentence("One sentence with no terminator"), "One sentence with no terminator");
  assert.equal(firstSentence(null), "");
  assert.equal(firstSentence("   "), "");
});

test("the header shows the day number and exact title", () => {
  const email = buildDevotionalDayEmail(baseInput);

  assert.match(email.html, /DAY 3 OF 7/);
  assert.match(email.html, /Returning With Singing/);
  assert.equal(email.subject, "Day 3 of 7: Returning With Singing");
  assert.match(email.text, /DAY 3 OF 7/);
});

test("anchor scriptures render verbatim from the database array", () => {
  const email = buildDevotionalDayEmail(baseInput);

  assert.match(email.html, /Anchor Scriptures/);
  assert.match(email.html, /Jeremiah 31:12 — &quot;They shall come and sing in the height of Zion\.&quot;/);
  assert.match(email.html, /<li[^>]*>Isaiah 35:10<\/li>/);
  assert.match(email.text, /- Isaiah 35:10/);
});

test("confession, journal prompt, and exercises are absent by construction", () => {
  const email = buildDevotionalDayEmail(baseInput);

  for (const omitted of ["Confession", "Journal", "Prayer Activation"]) {
    assert.equal(email.html.includes(omitted), false, `${omitted} must not appear`);
  }
});

test("the call to action uses the approved wording and the day URL", () => {
  const email = buildDevotionalDayEmail(baseInput);

  assert.match(email.html, /Click here to read the rest of today&#39;s devotional/);
  assert.match(email.html, /devotional\/day\/3/);
  assert.match(email.text, /Click here to read the rest of today's devotional:/);
});

test("missing reading and empty scriptures degrade without empty sections", () => {
  const email = buildDevotionalDayEmail({ ...baseInput, devotionalReading: null, anchorScriptures: ["  "] });

  assert.equal(email.html.includes("Devotional Reading"), false);
  assert.equal(email.html.includes("Anchor Scriptures"), false);
  assert.match(email.html, /Click here to read the rest/);
});
