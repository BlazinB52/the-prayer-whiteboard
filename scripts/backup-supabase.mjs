#!/usr/bin/env node

// Backs up everything in Supabase that isn't already in this git repo or in
// your local daily backup: a full Postgres dump (public + auth schemas) plus
// every actual file in every Storage bucket, written to a fresh,
// incrementally-named folder on D:.
//
// This talks directly to the linked production Supabase project over the
// network via the Supabase CLI's `db dump` (which shells out to pg_dump, no
// Docker required) and the Storage API — it does not touch the local dev
// stack (`supabase start`) at all.
//
// Usage: node --env-file=.env.local scripts/backup-supabase.mjs [destinationRoot]
//   destinationRoot defaults to D:\SupabaseBackups

import { execFileSync } from "node:child_process";
import { createClient } from "@supabase/supabase-js";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");

const destinationRoot = process.argv[2] ?? "D:\\SupabaseBackups";
const STORAGE_LIST_PAGE_SIZE = 100;

// .cmd files on Windows (like the Supabase CLI's npx-resolved binary) can
// only be launched through a shell — this is an OS constraint, not a Node.js
// choice. That means destinationRoot (the one argv-derived value that flows
// into the shell command below, via dbDumpPath) must be checked for shell
// metacharacters first, since shell:true does not escape arguments.
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

async function dumpDatabase(backupDir) {
  const dbDumpPath = path.join(backupDir, "database.sql");
  console.log(`Dumping database (public, auth schemas) to ${dbDumpPath} ...`);
  execFileSync(
    "npx",
    ["supabase", "db", "dump", "--linked", "--schema", "public,auth", "-f", dbDumpPath],
    { stdio: "inherit", shell: true },
  );
  console.log("Database dump complete.");
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

async function downloadBucket(bucket, backupDir) {
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
  }

  return { fileCount: objectPaths.length, totalBytes, failures };
}

async function backupStorage(backupDir) {
  console.log("Backing up Storage buckets ...");
  const { data: buckets, error } = await supabase.storage.listBuckets();
  if (error) throw new Error(`Could not list storage buckets: ${error.message}`);

  const summary = {};
  for (const bucket of buckets ?? []) {
    summary[bucket.id] = await downloadBucket(bucket.id, backupDir);
  }
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
  await dumpDatabase(backupDir);
  const storageSummary = await backupStorage(backupDir);
  const finishedAt = new Date();

  const manifest = {
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    durationSeconds: Math.round((finishedAt - startedAt) / 1000),
    databaseDump: "database.sql",
    storage: storageSummary,
  };
  await writeFile(path.join(backupDir, "manifest.json"), JSON.stringify(manifest, null, 2));

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
