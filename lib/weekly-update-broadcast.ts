import "server-only";

import { loadConfirmedRecipients } from "@/lib/broadcast-recipients";
import { siteUrl } from "@/lib/email-subscriptions";
import { buildWeeklyUpdateEmail } from "@/lib/weekly-update-email-content";
import { sendSenderTransactionalEmail } from "@/lib/sender-transactional";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const THROTTLE_MS = 120;
const MAX_RECORDED_FAILURES = 25;

export type BroadcastOutcome =
  | { status: "duplicate" }
  | { status: "not_publishable" }
  | { status: "sent" | "partial" | "failed"; recipientCount: number; sentCount: number; failedCount: number };

function getClient() {
  const supabase = createServiceRoleClient();
  if (!supabase) throw new Error("Broadcast storage is not configured.");
  return supabase;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Inserting the ledger row first is what makes the broadcast idempotent: the
// unique index on weekly_update_id rejects a second webhook for the same update.
async function claimBroadcast(weeklyUpdateId: string) {
  const supabase = getClient();
  const { data, error } = await supabase
    .from("email_broadcast_events")
    .insert({ weekly_update_id: weeklyUpdateId, status: "sending" })
    .select("id")
    .single();
  if (error) {
    if (error.code === "23505") return null;
    throw new Error(`Broadcast could not be claimed: ${error.message}`);
  }
  return data.id as string;
}

export async function broadcastWeeklyUpdate(weeklyUpdateId: string): Promise<BroadcastOutcome> {
  const supabase = getClient();

  // The webhook payload is untrusted input; re-read the row and re-check the
  // publish state before mailing anyone.
  const { data: update, error: updateError } = await supabase
    .from("weekly_updates")
    .select("id, title, body_markdown, converted_content, status, is_current")
    .eq("id", weeklyUpdateId)
    .maybeSingle();
  if (updateError) throw new Error(`Weekly update lookup failed: ${updateError.message}`);
  if (!update || update.status !== "published" || update.is_current !== true) return { status: "not_publishable" };

  const broadcastId = await claimBroadcast(weeklyUpdateId);
  if (!broadcastId) return { status: "duplicate" };

  const recipients = await loadConfirmedRecipients("weekly_updates");
  await supabase.from("email_broadcast_events").update({ recipient_count: recipients.length }).eq("id", broadcastId);

  const base = siteUrl();
  const weeklyUpdateUrl = `${base}/weekly-update`;
  const preferencesUrl = `${base}/email-preferences`;

  let sentCount = 0;
  let failedCount = 0;
  const failures: { subscriberId: string; reason: string }[] = [];

  for (const recipient of recipients) {
    const email = buildWeeklyUpdateEmail({
      firstName: recipient.firstName,
      title: update.title,
      bodyMarkdown: update.body_markdown,
      convertedContent: update.converted_content,
      weeklyUpdateUrl,
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
        failedCount += 1;
        if (failures.length < MAX_RECORDED_FAILURES) failures.push({ subscriberId: recipient.id, reason: result.reason });
      }
    } catch {
      // One bad recipient must not abandon the rest of the list.
      failedCount += 1;
      if (failures.length < MAX_RECORDED_FAILURES) failures.push({ subscriberId: recipient.id, reason: "exception" });
    }

    await sleep(THROTTLE_MS);
  }

  const status = failedCount === 0 ? "sent" : sentCount ? "partial" : "failed";
  await supabase.from("email_broadcast_events").update({
    status,
    sent_count: sentCount,
    failed_count: failedCount,
    error: failedCount ? `${failedCount} recipient(s) failed.` : null,
    metadata: { title: update.title, failures },
  }).eq("id", broadcastId);

  return { status, recipientCount: recipients.length, sentCount, failedCount };
}
