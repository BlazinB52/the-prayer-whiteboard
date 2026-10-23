import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the Back up now button is admin-only and only leaves a request for the computer to answer", async () => {
  const action = await readFile("app/admin/cm/backup-now-action.ts", "utf8");
  assert.match(action, /requireAdmin\(\)/, "a content manager cannot request a backup");
  assert.match(action, /from\("backup_requests"\)\.insert/, "it records a request instead of running anything on Vercel");
  assert.match(action, /23505/, "a second press while one is active is not an error");
  const page = await readFile("app/admin/cm/page.tsx", "utf8");
  assert.match(page, /role === "admin" \? \(\s*<section[\s\S]*<BackupNow/, "the button is shown to the Administrator only");
});

test("the request table is closed to signed-in users and allows one active request", async () => {
  const sql = await readFile("supabase/migrations/20261022000000_backup_requests.sql", "utf8");
  assert.match(sql, /enable row level security/);
  assert.match(sql, /revoke all on public\.backup_requests from anon, authenticated/);
  assert.match(sql, /grant select, insert, update on public\.backup_requests to service_role/);
  assert.match(sql, /unique index[\s\S]*where status in \('pending', 'running'\)/);
});

test("the poller runs the same scheduled backup, claims a request once, and shares a lock with the 12:30 run", async () => {
  const poller = await readFile("scripts/backup-request-poller.mjs", "utf8");
  assert.ok(poller.includes("scripts/scheduled-backup.mjs"), "same backup as the daily one");
  assert.match(poller, /\.eq\("status", "pending"\)\s*\.select/, "the claim only succeeds while the request is still pending");
  assert.match(poller, /BUSY_EXIT_CODE/, "a busy backup puts the request back instead of failing it");
  const scheduled = await readFile("scripts/scheduled-backup.mjs", "utf8");
  assert.match(scheduled, /flag: "wx"/, "the lock is created exclusively");
  assert.match(scheduled, /process\.exit\(BUSY_EXIT_CODE\)/);
  assert.match(scheduled, /BUSY_EXIT_CODE = 2/);
});
