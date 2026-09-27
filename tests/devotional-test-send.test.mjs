import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROUTE = "app/api/admin/devotional/test-send/route.ts";

// Absence assertions must look at code only; a comment naming a table or helper
// is documentation, not a call.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

async function readRoute() {
  const source = await readFile(ROUTE, "utf8");
  return { source, code: stripComments(source) };
}

test("the devotional test-send route rejects non-admins before doing any work", async () => {
  const { code } = await readRoute();

  assert.match(code, /getAuthorizedUser\(\)/);
  assert.match(code, /status: 401/);
  assert.equal(code.includes("requireAdmin"), false);
  assert.ok(code.indexOf("getAuthorizedUser()") < code.indexOf("request.json()"));
  assert.ok(code.indexOf("getAuthorizedUser()") < code.indexOf("sendSenderTransactionalEmail({"));
});

test("devotional test-send delivery targets only the supplied test address", async () => {
  const { code } = await readRoute();
  const sendCall = code.match(/sendSenderTransactionalEmail\(\{[\s\S]*?\}\)/)?.[0] ?? "";

  assert.match(sendCall, /toEmail: testEmail/);
  assert.equal(/toEmail:\s*(recipient|subscriber)/.test(sendCall), false);
  assert.equal(code.split("sendSenderTransactionalEmail({").length - 1, 1, "exactly one send call");
  assert.equal(/for\s*\(/.test(code), false, "a test send must not iterate recipients");
  assert.equal(/\.map\(|forEach\(/.test(code), false, "a test send must not fan out");
});

test("the devotional daily send ledger is never touched", async () => {
  const { code } = await readRoute();

  assert.equal(code.includes("email_devotional_broadcast_ledger"), false);
  assert.equal(code.includes("processDevotionalQueue"), false);
  assert.equal(code.includes("claimDay"), false);
});

test("devotional test-send never queries subscriber lists", async () => {
  const { code } = await readRoute();

  assert.equal(code.includes("loadConfirmedRecipients"), false);
  assert.equal(code.includes("email_subscription_preferences"), false);
  assert.equal(code.includes("email_subscribers"), false);
});

test("the devotional and day rows are read but never modified", async () => {
  const { code } = await readRoute();

  assert.match(code, /\.from\("teaching_devotionals"\)\s*\.select\(/);
  assert.match(code, /\.from\("teaching_devotional_days"\)\s*\.select\(/);
  assert.equal(/\.(update|insert|upsert|delete)\(/.test(code), false);
});

test("devotional test-send input is validated before anything is read or sent", async () => {
  const { code } = await readRoute();

  assert.match(code, /UUID_PATTERN\.test\(devotionalId\)/);
  assert.match(code, /dayNumber < 1 \|\| dayNumber > 7/);
  assert.match(code, /EMAIL_PATTERN\.test\(testEmail\)/);
  assert.ok(code.indexOf("EMAIL_PATTERN.test(testEmail)") < code.indexOf('.from("teaching_devotionals")'));
  assert.ok(code.indexOf("EMAIL_PATTERN.test(testEmail)") < code.indexOf("sendSenderTransactionalEmail({"));
  assert.match(code, /checkRateLimit\("devotional-test-send"/);
});

test("the devotional preview is built by the production email builder, includes the disclaimer, and is marked as a test", async () => {
  const { code } = await readRoute();

  assert.match(code, /buildDevotionalDayEmail\(\{/);
  assert.match(code, /subject: `\[TEST\] \$\{email\.subject\}`/);
  assert.match(code, /getEmailCopyrightDisclaimer\(base\)/);
  assert.match(code, /copyrightDisclaimer,/);
});

test("both devotional admin pages expose the devotional test send form", async () => {
  const [teachingOwnedPage, standalonePage, form] = await Promise.all([
    readFile("app/admin/teachings/[id]/devotional/page.tsx", "utf8"),
    readFile("app/admin/devotionals/[id]/page.tsx", "utf8"),
    readFile("app/admin/teachings/[id]/devotional/devotional-test-send-form.tsx", "utf8"),
  ]);

  assert.match(teachingOwnedPage, /import \{ DevotionalTestSendForm \} from "\.\/devotional-test-send-form";/);
  assert.match(teachingOwnedPage, /<DevotionalTestSendForm devotionalId=\{devotional\.id\} \/>/);
  assert.match(standalonePage, /import \{ DevotionalTestSendForm \} from "@\/app\/admin\/teachings\/\[id\]\/devotional\/devotional-test-send-form";/);
  assert.match(standalonePage, /<DevotionalTestSendForm devotionalId=\{devotional\.id\} \/>/);

  assert.match(form, /^"use client";/);
  assert.match(form, /"\/api\/admin\/devotional\/test-send"/);
  assert.match(form, /method: "POST"/);
  for (const forbidden of ["publishDevotional", "unpublishDevotional", "email_devotional_broadcast_ledger"]) {
    assert.equal(form.includes(forbidden), false, `${forbidden} must not appear in the test send form`);
  }
});
