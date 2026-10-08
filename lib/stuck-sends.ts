import "server-only";

import { resumeDevotionalBroadcast } from "@/lib/devotional-send";
import { sendSenderTransactionalEmail } from "@/lib/sender-transactional";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import { resumeTeachingBroadcast } from "@/lib/teaching-broadcast";
import { resumeWeeklyUpdateBroadcast } from "@/lib/weekly-update-broadcast";

// A send is only called stuck once it has been 'sending' this long: a healthy send finishes, or hands
// itself on, within a minute or two.
const STUCK_AFTER_MS = 10 * 60 * 1000;
// A devotional day is only worth finishing the same day it was due.
const DEVOTIONAL_RESUME_WINDOW_MS = 30 * 60 * 60 * 1000;
// Stop starting new resumes once this much of the request has gone, leaving room for the 40s send.
const LEG_BUDGET_MS = 15_000;

type SendKind = "weekly update" | "teaching" | "devotional";
type StuckSend = { kind: SendKind; ledgerId: string; refId: string; createdAt: string };

export type StuckSendsResult = {
  resumed: { kind: SendKind; ledgerId: string; status: string }[];
  // True when another request is needed to carry on (a send ran out of time, or time ran out here).
  continueAfter: boolean;
  problems: string[];
};

function getClient() {
  const supabase = createServiceRoleClient();
  if (!supabase) throw new Error("Send storage is not configured.");
  return supabase;
}

async function findStuckSends(now: Date): Promise<StuckSend[]> {
  const supabase = getClient();
  const before = new Date(now.getTime() - STUCK_AFTER_MS).toISOString();
  const [weekly, teaching, devotional] = await Promise.all([
    supabase.from("email_broadcast_events").select("id, weekly_update_id, created_at").eq("status", "sending").lt("created_at", before),
    supabase.from("email_teaching_broadcast_events").select("id, teaching_id, created_at").eq("status", "sending").lt("created_at", before),
    supabase.from("email_devotional_broadcast_ledger").select("id, created_at").eq("status", "sending").lt("created_at", before),
  ]);
  const found: StuckSend[] = [
    ...(weekly.data ?? []).map((row) => ({ kind: "weekly update" as const, ledgerId: row.id as string, refId: row.weekly_update_id as string, createdAt: row.created_at as string })),
    ...(teaching.data ?? []).map((row) => ({ kind: "teaching" as const, ledgerId: row.id as string, refId: row.teaching_id as string, createdAt: row.created_at as string })),
    ...(devotional.data ?? []).map((row) => ({ kind: "devotional" as const, ledgerId: row.id as string, refId: row.id as string, createdAt: row.created_at as string })),
  ];
  return found.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

// Sends that finished badly or not at all in the last two days, for the alert email.
async function findProblems(now: Date): Promise<string[]> {
  const supabase = getClient();
  const since = new Date(now.getTime() - 48 * 60 * 60 * 1000).toISOString();
  const stuckBefore = new Date(now.getTime() - 2 * 60 * 60 * 1000).toISOString();
  const problems: string[] = [];

  const [weekly, teaching, devotional] = await Promise.all([
    supabase.from("email_broadcast_events").select("status, sent_count, recipient_count, created_at").gte("created_at", since).neq("status", "sent"),
    supabase.from("email_teaching_broadcast_events").select("status, recipient_count, created_at").gte("created_at", since).neq("status", "sent"),
    supabase.from("email_devotional_broadcast_ledger").select("status, day_number, recipient_count, created_at").gte("created_at", since).neq("status", "sent"),
  ]);
  const describe = (kind: string, row: { status: string; created_at: string }, extra = "") => {
    const stuck = row.status === "sending" && row.created_at < stuckBefore;
    if (row.status === "sending" && !stuck) return;
    problems.push(`${kind}${extra} started ${row.created_at.slice(0, 16).replace("T", " ")} UTC is ${stuck ? "still stuck on sending" : row.status}.`);
  };
  for (const row of weekly.data ?? []) describe("Weekly update", row as never, ` (${row.sent_count} of ${row.recipient_count} sent)`);
  for (const row of teaching.data ?? []) describe("Teaching email", row as never);
  for (const row of devotional.data ?? []) describe("Devotional", row as never, ` day ${row.day_number}`);
  return problems;
}

async function resumeOne(send: StuckSend, now: Date): Promise<string> {
  if (send.kind === "weekly update") return (await resumeWeeklyUpdateBroadcast(send.refId)).status;
  if (send.kind === "teaching") return (await resumeTeachingBroadcast(send.refId)).status;
  // An old devotional day is not mailed late; it is left for the alert instead.
  if (now.getTime() - new Date(send.createdAt).getTime() > DEVOTIONAL_RESUME_WINDOW_MS) return "too_old";
  return (await resumeDevotionalBroadcast(send.ledgerId)).status;
}

// Finishes sends that were cut off and never picked back up. Resuming only mails subscribers who have
// no 'sent' record, so it cannot double-send, and sends from before per-recipient records existed are
// refused by their own resume. Runs as the daily safety net and chains itself while there is work.
export async function finishStuckSends(now = new Date()): Promise<StuckSendsResult> {
  const startedAt = Date.now();
  const resumed: StuckSendsResult["resumed"] = [];
  let continueAfter = false;

  for (const send of await findStuckSends(now)) {
    if (Date.now() - startedAt > LEG_BUDGET_MS) {
      continueAfter = true;
      break;
    }
    let status: string;
    try {
      status = await resumeOne(send, now);
    } catch {
      status = "error";
    }
    resumed.push({ kind: send.kind, ledgerId: send.ledgerId, status });
    if (status === "incomplete") {
      continueAfter = true;
      break;
    }
  }

  return { resumed, continueAfter, problems: continueAfter ? [] : await findProblems(now) };
}

// Tells the administrator when a send still needs attention after the safety net has had its go.
export async function sendProblemAlert(problems: string[]) {
  const to = (process.env.ADMIN_ALERT_EMAIL ?? "").trim();
  if (!to || !problems.length) return { sent: false as const };
  const text = `These emails need a look:\n\n${problems.map((line) => `- ${line}`).join("\n")}\n\nOpen the admin page for the content and use "Finish sending to the rest" where it is shown.`;
  const html = `<p>These emails need a look:</p><ul>${problems.map((line) => `<li>${line.replace(/</g, "&lt;")}</li>`).join("")}</ul><p>Open the admin page for the content and use “Finish sending to the rest” where it is shown.</p>`;
  const result = await sendSenderTransactionalEmail({ toEmail: to, subject: "Prayer Whiteboard: an email send needs attention", html, text });
  return { sent: result.ok };
}
