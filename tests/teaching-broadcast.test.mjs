import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildTeachingEmail } from "../lib/teaching-email-content.ts";

const baseInput = {
  firstName: "Max",
  title: "Aliyah, Israel, and the Harvest",
  summary: "A study of return and ingathering.",
  introduction: "We begin in Jeremiah.\n\nThen we turn to Isaiah.",
  teachingUrl: "https://theprayerwhiteboard.com/teachings/aliyah-israel-harvest-prayer",
  preferencesUrl: "https://theprayerwhiteboard.com/email-preferences",
};

test("a teaching email renders the announcement line with title, then the summary on its own paragraph", () => {
  const email = buildTeachingEmail(baseInput);

  assert.equal(email.subject, "New teaching: Aliyah, Israel, and the Harvest");
  assert.match(email.html, /Hi Max,/);
  assert.ok(email.text.startsWith("Hi Max,"));
  assert.match(email.html, /A study of return and ingathering\./);
  assert.match(email.html, /published on The Prayer Whiteboard — <strong><em>Aliyah, Israel, and the Harvest<\/em><\/strong>\.<\/p>\s*<p[^>]*>A study of return/);
  assert.match(email.text, /Prayer Whiteboard — Aliyah, Israel, and the Harvest\.\n\nA study of return and ingathering\./);
  assert.equal(email.html.includes("<h1"), false);
  assert.match(email.html, /Read the Full Teaching/);
  assert.match(email.text, /Read the full teaching:/);
});

test("a teaching email opens with the centered letterhead logo when a logo URL is provided", () => {
  const email = buildTeachingEmail({ ...baseInput, logoUrl: "https://theprayerwhiteboard.com/images/whiteboard-sword-logo-with-tagline.png" });

  assert.match(email.html, /text-align:center[^>]*><img src="https:\/\/theprayerwhiteboard\.com\/images\/whiteboard-sword-logo-with-tagline\.png"/);
  assert.ok(email.html.indexOf("<img") < email.html.indexOf("Hi Max,"));
  assert.equal(email.html.includes("letter-spacing:0.12em"), false);
});

test("nullable summary is omitted rather than rendered empty", () => {
  const email = buildTeachingEmail({ ...baseInput, summary: null });

  assert.equal(email.html.includes("<p style=\"margin:0 0 16px;line-height:1.7;\"></p>"), false);
  assert.match(email.html, /Read the Full Teaching/);
  assert.match(email.text, /Aliyah, Israel, and the Harvest/);
});

test("teaching content is escaped and carries an unsubscribe link", () => {
  const email = buildTeachingEmail({ ...baseInput, summary: "<script>alert(1)</script>" });

  assert.equal(email.html.includes("<script>"), false);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /email-preferences/);
  assert.match(email.text, /unsubscribe: https:\/\/theprayerwhiteboard\.com\/email-preferences/);
});

test("the teaching webhook rejects unauthenticated callers before doing any work", async () => {
  const source = await readFile("app/api/webhooks/teaching/route.ts", "utf8");

  assert.match(source, /crypto\.timingSafeEqual/);
  assert.match(source, /x-webhook-secret/);
  assert.match(source, /status: 401/);
  assert.ok(source.indexOf("timingSafeEqual(provided, secret)") < source.indexOf("request.json()"));
  // Publishing no longer starts a send, so the webhook never reaches a broadcast at all.
  assert.equal(source.includes("broadcastTeaching("), false);
});

test("the teaching webhook only acts on published teaching rows", async () => {
  const source = await readFile("app/api/webhooks/teaching/route.ts", "utf8");

  assert.match(source, /payload\.table !== "teachings"/);
  assert.match(source, /record\?\.status !== "published"/);
});

test("a teaching broadcast is claimed before sending so repeat webhooks cannot double-send", async () => {
  const source = await readFile("lib/teaching-broadcast.ts", "utf8");
  const claimIndex = source.indexOf("await claimBroadcast(teachingId)");
  // Sending lives in deliver(), which only runs once the ledger row is claimed.
  const sendIndex = source.indexOf("return deliver(found.teaching, broadcastId)");

  assert.match(source, /error\.code === "23505"/);
  assert.ok(claimIndex > 0 && sendIndex > claimIndex, "claim must happen before any send");
  assert.ok(source.indexOf('.from("teachings")') < claimIndex);
  assert.match(source, /teaching\.status !== "published"/);
});

test("broadcasts target the teachings preference category, not a Sender group", async () => {
  const source = await readFile("lib/teaching-broadcast.ts", "utf8");

  assert.match(source, /loadConfirmedRecipients\("teachings"\)/);
  assert.equal(source.includes("new_teachings"), false);
  assert.equal(source.includes("elVkLl"), false);
});

test("both broadcasts share one confirmed-recipient query", async () => {
  const [recipients, weekly, teaching] = await Promise.all([
    readFile("lib/broadcast-recipients.ts", "utf8"),
    readFile("lib/weekly-update-broadcast.ts", "utf8"),
    readFile("lib/teaching-broadcast.ts", "utf8"),
  ]);

  assert.match(recipients, /\.eq\("status", "active"\)/);
  assert.match(recipients, /\.eq\("email_subscribers\.status", "confirmed"\)/);
  assert.match(weekly, /loadConfirmedRecipients\("weekly_updates"\)/);
  assert.match(teaching, /loadConfirmedRecipients\("teachings"\)/);
  // The duplicated query was removed rather than left behind.
  assert.equal(weekly.includes("email_subscribers!inner"), false);
});

test("per-recipient failures are stored in the single ledger row", async () => {
  const source = await readFile("lib/teaching-broadcast.ts", "utf8");

  const deliveries = await readFile("lib/send-deliveries.ts", "utf8");
  assert.match(deliveries, /MAX_RECORDED_FAILURES/);
  assert.match(source, /error: finished && failedTotal \? \{ sentCount: run\.sentCount, failedCount: failedTotal, failures: run\.failures \} : {}/);
});

test("service_role can read the content tables the broadcasts re-read", async () => {
  const grants = await readFile("supabase/migrations/20260922030000_grant_broadcast_content_reads.sql", "utf8");

  assert.match(grants, /grant select on public\.weekly_updates to service_role;/);
  assert.match(grants, /grant select on public\.teachings to service_role;/);
  // Read-only: broadcasts must never write to content tables.
  assert.equal(/grant[^;]*(insert|update|delete)[^;]*on public\.(teachings|weekly_updates)/.test(grants), false);
});
