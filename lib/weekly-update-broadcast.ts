import "server-only";

import { assertRecipientsChoseLanguage, loadConfirmedRecipients } from "@/lib/broadcast-recipients";
import { getEmailCopyrightDisclaimer } from "@/lib/copyright-disclaimers";
import { siteUrl } from "@/lib/email-subscriptions";
import { deliverToRecipients, type DeliveryStore } from "@/lib/send-deliveries";
import { isSuppressionRejection, markSubscriberSuppressed } from "@/lib/sender-suppression";
import { buildWeeklyUpdateEmail } from "@/lib/weekly-update-email-content";
import { sendSenderTransactionalEmail } from "@/lib/sender-transactional";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const THROTTLE_MS = 120;
// A claim left in 'sending' this long means the request that made it was cut off mid-send.
const STALE_CLAIM_MS = 5 * 60 * 1000;

export type BroadcastOutcome =
  | { status: "duplicate" }
  | { status: "not_publishable" }
  | { status: "no_broadcast" }
  | { status: "already_complete" }
  | { status: "sent" | "partial" | "failed" | "incomplete"; recipientCount: number; sentCount: number; failedCount: number; remainingCount: number };

type WeeklyUpdateRow = { id: string; title: string; body_markdown: string; converted_content: unknown; language: "en" | "es" };

// Everything language-specific about one send, taken from the update's own language: the page the
// email links to and the preferences page. (The recipients, the wording and the footer follow the same language.)
function linksFor(base: string, language: "en" | "es") {
  return language === "es"
    ? { weeklyUpdateUrl: `${base}/espanol/actualizacion-semanal`, preferencesUrl: `${base}/espanol/preferencias` }
    : { weeklyUpdateUrl: `${base}/weekly-update`, preferencesUrl: `${base}/email-preferences` };
}

function getClient() {
  const supabase = createServiceRoleClient();
  if (!supabase) throw new Error("Broadcast storage is not configured.");
  return supabase;
}

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
    .select("id, title, body_markdown, converted_content, status, is_current, language")
    .eq("id", weeklyUpdateId)
    .maybeSingle();
  if (error) throw new Error(`Weekly update lookup failed: ${error.message}`);
  if (!update || update.status !== "published" || update.is_current !== true) return null;
  // English and Español updates are both emailed, each only to subscribers who chose that language.
  if (update.language !== "en" && update.language !== "es") return null;
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

function weeklyDeliveryStore(weeklyUpdateId: string): DeliveryStore {
  return {
    loadSent: () => loadSentSubscriberIds(weeklyUpdateId),
    claim: (subscriberId) => claimDelivery(weeklyUpdateId, subscriberId),
    record: (subscriberId, status, reason) => recordDelivery(weeklyUpdateId, subscriberId, status, reason),
  };
}

// Mails every confirmed recipient who has no 'sent' delivery yet, a few at a time, stopping when the
// time budget is spent. Safe to call repeatedly: finished recipients are skipped, so a resume never
// double-sends.
async function deliver(update: WeeklyUpdateRow, broadcastId: string): Promise<BroadcastOutcome> {
  const supabase = getClient();

  // The update's own language picks everything: who is mailed (only subscribers who chose that language),
  // the wording, the copyright footer, and the pages the email links to.
  const language = update.language;
  const recipients = await loadConfirmedRecipients("weekly_updates", language);
  assertRecipientsChoseLanguage(recipients, language);

  const base = siteUrl();
  const { weeklyUpdateUrl, preferencesUrl } = linksFor(base, language);
  const copyrightDisclaimer = await getEmailCopyrightDisclaimer(base, language);

  const run = await deliverToRecipients({
    store: weeklyDeliveryStore(update.id),
    recipients,
    throttleMs: THROTTLE_MS,
    buildEmail: () => buildWeeklyUpdateEmail({
      title: update.title,
      bodyMarkdown: update.body_markdown,
      convertedContent: update.converted_content as never,
      weeklyUpdateUrl,
      preferencesUrl,
      copyrightDisclaimer,
      language,
    }),
  });

  const { sentCount, failedCount, remainingCount } = run;
  const finished = remainingCount === 0;
  const status = !finished ? "incomplete" : failedCount === 0 ? "sent" : sentCount ? "partial" : "failed";

  const { error: ledgerUpdateError } = await supabase.from("email_broadcast_events").update({
    status: finished ? status : "sending",
    recipient_count: recipients.length,
    sent_count: Math.min(sentCount, recipients.length),
    failed_count: Math.min(failedCount, Math.max(recipients.length - sentCount, 0)),
    error: failedCount ? `${failedCount} recipient(s) failed.` : null,
    metadata: { title: update.title, failures: run.failures },
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
    .select("id, status, recipient_count")
    .eq("weekly_update_id", weeklyUpdateId)
    .maybeSingle();
  if (error) throw new Error(`Broadcast lookup failed: ${error.message}`);
  if (!ledger) return { status: "no_broadcast" };
  if (ledger.status === "sent") return { status: "already_complete" };

  // A send from before per-recipient records existed cannot say who was mailed, so resuming it would
  // mail everyone a second copy. Treat it as complete.
  const { count: deliveryRows } = await supabase
    .from("email_broadcast_deliveries")
    .select("subscriber_id", { count: "exact", head: true })
    .eq("weekly_update_id", weeklyUpdateId);
  if (!deliveryRows && (ledger.recipient_count as number) > 0) return { status: "already_complete" };

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
  // Only subscribers who chose this update's language count, so a Spanish update can never be sent to
  // someone who chose English only, and an English update never to someone who chose Español only.
  const language = update.language;
  const recipients = await loadConfirmedRecipients("weekly_updates", language);
  const recipient = recipients.find((candidate) => candidate.email.trim().toLowerCase() === email);
  if (!recipient) return { status: "not_subscribed" };
  assertRecipientsChoseLanguage([recipient], language);

  if (!(await claimDelivery(update.id, recipient.id))) return { status: "already_sent" };

  const base = siteUrl();
  const links = linksFor(base, language);
  const content = buildWeeklyUpdateEmail({
    title: update.title,
    bodyMarkdown: update.body_markdown,
    convertedContent: update.converted_content as never,
    weeklyUpdateUrl: links.weeklyUpdateUrl,
    preferencesUrl: links.preferencesUrl,
    copyrightDisclaimer: await getEmailCopyrightDisclaimer(base, language),
    language,
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
