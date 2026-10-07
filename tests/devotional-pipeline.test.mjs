import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DEVOTIONAL_TOTAL_DAYS, devotionalDayForWeekday, devotionalQueueStartDate, devotionalWeekdayName, isBeforeDevotionalQueueStart, pickNextQueuedSeries } from "../lib/devotional-schedule.ts";

// The cron fires at 11:00 UTC, which is early morning in America/Chicago.
// 2026-10-10 is a Saturday, so a week runs Saturday day 1 to Friday day 7.
const MORNING = (date) => new Date(`${date}T11:00:00Z`);
const CHICAGO = "America/Chicago";

test("each weekday morning forces its fixed day number", () => {
  const expected = [
    ["2026-10-10", "Saturday", 1],
    ["2026-10-11", "Sunday", 2],
    ["2026-10-12", "Monday", 3],
    ["2026-10-13", "Tuesday", 4],
    ["2026-10-14", "Wednesday", 5],
    ["2026-10-15", "Thursday", 6],
    ["2026-10-16", "Friday", 7],
  ];

  for (const [date, weekday, dayNumber] of expected) {
    const now = MORNING(date);
    assert.equal(devotionalWeekdayName(now, CHICAGO), weekday, `${date} should be ${weekday}`);
    assert.equal(devotionalDayForWeekday({ now, timeZone: CHICAGO }), dayNumber, `${weekday} should force day ${dayNumber}`);
  }
});

test("the mapping repeats every week and never falls out of window", () => {
  // A week later the same weekdays force the same day numbers. Nothing decays
  // with age, so stopping a finished series is the ledger's job now, not the
  // schedule's.
  assert.equal(devotionalDayForWeekday({ now: MORNING("2026-10-17"), timeZone: CHICAGO }), 1);
  assert.equal(devotionalDayForWeekday({ now: MORNING("2026-10-23"), timeZone: CHICAGO }), 7);
  assert.equal(DEVOTIONAL_TOTAL_DAYS, 7);
});

test("the weekday is read in the configured zone, not the host zone", () => {
  // 02:00 UTC Sunday is still 21:00 Saturday in Chicago.
  const now = new Date("2026-10-11T02:00:00Z");
  assert.equal(devotionalWeekdayName(now, "UTC"), "Sunday");
  assert.equal(devotionalWeekdayName(now, CHICAGO), "Saturday");
  assert.equal(devotionalDayForWeekday({ now, timeZone: "UTC" }), 2);
  assert.equal(devotionalDayForWeekday({ now, timeZone: CHICAGO }), 1);
});

test("a weekday past the end of a shorter series sends nothing", () => {
  // Friday forces day 7, but a five-day series has no day 7 to send.
  assert.equal(devotionalDayForWeekday({ now: MORNING("2026-10-16"), timeZone: CHICAGO, totalDays: 5 }), null);
  assert.equal(devotionalDayForWeekday({ now: MORNING("2026-10-10"), timeZone: CHICAGO, totalDays: 5 }), 1);
  assert.equal(devotionalDayForWeekday({ now: MORNING("2026-10-10"), timeZone: CHICAGO, totalDays: 0 }), null);
});

test("an invalid clock resolves to no send", () => {
  assert.equal(devotionalDayForWeekday({ now: new Date("not-a-date"), timeZone: CHICAGO }), null);
});

test("nothing is mailed before the queue start date, and the first cycle starts 2026-10-10", () => {
  assert.equal(devotionalQueueStartDate(), "2026-10-10");
  for (const date of ["2026-10-07", "2026-10-08", "2026-10-09"]) {
    assert.equal(isBeforeDevotionalQueueStart(MORNING(date), CHICAGO), true, `${date} is before the start`);
  }
  assert.equal(isBeforeDevotionalQueueStart(MORNING("2026-10-10"), CHICAGO), false);
  assert.equal(devotionalDayForWeekday({ now: MORNING("2026-10-10"), timeZone: CHICAGO }), 1);
  // The start date is read in the configured zone: 03:00 UTC on the 10th is still the 9th in Chicago.
  assert.equal(isBeforeDevotionalQueueStart(new Date("2026-10-10T03:00:00Z"), CHICAGO), true);
});

test("the queue starts the oldest unsent series published after the last mailed one", () => {
  const queue = [
    { id: "old-never-mailed", published_at: "2026-08-01T00:00:00Z" },
    { id: "last-mailed", published_at: "2026-09-20T00:00:00Z" },
    { id: "thursday", published_at: "2026-10-08T15:00:00Z" },
    { id: "friday", published_at: "2026-10-09T15:00:00Z" },
  ];
  const mailed = new Set(["last-mailed"]);
  const lastMailed = "2026-09-20T00:00:00Z";

  // An old series that predates the queue is never started as if it were new.
  assert.equal(pickNextQueuedSeries(queue, mailed, lastMailed)?.id, "thursday");
  // First published, first sent; the later one waits for the following Saturday.
  assert.equal(pickNextQueuedSeries(queue, new Set([...mailed, "thursday"]), "2026-10-08T15:00:00Z")?.id, "friday");
  assert.equal(pickNextQueuedSeries(queue, new Set([...mailed, "thursday", "friday"]), "2026-10-09T15:00:00Z"), null);
  // Nothing queued means nothing is sent.
  assert.equal(pickNextQueuedSeries([], mailed, lastMailed), null);
  // With no send history at all, the oldest published series starts.
  assert.equal(pickNextQueuedSeries(queue, new Set(), null)?.id, "old-never-mailed");
});

test("teaching publish-date math is gone from the schedule", async () => {
  const [schedule, send] = await Promise.all([
    readFile("lib/devotional-schedule.ts", "utf8"),
    readFile("lib/devotional-send.ts", "utf8"),
  ]);

  assert.equal(schedule.includes("publishedAt"), false);
  assert.equal(schedule.includes("calendarDaysBetween"), false);
  assert.equal(schedule.includes("devotionalDayForDate"), false);
  assert.equal(send.includes("devotionalDayForDate"), false);
  assert.equal(send.includes("teaching.published_at"), false);
});

test("per-subscriber drip tracking is fully removed", async () => {
  const [send, subscriptions, migration] = await Promise.all([
    readFile("lib/devotional-send.ts", "utf8"),
    readFile("lib/email-subscriptions.ts", "utf8"),
    readFile("supabase/migrations/20260922050000_devotional_relative_broadcast.sql", "utf8"),
  ]);

  assert.equal(send.includes("email_devotional_enrollments"), false);
  assert.equal(send.includes("current_day"), false);
  assert.equal(subscriptions.includes("enrollSubscriberInDevotional"), false);
  assert.equal(subscriptions.includes("pauseDevotionalEnrollments"), false);
  assert.match(migration, /drop table if exists public\.email_devotional_enrollments;/);

  await assert.rejects(readFile("lib/devotional-enrollment.ts", "utf8"), /ENOENT/);
});

test("a Saturday starts the oldest queued series and the other days continue it", async () => {
  const source = await readFile("lib/devotional-send.ts", "utf8");

  // The series is selected straight from teaching_devotionals, so one authored
  // standalone is eligible without a teaching having to be newest.
  assert.match(source, /\.from\("teaching_devotionals"\)[\s\S]*?\.eq\("status", "published"\)[\s\S]*?\.order\("published_at", \{ ascending: true \}\)/);
  assert.match(source, /devotionalDayForWeekday\(\{/);
  assert.match(source, /dayNumber === 1\s*\? await nextQueuedDevotional\(spanishIds\)\s*: await activeCycleDevotional\(dayNumber, now, spanishIds\)/);
  assert.match(source, /isBeforeDevotionalQueueStart\(now, timeZone\)/);

  // The teaching is resolved from the assignment table afterwards, and only
  // because the ledger key and the public day URL still need one.
  assert.match(source, /resolveAssignedTeaching\(devotional\.id\)/);
  assert.match(source, /\.from\("teaching_devotional_assignments"\)[\s\S]*?\.eq\("devotional_id", devotionalId\)/);
  assert.ok(
    source.indexOf('.from("teaching_devotionals")') < source.indexOf("resolveAssignedTeaching(devotional.id)"),
    "the series must be chosen before any teaching is looked up",
  );
});

test("a day is claimed in the ledger before any send", async () => {
  const source = await readFile("lib/devotional-send.ts", "utf8");
  const claimIndex = source.indexOf("await claimDay(devotional.id, dayNumber, teaching?.id ?? null)");
  // Sending lives in deliverDay(), which only runs once the day is claimed.
  const sendIndex = source.indexOf("return deliverDay({ ledgerId");

  assert.match(source, /error\.code === "23505"/);
  assert.ok(claimIndex > 0 && sendIndex > claimIndex, "claim must happen before any send");
  // Claiming only after content is resolved avoids burning the day on a missing row.
  assert.ok(source.indexOf('.from("teaching_devotional_days")') < claimIndex);
});

test("the ledger enforces one blast per devotional day, not per teaching day", async () => {
  const [original, rekey, send] = await Promise.all([
    readFile("supabase/migrations/20260922050000_devotional_relative_broadcast.sql", "utf8"),
    readFile("supabase/migrations/20260923010000_rekey_devotional_broadcast_ledger.sql", "utf8"),
    readFile("lib/devotional-send.ts", "utf8"),
  ]);

  // The teaching-keyed guard is retired and replaced with a series-keyed one,
  // so assigning a new devotional to a teaching that already mailed its seven
  // days no longer collides with the old rows.
  assert.match(rekey, /drop index if exists public\.email_devotional_broadcast_ledger_teaching_day_idx;/);
  assert.match(rekey, /create unique index[\s\S]*?email_devotional_broadcast_ledger \(devotional_id, day_number\)/);
  assert.match(rekey, /add column if not exists devotional_id uuid references public\.teaching_devotionals\(id\)/);
  assert.match(rekey, /alter column teaching_id drop not null/);

  // Existing history is carried over, never discarded.
  assert.match(rekey, /update public\.email_devotional_broadcast_ledger[\s\S]*?from public\.teaching_devotional_assignments/);
  assert.equal(/delete\s+from\s+public\.email_devotional_broadcast_ledger/i.test(rekey), false);

  assert.equal(/grant[^;]*delete[^;]*email_devotional_broadcast_ledger/.test(original), false);
  assert.match(send, /insert\(\{ devotional_id: devotionalId, teaching_id: teachingId, day_number: dayNumber/);
});

test("the email reads through to the assigned teaching, falling back to the devotional's own day URL", async () => {
  const [emailContent, send] = await Promise.all([
    readFile("lib/devotional-email-content.ts", "utf8"),
    readFile("lib/devotional-send.ts", "utf8"),
  ]);

  // devotionalDayUrl still exists: the public day page still routes off the
  // devotional's own slug, and a standalone series (no assigned teaching) has
  // no teaching page for the email to fall back on.
  assert.match(emailContent, /export function devotionalDayUrl\(/);
  assert.match(emailContent, /\/devotionals\/\$\{encodeURIComponent\(devotionalSlug\)\}\/day\/\$\{dayNumber\}/);
  assert.match(send, /teaching \? `\$\{base\}\/teachings\/\$\{teaching\.slug\}` : devotionalDayUrl\(base, devotional\.slug, dayNumber\)/);
});

test("the devotional day link has a public route to land on", async () => {
  const page = await readFile("app/devotionals/[slug]/day/[dayNumber]/page.tsx", "utf8");

  assert.match(page, /getPublishedDevotionalSeriesBySlug\(slug\)/);
  assert.match(page, /\.eq\("devotional_id", series\.id\)/);
  assert.match(page, /\.eq\("day_number", dayNumber\)/);
  assert.match(page, /notFound\(\)/);
});

test("the whole confirmed devotional list receives the day, throttled", async () => {
  const source = await readFile("lib/devotional-send.ts", "utf8");

  assert.match(source, /loadConfirmedRecipients\("devotionals"\)/);
  assert.match(source, /throttleMs: THROTTLE_MS/);
  // error is not-null in production (schema drift from the migration file), so
  // a clean run must still write a non-null value or the update silently fails
  // and leaves the row stuck on 'sending' forever.
  assert.match(source, /error: finished && failedCount \? \{ sentCount: run\.sentCount, failedCount, failures: run\.failures \} : \{\}/);
  assert.match(source, /if \(ledgerUpdateError\) throw new Error/);
});

test("the cron route still authenticates with a timing-safe bearer check", async () => {
  const source = await readFile("app/api/cron/send-devotionals/route.ts", "utf8");

  assert.match(source, /crypto\.timingSafeEqual/);
  assert.match(source, /CRON_SECRET/);
  assert.ok(source.indexOf("timingSafeEqual(provided, secret)") < source.indexOf("processDevotionalQueue()"));
});
