import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

function functionBody(source, name) {
  return source.match(new RegExp(`export async function ${name}[\\s\\S]*?\\n\\}\\n`))?.[0] ?? "";
}

test("publishing, unpublishing and deleting an outline require an Administrator", async () => {
  const source = await readFile("app/admin/outlines/actions.ts", "utf8");
  for (const name of ["setOutlineStatus", "deleteOutline"]) {
    const body = functionBody(source, name);
    assert.notEqual(body, "", `${name} must exist`);
    assert.match(body, /requireOutlineAdmin\(/, `${name} checks for an Administrator`);
    assert.doesNotMatch(body, /requireContentManager\(\)/, `${name} does not accept a content manager`);
  }
});

test("a content manager's upload is always saved as a draft", async () => {
  const source = await readFile("app/admin/outlines/actions.ts", "utf8");
  const body = functionBody(source, "saveOutline");
  assert.match(body, /const publish = role === "admin" && formData\.get\("publish"\) === "on"/);
});

test("a content manager's edits only reach drafts, and say so when they do not", async () => {
  const source = await readFile("app/admin/outlines/actions.ts", "utf8");
  for (const name of ["moveOutlineToCategory", "setOutlineTeaching"]) {
    const body = functionBody(source, name);
    assert.match(body, /\.select\("id"\)/, `${name} notices when nothing was changed`);
    assert.match(body, /Only a draft outline can be changed/);
  }
});

test("the screen hides Publish, Unpublish, Delete and Publish now from a content manager", async () => {
  const manager = await readFile("app/admin/outlines/outline-manager.tsx", "utf8");
  assert.match(manager, /\{isAdmin \? \(\s*<button[\s\S]*?setOutlineStatus/);
  assert.match(manager, /\{isAdmin \? \(\s*<button[\s\S]*?deleteOutline/);
  assert.match(manager, /\{isAdmin \? \(\s*<label[\s\S]*?name="publish"/);
  assert.match(manager, /This will be saved as a draft\. An Administrator publishes it after review\./);
  assert.match(manager, /const locked = !isAdmin && outline\.status === "published"/);
});

test("the migration lets staff add and edit drafts only, with no delete, and Administrators do everything", async () => {
  const sql = await readFile("supabase/migrations/20261007050000_outlines_publish_delete_admin_only.sql", "utf8");
  assert.match(sql, /drop policy if exists "Staff manage teaching outlines"/);
  assert.match(sql, /create policy "Admins manage teaching outlines"[\s\S]*?for all[\s\S]*?is_authenticated_admin\(\)/);
  assert.match(sql, /create policy "Staff add draft teaching outlines"[\s\S]*?for insert[\s\S]*?status = 'draft' and published_at is null/);
  assert.match(sql, /create policy "Staff edit draft teaching outlines"[\s\S]*?for update[\s\S]*?using \(public\.is_content_manager_or_admin\(\) and status = 'draft'\)/);
  assert.doesNotMatch(sql, /for delete\s+on public\.teaching_outlines|on public\.teaching_outlines\s+for delete/);
  assert.match(sql, /create policy "Staff remove unused teaching outline files"[\s\S]*?not exists/);
});
