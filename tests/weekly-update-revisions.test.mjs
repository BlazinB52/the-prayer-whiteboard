import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { weeklyUpdateEditableFields } from "../lib/weekly-update-revisions.ts";
import { parseFieldId } from "../lib/teaching-revisions.ts";

test("the database's field list is shaped for the shared review screens", () => {
  const fields = weeklyUpdateEditableFields([
    { field_key: "title", label: "Title", context: "Weekly update details", current_value: "Hello", max_length: 180, multiline: false, field_rows: 1, formatted: false },
    { field_key: "block_2", label: "Paragraph 2", context: "Weekly update content", current_value: null, max_length: 12000, multiline: true, field_rows: 5, formatted: true },
  ]);
  assert.equal(fields.length, 2);
  assert.equal(fields[0].id, "weekly_update:-:title");
  assert.equal(fields[0].targetKind, "weekly_update");
  assert.equal(fields[0].targetId, null);
  assert.equal(fields[1].current, "", "a missing value starts empty");
  assert.deepEqual(parseFieldId(fields[1].id), { targetKind: "weekly_update", targetId: null, fieldKey: "block_2" });
  assert.deepEqual(weeklyUpdateEditableFields(null), []);
});

test("co-editor weekly update actions only call the review functions and never touch tables directly", async () => {
  const source = await readFile("app/admin/cm/weekly-update-review/actions.ts", "utf8");
  assert.match(source, /requireContentManager\(\)/);
  assert.doesNotMatch(source, /requireAdmin|service-role|createServiceRoleClient/);
  assert.doesNotMatch(source, /\.from\(/);
  const calls = [...source.matchAll(/\.rpc\("([a-z_]+)"/g)].map((match) => match[1]);
  assert.deepEqual([...new Set(calls)].sort(), ["create_weekly_update_revision", "discard_teaching_revision", "save_weekly_update_revision_draft", "submit_weekly_update_revision"]);
  for (const forbidden of ["review_weekly_update_revision_change", "review_all_weekly_update_revision_changes", "cancel_teaching_revision", "purge_revision_history"]) {
    assert.equal(source.includes(forbidden), false, `${forbidden} is Administrator-only`);
  }
});

test("the Content Management page offers Weekly Update - Review, listing only drafts", async () => {
  const cm = await readFile("app/admin/cm/page.tsx", "utf8");
  assert.match(cm, /title: "Weekly Update - Review"/);
  assert.match(cm, /href: "\/admin\/cm\/weekly-update-review"/);
  for (const file of ["app/admin/cm/weekly-update-review/page.tsx", "app/admin/cm/weekly-update-review/[id]/page.tsx"]) {
    assert.match(await readFile(file, "utf8"), /\.eq\("status", "draft"\)/);
  }
});

test("the migration keeps decisions Administrator-only, limits editing to drafts, and cleans up on publish", async () => {
  const sql = await readFile("supabase/migrations/20261007040000_weekly_update_revisions.sql", "utf8");
  for (const name of ["review_weekly_update_revision_change", "review_all_weekly_update_revision_changes"]) {
    const body = sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`))?.[0] ?? "";
    assert.notEqual(body, "", `${name} must exist`);
    assert.match(body, /is_authenticated_admin\(\)/);
    assert.match(body, /security definer/);
  }
  for (const name of ["create_weekly_update_revision", "save_weekly_update_revision_draft", "submit_weekly_update_revision", "weekly_update_review_fields"]) {
    const body = sql.match(new RegExp(`create or replace function public\\.${name}[\\s\\S]*?\\n\\$\\$;`))?.[0] ?? "";
    assert.match(body, /is_content_manager_or_admin\(\)/, `${name} checks the caller`);
  }
  assert.doesNotMatch(sql, /grant (insert|update|delete|all)[^;]*to authenticated/i);
  assert.match(sql, /status = 'draft'/);
  assert.match(sql, /weekly_updates_close_revisions_on_publish/);
});

test("the Administrator pages send each weekly update decision to the matching functions", async () => {
  const actions = await readFile("app/admin/teaching-revisions/actions.ts", "utf8");
  assert.match(actions, /review_weekly_update_revision_change/);
  assert.match(actions, /review_all_weekly_update_revision_changes/);
  const detail = await readFile("app/admin/teaching-revisions/[revisionId]/page.tsx", "utf8");
  assert.match(detail, /weekly_update_review_fields/);
  const weekly = await readFile("app/admin/weekly-updates/page.tsx", "utf8");
  assert.match(weekly, /waiting for your review/);
});
