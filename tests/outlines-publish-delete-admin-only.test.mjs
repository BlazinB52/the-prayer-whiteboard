import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// Teaching outlines follow the same rule as teachings: creating, filing, publishing and deleting are the
// Administrator's. Content Managers only proof an outline after it is sent to them (outline-review.test.mjs).

function functionBody(source, name) {
  return source.match(new RegExp(`export async function ${name}[\\s\\S]*?\\n\\}\\n`))?.[0] ?? "";
}

test("every outline action requires an Administrator, never just a content manager", async () => {
  const source = await readFile("app/admin/outlines/actions.ts", "utf8");
  assert.doesNotMatch(source, /requireContentManager/);
  for (const name of ["previewOutline", "saveOutline", "setOutlineStatus", "moveOutlineToCategory", "setOutlineTeaching", "deleteOutline", "createOutlineCategory", "renameOutlineCategory", "deleteOutlineCategory"]) {
    const body = functionBody(source, name);
    assert.notEqual(body, "", `${name} must exist`);
    assert.match(body, /await requireAdmin\(\)/, `${name} checks for an Administrator`);
  }
});

test("an upload is always saved as a draft, and publishing is a separate Administrator step", async () => {
  const source = await readFile("app/admin/outlines/actions.ts", "utf8");
  const body = functionBody(source, "saveOutline");
  assert.match(body, /status: "draft"/);
  assert.match(body, /published_at: null/);
  assert.doesNotMatch(body, /formData\.get\("publish"\)/);
  assert.doesNotMatch(body, /sent_for_review_at/, "an upload never opens the gate by itself");
});

test("the outlines screen is Administrator-only and no longer branches on role", async () => {
  const page = await readFile("app/admin/outlines/page.tsx", "utf8");
  assert.match(page, /await requireAdmin\(\)/);
  assert.doesNotMatch(page, /requireContentManager|isAdmin/);
  const manager = await readFile("app/admin/outlines/outline-manager.tsx", "utf8");
  assert.doesNotMatch(manager, /isAdmin|locked/);
  assert.doesNotMatch(manager, /name="publish"/);
  assert.match(manager, /With Content Managers/);
  assert.match(manager, /Not sent for review/);
});

test("the outline page and its text editor are Administrator-only", async () => {
  for (const file of ["app/admin/outlines/[id]/page.tsx", "app/admin/outlines/[id]/edit-text/page.tsx", "app/admin/outlines/[id]/edit-text/actions.ts"]) {
    const source = await readFile(file, "utf8");
    assert.match(source, /await requireAdmin\(\)/, file);
    assert.doesNotMatch(source, /requireContentManager/, file);
  }
});

test("the earlier migration is history; the review migration is what takes content managers out of uploading", async () => {
  const early = await readFile("supabase/migrations/20261007050000_outlines_publish_delete_admin_only.sql", "utf8");
  assert.match(early, /create policy "Admins manage teaching outlines"[\s\S]*?for all[\s\S]*?is_authenticated_admin\(\)/);
  const sql = await readFile("supabase/migrations/20261011030000_outline_review.sql", "utf8");
  for (const policy of ["Staff add draft teaching outlines", "Staff edit draft teaching outlines", "Staff read teaching outlines"]) {
    assert.match(sql, new RegExp(`drop policy if exists "${policy}" on public\\.teaching_outlines`), policy);
  }
  for (const policy of ["Staff add teaching outline files", "Staff remove unused teaching outline files"]) {
    assert.match(sql, new RegExp(`drop policy if exists "${policy}" on storage\\.objects`), policy);
  }
  assert.doesNotMatch(sql, /create policy "Staff (add|edit)/, "no content manager write policy is recreated");
  assert.doesNotMatch(sql, /for delete\s+on public\.teaching_outlines|on public\.teaching_outlines\s+for delete/);
});
