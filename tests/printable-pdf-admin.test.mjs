import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const printablePdf = await import("../lib/printable-pdf-links.ts");
const migrationPath = "supabase/migrations/20260925020000_refactor_printable_pdf_links.sql";

test("printable PDF title and URL validation enforce the admin contract", () => {
  assert.deepEqual(printablePdf.validatePrintablePdfTitle("  Prayer Guide  "), { value: "Prayer Guide" });
  assert.deepEqual(printablePdf.validatePrintablePdfTitle("  "), { error: "Title is required." });
  assert.equal(printablePdf.validatePrintablePdfTitle("x".repeat(201)).error, "Title must be 200 characters or fewer.");
  assert.equal(printablePdf.validatePrintablePdfUrl("http://example.com/file.pdf").error, "Printable PDF URL must start with https://.");
  assert.equal(printablePdf.validatePrintablePdfUrl("javascript:alert(1)").error, "Printable PDF URL must start with https://.");
  assert.equal(printablePdf.validatePrintablePdfUrl("data:text/plain,test").error, "Printable PDF URL must start with https://.");
  assert.equal(printablePdf.validatePrintablePdfUrl("file:///tmp/test.pdf").error, "Printable PDF URL must start with https://.");
  assert.deepEqual(printablePdf.validatePrintablePdfUrl(" https://example.com/file.pdf "), { value: "https://example.com/file.pdf" });
});

test("admin actions create, edit, and delete general printable PDF records", async () => {
  const actions = await readFile("app/admin/printable-pdfs/actions.ts", "utf8");
  assert.equal((actions.match(/requireAdmin\(\)/g) ?? []).length, 2);
  assert.match(actions, /formData\.get\("title"\)/);
  assert.match(actions, /formData\.get\("printablePdfUrl"\)/);
  assert.match(actions, /formData\.get\("id"\)/);
  assert.match(actions, /from\("printable_pdf_links"\)[\s\S]*?\.insert\(\{ title: title\.value, printable_pdf_url: url\.value \}\)/);
  assert.match(actions, /from\("printable_pdf_links"\)[\s\S]*?\.update\(\{ title: title\.value, printable_pdf_url: url\.value \}\)/);
  assert.match(actions, /from\("printable_pdf_links"\)[\s\S]*?\.delete\(\)[\s\S]*?\.eq\("id", idResult\.value\)/);
  assert.doesNotMatch(actions, /teachingId|from\("teachings"\)|teaching_printable_pdf_links/);
});

test("admin form has title and URL controls and preserves failed values", async () => {
  const manager = await readFile("app/admin/printable-pdfs/printable-pdf-form.tsx", "utf8");
  assert.match(manager, /name="title"/);
  assert.match(manager, /name="printablePdfUrl"/);
  assert.doesNotMatch(manager, /<select|teachingId/);
  assert.match(manager, /useActionState\(async \(previousState: FormState, formData: FormData\)/);
  assert.match(manager, /event\.preventDefault\(\)[\s\S]*?new FormData\(event\.currentTarget\)[\s\S]*?saveFormAction\(formData\)/);
  assert.match(manager, /if \(result\.saved\) \{\s*setEditingId\(null\);\s*setTitle\(""\);\s*setPrintablePdfUrl\(""\);/);
  assert.doesNotMatch(manager, /if \(result\.error\)[\s\S]{0,160}setTitle\(""\)/);
});

test("admin list is compact, searchable, newest first, and has safe PDF actions", async () => {
  const page = await readFile("app/admin/printable-pdfs/page.tsx", "utf8");
  const manager = await readFile("app/admin/printable-pdfs/printable-pdf-form.tsx", "utf8");
  assert.match(page, /\.from\("printable_pdf_links"\)/);
  assert.match(page, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(manager, /Search PDF title/);
  assert.match(manager, /<th scope="col" className="px-3 py-3">Title<\/th>/);
  assert.match(manager, /<th scope="col" className="px-3 py-3">Date<\/th>/);
  assert.match(manager, /target="_blank" rel="noopener noreferrer"/);
  assert.match(manager, /Edit/);
  assert.match(manager, /Delete/);
  assert.match(manager, /This removes only the website listing\. It does not delete the PDF from OneDrive or any other storage provider\./);
});

test("forward migration renames the table and preserves legacy values before removing teaching_id", async () => {
  const migration = await readFile(migrationPath, "utf8");
  const titleBackfill = migration.indexOf("set title = teaching.title");
  const teachingDrop = migration.indexOf("drop column teaching_id");
  assert.match(migration, /alter table public\.teaching_printable_pdf_links\s+rename to printable_pdf_links/);
  assert.ok(titleBackfill >= 0 && teachingDrop > titleBackfill);
  assert.match(migration, /add column id uuid not null default gen_random_uuid\(\)/);
  assert.match(migration, /disable trigger teaching_printable_pdf_links_set_updated_at[\s\S]*?set title = teaching\.title[\s\S]*?enable trigger teaching_printable_pdf_links_set_updated_at/);
  assert.match(migration, /alter column title set not null/);
  assert.match(migration, /add constraint printable_pdf_links_pkey primary key \(id\)/);
  assert.doesNotMatch(migration, /drop table/);
  assert.doesNotMatch(migration, /alter table public\.teachings/);
});

test("migration grants public reads while keeping writes admin-only", async () => {
  const migration = await readFile(migrationPath, "utf8");
  assert.match(migration, /create policy "Public can read printable PDF links"[\s\S]*?for select[\s\S]*?to anon, authenticated[\s\S]*?using \(true\)/);
  assert.match(migration, /create policy "Admins manage printable PDF links"[\s\S]*?for all[\s\S]*?to authenticated[\s\S]*?using \(public\.is_authenticated_admin\(\)\)[\s\S]*?with check \(public\.is_authenticated_admin\(\)\)/);
  assert.match(migration, /revoke insert, update, delete on public\.printable_pdf_links from anon/);
});

test("public PDF page is read-only, sorted newest first, and responsive", async () => {
  const page = await readFile("app/pdf/page.tsx", "utf8");
  assert.match(page, /Printable PDF Links/);
  assert.match(page, /https:\/\/theprayerwhiteboard\.com\/pdf/);
  assert.doesNotMatch(page, new RegExp("/" + "PDF"));
  assert.match(page, /\.from\("printable_pdf_links"\)/);
  assert.match(page, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(page, />Title<\/th>/);
  assert.match(page, />Date<\/th>/);
  assert.match(page, />View PDF<\/a>/);
  assert.match(page, /target="_blank" rel="noopener noreferrer"/);
  assert.match(page, /md:hidden/);
  assert.match(page, /hidden border-y[\s\S]*md:block/);
  assert.doesNotMatch(page, /Edit|Delete|Search/);
});

test("shared desktop and mobile navigation receive only the top-menu PDF link", async () => {
  const header = await readFile("app/public-header.tsx", "utf8");
  assert.match(header, /\{ href: "\/pdf", label: "PDF Links" \}/);
  assert.doesNotMatch(header, new RegExp("/" + "PDF"));
  assert.equal((header.match(/navItems\.map/g) ?? []).length, 2);
  assert.match(header, /<nav className="hidden[^"]*lg:flex"/);
  assert.match(header, /<details className="group relative lg:hidden"/);
});

test("teaching and Storehouse queries remain out of the PDF feature", async () => {
  const files = await Promise.all([
    readFile("app/admin/printable-pdfs/page.tsx", "utf8"),
    readFile("app/admin/printable-pdfs/actions.ts", "utf8"),
    readFile("app/admin/printable-pdfs/printable-pdf-form.tsx", "utf8"),
    readFile("app/pdf/page.tsx", "utf8"),
  ]);
  assert.doesNotMatch(files.join("\n"), /from\("teachings"\)|teaching_id|Storehouse/);
});
