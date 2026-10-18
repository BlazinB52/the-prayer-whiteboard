import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { buildReviewReadyEmail, reviewPath } from "../lib/review-ready-email.ts";

test("the review email names the item, links to its review page, and never includes its content", () => {
  const email = buildReviewReadyEmail({ kind: "teaching", title: "Walking in the Light", reviewUrl: "https://example.com/admin/cm/teaching-review/abc", recipientName: "Sam", senderName: "Pat" });
  assert.equal(email.subject, "Ready for your review: Walking in the Light");
  assert.match(email.html, /Hello Sam,/);
  assert.match(email.html, /Pat has sent you a teaching to review/);
  assert.match(email.html, /<a href="https:\/\/example\.com\/admin\/cm\/teaching-review\/abc"[^>]*>Open it for review<\/a>/);
  assert.match(email.html, /proposals only/);
  assert.match(email.text, /Open it for review: https:\/\/example\.com\/admin\/cm\/teaching-review\/abc/);
  assert.match(email.html, /You will need to sign in/);
});

test("the email says the right thing for each kind, escapes the title, and copes with a missing name", () => {
  assert.match(buildReviewReadyEmail({ kind: "devotional", title: "T", reviewUrl: "https://x" }).html, /sent you a 7-day devotional to review/);
  assert.match(buildReviewReadyEmail({ kind: "weekly_update", title: "T", reviewUrl: "https://x" }).html, /sent you a weekly update to review/);
  const plain = buildReviewReadyEmail({ kind: "teaching", title: "A <b>bold</b> & title", reviewUrl: "https://x" });
  assert.match(plain.html, /A &lt;b&gt;bold&lt;\/b&gt; &amp; title/);
  assert.doesNotMatch(plain.html, /<b>bold<\/b>/);
  assert.match(plain.html, /Hello,/);
  assert.match(plain.html, /The Administrator has sent you/);
  assert.equal(buildReviewReadyEmail({ kind: "teaching", title: "  ", reviewUrl: "https://x" }).subject, "Ready for your review: Untitled teaching");
});

test("each kind links to its own Content Manager review page", () => {
  assert.equal(reviewPath("teaching", "id1"), "/admin/cm/teaching-review/id1");
  assert.equal(reviewPath("devotional", "id1"), "/admin/cm/devotional-review/id1");
  assert.equal(reviewPath("weekly_update", "id1"), "/admin/cm/weekly-update-review/id1");
});

test("sending for review is Administrator-only, only for drafts, once, and emails the Content Managers", async () => {
  const actions = await readFile("app/admin/review-gate-actions.ts", "utf8");
  assert.match(actions, /requireAdmin\(\)/);
  assert.doesNotMatch(actions, /requireContentManager/);
  assert.match(actions, /\.eq\("status", "draft"\)\s*\.is\("sent_for_review_at", null\)/, "only a draft that has not been sent");
  assert.match(actions, /notifyContentManagers\(/);
  assert.ok(actions.indexOf(".is(\"sent_for_review_at\", null)") < actions.indexOf("notifyContentManagers("), "the gate opens before anyone is emailed");
  assert.match(actions, /takeBackFromReview/);
  const send = await readFile("lib/review-ready-send.ts", "utf8");
  assert.match(send, /\.eq\("role", "content_manager"\)/);
  assert.match(send, /\.eq\("is_active", true\)/);
  assert.match(send, /\.is\("revoked_at", null\)/);
});

test("the weekly update send emails only the people who did not already have it", async () => {
  const actions = await readFile("app/admin/weekly-updates/actions.ts", "utf8");
  assert.match(actions, /if \(before && additions\.length\)/);
  assert.match(actions, /notifyContentManagers\(\{ kind: "weekly_update"/);
});

test("the teaching and devotional pages show the review gate for drafts, and the Content Manager lists say nothing is sent until it is", async () => {
  const teaching = await readFile("app/admin/teachings/[id]/edit/page.tsx", "utf8");
  assert.match(teaching, /teaching\.status === "draft" \? <ReviewGateSection noun="teaching"/);
  const devotional = await readFile("app/admin/devotionals/[id]/page.tsx", "utf8");
  assert.match(devotional, /devotional\.status === "draft" \? <ReviewGateSection noun="devotional"/);
  const section = await readFile("app/admin/review-gate-section.tsx", "utf8");
  assert.match(section, /Send to Content Managers for review/);
  assert.match(section, /Take back from review/);
  assert.match(section, /Content Managers cannot see this/);
  for (const file of ["app/admin/cm/teaching-review/page.tsx", "app/admin/cm/devotional-review/page.tsx"]) {
    assert.match(await readFile(file, "utf8"), /Nothing has been sent to you for review right now/);
  }
});

test("the migration hides unsent drafts from Content Managers in the database, and blocks proposals on them", async () => {
  const sql = await readFile("supabase/migrations/20261011020000_review_gate.sql", "utf8");
  for (const table of ["teachings", "teaching_devotionals"]) {
    assert.match(sql, new RegExp(`alter table public\\.${table} add column if not exists sent_for_review_at timestamptz`));
  }
  assert.match(sql, /status = 'draft' and sent_for_review_at is not null/);
  assert.match(sql, /weekly_update_proofings p where p\.weekly_update_id = weekly_updates\.id and p\.user_id = auth\.uid\(\)/);
  assert.match(sql, /create trigger content_revisions_require_open_review\s+before insert on public\.content_revisions/);
  assert.match(sql, /create trigger content_revision_changes_require_open_review\s+before insert on public\.content_revision_changes/);
  assert.match(sql, /before update of status on public\.content_revisions[\s\S]*?new\.status = 'submitted'/);
  assert.match(sql, /if public\.is_authenticated_admin\(\) then\s+return true;/, "Administrators are never blocked");
  assert.match(sql, /review_is_open\('weekly_update', null, null, p_weekly_update_id\)/);
  assert.match(sql, /sent_for_review_at is null or status = 'draft'/);
  assert.match(sql, /where r\.subject_type = 'teaching'[\s\S]*?status in \('draft', 'submitted'\)/, "work already under way stays visible");
});

test("an optional note appears in the review email, escaped, and is left out when empty", () => {
  const base = { kind: "teaching", title: "T", reviewUrl: "https://x", senderName: "Pat" };
  const withNote = buildReviewReadyEmail({ ...base, note: "Look at <point> 2.\nThanks" });
  assert.match(withNote.html, /A note from Brent/);
  assert.doesNotMatch(withNote.html, /A note from Pat|A note from the Administrator/, "the note is always from Brent, whatever the sender name is");
  assert.match(withNote.html, /Look at &lt;point&gt; 2\.<br>Thanks/);
  assert.match(withNote.text, /A note from Brent:\nLook at <point> 2\.\nThanks/);
  assert.doesNotMatch(buildReviewReadyEmail({ ...base, note: "   " }).html, /A note from/);
  assert.equal(buildReviewReadyEmail(base).html, buildReviewReadyEmail({ ...base, note: "" }).html);
});

test("sending for review goes to the chosen Content Managers, records them before the gate opens, and emails only new people", async () => {
  const actions = await readFile("app/admin/review-gate-actions.ts", "utf8");
  assert.match(actions, /readRecipientIds\(formData\)/);
  assert.match(actions, /review=nopick/, "sending to nobody is refused");
  assert.ok(actions.indexOf('from("content_review_recipients")\n    .insert') < actions.indexOf('.is("sent_for_review_at", null)'), "the people are recorded before the gate opens");
  assert.match(actions, /onlyUserIds: additions/, "only people who did not have it are emailed");
  const section = await readFile("app/admin/review-gate-section.tsx", "utf8");
  assert.match(section, /name="to"/);
  assert.match(section, /Not sent to yet/);
});

test("the weekly update send takes chosen people and emails only the ones who did not have it", async () => {
  const actions = await readFile("app/admin/weekly-updates/actions.ts", "utf8");
  assert.match(actions, /p_user_ids: chosen/);
  assert.match(actions, /onlyUserIds: additions/);
  assert.match(actions, /proofing=nopick/);
});
