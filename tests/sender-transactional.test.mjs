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

test("Sender API rejection diagnostics are sanitized", async () => {
  const result = await sendSenderTransactionalEmail({
    ...baseInput,
    apiKey: "secret-sender-api-key",
    toEmail: "reader@example.test",
    html: "<a href=\"https://theprayerwhiteboard.com/subscribe/confirm?token=secret-token\">Confirm</a>",
    text: "Confirm at https://theprayerwhiteboard.com/subscribe/confirm?token=secret-token",
    fetcher: async () => new Response(JSON.stringify({
      code: "sender_rejected",
      message: "Rejected reader@example.test with secret-sender-api-key at https://theprayerwhiteboard.com/subscribe/confirm?token=secret-token",
    }), { status: 422 }),
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.reason, "rejected");
    assert.equal(result.rejection?.httpStatus, 422);
    assert.equal(result.rejection?.errorCode, "sender_rejected");
    assert.match(result.rejection?.errorMessage ?? "", /\[redacted\]|\[redacted-email\]/);
  }
  const serialized = JSON.stringify(result);
  assert.equal(serialized.includes("secret-sender-api-key"), false);
  assert.equal(serialized.includes("reader@example.test"), false);
  assert.equal(serialized.includes("secret-token"), false);
  assert.equal(serialized.includes("theprayerwhiteboard.com/subscribe/confirm"), false);
});

test("Sender API key is normalized before building the Authorization header", async () => {
  let authorizationHeader = "";
  const result = await sendSenderTransactionalEmail({
    ...baseInput,
    apiKey: "\uFEFF test-api-key \uFEFF",
    fetcher: async (_url, init) => {
      authorizationHeader = new Headers(init?.headers).get("Authorization") ?? "";
      return new Response(JSON.stringify({ emailId: "message-123" }), { status: 200 });
    },
  });
  assert.equal(result.ok, true);
  assert.equal(authorizationHeader, "Bearer test-api-key");
});

test("Sender From address and name are normalized before building the payload", async () => {
  let body = {};
  const result = await sendSenderTransactionalEmail({
    ...baseInput,
    fromEmail: "\uFEFF Updates@ThePrayerWhiteboard.com \uFEFF",
    fromName: "\uFEFF The Prayer Whiteboard \uFEFF",
    fetcher: async (_url, init) => {
      body = JSON.parse(String(init?.body));
      return new Response(JSON.stringify({ emailId: "message-123" }), { status: 200 });
    },
  });
  assert.equal(result.ok, true);
  assert.deepEqual(body.from, {
    email: "updates@theprayerwhiteboard.com",
    name: "The Prayer Whiteboard",
  });
});

test("invalid Sender From address is rejected before the request is sent", async () => {
  let requestWasSent = false;
  const result = await sendSenderTransactionalEmail({
    ...baseInput,
    fromEmail: "\uFEFF not-an-email \uFEFF",
    fetcher: async () => {
      requestWasSent = true;
      return new Response("{}", { status: 200 });
    },
  });
  assert.deepEqual(result, { ok: false, reason: "configuration", message: "Sender transactional email is not configured." });
  assert.equal(requestWasSent, false);
});

test("unsafe Sender API keys are rejected before the request is sent", async () => {
  let requestWasSent = false;
  const result = await sendSenderTransactionalEmail({
    ...baseInput,
    apiKey: "test-api-key\u0100",
    fetcher: async () => {
      requestWasSent = true;
      return new Response("{}", { status: 200 });
    },
  });
  assert.deepEqual(result, { ok: false, reason: "configuration", message: "Sender transactional email is not configured." });
  assert.equal(requestWasSent, false);
});

test("network failure is reported as failed without throwing", async () => {
  const result = await sendSenderTransactionalEmail({
    ...baseInput,
    fetcher: async () => { throw new Error("offline"); },
  });
  assert.equal(result.ok, false);
  if (!result.ok) assert.equal(result.reason, "network");
});

test("network diagnostics exclude request secrets and recipient information", async () => {
  const result = await sendSenderTransactionalEmail({
    ...baseInput,
    apiKey: "secret-sender-api-key",
    toEmail: "reader@example.test",
    html: "<a href=\"https://theprayerwhiteboard.com/subscribe/confirm?token=secret-token\">Confirm</a>",
    text: "Confirm at https://theprayerwhiteboard.com/subscribe/confirm?token=secret-token",
    fetcher: async () => {
      const error = new Error("Failed for reader@example.test using secret-sender-api-key at https://theprayerwhiteboard.com/subscribe/confirm?token=secret-token", {
        cause: { code: "UND_ERR_CONNECT_TIMEOUT" },
      });
      error.name = "TypeError";
      throw error;
    },
  });
  assert.equal(result.ok, false);
  assert.equal(result.message, "Sender API request failed.");
  assert.equal(JSON.stringify(result), JSON.stringify(result).includes("secret-sender-api-key") ? "contains secret" : JSON.stringify(result));
  assert.equal(JSON.stringify(result).includes("reader@example.test"), false);
  assert.equal(JSON.stringify(result).includes("secret-token"), false);
  assert.equal(JSON.stringify(result).includes("theprayerwhiteboard.com/subscribe/confirm"), false);
  if (!result.ok) {
    assert.equal(result.diagnostic?.errorName, "TypeError");
    assert.equal(result.diagnostic?.causeCode, "UND_ERR_CONNECT_TIMEOUT");
  }
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

test("new access tokens replace older unused access tokens for the same subscriber", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  assert.match(source, /\.from\("email_access_tokens"\)\s*\.update\(\{ used_at: new Date\(\)\.toISOString\(\) \}\)/);
  assert.match(source, /\.eq\("subscriber_id", subscriberId\)/);
  assert.match(source, /\.eq\("token_type", tokenType\)/);
  assert.match(source, /\.is\("used_at", null\)/);
});

test("a Sender suppression rejection parks the subscriber instead of retrying delivery", async () => {
  const source = await readFile("lib/email-subscriptions.ts", "utf8");
  assert.match(source, /suppression list\/i\.test/);
  assert.match(source, /status: "suppressed"/);
  assert.match(source, /suppressed_at: new Date\(\)\.toISOString\(\)/);
  assert.match(source, /if \(isSuppressionRejection\(result\)\) await markSubscriberSuppressed\(subscriberId\)/);
});

test("legacy Sender embedded forms and the universal script are fully removed", async () => {
  const layout = await readFile("app/layout.tsx", "utf8");
  assert.equal(layout.includes("SenderUniversalScript"), false);

  for (const path of [
    "app/sender-universal-script.tsx",
    "app/devotionals/subscription-page-view.tsx",
    "app/devotionals/start/subscription-form.tsx",
    "lib/devotional-sender-forms.ts",
  ]) {
    await assert.rejects(readFile(path, "utf8"), /ENOENT/, `${path} should no longer exist`);
  }
});

test("public devotional start routes redirect into the unified signup flow", async () => {
  const [slugRoute, genericRoute] = await Promise.all([
    readFile("app/devotionals/[slug]/start/page.tsx", "utf8"),
    readFile("app/devotionals/start/page.tsx", "utf8"),
  ]);

  assert.match(slugRoute, /getPublishedDevotionalSeriesBySlug\(slug\)/);
  assert.match(slugRoute, /redirect\(getDevotionalStartPath\(series\)\)/);
  assert.match(genericRoute, /getPublishedDevotionalSeries\(\)/);
  assert.match(genericRoute, /redirect\(getDevotionalStartPath\(series\)\)/);
});
