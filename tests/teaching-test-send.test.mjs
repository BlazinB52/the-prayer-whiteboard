import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROUTE = "app/api/admin/teaching/test-send/route.ts";

// Absence assertions must look at code only; a comment naming a table or helper
// is documentation, not a call.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

async function readRoute() {
  const source = await readFile(ROUTE, "utf8");
  return { source, code: stripComments(source) };
}

test("the teaching test-send route rejects non-admins before doing any work", async () => {
  const { code } = await readRoute();

  assert.match(code, /getAuthorizedUser\(\)/);
  assert.match(code, /status: 401/);
  assert.equal(code.includes("requireAdmin"), false);
  assert.ok(code.indexOf("getAuthorizedUser()") < code.indexOf("request.json()"));
  assert.ok(code.indexOf("getAuthorizedUser()") < code.indexOf("sendSenderTransactionalEmail({"));
});

test("teaching test-send delivery targets only the supplied test address", async () => {
  const { code } = await readRoute();
  const sendCall = code.match(/sendSenderTransactionalEmail\(\{[\s\S]*?\}\)/)?.[0] ?? "";

  assert.match(sendCall, /toEmail: testEmail/);
  assert.equal(/toEmail:\s*(recipient|subscriber)/.test(sendCall), false);
  assert.equal(code.split("sendSenderTransactionalEmail({").length - 1, 1, "exactly one send call");
  assert.equal(/for\s*\(/.test(code), false, "a test send must not iterate recipients");
  assert.equal(/\.map\(|forEach\(/.test(code), false, "a test send must not fan out");
});

test("the teaching production broadcast ledger is never touched", async () => {
  const { code } = await readRoute();

  assert.equal(code.includes("email_teaching_broadcast_events"), false);
  assert.equal(code.includes("broadcastTeaching"), false);
  assert.equal(code.includes("claimBroadcast"), false);
});

test("teaching test-send never queries subscriber lists", async () => {
  const { code } = await readRoute();

  assert.equal(code.includes("loadConfirmedRecipients"), false);
  assert.equal(code.includes("email_subscription_preferences"), false);
  assert.equal(code.includes("email_subscribers"), false);
});

test("the teaching row is read but never modified", async () => {
  const { code } = await readRoute();

  assert.match(code, /\.from\("teachings"\)\s*\.select\(/);
  assert.equal(/\.(update|insert|upsert|delete)\(/.test(code), false);
});

test("teaching test-send input is validated before the teaching is read or anything is sent", async () => {
  const { code } = await readRoute();

  assert.match(code, /UUID_PATTERN\.test\(teachingId\)/);
  assert.match(code, /EMAIL_PATTERN\.test\(testEmail\)/);
  assert.ok(code.indexOf("EMAIL_PATTERN.test(testEmail)") < code.indexOf('.from("teachings")'));
  assert.ok(code.indexOf("EMAIL_PATTERN.test(testEmail)") < code.indexOf("sendSenderTransactionalEmail({"));
  assert.match(code, /checkRateLimit\("teaching-test-send"/);
});

test("the teaching preview is built by the production email builder, includes the disclaimer, and is marked as a test", async () => {
  const { code } = await readRoute();

  assert.match(code, /buildTeachingEmail\(\{/);
  assert.match(code, /subject: `\[TEST\] \$\{email\.subject\}`/);
  assert.match(code, /getEmailCopyrightDisclaimer\(base\)/);
  assert.match(code, /copyrightDisclaimer,/);
});

test("the admin teachings list exposes the teaching test send form", async () => {
  const [page, form] = await Promise.all([
    readFile("app/admin/teachings/page.tsx", "utf8"),
    readFile("app/admin/teachings/test-send-form.tsx", "utf8"),
  ]);

  assert.match(page, /import \{ TeachingTestSendForm \} from "\.\/test-send-form";/);
  assert.match(page, /<TeachingTestSendForm teachingId=\{teaching\.id\} \/>/);

  assert.match(form, /^"use client";/);
  assert.match(form, /"\/api\/admin\/teaching\/test-send"/);
  assert.match(form, /method: "POST"/);
  for (const forbidden of ["publishTeaching", "unpublishTeaching", "email_teaching_broadcast_events"]) {
    assert.equal(form.includes(forbidden), false, `${forbidden} must not appear in the test send form`);
  }
});
