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

test("the header shows the series, the day number, and the exact title", () => {
  const email = buildDevotionalDayEmail(baseInput);

  assert.match(email.html, /7-Day Devotional: Beyond the Garden/);
  assert.match(email.html, /DAY 3 OF 7/);
  assert.match(email.html, /Returning With Singing/);
  assert.match(email.html, /<strong[^>]*>For<\/strong> Beyond the Garden/);
  assert.equal(email.subject, "Day 3 of 7 — Returning With Singing");
  assert.match(email.text, /DAY 3 OF 7/);
});

test("anchor scriptures render verbatim from the database array", () => {
  const email = buildDevotionalDayEmail(baseInput);

  assert.match(email.html, /Anchor Scriptures/);
  assert.match(email.html, /Jeremiah 31:12 — &quot;They shall come and sing in the height of Zion\.&quot;/);
  assert.match(email.html, /<li[^>]*>Isaiah 35:10<\/li>/);
  assert.match(email.text, /- Isaiah 35:10/);
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
