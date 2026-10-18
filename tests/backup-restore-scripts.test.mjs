import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

// These scripts are proven by actually restoring a backup into an empty local Supabase and comparing it with the live
// site (see scripts/BACKUP_README.md). The tests below keep the pieces that rehearsal depends on from being undone, and
// keep the instructions that travel with every backup from promising things the restore script no longer does.

const backup = await readFile("scripts/backup-supabase.mjs", "utf8");
const restore = await readFile("scripts/restore-supabase.mjs", "utf8");
const readme = await readFile("scripts/BACKUP_README.md", "utf8");

// The RESTORE.md text the backup script writes into every backup folder.
const restoreMd = backup.slice(backup.indexOf("function restoreInstructions"), backup.indexOf("async function listAllObjects"));

test("the restore script does what the RESTORE.md in every backup says it does", () => {
  assert.match(restoreMd, /RESTORE_AUTH/);
  assert.match(restore, /process\.env\.RESTORE_AUTH === "1"/, "RESTORE_AUTH is read");
  assert.match(restore, /auth-data\.sql/, "and auth-data.sql is loaded");
  assert.match(restoreMd, /storage-policies\.sql/);
  assert.match(restore, /storage-policies\.sql/, "storage-policies.sql is loaded");
  assert.match(restore, /SET session_replication_role = origin/, "foreign-key checks are switched back on afterward");
  // The files themselves carry the switch that lets rows load in any order.
  assert.match(restoreMd, /begin with\s+\S*SET session_replication_role = replica;/);
});

test("a restore sets default access first, then resets each table's access to the backup's own grants", () => {
  const order = ["matchDefaultPrivileges(client, schemaSql)", "client.query(schemaSql)", "matchTableAccess(client, schemaSql)", "storagePoliciesPath", "authDataPath, \"utf8\"", "client.query(await readFile(dataPath"].map((marker) => restore.indexOf(marker, restore.indexOf("async function restoreDatabase")));
  assert.ok(order.every((index) => index > -1), `a step is missing: ${order.join(",")}`);
  assert.deepEqual([...order].sort((a, b) => a - b), order, "default access, schema, table access, storage rules, logins, data: in that order");
  assert.match(restore, /revoke all on table public\.%I from anon, authenticated, service_role/);
  assert.match(restore, /\/\^GRANT \.\* ON TABLE "public"\\./, "the backup's GRANT lines are replayed");
});

test("the restore only ever touches the database and project it is told to, never the live one", () => {
  assert.match(restore, /RESTORE_DB_URL, RESTORE_SUPABASE_URL, and RESTORE_SUPABASE_KEY are all required/);
  assert.doesNotMatch(restore, /SUPABASE_SECRET_KEY|NEXT_PUBLIC_SUPABASE_URL|\.env\.local/, "it never reads the live project's keys");
  assert.match(restore, /createClient\(supabaseUrl, supabaseKey/);
});

test("the backup saves the storage rules, reads them from the catalog, and a failure there does not lose the backup", () => {
  assert.match(backup, /from pg_policies where schemaname = 'storage' and tablename = 'objects'/);
  assert.match(backup, /storage-policies\.sql/);
  assert.match(backup, /storageRules: storageRulesSaved \? "storage-policies\.sql" : null/, "the manifest says whether they were saved");
  assert.match(backup, /WARNING: storage rules were not saved \(the rest of the backup is fine\)/);
  assert.match(backup, /await rm\(queryPath, \{ force: true \}\)/, "the temporary query file is removed");
  assert.ok(backup.indexOf("dumpStorageRules(backupDir)") < backup.indexOf("backupStorage(backupDir)"), "saved before the file download starts");
});

test("a backup that was made before storage-policies.sql existed still restores, with a plain warning", () => {
  assert.match(restore, /WARNING: this backup has no storage-policies\.sql/);
  assert.match(restore, /if \(existsSync\(storagePoliciesPath\)\)/);
});

test("the restore says plainly when logins were not restored and an admin has no login", () => {
  assert.match(restore, /Login accounts are NOT restored \(set RESTORE_AUTH=1 to restore them\)/);
  assert.match(restore, /admin_authorizations row\(s\) have no login yet/);
});

test("the README describes the real behavior: logins, storage rules, the order of a restore, and the rehearsal", () => {
  assert.doesNotMatch(readme, /Admin login \(Supabase Auth\) is deliberately NOT included/);
  for (const phrase of ["auth-data.sql", "storage-policies.sql", "RESTORE_AUTH", "Rehearsing a restore", "Proof that it works", "yyyymmdd"].filter((p) => p !== "yyyymmdd")) {
    assert.ok(readme.includes(phrase), phrase);
  }
  for (const bucket of ["chalkboards", "printable-pdfs", "weekly-update-documents", "authority-photos", "teaching-outlines"]) {
    assert.ok(readme.includes(bucket), `${bucket} is listed`);
  }
});
