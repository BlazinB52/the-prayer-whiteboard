import "server-only";

import { loadConfirmedRecipients } from "@/lib/broadcast-recipients";
import { getEmailCopyrightDisclaimer } from "@/lib/copyright-disclaimers";
import { siteUrl } from "@/lib/email-subscriptions";
import { isSuppressionRejection, markSubscriberSuppressed } from "@/lib/sender-suppression";
import { buildWeeklyUpdateEmail } from "@/lib/weekly-update-email-content";
import { sendSenderTransactionalEmail } from "@/lib/sender-transactional";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const THROTTLE_MS = 120;
const MAX_RECORDED_FAILURES = 25;
// The routes are capped at 60s. Stop starting new sends well before that so the ledger is always
// written, then hand the remainder to a follow-up request.
const TIME_BUDGET_MS = 40_000;
// A claim left in 'sending' this long means the request that made it was cut off mid-send.
const STALE_CLAIM_MS = 5 * 60 * 1000;

export type BroadcastOutcome =
  | { status: "duplicate" }
  | { status: "not_publishable" }
  | { status: "no_broadcast" }
  | { status: "already_complete" }
  | { status: "sent" | "partial" | "failed" | "incomplete"; recipientCount: number; sentCount: number; failedCount: number; remainingCount: number };

type WeeklyUpdateRow = { id: string; title: string; body_markdown: string; converted_content: unknown };

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

// The webhook payload is untrusted input; re-read the row and re-check the
// publish state before mailing anyone.
async function loadPublishableUpdate(weeklyUpdateId: string) {
  const supabase = getClient();
  const { data: update, error } = await supabase
    .from("weekly_updates")
    .select("id, title, body_markdown, converted_content, status, is_current")
    .eq("id", weeklyUpdateId)
    .maybeSingle();
  if (error) throw new Error(`Weekly update lookup failed: ${error.message}`);
  if (!update || update.status !== "published" || update.is_current !== true) return null;
  return update as WeeklyUpdateRow;
}

// Claims one recipient. Returns false when another request already sent (or is sending) to them,
// so two overlapping runs can never both mail the same subscriber.
async function claimDelivery(weeklyUpdateId: string, subscriberId: string) {
  const supabase = getClient();
  const { error } = await supabase
    .from("email_broadcast_deliveries")
    .insert({ weekly_update_id: weeklyUpdateId, subscriber_id: subscriberId, status: "sending" });
  if (!error) return true;
  if (error.code !== "23505") throw new Error(`Delivery could not be claimed: ${error.message}`);

  // Only a failed send, or a claim abandoned by a cut-off request, may be taken again.
  const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
  const { data, error: reclaimError } = await supabase
    .from("email_broadcast_deliveries")
    .update({ status: "sending", reason: null, updated_at: new Date().toISOString() })
    .eq("weekly_update_id", weeklyUpdateId)
    .eq("subscriber_id", subscriberId)
    .or(`status.eq.failed,and(status.eq.sending,updated_at.lt.${staleBefore})`)
    .select("subscriber_id");
  if (reclaimError) throw new Error(`Delivery could not be reclaimed: ${reclaimError.message}`);
  return (data?.length ?? 0) > 0;
}

async function recordDelivery(weeklyUpdateId: string, subscriberId: string, status: "sent" | "failed", reason?: string) {
  const supabase = getClient();
  await supabase
    .from("email_broadcast_deliveries")
    .update({ status, reason: reason ?? null, updated_at: new Date().toISOString() })
    .eq("weekly_update_id", weeklyUpdateId)
    .eq("subscriber_id", subscriberId);
}

async function loadSentSubscriberIds(weeklyUpdateId: string) {
  const supabase = getClient();
  const sent = new Set<string>();
  for (let from = 0; ; from += 1000) {
    const { data, error } = await supabase
      .from("email_broadcast_deliveries")
      .select("subscriber_id")
      .eq("weekly_update_id", weeklyUpdateId)
      .eq("status", "sent")
      .range(from, from + 999);
    if (error) throw new Error(`Delivery lookup failed: ${error.message}`);
    for (const row of data ?? []) sent.add(row.subscriber_id as string);
    if ((data?.length ?? 0) < 1000) break;
  }
  return sent;
}

// Mails every confirmed recipient who has no 'sent' delivery yet, stopping when the time budget is
// spent. Safe to call repeatedly: finished recipients are skipped, so a resume never double-sends.
async function deliver(update: WeeklyUpdateRow, broadcastId: string): Promise<BroadcastOutcome> {
  const supabase = getClient();
  const deadline = Date.now() + TIME_BUDGET_MS;

  const recipients = await loadConfirmedRecipients("weekly_updates");
  const alreadySent = await loadSentSubscriberIds(update.id);
  const pending = recipients.filter((recipient) => !alreadySent.has(recipient.id));

  const base = siteUrl();
  const weeklyUpdateUrl = `${base}/weekly-update`;
  const preferencesUrl = `${base}/email-preferences`;
  const copyrightDisclaimer = await getEmailCopyrightDisclaimer(base);

  let sentThisRun = 0;
  let failedCount = 0;
  let attempted = 0;
  const failures: { subscriberId: string; reason: string }[] = [];

  for (const recipient of pending) {
    if (Date.now() >= deadline) break;
    attempted += 1;
    if (!(await claimDelivery(update.id, recipient.id))) continue;

    const email = buildWeeklyUpdateEmail({
      title: update.title,
      bodyMarkdown: update.body_markdown,
      convertedContent: update.converted_content as never,
      weeklyUpdateUrl,
      preferencesUrl,
      copyrightDisclaimer,
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
        sentThisRun += 1;
        await recordDelivery(update.id, recipient.id, "sent");
      } else {
        failedCount += 1;
        await recordDelivery(update.id, recipient.id, "failed", result.reason);
        if (failures.length < MAX_RECORDED_FAILURES) failures.push({ subscriberId: recipient.id, reason: result.reason });
        if (isSuppressionRejection(result)) await markSubscriberSuppressed(recipient.id);
      }
    } catch {
      // One bad recipient must not abandon the rest of the list.
      failedCount += 1;
      await recordDelivery(update.id, recipient.id, "failed", "exception");
      if (failures.length < MAX_RECORDED_FAILURES) failures.push({ subscriberId: recipient.id, reason: "exception" });
    }

    await sleep(THROTTLE_MS);
  }

  const sentCount = alreadySent.size + sentThisRun;
  const remainingCount = pending.length - attempted;
  const finished = remainingCount === 0;
  const status = !finished ? "incomplete" : failedCount === 0 ? "sent" : sentCount ? "partial" : "failed";

  const { error: ledgerUpdateError } = await supabase.from("email_broadcast_events").update({
    status: finished ? status : "sending",
    recipient_count: recipients.length,
    sent_count: Math.min(sentCount, recipients.length),
    failed_count: Math.min(failedCount, Math.max(recipients.length - sentCount, 0)),
    error: failedCount ? `${failedCount} recipient(s) failed.` : null,
    metadata: { title: update.title, failures },
  }).eq("id", broadcastId);
  if (ledgerUpdateError) throw new Error(`Weekly update ledger could not be finalized: ${ledgerUpdateError.message}`);

  return { status, recipientCount: recipients.length, sentCount, failedCount, remainingCount };
}

export async function broadcastWeeklyUpdate(weeklyUpdateId: string): Promise<BroadcastOutcome> {
  const update = await loadPublishableUpdate(weeklyUpdateId);
  if (!update) return { status: "not_publishable" };

  const broadcastId = await claimBroadcast(weeklyUpdateId);
  if (!broadcastId) return { status: "duplicate" };

  return deliver(update, broadcastId);
}

// Finishes a broadcast that was cut off (or partly failed). Mails only subscribers without a 'sent'
// delivery, so it is safe to run again and again until it reports sent.
export async function resumeWeeklyUpdateBroadcast(weeklyUpdateId: string): Promise<BroadcastOutcome> {
  const update = await loadPublishableUpdate(weeklyUpdateId);
  if (!update) return { status: "not_publishable" };

  const supabase = getClient();
  const { data: ledger, error } = await supabase
    .from("email_broadcast_events")
    .select("id, status")
    .eq("weekly_update_id", weeklyUpdateId)
    .maybeSingle();
  if (error) throw new Error(`Broadcast lookup failed: ${error.message}`);
  if (!ledger) return { status: "no_broadcast" };
  if (ledger.status === "sent") return { status: "already_complete" };

  return deliver(update, ledger.id as string);
}

export type SingleSendOutcome =
  | { status: "sent"; email: string }
  | { status: "already_sent" }
  | { status: "not_publishable" }
  | { status: "not_subscribed" }
  | { status: "failed"; reason: string };

// Sends the current published update to one confirmed subscriber, for someone who joined after the
// broadcast ran. It uses the same delivery record as the broadcast, so the person is never mailed
// twice, and it only ever mails an address that is a confirmed weekly update subscriber.
export async function sendWeeklyUpdateToSubscriber(weeklyUpdateId: string, rawEmail: string): Promise<SingleSendOutcome> {
  const update = await loadPublishableUpdate(weeklyUpdateId);
  if (!update) return { status: "not_publishable" };

  const email = rawEmail.trim().toLowerCase();
  const recipients = await loadConfirmedRecipients("weekly_updates");
  const recipient = recipients.find((candidate) => candidate.email.trim().toLowerCase() === email);
  if (!recipient) return { status: "not_subscribed" };

  if (!(await claimDelivery(update.id, recipient.id))) return { status: "already_sent" };

  const base = siteUrl();
  const content = buildWeeklyUpdateEmail({
    title: update.title,
    bodyMarkdown: update.body_markdown,
    convertedContent: update.converted_content as never,
    weeklyUpdateUrl: `${base}/weekly-update`,
    preferencesUrl: `${base}/email-preferences`,
    copyrightDisclaimer: await getEmailCopyrightDisclaimer(base),
  });

  let result;
  try {
    result = await sendSenderTransactionalEmail({ toEmail: recipient.email, toName: recipient.firstName, subject: content.subject, html: content.html, text: content.text });
  } catch {
    await recordDelivery(update.id, recipient.id, "failed", "exception");
    return { status: "failed", reason: "exception" };
  }
  if (!result.ok) {
    await recordDelivery(update.id, recipient.id, "failed", result.reason);
    if (isSuppressionRejection(result)) await markSubscriberSuppressed(recipient.id);
    return { status: "failed", reason: result.reason };
  }
  await recordDelivery(update.id, recipient.id, "sent");

  // Keep the broadcast record's counts in step with the delivery table.
  const sentCount = (await loadSentSubscriberIds(update.id)).size;
  const supabase = getClient();
  await supabase.from("email_broadcast_events").update({ sent_count: sentCount, recipient_count: Math.max(recipients.length, sentCount) }).eq("weekly_update_id", update.id);
  return { status: "sent", email: recipient.email };
}
