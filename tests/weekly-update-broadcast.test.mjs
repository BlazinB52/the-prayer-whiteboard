import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildWeeklyUpdateEmail } from "../lib/weekly-update-email-content.ts";

const baseInput = {
  title: "This Week at the Whiteboard",
  bodyMarkdown: "Dear Prayer Family,\n\nSecond paragraph.",
  convertedContent: [],
  weeklyUpdateUrl: "https://theprayerwhiteboard.com/weekly-update",
  preferencesUrl: "https://theprayerwhiteboard.com/email-preferences",
};

test("weekly update email starts with the imported salutation in HTML and plain text", () => {
  const email = buildWeeklyUpdateEmail({
    ...baseInput,
    convertedContent: [
      { type: "paragraph", children: [{ text: "Dear Prayer Family," }] },
      { type: "paragraph", children: [{ text: "Weekly update body." }] },
    ],
  });

  assert.match(email.html, /<\/h1>\s*<p[^>]*>Dear Prayer Family,<\/p>/);
  assert.ok(email.text.startsWith("Dear Prayer Family,\n\nWeekly update body."));
  assert.doesNotMatch(email.html, />Hi [^<]+,<\/p>/);
  assert.doesNotMatch(email.html, />Hello,<\/p>/);
  assert.doesNotMatch(email.text, /^Hi [^\n]+,/);
  assert.doesNotMatch(email.text, /^Hello,$/);
});

test("structured blocks render into the email layout", () => {
  const email = buildWeeklyUpdateEmail({
    ...baseInput,
    convertedContent: [
      { type: "heading", level: 2, children: [{ text: "Prayer Focus" }] },
      { type: "paragraph", children: [{ text: "Stand firm.", bold: true }] },
      { type: "list", items: [[{ text: "Pray daily" }], [{ text: "Give thanks" }]] },
      { type: "quote", children: [{ text: "Be still." }] },
      { type: "divider" },
    ],
  });

  assert.match(email.html, /<h2[^>]*>Prayer Focus<\/h2>/);
  assert.match(email.html, /<strong>Stand firm\.<\/strong>/);
  assert.match(email.html, /<li[^>]*>Pray daily<\/li>/);
  assert.match(email.html, /<blockquote/);
  assert.match(email.html, /<hr/);
  assert.equal(email.subject, "This Week at the Whiteboard");
  assert.match(email.text, /PRAYER FOCUS/);
  assert.match(email.text, /- Pray daily/);
});

test("markdown body is used when no structured blocks exist", () => {
  const email = buildWeeklyUpdateEmail(baseInput);
  assert.match(email.html, /Dear Prayer Family,/);
  assert.match(email.html, /Second paragraph\./);
  assert.ok(email.text.startsWith("Dear Prayer Family,"));
});

test("broadcast content escapes subscriber-visible HTML and carries an unsubscribe link", () => {
  const email = buildWeeklyUpdateEmail({
    ...baseInput,
    convertedContent: [{ type: "paragraph", children: [{ text: "<script>alert(1)</script>" }] }],
  });

  assert.equal(email.html.includes("<script>"), false);
  assert.match(email.html, /&lt;script&gt;/);
  assert.match(email.html, /email-preferences/);
  assert.match(email.text, /unsubscribe: https:\/\/theprayerwhiteboard\.com\/email-preferences/);
});

test("the webhook route rejects unauthenticated callers before doing any work", async () => {
  const source = await readFile("app/api/webhooks/weekly-update/route.ts", "utf8");

  assert.match(source, /crypto\.timingSafeEqual/);
  assert.match(source, /x-webhook-secret/);
  assert.match(source, /status: 401/);
  // The secret check must precede parsing and broadcasting.
  assert.ok(source.indexOf("timingSafeEqual(provided, secret)") < source.indexOf("request.json()"));
  assert.ok(source.indexOf("timingSafeEqual(provided, secret)") < source.indexOf("broadcastWeeklyUpdate(weeklyUpdateId)"));
});

test("the webhook only acts on current published weekly update rows", async () => {
  const source = await readFile("app/api/webhooks/weekly-update/route.ts", "utf8");

  assert.match(source, /payload\.table !== "weekly_updates"/);
  assert.match(source, /record\?\.status !== "published" \|\| record\?\.is_current !== true/);
});

test("a broadcast is claimed before sending so repeat webhooks cannot double-send", async () => {
  const source = await readFile("lib/weekly-update-broadcast.ts", "utf8");
  const claimIndex = source.indexOf("await claimBroadcast(weeklyUpdateId)");
  // Sending lives in deliver(), which only runs once the ledger row is claimed.
  const sendIndex = source.indexOf("return deliver(update, broadcastId)");

  assert.match(source, /error\.code === "23505"/);
  assert.ok(claimIndex > 0 && sendIndex > claimIndex, "claim must happen before any send");
  // Webhook payloads are untrusted, so publish state is re-read from the row.
  assert.match(source, /\.from\("weekly_updates"\)/);
  assert.ok(source.indexOf("loadPublishableUpdate(weeklyUpdateId)", source.indexOf("export async function broadcastWeeklyUpdate")) < claimIndex);
  assert.match(source, /update\.status !== "published" \|\| update\.is_current !== true/);
});

test("only confirmed weekly update subscribers receive a broadcast", async () => {
  const [broadcast, recipients] = await Promise.all([
    readFile("lib/weekly-update-broadcast.ts", "utf8"),
    readFile("lib/broadcast-recipients.ts", "utf8"),
  ]);

  assert.match(broadcast, /loadConfirmedRecipients\("weekly_updates", language\)/);
  assert.match(recipients, /\.eq\("category", category\)/);
  assert.match(recipients, /\.eq\("status", "active"\)/);
  assert.match(recipients, /\.eq\("email_subscribers\.status", "confirmed"\)/);
});

test("subscriber broadcasts use the greeting-free weekly update builder", async () => {
  const source = await readFile("lib/weekly-update-broadcast.ts", "utf8");
  const builderCall = source.match(/buildWeeklyUpdateEmail\(\{[\s\S]*?\n\s*\}\);/)?.[0] ?? "";

  assert.match(builderCall, /bodyMarkdown: update\.body_markdown/);
  assert.equal(builderCall.includes("firstName"), false);
  assert.match(source, /toName: recipient\.firstName/);
});
