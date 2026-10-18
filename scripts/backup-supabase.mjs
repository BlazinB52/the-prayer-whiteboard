#!/usr/bin/env node

// Backs up everything in the "public" schema — every teaching, devotional,
// weekly update, and all other site content — plus every actual file in
// every Storage bucket and each bucket's configuration, written to a fresh,
// incrementally-named folder on D:. Pair with scripts/restore-supabase.mjs
// to actually recover from one of these — an untested backup isn't real
// disaster recovery.
//
// The "auth" schema STRUCTURE is deliberately not dumped. Restore-tested
// this: auth/storage schema objects are owned by internal roles
// (supabase_admin, supabase_auth_admin, ...) that only a Supabase-managed
// project provisions correctly — restoring that structure into an arbitrary
// target fails with "must be able to SET ROLE ...". A fresh Supabase
// project already has a correctly configured (empty) auth schema out of the
// box.
//
// The auth DATA (user rows: emails, password hashes, user IDs) IS dumped, to
// auth-data.sql, as a separate optional file. Without it, re-created admin
// and content-manager accounts get new user IDs, so every public table row
// that points at a user (admin_authorizations, etc.) would be orphaned.
// Loading auth-data.sql into a fresh project's existing auth schema keeps the
// original IDs and passwords. restore-supabase.mjs loads it only when
// RESTORE_AUTH=1 is set. This file contains password hashes: keep backup
// folders private.
//
// Each backup folder also gets a RESTORE.md with the restore steps and the
// circular-foreign-key note, so the instructions travel with the files.
//
// This talks directly to the linked production Supabase project over the
// network via the Supabase CLI's `db dump` (which shells out to pg_dump, no
// Docker required) and the Storage API — it does not touch the local dev
// stack (`supabase start`) at all.
//
// Usage: node --env-file=.env.local scripts/backup-supabase.mjs [destinationRoot]
//   destinationRoot defaults to D:\SupabaseBackups

import { execSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseQueryRows } from "./lib/query-output.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");

const destinationRoot = process.argv[2] ?? "D:\\SupabaseBackups";
const STORAGE_LIST_PAGE_SIZE = 100;

// .cmd files on Windows (like npx) can only be launched through a shell —
// this is an OS constraint, not a Node.js choice. Passing an args array
// together with shell:true triggers Node's DEP0190 deprecation warning (and
// may become an error in a future Node version), so the CLI is run with a
// single pre-built command string instead (see runSupabase below). That
// means destinationRoot (the one argv-derived value that flows into the
// command, via the dump file paths) must be checked for shell metacharacters
// first; paths are also wrapped in double quotes so spaces are safe.
function assertSafePathArgument(value, label) {
  if (/["'`$&|;<>\n\r^]/.test(value)) {
    throw new Error(`${label} contains characters that aren't safe to pass to the shell: ${value}`);
  }
}
assertSafePathArgument(destinationRoot, "destinationRoot");

const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

function todayStamp() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${year}${month}${day}`;
}

function nextBackupDir(root, stamp) {
  let suffix = 0;
  let candidate = path.join(root, `${stamp}_supabase`);
  while (existsSync(candidate)) {
    suffix += 1;
    candidate = path.join(root, `${stamp}_supabase_${suffix + 1}`);
  }
  return candidate;
}

// `supabase db dump` without --data-only dumps SCHEMA ONLY — confirmed by
// testing locally, dumping before and after inserting a row produced
// byte-identical output. Restoring only that file would silently produce an
// empty (but structurally correct) database, with none of the actual
// teachings content. A real backup needs both a schema pass and a
// --data-only pass, kept as two files so the data-only file can be replayed
// on its own against a target that already has the schema.
function runSupabase(args, outputPath) {
  assertSafePathArgument(outputPath, "output path");
  const command = `npx supabase ${args.join(" ")} -f "${outputPath}"`;
  execSync(command, { stdio: "inherit" });
}

async function dumpDatabase(backupDir) {
  const schemaPath = path.join(backupDir, "schema.sql");
  const dataPath = path.join(backupDir, "data.sql");
  const authDataPath = path.join(backupDir, "auth-data.sql");

  console.log(`Dumping schema (public) to ${schemaPath} ...`);
  runSupabase(["db", "dump", "--linked", "--schema", "public"], schemaPath);

  // The Supabase CLI prints "Dumped schema to ..." for this step too — that's
  // just its wording; this file really is the data.
  console.log(`Dumping data (public) to ${dataPath} ...`);
  runSupabase(["db", "dump", "--linked", "--data-only", "--schema", "public"], dataPath);

  // Login accounts. A failure here shouldn't throw away the content backup
  // above, so it's reported (and sets a non-zero exit code) but isn't fatal.
  let authDumped = false;
  console.log(`Dumping login accounts (auth data) to ${authDataPath} ...`);
  try {
    runSupabase(["db", "dump", "--linked", "--data-only", "--schema", "auth"], authDataPath);
    authDumped = true;
  } catch (error) {
    console.error(`  WARNING: auth data dump failed (content backup is still fine): ${error.message}`);
    process.exitCode = 1;
  }

  console.log("Database dump complete.");
  return { authDumped };
}

// The rules that let a signed-in admin upload, replace and delete files live on storage.objects, in the storage
// schema, so the public-schema dump above never sees them. Without them a restored site shows its files but every
// admin upload or delete is refused. They are read from the catalog and written back as plain CREATE POLICY lines.
// Like the login accounts, a failure here is reported but does not throw away the rest of the backup.
function quoteIdentifier(name) {
  return `"${String(name).replaceAll('"', '""')}"`;
}

async function dumpStorageRules(backupDir) {
  const queryPath = path.join(backupDir, ".storage-rules-query.sql");
  const outputPath = path.join(backupDir, "storage-policies.sql");
  console.log(`Saving storage access rules to ${outputPath} ...`);
  try {
    await writeFile(queryPath, "select policyname, permissive, roles, cmd, qual, with_check from pg_policies where schemaname = 'storage' and tablename = 'objects' order by policyname");
    assertSafePathArgument(queryPath, "query path");
    const raw = execSync(`npx supabase db query --linked -f "${queryPath}" -o json`, { encoding: "utf8", maxBuffer: 20 * 1024 * 1024, stdio: ["ignore", "pipe", "ignore"] });
    const rules = parseQueryRows(raw);
    if (!rules.length) throw new Error("no storage rules were found, which is not expected");

    const statements = rules.map((rule) => {
      const roles = (Array.isArray(rule.roles) ? rule.roles : String(rule.roles).replace(/[{}]/g, "").split(",")).map((role) => (role === "public" ? "public" : quoteIdentifier(role))).join(", ");
      const using = rule.qual ? ` using (${rule.qual})` : "";
      const check = rule.with_check ? ` with check (${rule.with_check})` : "";
      return `drop policy if exists ${quoteIdentifier(rule.policyname)} on storage.objects;\ncreate policy ${quoteIdentifier(rule.policyname)} on storage.objects as ${String(rule.permissive).toLowerCase()} for ${String(rule.cmd).toLowerCase()} to ${roles}${using}${check};`;
    });
    await writeFile(outputPath, `-- Access rules on storage.objects, saved ${new Date().toISOString()}.\n-- They call functions in the public schema, so load this after schema.sql.\nset search_path = public, pg_catalog;\n\n${statements.join("\n\n")}\n`);
    console.log(`  ${rules.length} storage rule(s) saved.`);
    return true;
  } catch (error) {
    console.error(`  WARNING: storage rules were not saved (the rest of the backup is fine): ${error.message}`);
    process.exitCode = 1;
    return false;
  } finally {
    await rm(queryPath, { force: true });
  }
}

function restoreInstructions(backupDir, authDumped) {
  return `# Restoring this backup

Made by scripts/backup-supabase.mjs on ${new Date().toString()}.

## Files

- schema.sql: structure of the public schema (tables, policies, functions)
- data.sql: all site content in the public schema
- ${authDumped ? "auth-data.sql: login accounts (emails, password hashes, user IDs). **Keep this folder private.**" : "auth-data.sql: NOT present. The auth dump failed during this backup."}
- buckets.json, storage-content-types.json, storage/: Storage bucket settings and files
- manifest.json: what was backed up and when

## Restore into a fresh Supabase project

From the PrayerWhiteboard folder (PowerShell):

    $env:RESTORE_DB_URL = "<target Postgres connection string>"
    $env:RESTORE_SUPABASE_URL = "<target project API URL>"
    $env:RESTORE_SUPABASE_KEY = "<target project secret key>"
    $env:RESTORE_AUTH = "1"   # optional: also restore login accounts
    node scripts/restore-supabase.mjs "${backupDir}"

That loads schema.sql, then storage-policies.sql, then (with RESTORE_AUTH=1)
auth-data.sql, then data.sql, then recreates the buckets and uploads the files.

## Circular foreign keys

teachings, teaching_devotionals and chalkboard_assets reference each other,
so no row order satisfies every foreign key while loading. pg_dump warns
about this on every backup. That's expected and the backup is complete.

data.sql and auth-data.sql each begin with
\`SET session_replication_role = replica;\` (this turns off foreign-key and
trigger checks for that connection), and restore-supabase.mjs loads them in one
connection and sets \`session_replication_role = origin;\` afterward. If you ever
load these files by hand (psql, SQL editor), do the same around them.

## Who can touch which table

A fresh Supabase project gives every new table wide default access for the
anon, authenticated and service_role roles, and a dump records only the GRANTs,
never the REVOKEs that made the live site tighter. restore-supabase.mjs sets the
default access to what schema.sql says before it creates any table, so the
restored tables match the live site. If you ever load schema.sql by hand, run
the \`ALTER DEFAULT PRIVILEGES\` lines at the bottom of it first.

## Storage access rules

storage-policies.sql holds the rules on storage.objects that let a signed-in admin
upload, replace and delete files. They live outside the public schema, so schema.sql
does not contain them. Without them a restored site shows its files, but admin
uploads and deletes are refused. restore-supabase.mjs loads the file after the schema.

## Login accounts

With RESTORE_AUTH=1, the original admin and content-manager accounts come back
with the same passwords and user IDs, so admin_authorizations rows still
match. Without it, sign up the admin account(s) again in the new project and
re-grant access, since the old user IDs won't exist there.
`;
}

async function listAllObjects(bucket, prefix = "") {
  const results = [];
  let offset = 0;

  while (true) {
    const { data, error } = await supabase.storage
      .from(bucket)
      .list(prefix, { limit: STORAGE_LIST_PAGE_SIZE, offset, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`Could not list "${bucket}/${prefix}": ${error.message}`);

    for (const entry of data ?? []) {
      const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.id === null) {
        // A null id means this entry is a "folder" placeholder, not a file.
        results.push(...(await listAllObjects(bucket, fullPath)));
      } else {
        results.push(fullPath);
      }
    }

    if ((data ?? []).length < STORAGE_LIST_PAGE_SIZE) break;
    offset += STORAGE_LIST_PAGE_SIZE;
  }

  return results;
}

async function downloadBucket(bucket, backupDir, contentTypes) {
  const objectPaths = await listAllObjects(bucket);
  console.log(`  ${bucket}: ${objectPaths.length} file(s)`);

  let totalBytes = 0;
  let failures = 0;

  for (const objectPath of objectPaths) {
    const { data, error } = await supabase.storage.from(bucket).download(objectPath);
    if (error || !data) {
      console.error(`    FAILED to download ${bucket}/${objectPath}: ${error?.message ?? "unknown error"}`);
      failures += 1;
      continue;
    }

    const destPath = path.join(backupDir, "storage", bucket, ...objectPath.split("/"));
    await mkdir(path.dirname(destPath), { recursive: true });
    const buffer = Buffer.from(await data.arrayBuffer());
    await writeFile(destPath, buffer);
    totalBytes += buffer.byteLength;
    // Restoring needs the real content-type (a .webp re-uploaded as
    // application/octet-stream would break in-browser rendering) — capture
    // it now rather than having the restore script guess from the extension.
    contentTypes[`${bucket}/${objectPath}`] = data.type || "application/octet-stream";
  }

  return { fileCount: objectPaths.length, totalBytes, failures };
}

async function backupStorage(backupDir) {
  console.log("Backing up Storage buckets ...");
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`Could not list storage buckets: ${error.message}`);

  // Bucket settings (public/private, size limit, allowed MIME types) live in
  // Supabase's internal storage schema, not in the public/auth dump above.
  // Persisting them here is what lets a restore recreate each bucket with
  // matching configuration instead of guessing or leaving it wide open.
  const bucketConfigs = (buckets ?? []).map((bucket) => ({
    id: bucket.id,
    public: bucket.public,
    file_size_limit: bucket.file_size_limit,
    allowed_mime_types: bucket.allowed_mime_types,
  }));
  await writeFile(path.join(backupDir, "buckets.json"), JSON.stringify(bucketConfigs, null, 2));

  const contentTypes = {};
  const summary = {};
  for (const bucket of buckets ?? []) {
    summary[bucket.id] = await downloadBucket(bucket.id, backupDir, contentTypes);
  }
  await writeFile(path.join(backupDir, "storage-content-types.json"), JSON.stringify(contentTypes, null, 2));
  return summary;
}

async function main() {
  if (!existsSync(path.parse(destinationRoot).root)) {
    throw new Error(`Destination drive "${path.parse(destinationRoot).root}" does not appear to exist on this machine.`);
  }

  await mkdir(destinationRoot, { recursive: true });
  const backupDir = nextBackupDir(destinationRoot, todayStamp());
  await mkdir(backupDir, { recursive: true });
  console.log(`Backup destination: ${backupDir}\n`);

  const startedAt = new Date();
  const { authDumped } = await dumpDatabase(backupDir);
  const storageRulesSaved = await dumpStorageRules(backupDir);
  const storageSummary = await backupStorage(backupDir);
  const finishedAt = new Date();

  const manifest = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSeconds: Math.round((finishedAt - startedAt) / 1000),
    databaseSchema: "schema.sql",
    databaseData: "data.sql",
    authData: authDumped ? "auth-data.sql" : null,
    storageRules: storageRulesSaved ? "storage-policies.sql" : null,
    restoreInstructions: "RESTORE.md",
    bucketConfigs: "buckets.json",
    storageContentTypes: "storage-content-types.json",
    storage: storageSummary,
  };
  await writeFile(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2));
  await writeFile(path.join(backupDir, "RESTORE.md"), restoreInstructions(backupDir, authDumped));

  const totalFiles = Object.values(storageSummary).reduce((sum, b) => sum + b.fileCount, 0);
  const totalFailures = Object.values(storageSummary).reduce((sum, b) => sum + b.failures, 0);
  const totalBytes = Object.values(storageSummary).reduce((sum, b) => sum + b.totalBytes, 0);

  console.log(`\nBackup complete in ${manifest.durationSeconds}s: ${totalFiles} storage file(s), ${(totalBytes / 1024 / 1024).toFixed(2)} MiB.`);
  if (totalFailures > 0) {
    console.error(`${totalFailures} storage file(s) failed to download — see log above.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nBackup failed: ${error.message}`);
  process.exitCode = 1;
});
