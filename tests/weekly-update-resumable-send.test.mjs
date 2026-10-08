import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const broadcast = await readFile("lib/weekly-update-broadcast.ts", "utf8");
const resumeRoute = await readFile("app/api/webhooks/weekly-update/resume/route.ts", "utf8");
const webhookRoute = await readFile("app/api/webhooks/weekly-update/route.ts", "utf8");
const shared = await readFile("lib/send-deliveries.ts", "utf8");
const migration = await readFile("supabase/migrations/20261006070000_weekly_update_deliveries.sql", "utf8");

test("a send stops before the 60s function limit and reports what is left", () => {
  const budget = Number(shared.match(/SEND_TIME_BUDGET_MS = ([\d_]+)/)?.[1].replaceAll("_", ""));
  assert.ok(budget > 0 && budget <= 45_000);
  assert.match(shared, /Date\.now\(\) < deadline/);
  assert.match(shared, /remainingCount: pending\.length - taken/);
  assert.match(broadcast, /finished \? status : "sending"/);
  assert.match(broadcast, /deliverToRecipients\(/);
});

test("emails go out a few at a time, not one by one", () => {
  const concurrency = Number(shared.match(/SEND_CONCURRENCY = (\d+)/)?.[1]);
  assert.ok(concurrency >= 3 && concurrency <= 8, "enough to finish a small list in one request, few enough for Sender");
  assert.match(shared, /Promise\.all\(Array\.from\(\{ length:/);
});

test("every recipient is claimed before sending and finished recipients are skipped", () => {
  assert.ok(shared.indexOf("store.claim(recipient.id)") < shared.indexOf("sendSenderTransactionalEmail({"));
  assert.match(shared, /alreadySent\.has\(recipient\.id\)/);
  assert.match(broadcast, /\.eq\("status", "sent"\)/);
  assert.match(migration, /primary key \(weekly_update_id, subscriber_id\)/);
});

test("only failed or abandoned claims can be taken again", () => {
  assert.match(broadcast, /status\.eq\.failed,and\(status\.eq\.sending,updated_at\.lt\./);
});

test("an incomplete send hands the rest to the resume route", () => {
  assert.match(webhookRoute, /outcome\.status === "incomplete"/);
  assert.match(webhookRoute, /after\(/);
  assert.match(resumeRoute, /outcome\.status === "incomplete"/);
});

test("the resume route accepts only the webhook secret or an admin session", () => {
  assert.match(resumeRoute, /timingSafeEqual\(provided, secret\)/);
  assert.match(resumeRoute, /getAuthorizedUser\(\)/);
  assert.ok(resumeRoute.indexOf("status: 401") < resumeRoute.indexOf("request.json()"));
  assert.ok(resumeRoute.indexOf("status: 401") < resumeRoute.indexOf("resumeWeeklyUpdateBroadcast(weeklyUpdateId)"));
});

test("sending to one subscriber is admin-only, real (no [TEST]) and limited to confirmed subscribers", async () => {
  const route = await readFile("app/api/admin/weekly-update/send-to-subscriber/route.ts", "utf8");
  assert.match(route, /getAuthorizedUser\(\)/);
  assert.ok(route.indexOf("status: 401") < route.indexOf("request.json()"));
  const fn = broadcast.slice(broadcast.indexOf("export async function sendWeeklyUpdateToSubscriber"));
  assert.doesNotMatch(fn, /\[TEST\]/);
  assert.match(fn, /loadConfirmedRecipients\("weekly_updates"\)/);
  assert.ok(fn.indexOf("claimDelivery(") < fn.indexOf("sendSenderTransactionalEmail("));
});

test("teaching and devotional sends are resumable through the shared delivery loop", async () => {
  assert.match(shared, /SEND_TIME_BUDGET_MS = 40_000/);
  assert.match(shared, /Date\.now\(\) < deadline/);
  assert.ok(shared.indexOf("store.claim(recipient.id)") < shared.indexOf("sendSenderTransactionalEmail({"));
  assert.match(shared, /alreadySent\.has\(recipient\.id\)/);

  const teaching = await readFile("lib/teaching-broadcast.ts", "utf8");
  const devotional = await readFile("lib/devotional-send.ts", "utf8");
  assert.match(teaching, /finished \? status : "sending"/);
  assert.match(devotional, /finished \? status : "sending"/);
  assert.equal(teaching.includes("sendSenderTransactionalEmail("), false);
  assert.equal(devotional.includes("sendSenderTransactionalEmail("), false);

  const teachingResume = await readFile("app/api/webhooks/teaching/resume/route.ts", "utf8");
  const devotionalResume = await readFile("app/api/cron/send-devotionals/resume/route.ts", "utf8");
  assert.ok(teachingResume.indexOf("status: 401") < teachingResume.indexOf("request.json()"));
  assert.ok(devotionalResume.indexOf("status: 401") < devotionalResume.indexOf("request.json()"));
  // The teaching send now starts from the Administrator's Send email button instead of the publish webhook.
  for (const route of ["app/api/admin/teaching/send-email/route.ts", "app/api/cron/send-devotionals/route.ts"]) {
    assert.match(await readFile(route, "utf8"), /status === "incomplete"\) scheduleContinuation\(/);
  }
});

test("teaching resume accepts an admin session and refuses legacy sends with no delivery records", async () => {
  const route = await readFile("app/api/webhooks/teaching/resume/route.ts", "utf8");
  assert.match(route, /getAuthorizedUser\(\)/);
  assert.ok(route.indexOf("status: 401") < route.indexOf("request.json()"));

  const teaching = await readFile("lib/teaching-broadcast.ts", "utf8");
  assert.match(teaching, /!deliveryRows && \(ledger\.recipient_count as number\) > 0\) return \{ status: "already_complete" \}/);
  assert.ok(teaching.indexOf("deliveryRows") < teaching.indexOf("return deliver(found.teaching, ledger.id as string)"));

  const page = await readFile("app/admin/teachings/page.tsx", "utf8");
  assert.match(page, /anyRows/);
  assert.match(page, /FinishTeachingSendButton/);
});

test("the weekly update uses the same delivery loop and refuses legacy sends on resume", () => {
  assert.match(broadcast, /store: weeklyDeliveryStore\(update\.id\)/);
  assert.match(broadcast, /!deliveryRows && \(ledger\.recipient_count as number\) > 0\) return \{ status: "already_complete" \}/);
});

test("a daily safety net finishes stuck sends and alerts when something still needs attention", async () => {
  const stuck = await readFile("lib/stuck-sends.ts", "utf8");
  const cron = await readFile("app/api/cron/finish-stuck-sends/route.ts", "utf8");
  const vercel = JSON.parse(await readFile("vercel.json", "utf8"));

  assert.ok(vercel.crons.some((entry) => entry.path === "/api/cron/finish-stuck-sends" && /^\d+ \d+ \* \* \*$/.test(entry.schedule)), "daily, which every Vercel plan allows");
  assert.match(stuck, /resumeWeeklyUpdateBroadcast\(/);
  assert.match(stuck, /resumeTeachingBroadcast\(/);
  assert.match(stuck, /resumeDevotionalBroadcast\(/);
  assert.match(stuck, /\.eq\("status", "sending"\)\.lt\("created_at", before\)/);
  assert.match(stuck, /too_old/);
  assert.match(stuck, /ADMIN_ALERT_EMAIL/);

  assert.match(cron, /timingSafeEqual\(provided, secret\)/);
  assert.ok(cron.indexOf("status: 401") < cron.indexOf("await run(secret)"));
  assert.match(cron, /continueAfter/);
});
