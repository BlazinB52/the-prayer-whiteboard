import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { publishEmailNotice } from "../lib/publish-email-notice.ts";

test("publishing says it does not email anyone, and points to the separate send", () => {
  const en = publishEmailNotice({ language: "en" });
  assert.equal(en.kind, "none");
  assert.match(en.text, /Publishing does not email subscribers/);
  assert.match(en.text, /Email subscribers box/);
  assert.match(publishEmailNotice({ language: "es" }).text, /No email is sent/);
});

test("the Publish section and its confirmation make no promise to email anyone", async () => {
  const page = await readFile("app/admin/teachings/[id]/edit/page.tsx", "utf8");
  assert.match(page, /publishEmailNotice\(\{ language:/);
  assert.doesNotMatch(page, /getPublishEmailInfo/);
  assert.doesNotMatch(page, /Publishing emails/);
  const button = await readFile("app/admin/teachings/publish-feature-button.tsx", "utf8");
  assert.match(button, /function withEmailNotice\(message: string, notice: string \| undefined\)/);
  assert.match(button, /withEmailNotice\(isDeepDive \? deepDiveConfirmationMessage : confirmationMessage, emailNotice\)/);
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
