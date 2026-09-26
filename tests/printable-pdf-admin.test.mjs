import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const printablePdf = await import("../lib/printable-pdf-links.ts");
const legacyMigrationPath = "supabase/migrations/20260925020000_refactor_printable_pdf_links.sql";
const storageMigrationPath = "supabase/migrations/20260926000000_add_printable_pdf_storage.sql";

test("printable PDF title validation enforces the admin contract", () => {
  assert.deepEqual(printablePdf.validatePrintablePdfTitle("  Prayer Guide  "), { value: "Prayer Guide" });
  assert.deepEqual(printablePdf.validatePrintablePdfTitle("  "), { error: "Title is required." });
  assert.equal(printablePdf.validatePrintablePdfTitle("x".repeat(201)).error, "Title must be 200 characters or fewer.");
  assert.equal(printablePdf.validatePrintablePdfUrl, undefined);
});

test("storage path helpers build and validate the expected shape", () => {
  const uuid = "0a1b2c3d-4e5f-4a1b-8c2d-0123456789ab";
  assert.equal(printablePdf.printablePdfStoragePath(uuid), `${uuid}.pdf`);
  assert.equal(printablePdf.isValidPrintablePdfStoragePath(`${uuid}.pdf`), true);
  assert.equal(printablePdf.isValidPrintablePdfStoragePath(`${uuid}.PDF`), true);
  assert.equal(printablePdf.isValidPrintablePdfStoragePath("not-a-uuid.pdf"), false);
  assert.equal(printablePdf.isValidPrintablePdfStoragePath(`${uuid}.png`), false);
  assert.equal(printablePdf.isValidPrintablePdfStoragePath("../../etc/passwd"), false);
});

test("magic byte check only accepts a real PDF header", () => {
  const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
  const notPdfBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d]);
  const tooShort = new Uint8Array([0x25, 0x50]);
  assert.equal(printablePdf.isValidPdfMagicBytes(pdfBytes), true);
  assert.equal(printablePdf.isValidPdfMagicBytes(notPdfBytes), false);
  assert.equal(printablePdf.isValidPdfMagicBytes(tooShort), false);
});

test("resolvePrintablePdfHref prefers storage_path over a legacy URL", () => {
  const fakeClient = {
    storage: {
      from(bucket) {
        return {
          getPublicUrl(path) {
            return { data: { publicUrl: `https://example.supabase.co/storage/v1/object/public/${bucket}/${path}` } };
          },
        };
      },
    },
  };

  assert.equal(
    printablePdf.resolvePrintablePdfHref({ storage_path: "abc.pdf", printable_pdf_url: "https://1drv.ms/old" }, fakeClient),
    "https://example.supabase.co/storage/v1/object/public/printable-pdfs/abc.pdf",
  );
  assert.equal(
    printablePdf.resolvePrintablePdfHref({ storage_path: null, printable_pdf_url: "https://1drv.ms/old" }, fakeClient),
    "https://1drv.ms/old",
  );
});

test("admin actions implement the signed-upload, verify, and cleanup flow", async () => {
  const actions = await readFile("app/admin/printable-pdfs/actions.ts", "utf8");
  assert.match(actions, /export async function createPrintablePdfUploadTarget/);
  assert.match(actions, /createSignedUploadUrl\(path\)/);
  assert.match(actions, /export async function cleanupPrintablePdfUpload/);
  assert.match(actions, /isValidPrintablePdfStoragePath\(path\)/);
  assert.match(actions, /headers: \{ Range: "bytes=0-4" \}/);
  assert.doesNotMatch(actions, /storage\.from\([^)]*\)\.download\(/);
  assert.match(actions, /isValidPdfMagicBytes\(/);
  assert.match(actions, /A PDF file is required\./);
  assert.match(actions, /update\.storage_path = storagePath;[\s\S]*?update\.printable_pdf_url = null;/);
  assert.match(actions, /existing\.storage_path && existing\.storage_path !== storagePath/);
  assert.match(actions, /export async function removePrintablePdfLink/);
  assert.match(actions, /existing\?\.storage_path/);
});

test("admin form uploads directly to storage with an immutable cache header", async () => {
  const manager = await readFile("app/admin/printable-pdfs/printable-pdf-form.tsx", "utf8");
  assert.match(manager, /type="file" accept="application\/pdf"/);
  assert.doesNotMatch(manager, /type="url"/);
  assert.match(manager, /createPrintablePdfUploadTarget\(\)/);
  assert.match(manager, /uploadToSignedUrl\(target\.path, target\.token, file as File/);
  assert.match(manager, /cacheControl: "public, max-age=31536000, immutable"/);
  assert.match(manager, /cleanupPrintablePdfUpload\(target\.path\)/);
  assert.match(manager, /cleanupPrintablePdfUpload\(storagePath\)/);
  assert.match(manager, /Choose a PDF file\./);
  assert.match(manager, /Leave blank to keep the current file/);
});

test("admin list warns before deleting a stored file, not just a legacy link", async () => {
  const manager = await readFile("app/admin/printable-pdfs/printable-pdf-form.tsx", "utf8");
  assert.match(manager, /This permanently deletes the stored PDF file as well as the website listing\./);
  assert.match(manager, /This removes only the website listing\. It does not delete the PDF from OneDrive or any other storage provider\./);
  assert.match(manager, /isStorageBacked/);
  assert.match(manager, /Search PDF title/);
  assert.match(manager, /<th scope="col" className="px-3 py-3">Title<\/th>/);
  assert.match(manager, /Edit/);
  assert.match(manager, /Delete/);
});

test("admin and public pages resolve a href instead of trusting the raw URL column", async () => {
  const adminPage = await readFile("app/admin/printable-pdfs/page.tsx", "utf8");
  const publicPage = await readFile("app/pdf/page.tsx", "utf8");
  for (const page of [adminPage, publicPage]) {
    assert.match(page, /select\("id, title, storage_path, printable_pdf_url/);
    assert.match(page, /resolvePrintablePdfHref\(link, supabase\)/);
  }
  assert.match(adminPage, /\.order\("created_at", \{ ascending: false \}\)/);
  assert.match(publicPage, /\.order\("created_at", \{ ascending: false \}\)/);
});

test("new storage migration creates a public bucket and a one-source check", async () => {
  const migration = await readFile(storageMigrationPath, "utf8");
  assert.match(migration, /insert into storage\.buckets[\s\S]*?'printable-pdfs'[\s\S]*?true,[\s\S]*?26214400/);
  assert.match(migration, /array\['application\/pdf'\]/);
  assert.match(migration, /create policy "Admins can manage printable pdf bucket objects"[\s\S]*?public\.is_authenticated_admin\(\)/);
  assert.match(migration, /create policy "Public can read printable pdf bucket objects"[\s\S]*?for select[\s\S]*?using \(bucket_id = 'printable-pdfs'\)/);
  assert.match(migration, /add column storage_path text unique/);
  assert.match(migration, /alter column printable_pdf_url drop not null/);
  assert.match(migration, /check \(num_nonnulls\(storage_path, printable_pdf_url\) = 1\)/);
});

test("forward migration renames the table and preserves legacy values before removing teaching_id", async () => {
  const migration = await readFile(legacyMigrationPath, "utf8");
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

test("legacy migration grants public reads while keeping writes admin-only", async () => {
  const migration = await readFile(legacyMigrationPath, "utf8");
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

test("chalkboard and printable-pdf uuid validation share one pattern", async () => {
  const uuidLib = await import("../lib/uuid.ts");
  const chalkboardPaths = await import("../lib/chalkboard-upload-paths.ts");
  assert.equal(chalkboardPaths.validChalkboardAssetGroupId("0a1b2c3d-4e5f-4a1b-8c2d-0123456789ab"), true);
  assert.equal(uuidLib.isValidUuid("0a1b2c3d-4e5f-4a1b-8c2d-0123456789ab"), true);
  assert.equal(uuidLib.isValidUuid("not-a-uuid"), false);
  const chalkboardSource = await readFile("lib/chalkboard-upload-paths.ts", "utf8");
  assert.match(chalkboardSource, /from "\.\/uuid\.ts"/);
  assert.doesNotMatch(chalkboardSource, /\/\^\[0-9a-f\]\{8\}/);
});
