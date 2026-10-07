import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { publishEmailNotice } from "../lib/publish-email-notice.ts";

test("the publish notice says exactly how many subscribers get emailed, and that it cannot be unsent", () => {
  const many = publishEmailNotice({ language: "en", alreadySent: false, recipientCount: 42 });
  assert.equal(many.kind, "email");
  assert.match(many.text, /Publishing emails 42 subscribers who chose New Teachings, within moments\./);
  assert.match(many.text, /An email cannot be unsent/);
  assert.match(many.text, /editing the teaching later does not send it again/);
  assert.match(many.text, /leave the teaching as a draft/);

  const one = publishEmailNotice({ language: "en", alreadySent: false, recipientCount: 1 });
  assert.match(one.text, /emails 1 subscriber who chose/);
  assert.doesNotMatch(one.text, /1 subscribers/);

  const unknown = publishEmailNotice({ language: "en", alreadySent: false, recipientCount: null });
  assert.equal(unknown.kind, "email");
  assert.match(unknown.text, /every subscriber who chose New Teachings/);
});

test("the publish notice is quiet only when nothing will really be sent", () => {
  assert.equal(publishEmailNotice({ language: "es", alreadySent: false, recipientCount: 99 }).kind, "none");
  assert.match(publishEmailNotice({ language: "es", alreadySent: false, recipientCount: 99 }).text, /No email is sent/);
  const resent = publishEmailNotice({ language: "en", alreadySent: true, recipientCount: 99 });
  assert.equal(resent.kind, "none");
  assert.match(resent.text, /already sent/);
  const nobody = publishEmailNotice({ language: "en", alreadySent: false, recipientCount: 0 });
  assert.equal(nobody.kind, "none");
  assert.match(nobody.text, /No subscribers are signed up/);
});

test("the number shown is the number the broadcast would email", async () => {
  const info = await readFile("lib/publish-email-info.ts", "utf8");
  const broadcast = await readFile("lib/teaching-broadcast.ts", "utf8");
  assert.match(info, /loadConfirmedRecipients\("teachings", "en"\)/);
  assert.match(broadcast, /loadConfirmedRecipients\("teachings"\)/, "the broadcast reads the same category, English by default");
  assert.match(info, /email_teaching_broadcast_events/, "an already-sent teaching is recognised from the broadcast ledger");
  assert.match(info, /if \(language === "es"\)/);
});

test("the Publish section shows the email notice and the confirmation repeats it", async () => {
  const page = await readFile("app/admin/teachings/[id]/edit/page.tsx", "utf8");
  assert.match(page, /publishEmailNotice\(await getPublishEmailInfo\(supabase, id,/);
  assert.match(page, /emailNotice=\{publishNotice\.text\}/);
  assert.match(page, /publishNotice\.kind === "email" \? "Email: " : ""/);
  const button = await readFile("app/admin/teachings/publish-feature-button.tsx", "utf8");
  assert.match(button, /function withEmailNotice\(message: string, notice: string \| undefined\)/);
  assert.match(button, /withEmailNotice\(isDeepDive \? deepDiveConfirmationMessage : confirmationMessage, emailNotice\)/);
  // The Español confirmations already say no email is sent, so they are left as they were.
  assert.match(button, /No email is sent to subscribers\./);
  assert.doesNotMatch(button, /withEmailNotice\(isDeepDive \? espanol/);
});

test("the Ready marker is Administrator-only, drafts-only, and only a note", async () => {
  const actions = await readFile("app/admin/teachings/actions.ts", "utf8");
  const ready = actions.match(/export async function setTeachingReady[\s\S]*?\n}\n/)?.[0] ?? "";
  assert.notEqual(ready, "");
  assert.match(ready, /await requireAdmin\(\)/);
  assert.match(ready, /\.update\(\{ ready_to_publish_at: ready \? new Date\(\)\.toISOString\(\) : null \}\)/);
  assert.match(ready, /\.eq\("status", "draft"\)/);
  assert.doesNotMatch(ready, /status: "published"|publish_and_feature_teaching|broadcast|email/i, "marking ready never publishes or emails");
  // Publishing is unchanged by the marker.
  const publish = actions.match(/export async function publishAndFeatureTeaching[\s\S]*?\n}\n/)?.[0] ?? "";
  assert.doesNotMatch(publish, /ready_to_publish_at/);
});

test("the edit page explains the marker and the list shows it", async () => {
  const page = await readFile("app/admin/teachings/[id]/edit/page.tsx", "utf8");
  assert.match(page, /It is only a note: it does not publish the teaching and does not send any email\./);
  assert.match(page, /Mark as ready to publish/);
  assert.match(page, /Remove ready mark/);
  assert.match(page, /teaching\.status === "draft" \? \(\n\s+<section[^>]*>\n\s+<p[^>]*>Ready to publish<\/p>/);
  const list = await readFile("app/admin/teachings/page.tsx", "utf8");
  assert.match(list, /teaching\.status === "draft" && teaching\.ready_to_publish_at/);
  assert.match(list, /Ready to publish/);
});

test("the marker migration only adds a note column, clears it when a teaching leaves draft, and grants nothing", async () => {
  const sql = await readFile("supabase/migrations/20261006050000_teaching_ready_to_publish.sql", "utf8");
  assert.match(sql, /add column if not exists ready_to_publish_at timestamptz/);
  assert.match(sql, /before update of status on public\.teachings/);
  assert.match(sql, /when \(new\.status <> 'draft' and new\.ready_to_publish_at is not null\)/);
  assert.match(sql, /check \(ready_to_publish_at is null or status = 'draft'\)/);
  assert.doesNotMatch(sql, /\bgrant\b/i, "no new access is granted");
  assert.doesNotMatch(sql, /net\.http_post|webhook/i, "the marker never touches the email webhook");
});
