import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { teachingEmailSendNotice } from "../lib/teaching-email-send-notice.ts";

const base = { status: "published", language: "en", ledgerStatus: null, deliveredCount: 0, ledgerRecipientCount: null, recipientCount: 17 };

test("a published English teaching that was never emailed offers a send with the exact subscriber count", () => {
  const notice = teachingEmailSendNotice(base);
  assert.equal(notice.kind, "ready");
  assert.equal(notice.canSend, true);
  assert.equal(notice.buttonLabel, "Send email to 17 subscribers");
  assert.match(notice.text, /Not sent yet\. Sending emails 17 subscribers who chose New Teachings, within moments\./);
  assert.match(notice.text, /cannot be unsent/);
  assert.match(notice.text, /editing the teaching later does not send it again/);
  assert.match(notice.confirm, /cannot be unsent/);
  assert.equal(teachingEmailSendNotice({ ...base, recipientCount: 1 }).buttonLabel, "Send email to 1 subscriber");
  assert.equal(teachingEmailSendNotice({ ...base, recipientCount: null }).buttonLabel, "Send email to subscribers");
});

test("nothing can be sent for a draft, an Español teaching, an empty list, or a finished send", () => {
  assert.equal(teachingEmailSendNotice({ ...base, status: "draft" }).canSend, false);
  assert.match(teachingEmailSendNotice({ ...base, status: "draft" }).text, /Publish this teaching first/);
  assert.equal(teachingEmailSendNotice({ ...base, language: "es" }).canSend, false);
  assert.equal(teachingEmailSendNotice({ ...base, recipientCount: 0 }).canSend, false);
  const sent = teachingEmailSendNotice({ ...base, ledgerStatus: "sent", deliveredCount: 40 });
  assert.equal(sent.kind, "sent");
  assert.equal(sent.canSend, false);
  assert.match(sent.text, /sent to 40 subscribers/);
});

test("a send that was cut short can be resumed, and says nobody is emailed twice", () => {
  const resume = teachingEmailSendNotice({ ...base, ledgerStatus: "sending", deliveredCount: 12, ledgerRecipientCount: 40 });
  assert.equal(resume.kind, "resume");
  assert.equal(resume.canSend, true);
  assert.equal(resume.buttonLabel, "Resume sending");
  assert.match(resume.text, /12 of 40 subscribers have it/);
  assert.match(resume.confirm, /Nobody who already has it is emailed again/);
});

test("the send route is Administrator-only, rate limited, and uses the idempotent broadcast", async () => {
  const route = await readFile("app/api/admin/teaching/send-email/route.ts", "utf8");
  assert.match(route, /getAuthorizedUser\(\)/);
  assert.match(route, /Unauthorized/);
  assert.match(route, /checkRateLimit\("teaching-send-email"/);
  assert.match(route, /broadcastTeaching\(teachingId\)/);
  assert.match(route, /resumeTeachingBroadcast\(teachingId\)/);
  assert.match(route, /already_complete/);
  assert.match(route, /scheduleContinuation\("\/api\/webhooks\/teaching\/resume"/);
});

test("publishing no longer starts a send: the webhook does nothing and the database trigger makes no web call", async () => {
  const webhook = await readFile("app/api/webhooks/teaching/route.ts", "utf8");
  assert.match(webhook, /manual_send_only/);
  assert.doesNotMatch(webhook, /broadcastTeaching|scheduleContinuation/);
  const sql = await readFile("supabase/migrations/20261007060000_teaching_email_manual_send.sql", "utf8");
  assert.match(sql, /create or replace function public\.notify_teaching_published\(\)/);
  assert.doesNotMatch(sql, /net\.http_post/);
  const publish = await readFile("app/admin/teachings/actions.ts", "utf8");
  const body = publish.match(/export async function publishAndFeatureTeaching[\s\S]*?\n}\n/)?.[0] ?? "";
  assert.doesNotMatch(body, /broadcast|send-email|teaching-broadcast/i);
});

test("the edit page shows an Email subscribers box beside Publish, never for an Español teaching", async () => {
  const page = await readFile("app/admin/teachings/[id]/edit/page.tsx", "utf8");
  assert.match(page, /id="email-subscribers"/);
  assert.match(page, /teaching\.language !== "es" \? \(\s*<section id="email-subscribers"/);
  assert.match(page, /Publishing and featuring this teaching never sends any email\./);
  assert.match(page, /SendTeachingEmailButton teachingId=\{id\}/);
  const box = await readFile("app/admin/teachings/send-email-box.tsx", "utf8");
  assert.match(box, /window\.confirm\(confirmMessage\)/);
  assert.match(box, /\/api\/admin\/teaching\/send-email/);
});
