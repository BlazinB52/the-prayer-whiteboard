import "server-only";

import { loadConfirmedRecipients } from "@/lib/broadcast-recipients";
import { siteUrl } from "@/lib/email-subscriptions";
import { isSuppressionRejection, markSubscriberSuppressed } from "@/lib/sender-suppression";
import { buildTeachingEmail } from "@/lib/teaching-email-content";
import { sendSenderTransactionalEmail } from "@/lib/sender-transactional";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const THROTTLE_MS = 120;
const MAX_RECORDED_FAILURES = 25;

export type TeachingBroadcastOutcome =
  | { status: "duplicate" }
  | { status: "not_publishable" }
  | { status: "sent" | "failed"; recipientCount: number; sentCount: number; failedCount: number };

function getClient() {
  const supabase = createServiceRoleClient();
  if (!supabase) throw new Error("Broadcast storage is not configured.");
  return supabase;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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

export async function broadcastTeaching(teachingId: string): Promise<TeachingBroadcastOutcome> {
  const supabase = getClient();

  // The webhook payload is untrusted input; re-read the row and re-check the
  // publish state before mailing anyone.
  const { data: teaching, error: teachingError } = await supabase
    .from("teachings")
    .select("id, slug, title, summary, introduction, status")
    .eq("id", teachingId)
    .maybeSingle();
  if (teachingError) throw new Error(`Teaching lookup failed: ${teachingError.message}`);
  if (!teaching || teaching.status !== "published") return { status: "not_publishable" };

  const broadcastId = await claimBroadcast(teachingId);
  if (!broadcastId) return { status: "duplicate" };

  const recipients = await loadConfirmedRecipients("teachings");
  await supabase.from("email_teaching_broadcast_events").update({ recipient_count: recipients.length }).eq("id", broadcastId);

  const base = siteUrl();
  const teachingUrl = `${base}/teachings/${teaching.slug}`;
  const preferencesUrl = `${base}/email-preferences`;

  let sentCount = 0;
  const failures: { subscriberId: string; reason: string }[] = [];

  for (const recipient of recipients) {
    const email = buildTeachingEmail({
      firstName: recipient.firstName,
      title: teaching.title,
      summary: teaching.summary,
      introduction: teaching.introduction,
      teachingUrl,
      preferencesUrl,
    });

    try {
      const result = await sendSenderTransactionalEmail({
        toEmail: recipient.email,
        toName: recipient.firstName,
        subject: email.subject,
        html: email.html,
        text: email.text,
      });
      if (result.ok) {
        sentCount += 1;
      } else {
        if (failures.length < MAX_RECORDED_FAILURES) failures.push({ subscriberId: recipient.id, reason: result.reason });
        if (isSuppressionRejection(result)) await markSubscriberSuppressed(recipient.id);
      }
    } catch {
      // One bad recipient must not abandon the rest of the list.
      if (failures.length < MAX_RECORDED_FAILURES) failures.push({ subscriberId: recipient.id, reason: "exception" });
    }

    await sleep(THROTTLE_MS);
  }

  const failedCount = recipients.length - sentCount;
  const status = failedCount && !sentCount ? "failed" : "sent";
  await supabase.from("email_teaching_broadcast_events").update({
    status,
    // All per-recipient failure detail lives in this one column, so a broadcast
    // costs a single row no matter how large the list is.
    error: failedCount ? { sentCount, failedCount, failures } : null,
  }).eq("id", broadcastId);

  return { status, recipientCount: recipients.length, sentCount, failedCount };
}
