import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("adding, renaming and deleting a category require an Administrator, not just a content manager", async () => {
  const source = await readFile("app/admin/outlines/actions.ts", "utf8");
  for (const name of ["createOutlineCategory", "renameOutlineCategory", "deleteOutlineCategory"]) {
    const body = source.match(new RegExp(`export async function ${name}[\\s\\S]*?\\n\\}\\n`))?.[0] ?? "";
    assert.notEqual(body, "", `${name} must exist`);
    assert.match(body, /await requireAdmin\(\)/, `${name} checks for an Administrator`);
    assert.doesNotMatch(body, /requireContentManager\(\)/, `${name} does not accept a content manager`);
  }
});

test("filing and moving outlines is the Administrator's too", async () => {
  const source = await readFile("app/admin/outlines/actions.ts", "utf8");
  const move = source.match(/export async function moveOutlineToCategory[\s\S]*?\n\}\n/)?.[0] ?? "";
  assert.match(move, /await requireAdmin\(\)/);
  assert.doesNotMatch(move, /requireContentManager/);
});

test("the page is Administrator-only, so category management needs no per-role switch", async () => {
  const page = await readFile("app/admin/outlines/page.tsx", "utf8");
  assert.match(page, /await requireAdmin\(\)/);
  const manager = await readFile("app/admin/outlines/outline-manager.tsx", "utf8");
  assert.match(manager, /<CategoriesSection/);
  assert.doesNotMatch(manager, /isAdmin/);
});

test("the migration makes category writes Administrator-only and leaves reading open", async () => {
  const sql = await readFile("supabase/migrations/20261007030000_outline_categories_admin_only.sql", "utf8");
  assert.match(sql, /drop policy if exists "Staff manage outline categories"/);
  assert.match(sql, /create policy "Admins manage outline categories"[\s\S]*?for all[\s\S]*?is_authenticated_admin\(\)[\s\S]*?with check \(public\.is_authenticated_admin\(\)\)/);
  assert.doesNotMatch(sql, /is_content_manager_or_admin/);
});
