import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { categoryLabels, confirmationCopy } from "../lib/subscription-confirmation-view.ts";

test("confirmation result copy lists one active category", () => {
  const copy = confirmationCopy("confirmed");
  assert.equal(copy.title, "Subscription confirmed!");
  assert.equal(copy.body, "Your email preferences are active. You are subscribed to:");
  assert.deepEqual(categoryLabels(["weekly_updates"]), ["Weekly Updates"]);
});

test("confirmation result copy lists all active categories", () => {
  assert.deepEqual(categoryLabels(["weekly_updates", "teachings", "devotionals"]), [
    "Weekly Updates",
    "New Teachings",
    "7-Day Devotionals",
  ]);
});

test("manage preferences button keeps white text in all visible states", async () => {
  const source = await readFile("app/subscribe/confirm/page.tsx", "utf8");
  assert.match(source, /!text-white/);
  assert.match(source, /hover:!text-white/);
  assert.match(source, /focus-visible:!text-white/);
  assert.match(source, /active:!text-white/);
  assert.match(source, /visited:!text-white/);
});

test("confirmed subscriber management-link request creates a token before delivery", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  assert.match(source, /subscriber\?\.status === "confirmed"/);
  assert.match(source, /const access = await createAccessToken\(subscriber\.id, "management"\)/);
  assert.match(source, /await deliverPreferenceManagementEmail\(/);
});

test("management token creation stores only hashed tokens", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  assert.match(source, /token_hash: tokenHash\(token\)/);
  assert.doesNotMatch(source, /token:\s*token/);
});

test("management delivery records Sender acceptance and failure paths", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  assert.match(source, /status: "sent"/);
  assert.match(source, /provider_message_id: result\.providerMessageId/);
  assert.match(source, /status: "failed"/);
  assert.match(source, /error: result\.reason/);
});

test("unknown preference addresses receive a neutral submitted response", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  assert.match(source, /if \(subscriber\?\.status === "confirmed" \|\| subscriber\?\.status === "unsubscribed"\)/);
  assert.match(source, /return \{ submitted: true \}/);
});

test("preference request rate limiting stays outside subscriber lookup", async () => {
  const source = await readFile("app/email-preferences/actions.ts", "utf8");
  assert.match(source, /checkRateLimit\("email-preferences", 5, 15 \* 60 \* 1000\)/);
  assert.match(source, /if \(!limit\.allowed\) return \{ error: "Too many requests/);
});

test("older unused management tokens are invalidated before a new token is created", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  assert.match(source, /\.eq\("token_type", tokenType\)/);
  assert.match(source, /\.is\("used_at", null\)/);
  assert.match(source, /\.insert\(\{\s*subscriber_id: subscriberId,\s*token_type: tokenType,/s);
});
