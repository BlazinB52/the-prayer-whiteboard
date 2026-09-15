import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { sendSenderTransactionalEmail } from "../lib/sender-transactional-core.ts";
import { buildConfirmationEmail, buildPreferenceManagementEmail } from "../lib/subscription-email-content.ts";

const baseInput = {
  apiKey: "test-api-key",
  fromEmail: "updates@theprayerwhiteboard.com",
  fromName: "The Prayer Whiteboard",
  toEmail: "reader@example.test",
  toName: "Reader",
  subject: "Test email",
  html: "<p>Hello</p>",
  text: "Hello",
};

test("successful Sender delivery captures the response identifier", async () => {
  const result = await sendSenderTransactionalEmail({
    ...baseInput,
    fetcher: async () => new Response(JSON.stringify({ success: true, emailId: "message-123" }), { status: 200 }),
  });
  assert.deepEqual(result, { ok: true, providerMessageId: "message-123" });
});

test("Sender API rejection is reported as failed without throwing", async () => {
  const result = await sendSenderTransactionalEmail({
    ...baseInput,
    fetcher: async () => new Response(JSON.stringify({ message: "Rejected" }), { status: 401 }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "rejected");
});

test("network failure is reported as failed without throwing", async () => {
  const result = await sendSenderTransactionalEmail({
    ...baseInput,
    fetcher: async () => { throw new Error("offline"); },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "network");
});

test("request timeout is reported distinctly", async () => {
  const result = await sendSenderTransactionalEmail({
    ...baseInput,
    timeoutMs: 1,
    fetcher: (_url, init) => new Promise((resolve, reject) => {
      init?.signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
      setTimeout(() => resolve(new Response("{}", { status: 200 })), 25);
    }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "timeout");
});

test("confirmation and preference emails include only the intended secure link", () => {
  const confirmation = buildConfirmationEmail({
    firstName: "Ada",
    categories: ["weekly_updates", "devotionals"],
    confirmationUrl: "https://theprayerwhiteboard.com/subscribe/confirm?token=raw-confirmation-token",
    expiresAt: "2026-09-18T12:00:00.000Z",
  });
  const preference = buildPreferenceManagementEmail({
    firstName: "Ada",
    managementUrl: "https://theprayerwhiteboard.com/email-preferences/manage?token=raw-management-token",
    expiresAt: "2026-09-15T12:30:00.000Z",
  });
  assert.match(confirmation.html, /Confirm My Subscription/);
  assert.match(confirmation.text, /Weekly Updates/);
  assert.match(preference.html, /Manage Email Preferences/);
  assert.match(preference.text, /single-use/);
});

test("Sender API keys are not referenced by client components", async () => {
  const files = [
    "app/subscribe/subscribe-form.tsx",
    "app/email-preferences/preference-request-form.tsx",
    "app/email-preferences/manage/preference-management-form.tsx",
    "app/devotionals/start/subscription-form.tsx",
  ];
  const contents = await Promise.all(files.map((file) => readFile(file, "utf8")));
  assert.equal(contents.some((content) => content.includes("SENDER_API_KEY") || content.includes("SENDER_API_TOKEN")), false);
});

test("raw tokens are not stored in delivery metadata fields", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  assert.equal(source.includes("confirmationUrl: `${siteUrl()}"), false);
  assert.equal(source.includes("managementUrl: `${siteUrl()}"), false);
  assert.equal(source.includes("deliveryStatus: \"sender_not_configured\""), false);
});

test("existing Sender devotional embedded form remains unchanged", async () => {
  const source = await readFile("app/devotionals/start/subscription-form.tsx", "utf8");
  assert.match(source, /SENDER_FORM_ID = "dyPEr6"/);
  assert.match(source, /senderForms\?\.render\?\.\(SENDER_FORM_ID\)/);
});
