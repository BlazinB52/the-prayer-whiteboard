#!/usr/bin/env node

// Restores a backup produced by scripts/backup-supabase.mjs into a target
// Postgres database and a target Supabase project's Storage — deliberately
// NOT the same project this backup came from, since the whole point is
// disaster recovery if the original Supabase/Vercel project is gone.
//
// The target should be a fresh Supabase project. It restores the "public"
// schema (all site content), Storage, and, only when RESTORE_AUTH=1, the login
// accounts (auth-data.sql: the same user ids and password hashes, so the
// admin_authorizations rows still match their logins). Without RESTORE_AUTH the
// accounts are left alone: sign up the admin again and re-grant access.
//
// A fresh Supabase project gives every new table wide default access for the
// anon, authenticated and service_role roles. The live site is tighter than
// that, and a dump records only the GRANTs, never the REVOKEs that got it
// there. So before the schema loads, the target's default access is set to
// exactly what the backup says it was, and new tables come out the same as live.
//
// Reads target credentials from env vars (not CLI args, so they never show
// up in shell history or a process list):
//   RESTORE_DB_URL        Postgres connection string for the target database
//   RESTORE_SUPABASE_URL  Target project's API URL
//   RESTORE_SUPABASE_KEY  Target project's service-role/secret key
//   RESTORE_AUTH          Optional. Set to 1 to also restore the login accounts.
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
const authDataPath = path.join(backupDir, "auth-data.sql");
const storagePoliciesPath = path.join(backupDir, "storage-policies.sql");
const restoreAuth = process.env.RESTORE_AUTH === "1";
const bucketsPath = path.join(backupDir, "buckets.json");
const contentTypesPath = path.join(backupDir, "storage-content-types.json");
const storageDir = path.join(backupDir, "storage");

for (const requiredPath of [schemaPath, dataPath, bucketsPath]) {
  if (!existsSync(requiredPath)) {
    throw new Error(`This doesn't look like a backup-supabase.mjs folder — missing ${path.basename(requiredPath)}.`);
  }
}

const targetSupabase = createClient(supabaseUrl, supabaseKey, { auth: { autoRefreshToken: false, persistSession: false } });

// The ALTER DEFAULT PRIVILEGES lines the dump wrote for the public schema (at the very end of schema.sql,
// where they would be too late to affect the tables it creates).
function defaultPrivilegeStatements(schemaSql) {
  return schemaSql.split(/\r?\n/).filter((line) => /^ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" /.test(line));
}

// Makes new objects in the target's public schema start with the access the backup's source had, not a fresh
// project's wide defaults. The dump then adds back, with its own GRANT lines, exactly what each object needs.
async function matchDefaultPrivileges(client, schemaSql) {
  const statements = defaultPrivilegeStatements(schemaSql);
  if (!statements.length) {
    console.warn("  WARNING: schema.sql has no default-privilege lines, so the target's own defaults stay as they are.");
    return;
  }
  for (const kind of ["TABLES", "SEQUENCES", "FUNCTIONS"]) {
    await client.query(`ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE ALL ON ${kind} FROM anon, authenticated, service_role`);
  }
  for (const statement of statements) await client.query(statement);
  console.log(`  default access in public set to match the backup (${statements.length} rule(s)).`);
}

// A dump records the GRANTs an object has, never the REVOKEs that took access away. A table the live site locked
// down completely (no anon or authenticated access at all) therefore comes back with whatever the target's
// defaults gave it. So once the schema is loaded, every table and view loses all access for the three API
// roles, and the backup's own GRANT lines are replayed: each ends up with exactly what the live site had.
async function matchTableAccess(client, schemaSql) {
  await client.query(`do $$ declare r record; begin
    for r in select c.relname from pg_class c join pg_namespace n on n.oid = c.relnamespace
             where n.nspname = 'public' and c.relkind in ('r', 'p', 'v', 'm') loop
      execute format('revoke all on table public.%I from anon, authenticated, service_role', r.relname);
    end loop; end $$`);
  const grants = schemaSql.split(/\r?\n/).filter((line) => /^GRANT .* ON TABLE "public"\./.test(line));
  for (const grant of grants) await client.query(grant);
  console.log(`  table access reset to match the backup (${grants.length} grant(s) replayed).`);
}

async function restoreDatabase() {
  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();
  try {
    const schemaSql = await readFile(schemaPath, "utf8");
    console.log("Setting default access to match the backup ...");
    await matchDefaultPrivileges(client, schemaSql);
    console.log(`Restoring schema from ${schemaPath} ...`);
    await client.query(schemaSql);
    await matchTableAccess(client, schemaSql);

    // The rules that let a signed-in admin upload and delete files. They sit on storage.objects and call
    // functions that schema.sql just created, so they go in now. Backups made before this file existed lack it.
    if (existsSync(storagePoliciesPath)) {
      console.log(`Restoring storage access rules from ${storagePoliciesPath} ...`);
      await client.query(await readFile(storagePoliciesPath, "utf8"));
    } else {
      console.warn("  WARNING: this backup has no storage-policies.sql (it was made before that file existed).");
      console.warn("  Files will show, but admin uploads and deletes will be refused until the storage rules on");
      console.warn("  storage.objects are recreated. They are defined in the supabase/migrations folder of the repo.");
    }

    // Logins go in before the content, since admin_authorizations points at them. Both files start with
    // SET session_replication_role = replica, which is what lets rows load in any order.
    if (restoreAuth) {
      if (!existsSync(authDataPath)) throw new Error("RESTORE_AUTH=1 was set but this backup has no auth-data.sql.");
      console.log(`Restoring login accounts from ${authDataPath} ...`);
      await client.query(await readFile(authDataPath, "utf8"));
    } else if (existsSync(authDataPath)) {
      console.log("Login accounts are NOT restored (set RESTORE_AUTH=1 to restore them).");
    }

    console.log(`Restoring data from ${dataPath} ...`);
    await client.query(await readFile(dataPath, "utf8"));
    await client.query("SET session_replication_role = origin");

    const { rows } = await client.query(
      `select (select count(*) from information_schema.tables where table_schema = 'public' and table_type = 'BASE TABLE')::int as tables,
              (select count(*) from auth.users)::int as logins,
              (select count(*) from public.admin_authorizations a where not exists (select 1 from auth.users u where u.id = a.user_id))::int as unmatched_admins`,
    );
    const { tables, logins, unmatched_admins: unmatchedAdmins } = rows[0];
    console.log(`Database restore complete: ${tables} tables, ${logins} login account(s).`);
    if (unmatchedAdmins > 0) {
      console.warn(`  NOTE: ${unmatchedAdmins} admin_authorizations row(s) have no login yet. Sign up that person in the new project (or restore with RESTORE_AUTH=1).`);
    }
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
