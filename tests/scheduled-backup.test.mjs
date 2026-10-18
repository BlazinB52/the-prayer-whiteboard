import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { foldersToPrune, freeFolderName, isBackupFolderName, newestFolders, sortBackupFolders } from "../scripts/lib/backup-retention.mjs";

test("only folders the backup script makes are recognised, and same-day reruns sort after the first", () => {
  assert.ok(isBackupFolderName("20261018_supabase"));
  assert.ok(isBackupFolderName("20261014_supabase_2"));
  for (const other of ["README.md", "20261018_supabase.partial", "20261018", "notes_supabase", "FreeCAD"]) assert.ok(!isBackupFolderName(other), other);
  assert.deepEqual(sortBackupFolders(["20261014_supabase_2", "20261018_supabase", "20261014_supabase", "x", "20261014_supabase_10"]), ["20261014_supabase", "20261014_supabase_2", "20261014_supabase_10", "20261018_supabase"]);
});

test("pruning keeps the newest backups and never names anything that is not a backup", () => {
  const names = ["20261008_supabase", "README.md", "20261001_supabase", "20261011_supabase", "20261014_supabase_2", "20261014_supabase"];
  assert.deepEqual(foldersToPrune(names, 3), ["20261001_supabase", "20261008_supabase"]);
  assert.deepEqual(foldersToPrune(names, 10), []);
  assert.deepEqual(foldersToPrune(names, 0).length, 5);
});

test("a drive is caught up with the newest backups, and a different backup never overwrites one with the same name", () => {
  const onComputer = ["20261011_supabase", "20261014_supabase", "20261017_supabase", "20261018_supabase"];
  assert.deepEqual(newestFolders(onComputer, 2), ["20261017_supabase", "20261018_supabase"]);
  assert.deepEqual(newestFolders(onComputer, 10), onComputer);
  assert.equal(freeFolderName("20261018_supabase", ["20261017_supabase"]), "20261018_supabase");
  assert.equal(freeFolderName("20261018_supabase", ["20261018_supabase"]), "20261018_supabase_2");
  assert.equal(freeFolderName("20261018_supabase", ["20261018_supabase", "20261018_supabase_2"]), "20261018_supabase_3");
  assert.equal(freeFolderName("20261018_supabase_2", ["20261018_supabase", "20261018_supabase_2"]), "20261018_supabase_3");
});

test("the scheduled backup works without the drive, copies whole backups only, and never uses a synced folder", async () => {
  const script = await readFile("scripts/scheduled-backup.mjs", "utf8");
  assert.ok(script.includes("existsSync(FLASH_DRIVE)"), "it checks that the flash drive is there");
  assert.ok(script.includes("Skipped the copy"), "and carries on without it");
  assert.ok(script.includes(".partial"), "a copy is renamed into place only when whole");
  assert.ok(script.includes("identityOf("), "the same Supabase backup is recognised by its manifest, not just its name");
  assert.ok(script.includes('"manifest.json"'), "a backup counts as finished only once its manifest is written");
  assert.doesNotMatch(script, /OneDrive|Documents/i, "the backups hold password hashes, so no synced folder");
  assert.match(script, /process\.exitCode = 1/, "a failed backup ends with a failing exit code so Task Scheduler shows it");
});

test("the storage rules are read whichever way the Supabase CLI answers, so a backup made by hand or by Task Scheduler keeps them", async () => {
  const { parseQueryRows } = await import("../scripts/lib/query-output.mjs");
  const rows = [{ policyname: "a", qual: "(x = '}')" }, { policyname: "b" }];
  // A person, or Task Scheduler, gets a bare array; an AI agent gets an object wrapped in markers.
  assert.deepEqual(parseQueryRows(JSON.stringify(rows, null, 2)), rows);
  assert.deepEqual(parseQueryRows(`{"boundary":"x","rows":${JSON.stringify(rows)},"warning":"untrusted"}`), rows);
  // A notice after the JSON is ignored, and so is anything before it.
  assert.deepEqual(parseQueryRows(`${JSON.stringify(rows)}\nA new version of Supabase CLI is available`), rows);
  assert.deepEqual(parseQueryRows(`Initialising login role...\n${JSON.stringify({ rows })}`), rows);
  assert.deepEqual(parseQueryRows("[]"), []);
  assert.throws(() => parseQueryRows("no json here"));
  const backup = await readFile("scripts/backup-supabase.mjs", "utf8");
  assert.ok(backup.includes("parseQueryRows(raw)"), "the backup script uses it");
});

test("the two kinds of file backup are told apart by name and kept to the newest few, in time order", async () => {
  const { timestampedBackups } = await import("../scripts/lib/backup-retention.mjs");
  const project = timestampedBackups("whiteboard_");
  const group = timestampedBackups("Prayer_Group_Backup_");
  const names = [
    "whiteboard_2026-10-18_14-05-00_abc1234",
    "whiteboard_2026-10-02_18-45-12",
    "whiteboard_2026-10-10_08-00-00_def5678",
    "whiteboard_2026-10-18_14-06-00.partial",
    "Prayer_Group_Backup_2026-10-18_14-05-00",
    "Prayer_Group_Backup_2026-10-02_18-45-12",
    "SupabaseBackups",
    "whiteboard_notes",
  ];
  assert.deepEqual(project.sort(names), ["whiteboard_2026-10-02_18-45-12", "whiteboard_2026-10-10_08-00-00_def5678", "whiteboard_2026-10-18_14-05-00_abc1234"]);
  assert.deepEqual(group.sort(names), ["Prayer_Group_Backup_2026-10-02_18-45-12", "Prayer_Group_Backup_2026-10-18_14-05-00"]);
  assert.deepEqual(foldersToPrune(names, 2, project), ["whiteboard_2026-10-02_18-45-12"]);
  assert.deepEqual(foldersToPrune(names, 1, group), ["Prayer_Group_Backup_2026-10-02_18-45-12"]);
  assert.deepEqual(newestFolders(names, 1, project), ["whiteboard_2026-10-18_14-05-00_abc1234"]);
});

test("the .bat takes a destination and a quiet flag, marks each finished copy, and the scheduled backup runs it", async () => {
  const script = await readFile("scripts/scheduled-backup.mjs", "utf8");
  assert.ok(script.includes("PrayerWhiteboard_Backup_Timestamped.bat"));
  assert.ok(script.includes('FILES_LOCAL, "quiet"'), "runs it with its own folder and without the pause");
  assert.ok(script.includes('"FileBackups"'), "file backups get their own folder on the computer and on the drive");
  assert.ok(script.includes("const KEEP_LOCAL = 14;") && script.includes("const KEEP_FLASH = 10;"), "the same number kept as the Supabase backups");
  assert.ok(script.includes("[SUPABASE, PROJECT_FILES, PRAYER_GROUP_FILES]"), "all three kinds are copied to the drive and pruned");
});
