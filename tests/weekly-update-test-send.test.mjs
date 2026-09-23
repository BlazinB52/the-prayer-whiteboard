import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const ROUTE = "app/api/admin/weekly-update/test-send/route.ts";

// Absence assertions must look at code only; a comment naming a table or helper
// is documentation, not a call.
function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^[ \t]*\/\/.*$/gm, "");
}

async function readRoute() {
  const source = await readFile(ROUTE, "utf8");
  return { source, code: stripComments(source) };
}

test("the test-send route rejects non-admins before doing any work", async () => {
  const { code } = await readRoute();

  assert.match(code, /getAuthorizedUser\(\)/);
  assert.match(code, /status: 401/);
  // requireAdmin redirects, which would return a 307 instead of a JSON 401.
  assert.equal(code.includes("requireAdmin"), false);
  assert.ok(code.indexOf("getAuthorizedUser()") < code.indexOf("request.json()"));
  assert.ok(code.indexOf("getAuthorizedUser()") < code.indexOf("sendSenderTransactionalEmail({"));
});

test("delivery targets only the supplied test address", async () => {
  const { code } = await readRoute();
  const sendCall = code.match(/sendSenderTransactionalEmail\(\{[\s\S]*?\}\)/)?.[0] ?? "";

  assert.match(sendCall, /toEmail: testEmail/);
  assert.equal(/toEmail:\s*(recipient|subscriber)/.test(sendCall), false);
  // Exactly one send, and nothing iterating recipients around it.
  assert.equal(code.split("sendSenderTransactionalEmail({").length - 1, 1, "exactly one send call");
  assert.equal(/for\s*\(/.test(code), false, "a test send must not iterate recipients");
  assert.equal(/\.map\(|forEach\(/.test(code), false, "a test send must not fan out");
});

test("the production broadcast ledger is never touched", async () => {
  const { code } = await readRoute();

  assert.equal(code.includes("email_broadcast_events"), false);
  assert.equal(code.includes("broadcastWeeklyUpdate"), false);
  assert.equal(code.includes("claimBroadcast"), false);
});

test("subscriber lists are never queried", async () => {
  const { code } = await readRoute();

  assert.equal(code.includes("loadConfirmedRecipients"), false);
  assert.equal(code.includes("email_subscription_preferences"), false);
  assert.equal(code.includes("email_subscribers"), false);
});

test("the weekly update row is read but never modified", async () => {
  const { code } = await readRoute();

  assert.match(code, /\.from\("weekly_updates"\)\s*\.select\(/);
  assert.equal(code.includes("is_current"), false);
  assert.equal(/status:\s*"published"/.test(code), false);
  // The only Supabase write verbs must be absent entirely.
  assert.equal(/\.(update|insert|upsert|delete)\(/.test(code), false);
});

test("input is validated before the update is read or anything is sent", async () => {
  const { code } = await readRoute();

  assert.match(code, /UUID_PATTERN\.test\(weeklyUpdateId\)/);
  assert.match(code, /EMAIL_PATTERN\.test\(testEmail\)/);
  assert.ok(code.indexOf("EMAIL_PATTERN.test(testEmail)") < code.indexOf('.from("weekly_updates")'));
  assert.ok(code.indexOf("EMAIL_PATTERN.test(testEmail)") < code.indexOf("sendSenderTransactionalEmail({"));
  assert.match(code, /checkRateLimit\("weekly-update-test-send"/);
});

test("the preview is built by the production email builder and marked as a test", async () => {
  const { code } = await readRoute();

  assert.match(code, /buildWeeklyUpdateEmail\(\{/);
  assert.match(code, /subject: `\[TEST\] \$\{email\.subject\}`/);
  assert.match(code, /convertedContent: update\.converted_content/);
  assert.match(code, /bodyMarkdown: update\.body_markdown/);
});

test("the comment-stripping helper does not hide real code", () => {
  const sample = `// email_broadcast_events in a comment\nconst a = 1; /* email_subscribers */\nconst b = "email_broadcast_events";`;
  const code = stripComments(sample);

  assert.equal(code.includes("const a = 1;"), true);
  assert.equal(code.includes('const b = "email_broadcast_events";'), true, "string literals must survive");
  assert.equal(code.split("email_broadcast_events").length - 1, 1, "only the comment occurrence is removed");
});
