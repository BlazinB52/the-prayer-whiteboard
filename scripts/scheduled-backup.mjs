#!/usr/bin/env node

// The unattended backup, started by Windows Task Scheduler (see scripts/BACKUP_README.md).
//
//   1. Runs scripts/backup-supabase.mjs into a folder on the computer's own disk, so it works with no drive plugged in.
//   2. If the flash drive is in (D:), copies the backups it does not have yet onto it. The drive is swapped out often, so
//      every run catches a newly inserted drive up with the recent backups, not just the newest one.
//   3. Removes the oldest backups on each side, keeping the most recent ones.
//
// Every run writes a line to backup-log.txt next to the backups. Nothing here is sent anywhere: the backups hold login
// password hashes, so they stay on this computer and on the flash drive, and are not put in a synced folder.
//
// Usage: node scripts/scheduled-backup.mjs

import { spawnSync } from "node:child_process";
import { appendFileSync, cpSync, existsSync, mkdirSync, readdirSync, readFileSync, renameSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { foldersToPrune, freeFolderName, isBackupFolderName, newestFolders } from "./lib/backup-retention.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LOCAL_ROOT = path.join(os.homedir(), "SupabaseBackups");
const FLASH_ROOT = "D:\\SupabaseBackups";
const KEEP_LOCAL = 14;
const KEEP_FLASH = 10;
const LOG_FILE = path.join(LOCAL_ROOT, "backup-log.txt");

function log(message) {
  const line = `${new Date().toLocaleString("en-US", { timeZone: "America/Chicago" })}  ${message}`;
  console.log(line);
  appendFileSync(LOG_FILE, `${line}\n`);
}

const backupFolders = (root) => (existsSync(root) ? readdirSync(root, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name) : []);
// A backup is finished only once manifest.json is written, which is the last thing the backup script does.
const isComplete = (root, name) => existsSync(path.join(root, name, "manifest.json"));

function runBackup() {
  const before = new Set(backupFolders(LOCAL_ROOT));
  const result = spawnSync(process.execPath, ["--env-file=.env.local", "scripts/backup-supabase.mjs", LOCAL_ROOT], { cwd: repoRoot, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });
  const made = backupFolders(LOCAL_ROOT).filter((name) => isBackupFolderName(name) && !before.has(name));
  return { result, made: made[0] ?? null };
}

// The manifest records when the backup started and finished, so two folders with the same manifest are the same backup,
// even under different names.
const manifestOf = (root, name) => (isComplete(root, name) ? readFileSync(path.join(root, name, "manifest.json"), "utf8") : null);

// Copied under a temporary name and renamed when whole, so a drive pulled out mid-copy never leaves a half backup
// that looks finished.
function copyToFlash(name, targetName) {
  const partial = path.join(FLASH_ROOT, `${targetName}.partial`);
  rmSync(partial, { recursive: true, force: true });
  cpSync(path.join(LOCAL_ROOT, name), partial, { recursive: true });
  renameSync(partial, path.join(FLASH_ROOT, targetName));
}

function syncFlash() {
  if (!existsSync("D:\\")) {
    log("Flash drive D: is not plugged in. Skipped the copy; the next run with it in will catch it up.");
    return;
  }
  mkdirSync(FLASH_ROOT, { recursive: true });
  const complete = backupFolders(LOCAL_ROOT).filter((name) => isComplete(LOCAL_ROOT, name));
  for (const name of newestFolders(complete, KEEP_FLASH)) {
    const onFlash = backupFolders(FLASH_ROOT);
    const manifest = manifestOf(LOCAL_ROOT, name);
    if (onFlash.some((existing) => manifestOf(FLASH_ROOT, existing) === manifest)) continue;
    const targetName = freeFolderName(name, onFlash);
    copyToFlash(name, targetName);
    log(`Copied ${name} to ${path.join(FLASH_ROOT, targetName)}.`);
  }
  for (const entry of backupFolders(FLASH_ROOT).filter((name) => name.endsWith(".partial"))) rmSync(path.join(FLASH_ROOT, entry), { recursive: true, force: true });
  for (const name of foldersToPrune(backupFolders(FLASH_ROOT), KEEP_FLASH)) {
    rmSync(path.join(FLASH_ROOT, name), { recursive: true, force: true });
    log(`Removed the oldest flash drive backup ${name}.`);
  }
}

function pruneLocal(newest) {
  // An unfinished folder from an earlier failed run is no use to anyone; the one just made is kept for the log's sake.
  for (const name of backupFolders(LOCAL_ROOT)) {
    if (isBackupFolderName(name) && name !== newest && !isComplete(LOCAL_ROOT, name)) rmSync(path.join(LOCAL_ROOT, name), { recursive: true, force: true });
  }
  for (const name of foldersToPrune(backupFolders(LOCAL_ROOT), KEEP_LOCAL)) {
    rmSync(path.join(LOCAL_ROOT, name), { recursive: true, force: true });
    log(`Removed the oldest local backup ${name}.`);
  }
}

mkdirSync(LOCAL_ROOT, { recursive: true });
const { result, made } = runBackup();
if (!made || !isComplete(LOCAL_ROOT, made)) {
  const detail = `${result.stderr ?? ""}${result.error ? String(result.error) : ""}`.trim().split(/\r?\n/).slice(-3).join(" | ");
  log(`BACKUP FAILED. ${detail || `The backup script stopped with code ${result.status}.`}`);
  process.exit(1);
}
if (result.status === 0) {
  log(`Backup ${made} finished.`);
} else {
  log(`Backup ${made} finished with a warning, so some part of it was not saved.`);
  for (const line of String(result.stderr).split(/\r?\n/).filter((text) => text.includes("WARNING"))) log(`  ${line.trim()}`);
}
try {
  syncFlash();
} catch (error) {
  log(`The copy to the flash drive failed: ${error instanceof Error ? error.message : String(error)}. The backup on this computer is fine.`);
  process.exitCode = 1;
}
pruneLocal(made);
if (process.exitCode !== 1 && result.status !== 0) process.exitCode = 1;
