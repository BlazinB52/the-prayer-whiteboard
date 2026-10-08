import "server-only";

import { after } from "next/server";
import type { BroadcastRecipient } from "@/lib/broadcast-recipients";
import { siteUrl } from "@/lib/email-subscriptions";
import { isSuppressionRejection, markSubscriberSuppressed } from "@/lib/sender-suppression";
import { sendSenderTransactionalEmail } from "@/lib/sender-transactional";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

// The routes are capped at 60s. Stop starting new sends well before that so the ledger is always
// written, then hand the remainder to a follow-up request.
export const SEND_TIME_BUDGET_MS = 40_000;
// Sender takes about 5-6 seconds to accept one message, so one at a time only fits about a dozen
// recipients in a request. A few at once keeps a list of this size inside a single request.
export const SEND_CONCURRENCY = 4;
// A claim left in 'sending' this long means the request that made it was cut off mid-send.
export const STALE_CLAIM_MS = 5 * 60 * 1000;
const MAX_RECORDED_FAILURES = 25;

export type DeliveryKind = "teaching" | "devotional";
export type EmailContent = { subject: string; html: string; text: string };
export type DeliveryRun = {
  recipientCount: number;
  sentCount: number;
  failedCount: number;
  remainingCount: number;
  failures: { subscriberId: string; reason: string }[];
};

// Where per-recipient progress is kept. Each kind of send has its own table; the loop below only
// needs these three operations.
export type DeliveryStore = {
  loadSent(): Promise<Set<string>>;
  // False when someone else already sent, or is sending, to this subscriber.
  claim(subscriberId: string): Promise<boolean>;
  record(subscriberId: string, status: "sent" | "failed", reason?: string): Promise<void>;
};

function getClient() {
  const supabase = createServiceRoleClient();
  if (!supabase) throw new Error("Send storage is not configured.");
  return supabase;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// The store for teaching and devotional sends (email_send_deliveries).
export function sendDeliveriesStore(kind: DeliveryKind, ledgerId: string): DeliveryStore {
  return {
    async loadSent() {
      const supabase = getClient();
      const sent = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from("email_send_deliveries")
          .select("subscriber_id")
          .eq("kind", kind)
          .eq("ledger_id", ledgerId)
          .eq("status", "sent")
          .range(from, from + 999);
        if (error) throw new Error(`Delivery lookup failed: ${error.message}`);
        for (const row of data ?? []) sent.add(row.subscriber_id as string);
        if ((data?.length ?? 0) < 1000) break;
      }
      return sent;
    },

    async claim(subscriberId) {
      const supabase = getClient();
      const { error } = await supabase
        .from("email_send_deliveries")
        .insert({ kind, ledger_id: ledgerId, subscriber_id: subscriberId, status: "sending" });
      if (!error) return true;
      if (error.code !== "23505") throw new Error(`Delivery could not be claimed: ${error.message}`);

      // Only a failed send, or a claim abandoned by a cut-off request, may be taken again.
      const staleBefore = new Date(Date.now() - STALE_CLAIM_MS).toISOString();
      const { data, error: reclaimError } = await supabase
        .from("email_send_deliveries")
        .update({ status: "sending", reason: null, updated_at: new Date().toISOString() })
        .eq("kind", kind)
        .eq("ledger_id", ledgerId)
        .eq("subscriber_id", subscriberId)
        .or(`status.eq.failed,and(status.eq.sending,updated_at.lt.${staleBefore})`)
        .select("subscriber_id");
      if (reclaimError) throw new Error(`Delivery could not be reclaimed: ${reclaimError.message}`);
      return (data?.length ?? 0) > 0;
    },

    async record(subscriberId, status, reason) {
      await getClient()
        .from("email_send_deliveries")
        .update({ status, reason: reason ?? null, updated_at: new Date().toISOString() })
        .eq("kind", kind)
        .eq("ledger_id", ledgerId)
        .eq("subscriber_id", subscriberId);
    },
  };
}

// Mails every recipient who has no 'sent' delivery yet, a few at a time, stopping when the time
// budget is spent. Safe to call repeatedly: finished recipients are skipped, never mailed twice.
export async function deliverToRecipients(input: {
  store: DeliveryStore;
  recipients: BroadcastRecipient[];
  buildEmail: (recipient: BroadcastRecipient) => EmailContent;
  throttleMs: number;
  concurrency?: number;
}): Promise<DeliveryRun> {
  const { store, recipients } = input;
  const deadline = Date.now() + SEND_TIME_BUDGET_MS;
  const alreadySent = await store.loadSent();
  const pending = recipients.filter((recipient) => !alreadySent.has(recipient.id));

  let sentThisRun = 0;
  let failedCount = 0;
  let taken = 0;
  const failures: DeliveryRun["failures"] = [];

  async function sendOne(recipient: BroadcastRecipient) {
    if (!(await store.claim(recipient.id))) return;
    const email = input.buildEmail(recipient);
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
        await store.record(recipient.id, "sent");
      } else {
        failedCount += 1;
        await store.record(recipient.id, "failed", result.reason);
        if (failures.length < MAX_RECORDED_FAILURES) failures.push({ subscriberId: recipient.id, reason: result.reason });
        if (isSuppressionRejection(result)) await markSubscriberSuppressed(recipient.id);
      }
    } catch {
      // One bad recipient must not abandon the rest of the list.
      failedCount += 1;
      await store.record(recipient.id, "failed", "exception");
      if (failures.length < MAX_RECORDED_FAILURES) failures.push({ subscriberId: recipient.id, reason: "exception" });
    }
  }

  // Each worker takes the next recipient until the list or the time budget runs out. A recipient is
  // only counted as taken once a worker has started on it, so anything left over is reported.
  async function worker() {
    while (Date.now() < deadline && taken < pending.length) {
      const recipient = pending[taken];
      taken += 1;
      await sendOne(recipient);
      await sleep(input.throttleMs);
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(input.concurrency ?? SEND_CONCURRENCY, pending.length)) }, worker));

  return {
    recipientCount: recipients.length,
    sentCount: recipients.length - pending.length + sentThisRun,
    failedCount,
    remainingCount: pending.length - taken,
    failures,
  };
}

// Hands an unfinished send to a follow-up request once this response has gone out.
export function scheduleContinuation(path: string, headers: Record<string, string>, body: Record<string, string>) {
  after(async () => {
    await fetch(`${siteUrl()}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify(body),
    }).catch(() => undefined);
  });
}
