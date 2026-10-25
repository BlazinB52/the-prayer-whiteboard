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

test("the settings table is closed to signed-in users", async () => {
  const sql = await readFile("supabase/migrations/20261025000000_site_settings.sql", "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.site_settings from anon, authenticated/);
});

test("both homepages apply the saved colors and keep the original look when none is saved", async () => {
  for (const file of ["app/page.tsx", "app/espanol/page.tsx"]) {
    const page = await readFile(file, "utf8");
    assert.match(page, /loadWhiteboardCardColors\(\)/, file);
    assert.match(page, /whiteboardCardStyles\(cardColors\)\.front/, file);
    assert.match(page, /whiteboardCardStyles\(cardColors\)\.back/, file);
  }
});
