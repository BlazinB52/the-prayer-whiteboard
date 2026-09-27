#!/usr/bin/env node

// Restores a backup produced by scripts/backup-supabase.mjs into a target
// Postgres database and a target Supabase project's Storage — deliberately
// NOT the same project this backup came from, since the whole point is
// disaster recovery if the original Supabase/Vercel project is gone.
//
// The target should be a fresh Supabase project. This only restores the
// "public" schema (all site content) and Storage — not admin login, which
// a fresh project already has an empty, correctly-configured copy of.
// Recreate your admin account there via Supabase's normal signup flow after
// restoring content.
//
// Reads target credentials from env vars (not CLI args, so they never show
// up in shell history or a process list):
//   RESTORE_DB_URL        Postgres connection string for the target database
//   RESTORE_SUPABASE_URL  Target project's API URL
//   RESTORE_SUPABASE_KEY  Target project's service-role/secret key
//
// Usage: RESTORE_DB_URL=... RESTORE_SUPABASE_URL=... RESTORE_SUPABASE_KEY=... \
//          node scripts/restore-supabase.mjs <backupFolder>

import { createClient } from "@supabase/supabase-js";
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import pg from "pg";

const backupDir = process.argv[2];
if (!backupDir) throw new Error("Usage: node scripts/restore-supabase.mjs <backupFolder>");
if (!existsSync(backupDir)) throw new Error(`Backup folder does not exist: ${backupDir}`);

const dbUrl = process.env.RESTORE_DB_URL;
const supabaseUrl = process.env.RESTORE_SUPABASE_URL;
const supabaseKey = process.env.RESTORE_SUPABASE_KEY;
if (!dbUrl || !supabaseUrl || !supabaseKey) {
  throw new Error("RESTORE_DB_URL, RESTORE_SUPABASE_URL, and RESTORE_SUPABASE_KEY are all required.");
}

const schemaPath = path.join(backupDir, "schema.sql");
const dataPath = path.join(backupDir, "data.sql");
const bucketsPath = path.join(backupDir, "buckets.json");
const contentTypesPath = path.join(backupDir, "storage-content-types.json");
const storageDir = path.join(backupDir, "storage");

for (const requiredPath of [schemaPath, dataPath, bucketsPath]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`This doesn't look like a backup-supabase.mjs folder — missing ${path.basename(requiredPath)}.`);
  }
}

const targetSupabase = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });

async function restoreDatabase() {
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    console.log(`Restoring schema from ${schemaPath} ...`);
    await client.query(await readFile(schemaPath, "utf8"));
    console.log(`Restoring data from ${dataPath} ...`);
    await client.query(await readFile(dataPath, "utf8"));
    console.log("Database restore complete.");
  } finally {
    await client.end();
  }
}

async function restoreBuckets() {
  const bucketConfigs = JSON.parse(await readFile(bucketsPath, "utf8"));
  console.log(`Recreating ${bucketConfigs.length} bucket(s) ...`);

  for (const bucket of bucketConfigs) {
    const { error } = await targetSupabase.storage.createBucket(bucket.id, {
      public: bucket.public,
      fileSizeLimit: bucket.file_size_limit ?? undefined,
      allowedMimeTypes: bucket.allowed_mime_types ?? undefined,
    });
    if (error && !/already exists/i.test(error.message)) {
      throw new Error(`Could not create bucket "${bucket.id}": ${error.message}`);
    }
    console.log(`  ${bucket.id}${error ? " (already existed)" : ""}`);
  }

  return bucketConfigs.map((bucket) => bucket.id);
}

async function walkFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await walkFiles(fullPath)));
    } else {
      files.push(fullPath);
    }
  }
  return files;
}

async function restoreStorageFiles(bucketIds) {
  if (!existsSync(storageDir)) {
    console.log("No storage/ folder in this backup — skipping file restore.");
    return { uploaded: 0, failures: 0 };
  }

  const contentTypes = existsSync(contentTypesPath) ? JSON.parse(await readFile(contentTypesPath, "utf8")) : {};

  let uploaded = 0;
  let failures = 0;

  for (const bucketId of bucketIds) {
    const bucketDir = path.join(storageDir, bucketId);
    if (!existsSync(bucketDir)) continue;

    const files = await walkFiles(bucketDir);
    console.log(`  ${bucketId}: uploading ${files.length} file(s) ...`);

    for (const filePath of files) {
      const relativePath = path.relative(bucketDir, filePath).split(path.sep).join("/");
      const buffer = await readFile(filePath);
      const contentType = contentTypes[`${bucketId}/${relativePath}`] ?? "application/octet-stream";

      const { error } = await targetSupabase.storage.from(bucketId).upload(relativePath, buffer, {
        contentType,
        upsert: true,
      });

      if (error) {
        console.error(`    FAILED to upload ${bucketId}/${relativePath}: ${error.message}`);
        failures += 1;
        continue;
      }
      uploaded += 1;
    }
  }

  return { uploaded, failures };
}

async function main() {
  const startedAt = new Date();
  await restoreDatabase();
  const bucketIds = await restoreBuckets();
  const { uploaded, failures } = await restoreStorageFiles(bucketIds);
  const finishedAt = new Date();

  console.log(`\nRestore complete in ${Math.round((finishedAt - startedAt) / 1000)}s: ${uploaded} storage file(s) uploaded.`);
  if (failures > 0) {
    console.error(`${failures} storage file(s) failed to upload — see log above.`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(`\nRestore failed: ${error.message}`);
  process.exitCode = 1;
});
