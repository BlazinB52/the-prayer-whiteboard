import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const broadcast = await readFile("lib/weekly-update-broadcast.ts", "utf8");
const resumeRoute = await readFile("app/api/webhooks/weekly-update/resume/route.ts", "utf8");
const webhookRoute = await readFile("app/api/webhooks/weekly-update/route.ts", "utf8");
const migration = await readFile("supabase/migrations/20261006070000_weekly_update_deliveries.sql", "utf8");

test("a send stops before the 60s function limit and reports what is left", () => {
  const budget = Number(broadcast.match(/TIME_BUDGET_MS = ([\d_]+)/)?.[1].replaceAll("_", ""));
  assert.ok(budget > 0 && budget <= 45_000);
  assert.match(broadcast, /Date\.now\(\) >= deadline/);
  assert.match(broadcast, /status: "incomplete"|"incomplete"/);
  assert.match(broadcast, /finished \? status : "sending"/);
});

test("every recipient is claimed before sending and finished recipients are skipped", () => {
  assert.ok(broadcast.indexOf("claimDelivery(update.id, recipient.id)") < broadcast.indexOf("sendSenderTransactionalEmail({"));
  assert.match(broadcast, /alreadySent\.has\(recipient\.id\)/);
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
