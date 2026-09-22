import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { calendarDaysBetween, devotionalDayForDate } from "../lib/devotional-schedule.ts";

// Teaching published Tuesday noon UTC; devotional day 1 falls on Wednesday.
const TUESDAY_NOON = "2026-09-22T12:00:00Z";

test("day 1 lands the morning after the teaching is published", () => {
  assert.equal(devotionalDayForDate({ publishedAt: TUESDAY_NOON, now: new Date("2026-09-23T08:00:00Z"), totalDays: 7 }), 1);
  assert.equal(devotionalDayForDate({ publishedAt: TUESDAY_NOON, now: new Date("2026-09-24T08:00:00Z"), totalDays: 7 }), 2);
  assert.equal(devotionalDayForDate({ publishedAt: TUESDAY_NOON, now: new Date("2026-09-29T08:00:00Z"), totalDays: 7 }), 7);
});

test("publication day and days past the series send nothing", () => {
  assert.equal(devotionalDayForDate({ publishedAt: TUESDAY_NOON, now: new Date("2026-09-22T23:00:00Z"), totalDays: 7 }), null);
  assert.equal(devotionalDayForDate({ publishedAt: TUESDAY_NOON, now: new Date("2026-09-30T08:00:00Z"), totalDays: 7 }), null);
  assert.equal(devotionalDayForDate({ publishedAt: TUESDAY_NOON, now: new Date("2026-09-21T08:00:00Z"), totalDays: 7 }), null);
});

test("the delta counts calendar days, not 24-hour spans", () => {
  // Only 8 hours after a late publish, but the calendar date has advanced.
  assert.equal(devotionalDayForDate({ publishedAt: "2026-09-22T23:00:00Z", now: new Date("2026-09-23T07:00:00Z"), totalDays: 7 }), 1);
  assert.equal(calendarDaysBetween(new Date("2026-09-22T23:59:00Z"), new Date("2026-09-23T00:01:00Z")), 1);
  assert.equal(calendarDaysBetween(new Date("2026-09-22T00:01:00Z"), new Date("2026-09-22T23:59:00Z")), 0);
});

test("the schedule zone shifts which morning a day belongs to", () => {
  // 21:00 UTC Wednesday is still Wednesday in UTC but already Thursday in Tokyo.
  const now = new Date("2026-09-23T21:00:00Z");
  assert.equal(devotionalDayForDate({ publishedAt: TUESDAY_NOON, now, totalDays: 7, timeZone: "UTC" }), 1);
  assert.equal(devotionalDayForDate({ publishedAt: TUESDAY_NOON, now, totalDays: 7, timeZone: "Asia/Tokyo" }), 2);
  assert.equal(devotionalDayForDate({ publishedAt: TUESDAY_NOON, now, totalDays: 7, timeZone: "Pacific/Honolulu" }), 1);
});

test("invalid dates and empty series resolve to no send", () => {
  assert.equal(devotionalDayForDate({ publishedAt: "not-a-date", now: new Date(), totalDays: 7 }), null);
  assert.equal(devotionalDayForDate({ publishedAt: TUESDAY_NOON, now: new Date("2026-09-23T08:00:00Z"), totalDays: 0 }), null);
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

test("the run is driven by the most recently published teaching", async () => {
  const source = await readFile("lib/devotional-send.ts", "utf8");

  assert.match(source, /\.from\("teachings"\)/);
  assert.match(source, /\.eq\("status", "published"\)/);
  assert.match(source, /\.order\("published_at", \{ ascending: false \}\)/);
  assert.match(source, /devotionalDayForDate\(\{/);
});

test("a day is claimed in the ledger before any send", async () => {
  const source = await readFile("lib/devotional-send.ts", "utf8");
  const claimIndex = source.indexOf("await claimDay(teaching.id, dayNumber)");
  const sendIndex = source.indexOf("sendSenderTransactionalEmail(");

  assert.match(source, /error\.code === "23505"/);
  assert.ok(claimIndex > 0 && sendIndex > claimIndex, "claim must happen before any send");
  // Claiming only after content is resolved avoids burning the day on a missing row.
  assert.ok(source.indexOf('.from("teaching_devotional_days")') < claimIndex);
});

test("the ledger enforces one blast per teaching day", async () => {
  const migration = await readFile("supabase/migrations/20260922050000_devotional_relative_broadcast.sql", "utf8");

  assert.match(migration, /create unique index[\s\S]*?email_devotional_broadcast_ledger \(teaching_id, day_number\)/);
  assert.equal(/grant[^;]*delete[^;]*email_devotional_broadcast_ledger/.test(migration), false);
  assert.match(migration, /grant select on public\.teachings to service_role;/);
  assert.match(migration, /grant select on public\.teaching_devotional_days to service_role;/);
});

test("the whole confirmed devotional list receives the day, throttled", async () => {
  const source = await readFile("lib/devotional-send.ts", "utf8");

  assert.match(source, /loadConfirmedRecipients\("devotionals"\)/);
  assert.match(source, /await sleep\(THROTTLE_MS\);/);
  assert.match(source, /error: failedCount \? \{ sentCount, failedCount, failures \} : null/);
});

test("the cron route still authenticates with a timing-safe bearer check", async () => {
  const source = await readFile("app/api/cron/send-devotionals/route.ts", "utf8");

  assert.match(source, /crypto\.timingSafeEqual/);
  assert.match(source, /CRON_SECRET/);
  assert.ok(source.indexOf("timingSafeEqual(provided, secret)") < source.indexOf("processDevotionalQueue()"));
});
