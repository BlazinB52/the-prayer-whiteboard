import "server-only";

import { loadConfirmedRecipients } from "@/lib/broadcast-recipients";
import { getEmailCopyrightDisclaimer } from "@/lib/copyright-disclaimers";
import { siteUrl } from "@/lib/email-subscriptions";
import { deliverToRecipients } from "@/lib/send-deliveries";
import { buildTeachingEmail } from "@/lib/teaching-email-content";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const THROTTLE_MS = 120;

export type TeachingBroadcastOutcome =
  | { status: "duplicate" }
  | { status: "not_publishable" }
  | { status: "skipped_language" }
  | { status: "no_broadcast" }
  | { status: "already_complete" }
  | { status: "sent" | "failed" | "incomplete"; recipientCount: number; sentCount: number; failedCount: number; remainingCount: number };

type TeachingRow = { id: string; slug: string; title: string; summary: string | null };

function getClient() {
  const supabase = createServiceRoleClient();
  if (!supabase) throw new Error("Broadcast storage is not configured.");
  return supabase;
}

// Claiming the ledger row first is what makes the broadcast idempotent: the
// unique index on teaching_id rejects a second webhook for the same teaching.
async function claimBroadcast(teachingId: string) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("email_teaching_broadcast_events")
    .insert({ teaching_id: teachingId, status: "sending" })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(`Teaching broadcast could not be claimed: ${error.message}`);
  }
  return data.id as string;
}

// The webhook payload is untrusted input; re-read the row and re-check the
// publish state before mailing anyone.
async function loadPublishableTeaching(teachingId: string) {
  const supabase = getClient();
  const { data: teaching, error } = await supabase
    .from("teachings")
    .select("id, slug, title, summary, status, language")
    .eq("id", teachingId)
    .maybeSingle();
  if (error) throw new Error(`Teaching lookup failed: ${error.message}`);
  if (!teaching || teaching.status !== "published") return { status: "not_publishable" as const };
  // The subscriber list is English; Español teachings are published without an email.
  if (teaching.language !== "en") return { status: "skipped_language" as const };
  return { status: "ok" as const, teaching: teaching as TeachingRow };
}

// Mails every confirmed recipient who has no 'sent' delivery yet, stopping when the time budget is
// spent. Safe to call repeatedly: finished recipients are skipped, so a resume never double-sends.
async function deliver(teaching: TeachingRow, broadcastId: string): Promise<TeachingBroadcastOutcome> {
  const supabase = getClient();
  const recipients = await loadConfirmedRecipients("teachings");

  const base = siteUrl();
  const teachingUrl = `${base}/teachings/${teaching.slug}`;
  const preferencesUrl = `${base}/email-preferences`;
  const copyrightDisclaimer = await getEmailCopyrightDisclaimer(base);

  const run = await deliverToRecipients({
    kind: "teaching",
    ledgerId: broadcastId,
    recipients,
    throttleMs: THROTTLE_MS,
    buildEmail: (recipient) => buildTeachingEmail({
      firstName: recipient.firstName,
      title: teaching.title,
      summary: teaching.summary,
      teachingUrl,
      logoUrl: `${base}/images/whiteboard-sword-logo-with-tagline.png`,
      preferencesUrl,
      copyrightDisclaimer,
    }),
  });

  const finished = run.remainingCount === 0;
  const failedTotal = run.recipientCount - run.sentCount;
  const status = !finished ? "incomplete" : failedTotal && !run.sentCount ? "failed" : "sent";
  const { error: ledgerUpdateError } = await supabase.from("email_teaching_broadcast_events").update({
    status: finished ? status : "sending",
    recipient_count: run.recipientCount,
    // All per-recipient failure detail lives in this one column, so a broadcast
    // costs a single row no matter how large the list is.
    error: finished && failedTotal ? { sentCount: run.sentCount, failedCount: failedTotal, failures: run.failures } : null,
  }).eq("id", broadcastId);
  if (ledgerUpdateError) throw new Error(`Teaching ledger could not be finalized: ${ledgerUpdateError.message}`);

  return { status, recipientCount: run.recipientCount, sentCount: run.sentCount, failedCount: failedTotal, remainingCount: run.remainingCount };
}

export async function broadcastTeaching(teachingId: string): Promise<TeachingBroadcastOutcome> {
  const found = await loadPublishableTeaching(teachingId);
  if (found.status !== "ok") return { status: found.status };

  const broadcastId = await claimBroadcast(teachingId);
  if (!broadcastId) return { status: "duplicate" };

  return deliver(found.teaching, broadcastId);
}

// Finishes a teaching broadcast that was cut off. Mails only subscribers without a 'sent' delivery.
export async function resumeTeachingBroadcast(teachingId: string): Promise<TeachingBroadcastOutcome> {
  const found = await loadPublishableTeaching(teachingId);
  if (found.status !== "ok") return { status: found.status };

  const { data: ledger, error } = await getClient()
    .from("email_teaching_broadcast_events")
    .select("id, status")
    .eq("teaching_id", teachingId)
    .maybeSingle();
  if (error) throw new Error(`Teaching broadcast lookup failed: ${error.message}`);
  if (!ledger) return { status: "no_broadcast" };
  if (ledger.status === "sent") return { status: "already_complete" };

  return deliver(found.teaching, ledger.id as string);
}
