import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration = await readFile("supabase/migrations/20261010010000_weekly_update_proofing.sql", "utf8");
const adminActions = await readFile("app/admin/weekly-updates/actions.ts", "utf8");
const adminPage = await readFile("app/admin/weekly-updates/page.tsx", "utf8");
const cmActions = await readFile("app/admin/cm/weekly-update-review/actions.ts", "utf8");
const cmList = await readFile("app/admin/cm/weekly-update-review/page.tsx", "utf8");
const cmDetail = await readFile("app/admin/cm/weekly-update-review/[id]/page.tsx", "utf8");

test("only a Content Manager or Administrator can OK a draft, and only one sent for proofing", () => {
  assert.match(migration, /security definer/);
  assert.match(migration, /is_content_manager_or_admin\(\)/);
  assert.match(migration, /and status = 'draft'\s+and sent_to_proofing_at is not null/);
  assert.match(migration, /revoke all on function public\.set_weekly_update_proofed_ok\(uuid, boolean\) from public/);
  assert.match(migration, /grant execute on function public\.set_weekly_update_proofed_ok\(uuid, boolean\) to authenticated/);
  // An OK needs a send first, so a draft can never be OK'd without the Content Managers having been asked.
  assert.match(migration, /check \(proofed_ok_at is null or sent_to_proofing_at is not null\)/);
});

test("submitting is the one pass and is also the OK to publish", () => {
  const submit = cmActions.slice(cmActions.indexOf('if (intent === "submit")'));
  // The proposed changes are submitted first, and only then is the OK recorded.
  assert.ok(submit.indexOf("submit_weekly_update_revision") < submit.indexOf("set_weekly_update_proofed_ok"));
  // With nothing to propose, the empty draft is removed and the submit is the OK on its own.
  assert.ok(submit.indexOf("discard_teaching_revision") < submit.indexOf("set_weekly_update_proofed_ok"));
  assert.match(submit, /proposed === 0/);
  // The database still refuses an OK while unsubmitted changes are open.
  assert.match(migration, /Submit or discard your proposed changes first./);
});

test("the Content Manager page has one submit at the bottom, a strong note, and no further edits afterwards", async () => {
  const form = await readFile("app/admin/cm/teaching-review/[id]/review-edit-form.tsx", "utf8");
  assert.match(cmDetail, /submitsAsOk/);
  assert.match(form, /Submitting to the Administrator means you are saying this {subject} is OK to publish/);
  assert.match(form, /disabled={pending || (!submitsAsOk && changedCount === 0)}/);
  assert.match(form, /Submit to Administrator: OK to publish/);
  // The separate OK, withdraw, take-back and new-revision controls are gone.
  assert.equal(cmDetail.includes("setWeeklyUpdateProofedOk"), false);
  assert.equal(cmDetail.includes("RecallRevisionButton"), false);
  assert.equal(cmDetail.includes("?new=1"), false);
  assert.equal(cmActions.includes("export async function setWeeklyUpdateProofedOk"), false);
  assert.match(cmDetail, /There are no further edits at this time./);
});

test("withdrawing an OK also removes the ready mark, which was based on it", () => {
  assert.match(migration, /ready_to_publish_at = case when p_ok then ready_to_publish_at else null end/);
});

test("the Administrator can only mark a draft ready after a Content Manager's OK", () => {
  const ready = adminActions.slice(adminActions.indexOf("export async function setWeeklyUpdateReady"), adminActions.indexOf("export async function setWeeklyUpdateReady") + 1200);
  assert.match(ready, /if \(ready\) query = query\.not\("proofed_ok_at", "is", null\)/);
  assert.match(ready, /ready=notproofed/);
  // The ready button is only offered once the OK exists.
  assert.ok(adminPage.indexOf("Mark as ready to publish") > adminPage.indexOf("!update.proofed_ok_at ?"));
});

test("sending for proofing and taking back are admin-only, draft-only and publish nothing", () => {
  for (const name of ["sendWeeklyUpdateToProofing", "takeWeeklyUpdateBackFromProofing"]) {
    const start = adminActions.indexOf(`export async function ${name}`);
    const body = adminActions.slice(start, start + 1100);
    assert.match(body, /await requireAdmin\(\)/);
    assert.match(body, /\.eq\("status", "draft"\)/);
    assert.doesNotMatch(body, /publish_weekly_update|broadcast/);
  }
  const send = adminActions.slice(adminActions.indexOf("export async function sendWeeklyUpdateToProofing"));
  // Sending again starts proofing over.
  assert.match(send.slice(0, 700), /proofed_ok_at: null[\s\S]*ready_to_publish_at: null/);
});

test("replacing the document clears the OK and ready mark but keeps it with the Content Managers", () => {
  const update = adminActions.slice(adminActions.indexOf("export async function updateWeeklyUpdate"), adminActions.indexOf("export async function setWeeklyUpdateReady"));
  assert.match(update, /update\.proofed_ok_at = null/);
  assert.match(update, /update\.ready_to_publish_at = null/);
  assert.equal(update.includes("sent_to_proofing_at"), false);
});

test("Content Managers only see drafts that were sent to them", () => {
  assert.match(cmList, /\.not\("sent_to_proofing_at", "is", null\)/);
  assert.match(cmDetail, /\.not\("sent_to_proofing_at", "is", null\)/);
});

test("publishing warns when the draft has not been through the workflow", () => {
  assert.match(adminPage, /No Content Manager has marked this draft OK to publish\./);
  assert.match(adminPage, /This draft has not been marked ready to publish\./);
});
