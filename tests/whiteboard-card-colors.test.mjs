import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("only #rrggbb colors are accepted, so nothing else reaches a style attribute", async () => {
  const source = await readFile("lib/whiteboard-card-colors.ts", "utf8");
  assert.match(source, /\^#\[0-9a-f\]\{6\}\$/i);
});

test("the admin save is admin-only, validates both colors and refreshes both homepages", async () => {
  const action = await readFile("app/admin/whiteboard-colors-action.ts", "utf8");
  assert.match(action, /requireAdmin\(\)/);
  assert.match(action, /normalizeHexColor\(formData\.get\("front"\)\)/);
  assert.match(action, /normalizeHexColor\(formData\.get\("back"\)\)/);
  assert.match(action, /revalidatePath\("\/"\)[\s\S]*revalidatePath\("\/espanol"\)/);
});

test("the save targets the existing site_settings table by its key column and its original grants are restored", async () => {
  const action = await readFile("app/admin/whiteboard-colors-action.ts", "utf8");
  assert.match(action, /onConflict: "key"/);
  const sql = await readFile("supabase/migrations/20261025010000_restore_site_settings_grants.sql", "utf8");
  assert.match(sql, /grant select on public\.site_settings to anon, authenticated/);
  assert.match(sql, /grant select, insert, update, delete on public\.site_settings to authenticated/);
});

test("both homepages apply the saved colors and keep the original look when none is saved", async () => {
  for (const file of ["app/page.tsx", "app/espanol/page.tsx"]) {
    const page = await readFile(file, "utf8");
    assert.match(page, /loadWhiteboardCardColors\(\)/, file);
    assert.match(page, /whiteboardCardStyles\(cardColors\)\.front/, file);
    assert.match(page, /whiteboardCardStyles\(cardColors\)\.back/, file);
  }
});
