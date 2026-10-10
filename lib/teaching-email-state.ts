import "server-only";

import { loadConfirmedRecipients } from "@/lib/broadcast-recipients";
import type { TeachingEmailSendInput } from "@/lib/teaching-email-send-notice";

type Row = Record<string, unknown>;
type AdminSupabase = {
  from: (table: string) => {
    select: (columns: string, options?: { count: "exact"; head: true }) => {
      eq: (column: string, value: string) => {
        eq: (column: string, value: string) => {
          eq: (column: string, value: string) => PromiseLike<{ count: number | null }>;
        };
        maybeSingle: () => PromiseLike<{ data: Row | null }>;
      };
    };
  };
};

/** Reads what the Email subscribers box needs: whether a send was started, how far it got, and who a new send would reach. */
export async function getTeachingEmailState(supabase: unknown, teachingId: string, status: string, language: "en" | "es"): Promise<TeachingEmailSendInput> {
  const base: TeachingEmailSendInput = { status, language, ledgerStatus: null, deliveredCount: 0, ledgerRecipientCount: null, recipientCount: null };
  if (status !== "published") return base;

  const db = supabase as AdminSupabase;
  const { data: ledger } = await db.from("email_teaching_broadcast_events").select("id, status, recipient_count").eq("teaching_id", teachingId).maybeSingle();

  if (ledger) {
    const ledgerId = String(ledger.id);
    const { count } = await db.from("email_send_deliveries").select("subscriber_id", { count: "exact", head: true }).eq("kind", "teaching").eq("ledger_id", ledgerId).eq("status", "sent");
    const ledgerStatus = ledger.status === "sent" || ledger.status === "failed" ? ledger.status : "sending";
    return {
      ...base,
      ledgerStatus,
      deliveredCount: count ?? 0,
      ledgerRecipientCount: typeof ledger.recipient_count === "number" ? ledger.recipient_count : null,
    };
  }

  // The same list the broadcast itself reads, so the number shown is the number emailed.
  try {
    return { ...base, recipientCount: (await loadConfirmedRecipients("teachings", language)).length };
  } catch {
    return base;
  }
}
