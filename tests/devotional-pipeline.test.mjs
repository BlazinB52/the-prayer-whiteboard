import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the cron route authenticates with a timing-safe bearer check before running", async () => {
  const source = await readFile("app/api/cron/send-devotionals/route.ts", "utf8");

  assert.match(source, /crypto\.timingSafeEqual/);
  assert.match(source, /CRON_SECRET/);
  assert.match(source, /Bearer\\s\+/);
  assert.match(source, /status: 401/);
  assert.ok(source.indexOf("timingSafeEqual(provided, secret)") < source.indexOf("processDevotionalQueue()"));
});

test("due enrollments are active and older than the send interval", async () => {
  const source = await readFile("lib/devotional-send.ts", "utf8");

  assert.match(source, /SEND_INTERVAL_HOURS = 20/);
  assert.match(source, /\.eq\("status", "active"\)/);
  assert.match(source, /last_sent_at\.is\.null,last_sent_at\.lt\./);
  // Bounded per run so the function cannot exceed its timeout.
  assert.match(source, /\.limit\(MAX_PER_RUN\)/);
});

test("a successful send advances the day and completes the series at the end", async () => {
  const source = await readFile("lib/devotional-send.ts", "utf8");

  assert.match(source, /const nextDay = enrollment\.current_day \+ 1;/);
  assert.match(source, /current_day: nextDay/);
  assert.match(source, /last_sent_at: new Date\(\)\.toISOString\(\)/);
  assert.match(source, /status: nextDay > series\.totalDays \? "completed" : "active"/);
});

test("a failed send retries the same day rather than skipping it", async () => {
  const source = await readFile("lib/devotional-send.ts", "utf8");
  const failedIndex = source.indexOf("summary.failed += 1;");
  const failureBranch = source.slice(source.lastIndexOf("} else {", failedIndex), failedIndex);

  assert.equal(/current_day\s*:/.test(failureBranch), false, "a failure must not advance the day");
  assert.match(failureBranch, /last_sent_at: new Date\(\)\.toISOString\(\)/);
});

test("subscribers who are no longer confirmed are paused, not mailed", async () => {
  const source = await readFile("lib/devotional-send.ts", "utf8");

  assert.match(source, /subscriber\.status !== "confirmed"/);
  assert.match(source, /status: "paused"/);
  const pauseIndex = source.indexOf('subscriber.status !== "confirmed"');
  assert.ok(pauseIndex > 0 && pauseIndex < source.indexOf("sendSenderTransactionalEmail("));
});

test("sends are throttled sequentially like the backfill script", async () => {
  const source = await readFile("lib/devotional-send.ts", "utf8");

  assert.match(source, /THROTTLE_MS = 150/);
  assert.match(source, /await sleep\(THROTTLE_MS\);/);
});

test("confirming devotionals enrolls the subscriber at day 1", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  const sync = source.match(/async function syncConfirmedSubscriber[\s\S]*?\n}/)?.[0] ?? "";

  assert.match(sync, /input\.categories\.includes\("devotionals"\) && input\.devotionalSlug/);
  assert.match(sync, /enrollSubscriberInDevotional\(input\.subscriberId, input\.devotionalSlug\)/);
});

test("enrollment only ever happens on confirmed paths", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  const pendingBranch = source.match(/let subscriberId[\s\S]*?export async function confirmSubscriptionToken/)?.[0] ?? "";

  assert.equal(pendingBranch.includes("enrollSubscriberInDevotional"), false);
});

test("unsubscribing or suppression stops the daily devotional pacing", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");

  assert.match(source, /if \(!categories\.includes\("devotionals"\)\) await pauseDevotionalEnrollments/);
  const suppressed = source.match(/async function markSubscriberSuppressed[\s\S]*?\n}/)?.[0] ?? "";
  assert.match(suppressed, /pauseDevotionalEnrollments\(subscriberId\)/);
});

test("re-enrolling a completed series restarts it without resetting an active one", async () => {
  const source = await readFile("lib/devotional-enrollment.ts", "utf8");

  assert.match(source, /if \(existing\.status === "active"\) return;/);
  assert.match(source, /status: "active", current_day: 1, last_sent_at: null/);
  assert.match(source, /insertError\.code !== "23505"/);
});

test("the cron schedule and service role content grants are configured", async () => {
  const [vercel, migration] = await Promise.all([
    readFile("vercel.json", "utf8"),
    readFile("supabase/migrations/20260922040000_devotional_tracking.sql", "utf8"),
  ]);

  assert.match(vercel, /\/api\/cron\/send-devotionals/);
  assert.match(migration, /grant select on public\.teaching_devotionals to service_role;/);
  assert.match(migration, /grant select on public\.teaching_devotional_days to service_role;/);
  assert.match(migration, /email_devotional_enrollments_subscriber_series_idx/);
  assert.equal(/grant[^;]*delete[^;]*email_devotional_enrollments/.test(migration), false);
});
