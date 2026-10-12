import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildDevotionalDayEmail } from "../lib/devotional-email-content.ts";
import { parseDevotionalText } from "../lib/devotional-import.ts";
import { buildDevotionalEditableFields } from "../lib/devotional-revisions.ts";
import { devotionalDaySections, emptyDevotionalDay, findDevotionalPublishBlocker, hasCommunionDay, isCompleteDevotionalDay, usesLegacyDayLayout } from "../lib/devotionals.ts";
import { ui } from "../lib/i18n.ts";

const labels = ui("en");

function day(dayNumber, overrides = {}) {
  return {
    ...emptyDevotionalDay(dayNumber),
    title: `Day ${dayNumber}: Title`,
    anchor_scriptures: ['John 3:16 (KJV) — "For God so loved the world."'],
    devotional_reading: "Reading.",
    confession: "Confession.",
    ...overrides,
  };
}

const communion = { bread_reflection: "Bread.", cup_reflection: "Cup.", self_examination: "Self-examination.", series_closing_prayer: "Closing prayer." };
const oldDay7 = { journal_prompt: "Old prompt.", prayer_activation: "Old activation." };
const sectionLabels = (sections) => sections.map((section) => section.label);

test("Day 7 uses the Communion layout and Days 1-6 keep the usual one", () => {
  assert.deepEqual(sectionLabels(devotionalDaySections(day(7, communion), labels)), [
    "Anchor Scriptures",
    "The Rest Reflection",
    "Today's Confession of Rest",
    "The Table of Remembrance",
    "Reverent Self-Examination & Blessing",
    "The Bread Reflection",
    "The Cup Reflection",
    "Series Closing Prayer",
  ]);
  assert.deepEqual(sectionLabels(devotionalDaySections(day(3, { journal_prompt: "J", prayer_activation: "P" }), labels)), [
    "Anchor Scriptures",
    "Devotional Reading",
    "Today's Confession",
    "5-Minute Journal Prompt",
    "Prayer Activation Exercise",
  ]);
});

test("the Table of Remembrance sentence is fixed by the site, in English and Español", () => {
  const english = devotionalDaySections(day(7, communion), labels).find((section) => section.key === "table_of_remembrance");
  assert.equal(english.text, "Prepare a small piece of bread and a small cup of juice. Quiet your heart, move from striving to receiving, and partake deliberately.");
  const spanish = devotionalDaySections(day(7, communion), ui("es")).find((section) => section.key === "table_of_remembrance");
  assert.match(spanish.text, /^Prepará un pedacito de pan/);
  assert.match(spanish.text, /Aquietá/);
});

test("a Day 7 saved before this format keeps its old layout until it is converted", () => {
  const legacy = day(7, oldDay7);
  assert.equal(usesLegacyDayLayout(legacy), true);
  assert.deepEqual(sectionLabels(devotionalDaySections(legacy, labels)), [
    "Anchor Scriptures",
    "Devotional Reading",
    "Today's Confession",
    "5-Minute Journal Prompt",
    "Prayer Activation Exercise",
  ]);
  // Any Communion text switches it to the new layout.
  assert.equal(usesLegacyDayLayout(day(7, { ...oldDay7, bread_reflection: "Bread." })), false);
  // Only Day 7 can be legacy, and a brand-new empty Day 7 is a Communion day.
  assert.equal(usesLegacyDayLayout(day(3, oldDay7)), false);
  assert.equal(usesLegacyDayLayout(day(7)), false);
});

test("publishing needs the Communion text and Series Closing Prayer on Day 7, and no journal or prayer", () => {
  const days = [1, 2, 3, 4, 5, 6].map((n) => day(n, { journal_prompt: "J", prayer_activation: "P" }));
  const devotional = { title: "Series" };

  assert.match(findDevotionalPublishBlocker(devotional, [...days, day(7, oldDay7)]), /Day 7 needs the Reverent Self-Examination/);
  assert.match(findDevotionalPublishBlocker(devotional, [...days, day(7, { ...communion, bread_reflection: null })]), /Day 7 needs the Bread Reflection/);
  assert.match(findDevotionalPublishBlocker(devotional, [...days, day(7, { ...communion, series_closing_prayer: "" })]), /Day 7 needs the Series Closing Prayer/);
  assert.match(findDevotionalPublishBlocker(devotional, [...days, day(7, { ...communion, cup_reflection: null })]), /Day 7 needs the Cup Reflection/);
  assert.match(findDevotionalPublishBlocker(devotional, [...days, day(7, { ...communion, self_examination: " " })]), /Day 7 needs the Reverent Self-Examination/);
  assert.equal(findDevotionalPublishBlocker(devotional, [...days, day(7, communion)]), null);
  // Days 1-6 still need their journal prompt and prayer activation.
  assert.match(findDevotionalPublishBlocker(devotional, [day(1), ...days.slice(1), day(7, communion)]), /Day 1 needs a 5-minute journal prompt/);

  assert.equal(isCompleteDevotionalDay(day(7, communion)), true);
  assert.equal(isCompleteDevotionalDay(day(7, oldDay7)), false);
  assert.equal(isCompleteDevotionalDay(day(2, { journal_prompt: "J", prayer_activation: "P" })), true);
});

test("the review list gives Day 7 the Communion fields and keeps an old Day 7's text visible", () => {
  const devotional = { id: "d", title: "Series", introduction: null };
  const keysFor = (row) => buildDevotionalEditableFields(devotional, [row]).filter((field) => field.targetKind === "day").map((field) => field.fieldKey);
  const row = (dayNumber, extra = {}) => ({ id: `day-${dayNumber}`, day_number: dayNumber, title: `Day ${dayNumber}`, anchor_scriptures: [], devotional_reading: "R", confession: "C", journal_prompt: null, prayer_activation: null, ...extra });

  assert.deepEqual(keysFor(row(2)), ["title", "anchor_scriptures", "devotional_reading", "confession", "journal_prompt", "prayer_activation"]);
  assert.deepEqual(keysFor(row(7, communion)), ["title", "anchor_scriptures", "devotional_reading", "confession", "self_examination", "bread_reflection", "cup_reflection", "series_closing_prayer"]);
  assert.deepEqual(keysFor(row(7, oldDay7)), ["title", "anchor_scriptures", "devotional_reading", "confession", "self_examination", "bread_reflection", "cup_reflection", "series_closing_prayer", "journal_prompt", "prayer_activation"]);

  const day7 = buildDevotionalEditableFields(devotional, [row(7, communion)]).filter((field) => field.targetKind === "day");
  assert.equal(day7.find((field) => field.fieldKey === "devotional_reading").label, "The Rest Reflection");
  assert.equal(day7.find((field) => field.fieldKey === "confession").label, "Today's Confession of Rest");
  assert.equal(day7.find((field) => field.fieldKey === "bread_reflection").maxLength, 6000);
});

test("the review database functions accept every Communion field", async () => {
  const first = await readFile("supabase/migrations/20261011000000_devotional_communion_day.sql", "utf8");
  const second = await readFile("supabase/migrations/20261011010100_devotional_series_closing_prayer.sql", "utf8");
  for (const field of ["bread_reflection", "cup_reflection", "self_examination"]) {
    assert.match(first, new RegExp(`p_field = '${field}' then\\s+valid := true; current_value := v_day\\.${field}; max_length := 6000`));
    assert.match(first, new RegExp(`p_field = '${field}' then\\s+update public\\.teaching_devotional_days dd set ${field} = nullif\\(v_value, ''\\)`));
  }
  assert.match(first, /add column if not exists bread_reflection text/);

  // The later migration replaces both functions again, so it must still know every earlier field.
  for (const field of ["bread_reflection", "cup_reflection", "self_examination", "journal_prompt", "prayer_activation", "devotional_reading", "confession"]) {
    assert.match(second, new RegExp(`p_field = '${field}' then`), `${field} is still handled`);
  }
  assert.match(second, /p_field = 'series_closing_prayer' then\s+valid := true; current_value := v_day\.series_closing_prayer; max_length := 3000/);
  assert.match(second, /p_field = 'series_closing_prayer' then\s+update public\.teaching_devotional_days dd set series_closing_prayer = nullif\(v_value, ''\)/);
  assert.match(second, /add column if not exists series_closing_prayer text/);

  // Neither migration rewrites text that is already saved.
  assert.doesNotMatch(first + second, /update public\.teaching_devotional_days set/i);
});

const emailInput = {
  dayNumber: 7,
  totalDays: 7,
  title: "DAY 7 — COMMUNION AND REST: Carrying His Presence",
  seriesTitle: "Walking in the Light",
  anchorScriptures: ['Hebrews 4:9–10 (KJV) — "There remaineth therefore a rest to the people of God."'],
  devotionalReading: "Rest reading.",
  confession: "Rest confession.",
  journalPrompt: null,
  prayerActivation: null,
  readUrl: "https://theprayerwhiteboard.com/teachings/walking-in-the-light",
  preferencesUrl: "https://theprayerwhiteboard.com/email-preferences",
};

test("the Day 7 email shows the Communion sections in order and no journal or prayer", () => {
  const email = buildDevotionalDayEmail({ ...emailInput, breadReflection: "Bread text.", cupReflection: "Cup text.", selfExamination: "Self-examination text.", seriesClosingPrayer: "Closing prayer text." });
  const order = ["Anchor Scriptures", "The Rest Reflection", "Today&#39;s Confession of Rest", "The Table of Remembrance", "Reverent Self-Examination &amp; Blessing", "The Bread Reflection", "The Cup Reflection", "Series Closing Prayer"]
    .map((heading) => email.html.indexOf(heading));
  assert.ok(order.every((index) => index > -1), `a heading is missing: ${order.join(",")}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, "the sections are in reading order");
  assert.match(email.html, /Prepare a small piece of bread and a small cup of juice\./);
  assert.match(email.html, /Bread text\./);
  assert.doesNotMatch(email.html, /5-Minute Journal Prompt|Prayer Activation Exercise|Devotional Reading/);
  assert.match(email.text, /The Table of Remembrance\nPrepare a small piece of bread/);
  assert.match(email.text, /Reverent Self-Examination & Blessing\nSelf-examination text\./);
  assert.match(email.text, /Series Closing Prayer\nClosing prayer text\./);
  assert.ok(email.html.lastIndexOf("Closing prayer text.") > email.html.lastIndexOf("Cup text."), "the closing prayer is last");
  assert.doesNotMatch(email.text, /5-Minute Journal Prompt|Prayer Activation Exercise/);
});

test("an unconverted Day 7 still mails in its old layout", () => {
  const email = buildDevotionalDayEmail({ ...emailInput, journalPrompt: "Old prompt.", prayerActivation: "Old activation." });
  assert.match(email.html, /Devotional Reading/);
  assert.match(email.html, /5-Minute Journal Prompt/);
  assert.match(email.html, /Old activation\./);
  assert.doesNotMatch(email.html, /The Table of Remembrance|The Bread Reflection/);
});

test("Days 1-6 email exactly as before", () => {
  const email = buildDevotionalDayEmail({ ...emailInput, dayNumber: 3, title: "Day 3: Title", journalPrompt: "Prompt.", prayerActivation: "Activation." });
  assert.match(email.html, /Devotional Reading/);
  assert.match(email.html, /Today&#39;s Confession</);
  assert.match(email.html, /Prayer Activation Exercise/);
  assert.doesNotMatch(email.html, /The Rest Reflection|The Bread Reflection/);
});

test("a Day 7 import replaces an older Day 7 and never leaves journal or prayer text behind", async () => {
  const actions = await readFile("app/admin/teachings/devotional-actions.ts", "utf8");
  assert.match(actions, /journal_prompt: day\.journal_prompt \|\| null/);
  assert.match(actions, /bread_reflection: day\.bread_reflection \|\| null/);
  // The definition plus the three ways in: import into a teaching's devotional, import into a standalone
  // one, and create a new devotional from a file.
  assert.equal((actions.match(/importedDayRow\(/g) ?? []).length, 4, "every import path uses the same row builder");
});

test("saving a Day 7 never erases old journal or prayer text unless Communion text is being saved", async () => {
  const actions = await readFile("app/admin/teachings/devotional-actions.ts", "utf8");
  assert.match(actions, /savingCommunionText \? \{ \.\.\.values, journal_prompt: null, prayer_activation: null \} : values/);
});

test("a Day 7 file written in the old format is refused with a plain explanation", () => {
  const oldFormat = (n) => `Day ${n}: Day ${n}
Anchor Scriptures
John 3:16 (KJV) — "For God so loved the world."
Devotional Reading
Reading.
Today's Confession
Confession.
5-Minute Journal Prompt
Prompt.
Prayer Activation Exercise
Activation.`;
  assert.throws(
    () => parseDevotionalText(["Title", ...[1, 2, 3, 4, 5, 6, 7].map(oldFormat)].join("\n")),
    /Day 7: Day 7 must use the Communion and rest format/,
  );
});

test("a file ending in a Website Description line imports, and the line is not part of Day 7", () => {
  const six = (n) => `Day ${n}: Title ${n}
Anchor Scriptures
John 3:16 (KJV) — "For God so loved the world."
Devotional Reading
Reading ${n}.
Today's Confession
Confession ${n}.
5-Minute Journal Prompt
Prompt ${n}.
Prayer Activation Exercise
Activation ${n}.`;
  const seven = `DAY 7 — COMMUNION AND REST: Rest
Anchor Scriptures
Hebrews 4:9 (KJV) — "There remaineth therefore a rest."
The Rest Reflection
Rest.
Today’s Confession of Rest
Rest confession.
The Table of Remembrance
Prepare a small piece of bread and a small cup of juice. Quiet your heart, move from striving to receiving, and partake deliberately.
Reverent Self-Examination & Blessing
Examine yourself.

May the Lord bless you.
The Bread Reflection
Bread.
The Cup Reflection
Cup.
Series Closing Prayer
Father, thank You for this week.

In Jesus’ name, amen.

Website Description: A seven-day journey.`;
  const parsed = parseDevotionalText(["From Glory to Glory: Carrying the Presence of God", "", "Introduction one.", "", ...[1, 2, 3, 4, 5, 6].map(six), seven].join("\n"));
  assert.equal(parsed.days[6].title, "DAY 7 — COMMUNION AND REST: Rest");
  assert.equal(parsed.days[6].confession, "Rest confession.");
  assert.equal(parsed.days[6].self_examination, "Examine yourself.\nMay the Lord bless you.");
  assert.equal(parsed.days[6].series_closing_prayer, "Father, thank You for this week.\nIn Jesus' name, amen.");
  assert.doesNotMatch(JSON.stringify(parsed), /Website Description|seven-day journey/);
});

test("a Day 7 with no Series Closing Prayer is refused and the missing label is named", () => {
  const six = (n) => `Day ${n}: Title ${n}
Anchor Scriptures
John 3:16 (KJV) — "For God so loved the world."
Devotional Reading
Reading ${n}.
Today's Confession
Confession ${n}.
5-Minute Journal Prompt
Prompt ${n}.
Prayer Activation Exercise
Activation ${n}.`;
  const sevenWithoutClosing = `DAY 7 — COMMUNION AND REST: Rest
Anchor Scriptures
Hebrews 4:9 (KJV) — "There remaineth therefore a rest."
The Rest Reflection
Rest.
Today's Confession of Rest
Rest confession.
The Table of Remembrance
Prepare a small piece of bread and a small cup of juice.
Reverent Self-Examination & Blessing
Examine yourself.
The Bread Reflection
Bread.
The Cup Reflection
Cup.`;
  assert.throws(
    () => parseDevotionalText(["Title", "Intro.", ...[1, 2, 3, 4, 5, 6].map(six), sevenWithoutClosing].join("\n")),
    /Missing "Series Closing Prayer:" in DAY 7/,
  );
});

test("the Series Closing Prayer label is the same in Español and the section order matches the form", async () => {
  assert.equal(ui("es").seriesClosingPrayer, "Oración de cierre de la serie");
  const form = await readFile("app/admin/teachings/[id]/devotional/devotional-editor.tsx", "utf8");
  const order = ["labels.restReflection", "labels.confessionOfRest", "labels.tableOfRemembrance", "labels.selfExamination", "labels.breadReflection", "labels.cupReflection", "labels.seriesClosingPrayer"]
    .map((label) => form.indexOf(label));
  assert.ok(order.every((index) => index > -1));
  assert.deepEqual([...order].sort((a, b) => a - b), order, "the Day 7 form lists the sections in reading order");
});

// ---------------------------------------------------------------------------
// The Day 6 heads-up: tomorrow is Communion, have bread and juice ready
// ---------------------------------------------------------------------------

const headsUpEmail = (overrides) => buildDevotionalDayEmail({ ...emailInput, dayNumber: 6, title: "Day 6: Title", journalPrompt: "Prompt.", prayerActivation: "Activation.", ...overrides });

test("the Day 6 email reminds the reader to have bread and juice ready when Day 7 is Communion", () => {
  const email = headsUpEmail({ communionTomorrow: true });
  assert.match(email.html, /Tomorrow is Communion Friday\./);
  assert.match(email.html, /Tonight, have a small piece of bread and a small cup of juice ready for when you open Day 7\./);
  assert.match(email.text, /Tomorrow is Communion Friday\. Tonight, have a small piece of bread and a small cup of juice ready for when you open Day 7\./);
  // It sits after the day's content and before the Read button.
  assert.ok(email.html.indexOf("Prayer Activation Exercise") < email.html.indexOf("Tomorrow is Communion Friday."));
  assert.ok(email.html.indexOf("Tomorrow is Communion Friday.") < email.html.indexOf("Read the Full Teaching"));
});

test("the reminder is left out when Day 7 is not a Communion day, and on every other day", () => {
  assert.doesNotMatch(headsUpEmail({ communionTomorrow: false }).html, /Communion Friday/);
  assert.doesNotMatch(headsUpEmail({}).html, /Communion Friday/);
  // Even if a caller passes true, only Day 6 carries it.
  for (const dayNumber of [1, 2, 3, 4, 5, 7]) {
    const email = headsUpEmail({ dayNumber, communionTomorrow: true });
    assert.doesNotMatch(email.html, /Communion Friday/, `day ${dayNumber}`);
    assert.doesNotMatch(email.text, /Communion Friday/, `day ${dayNumber}`);
  }
});

test("only a Day 7 written in the Communion format triggers the reminder", () => {
  assert.equal(hasCommunionDay({ day_number: 7, ...communion }), true);
  assert.equal(hasCommunionDay({ day_number: 7, bread_reflection: "Bread." }), true);
  assert.equal(hasCommunionDay({ day_number: 7, bread_reflection: " ", cup_reflection: null, self_examination: null, series_closing_prayer: null }), false, "an empty Day 7 does not");
  assert.equal(hasCommunionDay(null), false, "no Day 7 saved");
  assert.equal(hasCommunionDay({ day_number: 6, ...communion }), false, "only Day 7 counts");
});

test("the daily send, the test send and both website day pages all apply the same rule", async () => {
  const send = await readFile("lib/devotional-send.ts", "utf8");
  assert.match(send, /communionTomorrow,\r?\n/, "the real send passes it to the email");
  assert.match(send, /hasCommunionDay\(data\)/);
  const testSend = await readFile("app/api/admin/devotional/test-send/route.ts", "utf8");
  assert.match(testSend, /communionTomorrow: hasCommunionDay\(day7\)/, "a Day 6 test email shows what will really be sent");
  for (const page of ["app/devotionals/[slug]/day/[dayNumber]/page.tsx", "app/teachings/[slug]/devotional/day/[dayNumber]/page.tsx"]) {
    const source = await readFile(page, "utf8");
    assert.match(source, /hasCommunionDay\(day7\)/, page);
    assert.match(source, /<CommunionHeadsUp title=\{t\.communionNextTitle\} text=\{t\.communionNext\} \/>/, page);
  }
});

test("the website wording does not say 'tomorrow', and Español is translated in voseo", () => {
  // The website page can be read on any day, so it names Day 7 rather than saying "tomorrow".
  assert.doesNotMatch(ui("en").communionNext + ui("en").communionNextTitle, /tomorrow|tonight/i);
  assert.equal(ui("en").communionTomorrowTitle, "Tomorrow is Communion Friday.");
  assert.equal(ui("es").communionTomorrowTitle, "Mañana es el viernes de Comunión.");
  assert.match(ui("es").communionTomorrow, /tené listo un pedacito de pan y una copita de jugo/);
  assert.match(ui("es").communionNext, /tené listo/);
  for (const key of ["communionTomorrowTitle", "communionTomorrow", "communionNextTitle", "communionNext"]) {
    assert.notEqual(ui("es")[key], ui("en")[key], `${key} is translated`);
  }
});
