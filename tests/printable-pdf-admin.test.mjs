import test from "node:test";
import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";

const printablePdf = await import("../lib/printable-pdf-links.ts");

test("admin dashboard removes Calendar and adds Teaching PDF Links", async () => {
  const dashboard = await readFile("app/admin/page.tsx", "utf8");
  assert.doesNotMatch(dashboard, /title:\s*"Calendar"/);
  assert.doesNotMatch(dashboard, /Planned for later/);
  assert.match(dashboard, /title:\s*"Teaching PDF Links"/);
  assert.match(dashboard, /href:\s*"\/admin\/printable-pdfs"/);
});

test("printable PDF admin actions require admin authorization", async () => {
  const actions = await readFile("app/admin/printable-pdfs/actions.ts", "utf8");
  const requireAdminCalls = actions.match(/requireAdmin\(\)/g) ?? [];
  assert.equal(requireAdminCalls.length, 2);
  assert.match(actions, /savePrintablePdfLink/);
  assert.match(actions, /removePrintablePdfLink/);
  assert.match(actions, /formData\.get\("teachingId"\)/);
  assert.match(actions, /\.upsert\(\{ teaching_id: teachingId, printable_pdf_url: url\.value \}/);
  assert.match(actions, /\.delete\(\)/);
});

test("teaching selection submits the teaching UUID through FormData", async () => {
  const manager = await readFile("app/admin/printable-pdfs/printable-pdf-form.tsx", "utf8");
  const actions = await readFile("app/admin/printable-pdfs/actions.ts", "utf8");
  assert.match(manager, /name=\{editingTeachingId \? undefined : "teachingId"\}/);
  assert.match(manager, /<option key=\{teaching\.id\} value=\{teaching\.id\}>/);
  assert.match(manager, /type="hidden" name="teachingId" value=\{selectedTeachingId\}/);
  assert.match(actions, /validateTeachingId\(formData\.get\("teachingId"\)\)/);
  assert.doesNotMatch(manager, /savePrintablePdfLink\(selectedTeachingId/);
});

test("runtime teaching UUID validation accepts the traced Supabase UUID", () => {
  const teachingId = "79cd2b0d-cdda-48be-a92a-a6def963744e";
  assert.deepEqual(printablePdf.validateTeachingId(teachingId), { value: teachingId });
  assert.deepEqual(printablePdf.validateTeachingId(""), { error: "Teaching selection was not submitted." });
  assert.deepEqual(printablePdf.validateTeachingId("not-a-uuid"), { error: "Teaching ID is invalid." });
});

test("the teaching dropdown is not filtered by teaching status or type", async () => {
  const page = await readFile("app/admin/printable-pdfs/page.tsx", "utf8");
  const teachingQuery = page.match(/supabase\s*\.from\("teachings"\)[\s\S]*?\.order\("title", \{ ascending: true \}\)/)?.[0] ?? "";
  assert.match(teachingQuery, /\.select\("id, title, gathering_date"\)/);
  assert.doesNotMatch(teachingQuery, /\.eq\(|\.in\(|teaching_type|status/);
});

test("save verifies and assigns the exact selected teaching ID", async () => {
  const actions = await readFile("app/admin/printable-pdfs/actions.ts", "utf8");
  assert.match(actions, /validateTeachingId\(formData\.get\("teachingId"\)\)/);
  assert.match(actions, /from\("teachings"\)[\s\S]*?\.select\("id"\)[\s\S]*?\.eq\("id", teachingId\)[\s\S]*?\.maybeSingle\(\)/);
  assert.match(actions, /if \(teachingError\)[\s\S]*?Teaching lookup failed:/);
  assert.match(actions, /if \(!teaching\) \{\s*return \{ error: "Teaching could not be found\." \};/);
  assert.match(actions, /from\("teaching_printable_pdf_links"\)[\s\S]*?\.upsert\(\{ teaching_id: teachingId, printable_pdf_url: url\.value \}, \{ onConflict: "teaching_id" \}\)/);
});

test("save rejects a nonexistent or invalid teaching UUID", async () => {
  const actions = await readFile("app/admin/printable-pdfs/actions.ts", "utf8");
  assert.match(actions, /Teaching ID is invalid\./);
  assert.match(actions, /if \(!teaching\) \{\s*return \{ error: "Teaching could not be found\." \};/);
  assert.equal(printablePdf.getTeachingLookupErrorCategory("42501"), "authorization error");
  assert.equal(printablePdf.getTeachingLookupErrorCategory("PGRST116"), "database response error");
  assert.equal(printablePdf.getTeachingLookupErrorCategory(undefined), "database query error");
});

test("failed saves preserve form values and successful saves reset them", async () => {
  const manager = await readFile("app/admin/printable-pdfs/printable-pdf-form.tsx", "utf8");
  assert.match(manager, /value=\{selectedTeachingId\}/);
  assert.match(manager, /value=\{printablePdfUrl\}/);
  assert.match(manager, /event\.preventDefault\(\)/);
  assert.match(manager, /startTransition\(\(\) => saveFormAction\(formData\)\)/);
  assert.match(manager, /if \(result\.saved\) \{\s*setSelectedTeachingId\(""\);\s*setEditingTeachingId\(null\);\s*setPrintablePdfUrl\(""\);\s*\}/);
  assert.doesNotMatch(manager, /if \(result\.error\)[\s\S]{0,160}setSelectedTeachingId\(""\)/);
});

test("printable PDF admin uses one compact form and an assignments table", async () => {
  const page = await readFile("app/admin/printable-pdfs/page.tsx", "utf8");
  const manager = await readFile("app/admin/printable-pdfs/printable-pdf-form.tsx", "utf8");
  assert.match(page, /Teaching Printable PDF Link/);
  assert.match(page, /PrintablePdfManager/);
  assert.match(page, /printable_pdf_url, updated_at/);
  assert.match(manager, /Save PDF Link/);
  assert.match(manager, /Cancel Edit/);
  assert.match(manager, /Search teaching\.\.\./);
  assert.match(manager, /<table/);
  assert.match(manager, /target="_blank" rel="noopener noreferrer"/);
  assert.match(manager, /No printable PDF links have been added yet\./);
  assert.match(manager, /Saving will update it\./);
});

test("printable PDF deletion requires confirmation and removes only the assignment", async () => {
  const manager = await readFile("app/admin/printable-pdfs/printable-pdf-form.tsx", "utf8");
  const actions = await readFile("app/admin/printable-pdfs/actions.ts", "utf8");
  assert.match(manager, /window\.confirm\("Remove this printable PDF link\?/);
  assert.match(manager, /does not delete the teaching or the PDF from OneDrive/);
  assert.match(actions, /from\("teaching_printable_pdf_links"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("teaching_id", teachingIdResult\.value\)/);
});

test("printable PDF URL validation rejects unsafe and malformed URLs", async () => {
  const validator = await readFile("lib/printable-pdf-links.ts", "utf8");
  assert.match(validator, /new URL\(url\)/);
  assert.match(validator, /parsed\.protocol !== "https:"/);
  assert.match(validator, /javascript:/);
  assert.match(validator, /data:/);
  assert.match(validator, /file:/);
  assert.match(validator, /\[<>"\\s\]/);
});

test("printable PDF storage migration uses one link per teaching with RLS", async () => {
  const migration = await readFile("supabase/migrations/20260925000000_add_teaching_printable_pdf_links.sql", "utf8");
  assert.match(migration, /create table if not exists public\.teaching_printable_pdf_links/);
  assert.match(migration, /teaching_id uuid primary key references public\.teachings\(id\) on delete cascade/);
  assert.match(migration, /printable_pdf_url text not null/);
  assert.match(migration, /alter table public\.teaching_printable_pdf_links enable row level security/);
  assert.match(migration, /Public can read published teaching printable PDF links/);
  assert.match(migration, /Admins manage teaching printable PDF links/);
  assert.match(migration, /printable_pdf_url like 'https:\/\/%'/);
});

test("calendar cleanup migration is not created without verified production tables", async () => {
  const migrations = await readdir("supabase/migrations");
  const cleanupMigrations = migrations.filter((name) => /drop.*calendar|calendar.*drop|remove.*calendar|calendar.*cleanup/i.test(name));
  assert.deepEqual(cleanupMigrations, []);
});
