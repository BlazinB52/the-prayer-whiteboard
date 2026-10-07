import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { weeklyUpdatePublishNotice } from "../lib/weekly-update-publish-notice.ts";

test("the notice states the subscriber count and that an email cannot be unsent", () => {
  const notice = weeklyUpdatePublishNotice({ alreadySent: false, recipientCount: 3, replacesTitle: null });
  assert.equal(notice.kind, "email");
  assert.match(notice.text, /3 subscribers who chose Weekly Updates/);
  assert.match(notice.confirm, /email 3 subscribers/);
  assert.match(notice.confirm, /cannot be unsent/);
});

test("singular, unknown and zero recipient counts read correctly", () => {
  assert.match(weeklyUpdatePublishNotice({ alreadySent: false, recipientCount: 1, replacesTitle: null }).text, /1 subscriber who/);
  assert.match(weeklyUpdatePublishNotice({ alreadySent: false, recipientCount: null, replacesTitle: null }).text, /every subscriber who chose Weekly Updates/);
  const none = weeklyUpdatePublishNotice({ alreadySent: false, recipientCount: 0, replacesTitle: null });
  assert.equal(none.kind, "none");
  assert.match(none.text, /no email will be sent/);
});

test("an update that was already emailed says publishing again sends nothing", () => {
  const notice = weeklyUpdatePublishNotice({ alreadySent: true, recipientCount: 40, replacesTitle: null });
  assert.equal(notice.kind, "none");
  assert.match(notice.text, /will not email anyone/);
});

test("the notice names the update that moves to the archive", () => {
  const notice = weeklyUpdatePublishNotice({ alreadySent: false, recipientCount: 2, replacesTitle: "Last Week" });
  assert.match(notice.text, /replaces "Last Week".*archive/);
  assert.match(notice.confirm, /Last Week/);
});

test("the migration only allows the ready mark on drafts and clears it on any status change", () => {
  const sql = readFileSync(new URL("../supabase/migrations/20261006060000_weekly_update_ready_and_report.sql", import.meta.url), "utf8");
  assert.match(sql, /ready_to_publish_at is null or status = 'draft'/);
  assert.match(sql, /before update of status on public\.weekly_updates/);
  assert.match(sql, /conversion_report jsonb/);
});

test("the Publish button asks for confirmation using the notice, and the page wires the ready mark", () => {
  const page = readFileSync(new URL("../app/admin/weekly-updates/page.tsx", import.meta.url), "utf8");
  const buttons = readFileSync(new URL("../app/admin/weekly-updates/status-buttons.tsx", import.meta.url), "utf8");
  assert.match(page, /confirmMessage=\{publishNotice\.confirm\}/);
  assert.match(buttons, /window\.confirm\(confirmMessage\)/);
  assert.match(page, /setWeeklyUpdateReady\.bind/);
});
