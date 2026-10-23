#!/usr/bin/env node

// Answers the "Back up now" button on /admin/cm (see supabase/migrations/20261022000000_backup_requests.sql). Windows Task
// Scheduler starts this every minute (scripts/install-backup-request-task.ps1). It looks for a pending request, and if there
// is one runs the same scripts/scheduled-backup.mjs that runs at 12:30 PM, then records on the request how it went.
//
// Usage: node --env-file=.env.local scripts/backup-request-poller.mjs

import { createClient } from "@supabase/supabase-js";
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
// scheduled-backup.mjs exits with this when another backup (the 12:30 PM one, say) is already running.
const BUSY_EXIT_CODE = 2;
// A request left "running" this long was abandoned by a crash or a shutdown; it must not block the button forever.
const STALE_RUNNING_MS = 2 * 60 * 60 * 1000;

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY;
if (!url || !key) throw new Error("NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
const supabase = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });

async function main() {
  const stale = new Date(Date.now() - STALE_RUNNING_MS).toISOString();
  await supabase
    .from("backup_requests")
    .update({ status: "failed", finished_at: new Date().toISOString(), message: "The computer stopped before the backup finished." })
    .eq("status", "running")
    .lt("started_at", stale);

  const { data: waiting, error } = await supabase.from("backup_requests").select("id").eq("status", "pending").order("requested_at").limit(1);
  if (error) throw error;
  if (!waiting?.length) return;
  const id = waiting[0].id;

  // Claim it: only one poller can flip pending to running.
  const { data: claimed, error: claimError } = await supabase
    .from("backup_requests")
    .update({ status: "running", started_at: new Date().toISOString() })
    .eq("id", id)
    .eq("status", "pending")
    .select("id");
  if (claimError) throw claimError;
  if (!claimed?.length) return;

  const result = spawnSync(process.execPath, ["scripts/scheduled-backup.mjs"], { cwd: repoRoot, encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });

  if (result.status === BUSY_EXIT_CODE) {
    // Put it back; the next minute's run tries again once the other backup has finished.
    await supabase.from("backup_requests").update({ status: "pending", started_at: null }).eq("id", id);
    return;
  }

  const detail = String(result.stdout ?? "").trim().split(/\r?\n/).filter(Boolean).slice(-2).join(" | ");
  const worked = result.status === 0;
  await supabase
    .from("backup_requests")
    .update({ status: worked ? "done" : "failed", finished_at: new Date().toISOString(), message: worked ? null : detail.slice(0, 500) || `The backup stopped with code ${result.status}.` })
    .eq("id", id);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
