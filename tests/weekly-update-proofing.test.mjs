import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile("supabase/migrations/20261010020000_weekly_update_proofings.sql", "utf8");
const adminActions = await readFile("app/admin/weekly-updates/actions.ts", "utf8");
const adminPage = await readFile("app/admin/weekly-updates/page.tsx", "utf8");
const cmActions = await readFile("app/admin/cm/weekly-update-review/actions.ts", "utf8");
const cmList = await readFile("app/admin/cm/weekly-update-review/page.tsx", "utf8");
const cmDetail = await readFile("app/admin/cm/weekly-update-review/[id]/page.tsx", "utf8");

test("every active Content Manager is sent their own copy, and nobody gets a second pass by accident", () => {
  const send = migration.slice(migration.indexOf("function public.send_weekly_update_for_proofing"), migration.indexOf("function public.take_back_weekly_update_from_proofing"));
  assert.match(send, /aa\.role = 'content_manager' and aa\.is_active = true and aa\.revoked_at is null/);
  assert.match(send, /is_authenticated_admin\(\)/);
  assert.match(send, /status = 'draft'/);
  // Running it again adds anyone new but leaves existing rows alone unless a restart is asked for.
  assert.match(send, /on conflict \(weekly_update_id, user_id\) do nothing/);
  assert.match(send, /if p_restart then/);
  assert.match(send, /There are no Content Managers to send it to\./);
  assert.match(migration, /primary key \(weekly_update_id, user_id\)/);
});

test("one Content Manager submitting never locks out another", () => {
  const submit = migration.slice(migration.indexOf("function public.submit_weekly_update_proof"));
  assert.match(submit, /p\.user_id = v_user/);
  assert.match(submit, /p\.submitted_at is null/);
  // The shared OK from the first version is gone, so there is nothing one person can set for everyone.
  assert.match(migration, /drop function if exists public\.set_weekly_update_proofed_ok\(uuid, boolean\)/);
  assert.match(migration, /drop column if exists proofed_ok_at/);
  assert.equal(adminPage.includes("proofed_ok_at"), false);
  assert.equal(cmDetail.includes("proofed_ok_at"), false);
  assert.equal(cmList.includes("proofed_ok_at"), false);
});

test("a Content Manager can only open a draft that was sent to them, and has one pass", () => {
  assert.match(migration, /user_id = auth\.uid\(\) and public\.is_content_manager_or_admin\(\)/);
  assert.match(cmDetail, /\.from\("weekly_update_proofings"\)[\s\S]*?\.eq\("user_id", user\.id\)/);
  assert.match(cmDetail, /if \(!proofing\) notFound\(\)/);
  assert.match(cmDetail, /Boolean\(proofing\.submitted_at\)/);
  assert.match(cmList, /\.from\("weekly_update_proofings"\)/);
  assert.match(cmList, /\.in\("id", \[\.\.\.submittedAt\.keys\(\)\]\)/);
});

test("submitting is the one pass and is also the OK to publish", () => {
  const submit = cmActions.slice(cmActions.indexOf('if (intent === "submit")'));
  // The proposed changes are submitted first, and only then is the proof recorded.
  assert.ok(submit.indexOf("submit_weekly_update_revision") < submit.indexOf("submit_weekly_update_proof"));
  // With nothing to propose, the empty draft is removed and the submit is the OK on its own.
  assert.ok(submit.indexOf("discard_teaching_revision") < submit.indexOf("submit_weekly_update_proof"));
  assert.match(submit, /proposed === 0/);
  // The database still refuses an OK while unsubmitted changes are open.
  assert.match(migration, /Submit or discard your proposed changes first\./);
});

test("the Content Manager page has one submit at the bottom, a strong note, and no further edits afterwards", async () => {
  const form = await readFile("app/admin/cm/teaching-review/[id]/review-edit-form.tsx", "utf8");
  assert.match(cmDetail, /submitsAsOk/);
  assert.match(form, /Submitting to the Administrator means you are saying this \{subject\} is OK to publish/);
  assert.match(form, /disabled=\{pending \|\| \(!submitsAsOk && changedCount === 0\)\}/);
  assert.match(form, /Submit to Administrator: OK to publish/);
  assert.equal(cmDetail.includes("RecallRevisionButton"), false);
  assert.equal(cmDetail.includes("?new=1"), false);
  assert.match(cmDetail, /There are no further edits at this time\./);
});

test("the Administrator sees every proof and can open each Content Manager's changes", () => {
  assert.match(adminPage, /\.from\("weekly_update_proofings"\)/);
  assert.match(adminPage, /\.eq\("subject_type", "weekly_update"\)\.eq\("status", "submitted"\)/);
  assert.match(adminPage, /\/admin\/teaching-revisions\/\$\{revision\.id\}/);
  assert.match(adminPage, /Proofs \{proofs\.filter/);
  assert.match(adminPage, /No changes proposed/);
});

test("the Administrator never needs a Content Manager's approval to mark ready or publish", () => {
  const ready = adminActions.slice(adminActions.indexOf("export async function setWeeklyUpdateReady"), adminActions.indexOf("export async function sendWeeklyUpdateToProofing"));
  assert.doesNotMatch(ready, /proofed|proofing/);
  const publish = adminActions.slice(adminActions.indexOf("export async function publishWeeklyUpdate"), adminActions.indexOf("export async function deleteWeeklyUpdate"));
  assert.doesNotMatch(publish, /proofing|submitted_at/);
  // Outstanding proofs only produce a warning in the confirmation, never a block.
  assert.match(adminPage, /have not submitted their proof yet\. Publishing ends their review\./);
});

test("sending for proofing and taking back are admin-only, draft-only and publish nothing", () => {
  for (const name of ["sendWeeklyUpdateToProofing", "takeWeeklyUpdateBackFromProofing"]) {
    const start = adminActions.indexOf(`export async function ${name}`);
    const body = adminActions.slice(start, start + 900);
    assert.match(body, /await requireAdmin\(\)/);
    assert.doesNotMatch(body, /publish_weekly_update|broadcast/);
  }
  assert.match(adminActions, /rpc\("send_weekly_update_for_proofing", \{ p_weekly_update_id: id, p_restart: false \}\)/);
  assert.match(adminActions, /rpc\("take_back_weekly_update_from_proofing"/);
  for (const fn of ["send_weekly_update_for_proofing", "take_back_weekly_update_from_proofing", "restart_weekly_update_proofing"]) {
    assert.match(migration, new RegExp(`function public\\.${fn}[\\s\\S]*?is_authenticated_admin\\(\\)`));
  }
});

test("replacing the document gives everyone a fresh pass", () => {
  const update = adminActions.slice(adminActions.indexOf("export async function updateWeeklyUpdate"), adminActions.indexOf("export async function setWeeklyUpdateReady"));
  assert.match(update, /if \(docx\.value\) await supabase\.rpc\("restart_weekly_update_proofing"/);
  assert.match(update, /update\.ready_to_publish_at = null/);
  assert.match(migration, /set submitted_at = null, sent_at = now\(\)/);
});

test("a draft already sent under the first version is carried over", () => {
  assert.match(migration, /w\.sent_to_proofing_at is not null/);
});
