#!/usr/bin/env node

// The unattended backup, started by Windows Task Scheduler (see scripts/BACKUP_README.md). It makes three kinds of backup:
//
//   Supabase       scripts/backup-supabase.mjs: the database, login accounts, storage rules and every stored file.
//   Project files  a copy of this project folder, made by PrayerWhiteboard_Backup_Timestamped.bat (next to the repo).
//   Prayer Group   a copy of the Prayer Group files, made by the same .bat.
//
// Each goes first into a folder on the computer's own disk, so it works with no drive plugged in. If the flash drive is in
// (D:), the recent backups it does not have yet are then copied onto it. The drive is swapped out often, so every run
// catches a newly inserted drive up, not just with the newest backup. Finally the oldest backups are removed on each side.
//
// Every run writes lines to backup-log.txt. The backups hold login password hashes and the project's secret keys, so they
// stay on this computer and on the flash drive, and are not put in a synced folder.
//
// Usage: node scripts/scheduled-backup.mjs

import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { foldersToPrune, freeFolderName, newestFolders, SUPABASE_BACKUPS, timestampedBackups } from "./lib/backup-retention.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE_BACKUP_BAT = path.join(repoRoot, "..", "PrayerWhiteboard_Backup_Timestamped.bat");
const FLASH_DRIVE = "D:\\";
const KEEP_LOCAL = 14;
const KEEP_FLASH = 10;

const SUPABASE_LOCAL = path.join(os.homedir(), "SupabaseBackups");
const FILES_LOCAL = path.join(os.homedir(), "FileBackups");
const LOG_FILE = path.join(SUPABASE_LOCAL, "backup-log.txt");

// A backup is finished only once its marker file exists: the Supabase script writes manifest.json as its last step, and the
// .bat writes BACKUP_COMPLETE.txt after a successful copy. A manifest also tells two same-named Supabase backups apart.
const SUPABASE = { label: "Supabase", localRoot: SUPABASE_LOCAL, flashRoot: path.join(FLASH_DRIVE, "SupabaseBackups"), marker: "manifest.json", backups: SUPABASE_BACKUPS, sameNameIsSameBackup: false };
const PROJECT_FILES = { label: "Project files", localRoot: FILES_LOCAL, flashRoot: path.join(FLASH_DRIVE, "FileBackups"), marker: "BACKUP_COMPLETE.txt", backups: timestampedBackups("whiteboard_"), sameNameIsSameBackup: true };
const PRAYER_GROUP_FILES = { label: "Prayer Group files", localRoot: FILES_LOCAL, flashRoot: path.join(FLASH_DRIVE, "FileBackups"), marker: "BACKUP_COMPLETE.txt", backups: timestampedBackups("Prayer_Group_Backup_"), sameNameIsSameBackup: true };
const KINDS = [SUPABASE, PROJECT_FILES, PRAYER_GROUP_FILES];

function log(message) {
  const line = `${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })}  ${message}`;
  console.log(line);
  appendFileSync(LOG_FILE, `${line}\n`);
}

const folders = (root) => (existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name) : []);
const isComplete = (kind, root, name) => existsSync(path.join(root, name, kind.marker));
const completeFolders = (kind, root) => kind.backups.sort(folders(root)).filter((name) => isComplete(kind, root, name));
// What makes a backup the same as one already on the drive.
const identityOf = (kind, root, name) => (kind.sameNameIsSameBackup ? name : readFileSync(path.join(root, name, kind.marker), "utf8"));

// Failing to make one kind must not stop the others, so each step reports whether it worked and the run carries on.
function runSupabaseBackup() {
  const before = new Set(folders(SUPABASE_LOCAL));
  const result = spawnSync(process.execPath, ["--env-file=.env.local", "scripts/backup-supabase.mjs", SUPABASE_LOCAL], { cwd: repoRoot, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  const made = folders(SUPABASE_LOCAL).find((name) => SUPABASE_BACKUPS.matches(name) && !before.has(name));
  if (!made || !isComplete(SUPABASE, SUPABASE_LOCAL, made)) {
    const detail = `${result.stderr ?? ""}${result.error ? String(result.error) : ""}`.trim().split(/\r?\n/).slice(-3).join(" | ");
    log(`SUPABASE BACKUP FAILED. ${detail || `The backup script stopped with code ${result.status}.`}`);
    return { ok: false, made: [] };
  }
  if (result.status === 0) {
    log(`Supabase backup ${made} finished.`);
    return { ok: true, made: [made] };
  }
  log(`Supabase backup ${made} finished with a warning, so some part of it was not saved.`);
  for (const line of String(result.stderr).split(/\r?\n/).filter((text) => text.includes("WARNING"))) log(`  ${line.trim()}`);
  return { ok: false, made: [made] };
}

function runFileBackup() {
  if (!existsSync(FILE_BACKUP_BAT)) {
    log(`FILE BACKUP FAILED. ${FILE_BACKUP_BAT} was not found.`);
    return { ok: false, made: [] };
  }
  const before = new Set(folders(FILES_LOCAL));
  const result = spawnSync("cmd.exe", ["/c", FILE_BACKUP_BAT, FILES_LOCAL, "quiet"], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  const made = folders(FILES_LOCAL).filter((name) => !before.has(name));
  const whole = made.filter((name) => [PROJECT_FILES, PRAYER_GROUP_FILES].some((kind) => kind.backups.matches(name) && isComplete(kind, FILES_LOCAL, name)));
  if (result.status !== 0 || whole.length !== 2) {
    const detail = String(result.stdout).trim().split(/\r?\n/).filter(Boolean).slice(-3).join(" | ");
    log(`FILE BACKUP FAILED (code ${result.status}). ${detail}`);
    return { ok: false, made };
  }
  log(`File backups ${whole.join(" and ")} finished.`);
  return { ok: true, made };
}

// Copied under a temporary name and renamed when whole, so a drive pulled out mid-copy never leaves a half backup
// that looks finished.
function copyToFlash(kind, name, targetName) {
  const partial = path.join(kind.flashRoot, `${targetName}.partial`);
  rmSync(partial, { recursive: true, force: true });
  cpSync(path.join(kind.localRoot, name), partial, { recursive: true });
  renameSync(partial, path.join(kind.flashRoot, targetName));
}

function syncFlash(kind) {
  mkdirSync(kind.flashRoot, { recursive: true });
  for (const name of newestFolders(completeFolders(kind, kind.localRoot), KEEP_FLASH, kind.backups)) {
    const onFlash = folders(kind.flashRoot);
    const identity = identityOf(kind, kind.localRoot, name);
    if (onFlash.some((existing) => kind.backups.matches(existing) && isComplete(kind, kind.flashRoot, existing) && identityOf(kind, kind.flashRoot, existing) === identity)) continue;
    const targetName = kind.sameNameIsSameBackup ? name : freeFolderName(name, onFlash);
    copyToFlash(kind, name, targetName);
    log(`Copied ${name} to ${path.join(kind.flashRoot, targetName)}.`);
  }
  for (const entry of folders(kind.flashRoot).filter((name) => name.endsWith(".partial"))) rmSync(path.join(kind.flashRoot, entry), { recursive: true, force: true });
  for (const name of foldersToPrune(folders(kind.flashRoot), KEEP_FLASH, kind.backups)) {
    rmSync(path.join(kind.flashRoot, name), { recursive: true, force: true });
    log(`Removed the oldest flash drive backup ${name}.`);
  }
}

function pruneLocal(kind, justMade) {
  // An unfinished folder from an earlier failed run is no use to anyone; one made in this run stays, for the log's sake.
  for (const name of kind.backups.sort(folders(kind.localRoot))) {
    if (!justMade.includes(name) && !isComplete(kind, kind.localRoot, name)) rmSync(path.join(kind.localRoot, name), { recursive: true, force: true });
  }
  for (const name of foldersToPrune(folders(kind.localRoot), KEEP_LOCAL, kind.backups)) {
    rmSync(path.join(kind.localRoot, name), { recursive: true, force: true });
    log(`Removed the oldest local backup ${name}.`);
  }
}

mkdirSync(SUPABASE_LOCAL, { recursive: true });
mkdirSync(FILES_LOCAL, { recursive: true });
const supabase = runSupabaseBackup();
const files = runFileBackup();
let allWorked = supabase.ok && files.ok;

if (existsSync(FLASH_DRIVE)) {
  for (const kind of KINDS) {
    try {
      syncFlash(kind);
    } catch (error) {
      log(`The ${kind.label} copy to the flash drive failed: ${error instanceof Error ? error.message : String(error)}. The backup on this computer is fine.`);
      allWorked = false;
    }
  }
} else {
  log("Flash drive D: is not plugged in. Skipped the copy; the next run with it in will catch it up.");
}
for (const kind of KINDS) pruneLocal(kind, kind === SUPABASE ? supabase.made : files.made);
if (!allWorked) process.exitCode = 1;
