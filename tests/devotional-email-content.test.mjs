import assert from "node:assert/strict";
import test from "node:test";
import { buildDevotionalDayEmail } from "../lib/devotional-email-content.ts";

const baseInput = {
  dayNumber: 3,
  totalDays: 7,
  title: "Returning With Singing",
  seriesTitle: "Beyond the Garden",
  anchorScriptures: ["Jeremiah 31:12 — \"They shall come and sing in the height of Zion.\"", "Isaiah 35:10"],
  devotionalReading: "God gathers His people from far away. He does not forget them.\n\nA second paragraph that must appear too.",
  confession: "I declare that I am gathered and remembered.",
  journalPrompt: "Where have you felt far from home this week?",
  prayerActivation: "Speak this aloud: I am not forgotten.",
  readUrl: "https://theprayerwhiteboard.com/teachings/beyond-the-garden",
  preferencesUrl: "https://theprayerwhiteboard.com/email-preferences",
};

test("the header shows the day number, the exact title, and the series on the For line", () => {
  const email = buildDevotionalDayEmail(baseInput);

  assert.match(email.html, />Beyond the Garden<\/p>/);
  assert.match(email.html, /DAY 3 OF 7/);
  assert.match(email.html, /Returning With Singing/);
  assert.match(email.html, /<strong[^>]*>For<\/strong> Beyond the Garden/);
  assert.equal(email.subject, "Day 3 of 7 — Returning With Singing");
  assert.match(email.text, /DAY 3 OF 7/);
});

test("the header opens with the brand line, then the gray series line, with no logo", () => {
  const email = buildDevotionalDayEmail(baseInput);

  assert.equal(email.html.includes("<img"), false);
  assert.ok(email.html.indexOf("The Prayer Whiteboard</p>") < email.html.indexOf(">Beyond the Garden</p>"));
  assert.ok(email.html.indexOf(">Beyond the Garden</p>") < email.html.indexOf("DAY 3 OF 7"));
  assert.ok(email.text.startsWith("THE PRAYER WHITEBOARD\nBeyond the Garden\n"));
});

test("anchor scriptures render verbatim from the database array", () => {
  const email = buildDevotionalDayEmail(baseInput);

  assert.match(email.html, /Anchor Scriptures/);
  assert.match(email.html, /font-weight:700[^>]*>Jeremiah 31:12<\/p><p style="margin:0;font-style:italic[^>]*>They shall come and sing in the height of Zion\.<\/p>/);
  assert.match(email.html, /font-weight:700[^>]*>Isaiah 35:10<\/p>/);
  assert.match(email.text, /\n  Jeremiah 31:12\n  They shall come and sing in the height of Zion\./);
  assert.match(email.text, /\n  Isaiah 35:10/);
});

test("the header never shows a '7-Day Devotional:' prefix, only the series title", () => {
  const email = buildDevotionalDayEmail(baseInput);
  assert.doesNotMatch(email.html, /7-Day Devotional:/);
  assert.doesNotMatch(email.text, /7-Day Devotional:/);
});

test("anchor scriptures use the standard verse style without bullets", () => {
  const email = buildDevotionalDayEmail(baseInput);
  assert.doesNotMatch(email.html.slice(email.html.indexOf("Anchor Scriptures"), email.html.indexOf("Devotional Reading")), /<li/);
  assert.match(email.html, /border-left:4px solid #c99a52/, "a gold line down the left edge");
  assert.match(email.html, /font-style:italic/, "the verse is italic");
});

test("bold, italic, links and bullets in the devotional carry into the email", () => {
  const email = buildDevotionalDayEmail({
    ...baseInput,
    anchorScriptures: ["**John 3:16** (KJV) — \"For *God* so loved the world.\""],
    devotionalReading: "Read [this passage](https://example.com/a?x=1&y=2) **today**.\n\n- first point\n- second *point*",
    confession: "[bad](javascript:void0) stays as words.",
  });
  assert.match(email.html, /font-weight:700[^>]*>John 3:16 \(KJV\)<\/p>/);
  assert.match(email.html, /<em>God<\/em>/);
  assert.match(email.html, /<a href="https:\/\/example\.com\/a\?x=1&amp;y=2"[^>]*>this passage<\/a>/);
  assert.match(email.html, /<strong>today<\/strong>/);
  assert.match(email.html, /<ul[^>]*><li[^>]*>first point<\/li><li[^>]*>second <em>point<\/em><\/li><\/ul>/);
  assert.doesNotMatch(email.html, /\*\*|\]\(/);
  assert.doesNotMatch(email.html, /<a href="javascript/);
  assert.match(email.html, /bad stays as words/);
  assert.doesNotMatch(email.text, /\*|\]\(/);
  assert.match(email.text, /Read this passage \(https:\/\/example\.com\/a\?x=1&y=2\) today\./);
  assert.match(email.text, /- first point\n- second point/);
});

test("the full devotional reading is included, not a first-sentence teaser", () => {
  const email = buildDevotionalDayEmail(baseInput);

  assert.match(email.html, /He does not forget them/);
  assert.match(email.html, /second paragraph that must appear too/);
});

test("confession, journal prompt, and prayer activation each render in their own field", () => {
  const email = buildDevotionalDayEmail(baseInput);

  assert.match(email.html, /Today&#39;s Confession/);
  assert.match(email.html, /I declare that I am gathered and remembered/);
  assert.match(email.html, /5-Minute Journal Prompt/);
  assert.match(email.html, /Where have you felt far from home this week/);
  assert.match(email.html, /Prayer Activation Exercise/);
  assert.match(email.html, /Speak this aloud: I am not forgotten/);
});

test("the call to action is a styled button reading through to the assigned teaching", () => {
  const email = buildDevotionalDayEmail(baseInput);

  assert.match(email.html, /Read the Full Teaching/);
  assert.match(email.html, /href="https:\/\/theprayerwhiteboard\.com\/teachings\/beyond-the-garden"/);
  assert.match(email.text, /Read the Full Teaching:/);
});

test("a tomorrow line appears mid-series and disappears on the final day", () => {
  const midSeries = buildDevotionalDayEmail(baseInput);
  assert.match(midSeries.html, /Tomorrow: Day 4 of Beyond the Garden/);

  const finalDay = buildDevotionalDayEmail({ ...baseInput, dayNumber: 7 });
  assert.equal(finalDay.html.includes("Tomorrow:"), false);
});

test("the brand footer tagline and the compliance link are both present", () => {
  const email = buildDevotionalDayEmail(baseInput);

  assert.match(email.html, /Prayer &bull; Scripture &bull; Teaching &bull; Devotion/);
  assert.match(email.html, /Manage your email preferences or unsubscribe/);
  assert.match(email.html, /href="https:\/\/theprayerwhiteboard\.com\/email-preferences"/);
});

test("missing optional fields degrade without empty sections", () => {
  const email = buildDevotionalDayEmail({
    ...baseInput,
    devotionalReading: null,
    confession: null,
    journalPrompt: null,
    prayerActivation: null,
    anchorScriptures: ["  "],
  });

  assert.equal(email.html.includes("Devotional Reading"), false);
  assert.equal(email.html.includes("Anchor Scriptures"), false);
  assert.equal(email.html.includes("Today&#39;s Confession"), false);
  assert.equal(email.html.includes("5-Minute Journal Prompt"), false);
  assert.equal(email.html.includes("Prayer Activation Exercise"), false);
  assert.match(email.html, /Read the Full Teaching/);
});
